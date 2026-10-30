import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * CE QUI GARANTIT QU'UN ÉVÉNEMENT FINIT PAR ARRIVER.
 *
 * Une commande payée, c'est DEUX gestes : l'écrire en base, et prévenir
 * l'écran de la buvette. Entre les deux, tout peut arriver — un redémarrage,
 * une passerelle pas encore prête (`RealtimeService` le journalisait déjà
 * sans rien pouvoir y faire), un réseau qui hoquette. La commande existait
 * alors, encaissée, et le comptoir n'en savait rien.
 *
 * Le tableau de bord rattrapait une partie par ses relectures REST. Une
 * partie seulement : il faut que quelqu'un regarde l'écran au bon moment, et
 * rien ne rattrapait les autres consommateurs.
 *
 * Désormais chaque émission dépose une ligne dans `realtime_outbox` ; cet
 * ouvrier rejoue tout ce qui n'est pas marqué livré. L'écran du comptoir ne
 * dépend plus de la présence d'une socket à une seconde près.
 *
 * ── CE QUI EST GARANTI, ET CE QUI NE L'EST PAS ───────────────────────
 *
 * AU MOINS UNE FOIS, jamais exactement une fois. Un rejeu peut doubler une
 * émission — si la livraison a abouti mais que le marquage n'est pas passé.
 * C'est le bon sens du compromis : mieux vaut deux fois que zéro fois, et
 * l'enveloppe porte un `eventId` unique qui permet au client de reconnaître
 * un doublon.
 *
 * DANS L'ORDRE D'ARRIVÉE, et c'est la SÉQUENCE qui le dit — pas la date.
 *
 * Deux annonces déposées dans la même transaction portent la même date à
 * la milliseconde près. `ORDER BY created_at` avait donc des ex æquo, et
 * PostgreSQL rendait les lignes dans l'ordre qu'il voulait : mesuré sur
 * une vraie base, quinze lignes ressortaient mélangées. Un `order_ready`
 * rejoué avant son `order_updated` montrerait une commande prête avant
 * d'avoir avancé.
 *
 * ── MAIS L'ORDRE EST TENU PAR OUVRIER, PAS ENTRE OUVRIERS ────────
 *
 * Il faut l'écrire, parce que cette phrase-là a longtemps promis plus que le
 * code ne donne. DANS un ouvrier, l'ordre est total : les lots s'enchaînent
 * l'un après l'autre et chaque lot est trié avant d'émettre. ENTRE deux
 * instances, personne ne l'a jamais garanti — l'une réserve les deux cents
 * plus anciennes, l'autre les suivantes, et rien ne dit laquelle finira la
 * première.
 *
 * CE QUE ÇA COÛTE EN VRAI, et c'est pourquoi on le laisse ainsi :
 *
 *   · les annonces d'une MÊME commande sont déposées ensemble — la transition
 *     dépose `order_updated` et `order_ready` dans la même transaction, donc
 *     avec des séquences consécutives. Elles tombent dans le même lot, chez
 *     le même ouvrier, et l'ordre tient ;
 *   · pour qu'elles se séparent, il faut deux cents AUTRES annonces entre
 *     elles, donc une file en retard ET deux instances. À la vitesse de
 *     vidange mesurée — près de cinq mille par seconde — deux cents annonces
 *     valent quarante millisecondes de retard. Deux gestes d'une même
 *     commande séparés de quarante millisecondes, cela n'existe pas au
 *     comptoir : une équipière ne touche pas deux boutons dans le même
 *     quarantième de seconde ;
 *   · et si cela arrivait, le tableau affiche un statut faux jusqu'à la
 *     réconciliation REST, soit au plus une minute.
 *
 * Sérialiser par commande coûterait un verrou partagé sur le chemin le plus
 * chaud du service, pour fermer une fenêtre de quarante millisecondes qui se
 * referme toute seule en moins d'une minute. Le prix n'en vaut pas la peine,
 * et c'est une DÉCISION, pas un oubli.
 *
 * `test/integration/outbox-ordre-deux-ouvriers.int-spec.ts` établit les trois
 * cas sur une vraie base. Ce qui reste exigé, et que ce test vérifie : rien ne
 * se perd, et rien ne part deux fois.
 */
/** Une ligne réservée par la requête de réservation. */
interface LigneReservee {
  id: string;
  event_id: string;
  event_name: string;
  rooms: string[];
  payload: unknown;
  attempts: number;
  sequence: bigint;
}

/** Ce qu'un tour de rattrapage a fait, et ce qu'il laisse derrière lui. */
export interface EtatDeLaFile {
  rejoues: number;
  abandonnes: number;
  /** Nombre de lots enchaînés. Zéro quand il n'y avait rien à faire. */
  passages: number;
  /** Ce qui reste en attente APRÈS la vidange. `null` : pas mesuré. */
  enAttente: number | null;
  /** Âge de la plus vieille annonce en attente. `null` : la file est vide. */
  plusVieuxMs: number | null;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger('Outbox');

  /**
   * Combien de lignes on rejoue par passage.
   *
   * Borné : après une coupure d'une heure, il peut y en avoir des milliers.
   * Les envoyer toutes d'un coup bloquerait la boucle d'événements et ferait
   * tomber les sockets vivantes — on répare le temps réel, on ne le casse pas.
   * Le reste part au tour suivant.
   */
  private static readonly PAR_PASSAGE = 200;

  /**
   * COMBIEN DE LOTS ON ENCHAÎNE DANS LE MÊME TOUR.
   *
   * Un seul lot par minute, c'était 200 annonces par minute : une file de
   * 10 000 — une coupure d'une heure un soir de match — demandait CINQUANTE
   * MINUTES à se vider. Le match est fini avant que le comptoir ait tout vu,
   * et une annonce qui arrive après le coup de sifflet ne sert plus à rien.
   *
   * On enchaîne donc les lots tant qu'il reste du travail. MESURÉ sur un
   * PostgreSQL véritable : les 10 000 annonces de l'exemple partent en
   * 2,0 secondes, soit près de 5 000 par seconde — c'est le budget de temps
   * qui gouverne, pas ce plafond.
   *
   * Il reste comme garde-fou contre une boucle pathologique, et il est posé
   * haut exprès : à 200 lignes le lot, cinq cents passages valent 100 000
   * annonces, bien au-delà de ce que vingt secondes permettent d'atteindre.
   * Trop bas, c'''est LUI qui aurait coupé la vidange — à cinquante, les
   * 10 000 de la mesure tombaient pile sur la limite.
   */
  private static readonly PASSAGES_MAX = 500;

  /**
   * LE TEMPS QU'ON S'ACCORDE pour vider, et pourquoi il existe.
   *
   * La vidange tient le processus : tant qu'elle tourne, elle partage la
   * boucle d'événements avec les sockets vivantes. Vingt secondes laissent
   * quarante secondes de respiration avant le tour suivant, et bornent les
   * dégâts si la base répond mal — on préfère reprendre à la minute suivante
   * plutôt que d'empiler les tours les uns sur les autres.
   */
  private static readonly BUDGET_MS = 20_000;

  /**
   * AU-DELÀ, LA FILE N'EST PLUS UN FILET : C'EST UN RETARD.
   *
   * Mille annonces en attente après une vidange complète veut dire que les
   * dépôts arrivent plus vite qu'on ne les sert. Cela doit se voir dans les
   * journaux avant qu'un comptoir ne s'en aperçoive.
   */
  private static readonly PROFONDEUR_ALERTE = 1_000;

  /**
   * ET L'ÂGE, qui dit la vraie gravité.
   *
   * La profondeur seule ne distingue pas une rafale d'un blocage. Une annonce
   * qui attend cinq minutes, c'est un écran de comptoir aveugle depuis cinq
   * minutes — le client est au guichet et sa commande n'est pas affichée.
   */
  private static readonly RETARD_ALERTE_MS = 5 * 60_000;

  /**
   * Au bout de combien d'échecs on cesse d'essayer.
   *
   * Une ligne qui échoue dix fois n'échoue pas par hasard : son salon
   * n'existe plus, ou sa charge est illisible. La rejouer sans fin
   * masquerait les suivantes derrière elle, passage après passage.
   */
  private static readonly ESSAIS_MAX = 10;

  /**
   * Combien de temps on garde une ligne livrée.
   *
   * C'est une file d'attente, pas un journal : le registre immuable, c'est
   * `OrderAuditTrail`. Sept jours suffisent à enquêter sur un incident du
   * week-end dernier, et évitent que la table enfle sans fin.
   */
  private static readonly JOURS_DE_GARDE = 7;

  /**
   * COMBIEN DE TEMPS UNE LIGNE RESTE RÉSERVÉE.
   *
   * `FOR UPDATE SKIP LOCKED` ne verrouille que le temps de la requête. Une
   * fois celle-ci terminée, la ligne est encore non livrée — et une autre
   * réplique la reprenait avant que la première n'ait fini d'émettre. Le
   * comptoir voyait la même commande arriver deux fois.
   *
   * Deux minutes : l'ouvrier passe à la minute et traite au plus deux cents
   * lignes, donc il a largement fini avant l'échéance. Et le bail EXPIRE,
   * c'est tout l'intérêt : un ouvrier qui meurt entre la réservation et
   * l'envoi ne retient pas la ligne pour toujours — elle repart au tour
   * suivant. Un verrou qu'il faudrait lever à la main survivrait à la panne
   * qu'il était censé couvrir.
   */
  private static readonly BAIL_MS = 120_000;

  /**
   * UNE VIDANGE À LA FOIS DANS CETTE INSTANCE.
   *
   * La vidange peut durer vingt secondes ; le cron passe à la minute. En cas
   * de retard, deux vidanges du MÊME processus se chevaucheraient. Le bail
   * les empêcherait de se marcher dessus, mais elles se disputeraient la
   * boucle d'événements pour rien.
   *
   * Entre INSTANCES, c'est le bail qui décide — et c'est voulu : deux
   * répliques qui vident ensemble vont deux fois plus vite.
   */
  private enCours = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RealtimeGateway,
  ) {}

  /**
   * Dépose une émission, DANS la transaction de l'appelant quand il en a une.
   *
   * C'est tout l'intérêt : la ligne et le changement métier tombent ou
   * passent ENSEMBLE. Écrite après le commit, elle laisserait une fenêtre —
   * étroite, mais réelle — où la commande existe et l'annonce n'existe pas.
   */
  deposer(
    tx: Prisma.TransactionClient,
    params: { eventId: string; eventName: string; rooms: string[]; payload: unknown },
  ) {
    return tx.realtimeOutbox.create({
      data: {
        eventId: params.eventId,
        eventName: params.eventName,
        rooms: params.rooms,
        payload: params.payload as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Marque une ligne livrée, après une émission immédiate réussie.
   *
   * Hors transaction, et sans jamais lever : si ce marquage échoue, l'ouvrier
   * rejouera — un doublon, pas une perte. L'inverse serait impardonnable.
   */
  async marquerLivre(eventId: string): Promise<void> {
    try {
      await this.prisma.realtimeOutbox.updateMany({
        where: { eventId, deliveredAt: null },
        data: { deliveredAt: new Date() },
      });
    } catch (e) {
      this.logger.warn(
        `Marquage impossible pour ${eventId} : ${e instanceof Error ? e.message : String(e)}. ` +
          `L'ouvrier rejouera — un doublon vaut mieux qu'un silence.`,
      );
    }
  }

  /**
   * LE RATTRAPAGE — toutes les minutes.
   *
   * Pourquoi la minute et pas la seconde : l'émission immédiate couvre le cas
   * normal, et cet ouvrier n'existe que pour les ratés. Interroger la base
   * chaque seconde pour une table vide 99 % du temps coûterait plus que ce
   * qu'il rapporte.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async rejouer(): Promise<EtatDeLaFile> {
    if (this.enCours) {
      this.logger.debug('Vidange deja en cours — ce tour est saute.');
      return { rejoues: 0, abandonnes: 0, passages: 0, enAttente: null, plusVieuxMs: null };
    }
    this.enCours = true;
    try {
      return await this.vider();
    } finally {
      this.enCours = false;
    }
  }

  /**
   * ON VIDE, on ne grignote pas.
   *
   * Lot après lot tant qu'il reste du travail, dans la limite du budget et du
   * nombre de passages. Entre deux lots, la main est rendue à la boucle
   * d'événements : les sockets vivantes continuent de servir pendant qu'on
   * rattrape le retard.
   */
  private async vider(): Promise<EtatDeLaFile> {
    const { server } = this.gateway;
    if (!server) {
      // La passerelle n'est pas prête : rien n'est perdu, les lignes
      // attendent. C'est exactement la panne que cette table couvre.
      return { rejoues: 0, abandonnes: 0, passages: 0, enAttente: null, plusVieuxMs: null };
    }

    const echeance = Date.now() + OutboxService.BUDGET_MS;
    let rejoues = 0;
    let abandonnes = 0;
    let passages = 0;

    while (passages < OutboxService.PASSAGES_MAX && Date.now() < echeance) {
      const lot = await this.reserver();
      if (lot.length === 0) break;
      passages += 1;

      const bilan = await this.emettreLot(server, lot);
      rejoues += bilan.rejoues;
      abandonnes += bilan.abandonnes;

      // Un lot incomplet veut dire qu'il ne reste rien à prendre — ou que le
      // reste est réservé par une autre réplique, qui s'en occupe.
      if (lot.length < OutboxService.PAR_PASSAGE) break;

      // La main à la boucle d'événements, entre deux lots.
      await new Promise((suite) => setImmediate(suite));
    }

    if (rejoues > 0) {
      this.logger.log(
        `${rejoues} evenement(s) rejoue(s) en ${passages} lot(s) — ils n'etaient jamais arrives.`,
      );
    }
    if (abandonnes > 0) {
      // Au niveau ERREUR : une ligne abandonnée est un écran qui ne saura
      // jamais. Cela doit se voir, pas se deviner.
      this.logger.error(
        `${abandonnes} evenement(s) ABANDONNE(S) apres ${OutboxService.ESSAIS_MAX} essais. ` +
          `Voir realtime_outbox.last_error, puis reprendreLesAbandonnes().`,
      );
    }

    const reste = await this.mesurer();
    this.alerter(reste);
    return { rejoues, abandonnes, passages, ...reste };
  }

  /** Réserve un lot. Voir le commentaire de la requête. */
  private async reserver() {
    /**
     * RÉSERVER AVANT DE LIRE — sinon deux instances rejouent la même ligne.
     *
     * Chaque réplique exécute ce cron. Un `findMany` tout simple leur rend à
     * toutes les mêmes lignes en attente : elles émettent toutes, et le
     * comptoir voit la même commande arriver deux fois. L'`eventId` permet à
     * un client de reconnaître le doublon, mais compter là-dessus, c'est
     * supposer que TOUS les consommateurs dédupliquent correctement.
     *
     * `FOR UPDATE SKIP LOCKED` règle le temps de la REQUÊTE : chaque
     * instance verrouille les lignes qu'elle prend, et les autres sautent
     * celles-là au lieu d'attendre.
     *
     * Mais ce verrou tombe avec la requête, et la ligne est encore non
     * livrée : une autre réplique la reprenait pendant que la première
     * émettait. D'où le BAIL — `claimed_until` — qui couvre la phase
     * d'émission, et que les autres ouvriers respectent. Il expire tout
     * seul : un ouvrier qui meurt n'emporte pas la ligne avec lui.
     *
     * L'essai est compté AU MOMENT DE LA RÉSERVATION, pas après l'émission :
     * un ouvrier qui meurt entre les deux a quand même consommé son essai.
     * Sans cela, une ligne qui fait tomber son ouvrier serait reprise sans
     * fin, par toutes les instances, à chaque passage.
     */
    return await this.prisma.$queryRaw<
      {
        id: string;
        event_id: string;
        event_name: string;
        rooms: string[];
        payload: unknown;
        attempts: number;
        sequence: bigint;
      }[]
    >`
      UPDATE "realtime_outbox"
         SET attempts = attempts + 1,
             claimed_until = NOW() + (${OutboxService.BAIL_MS} || ' milliseconds')::interval
       WHERE id IN (
         SELECT id
           FROM "realtime_outbox"
          WHERE delivered_at IS NULL
            AND attempts < ${OutboxService.ESSAIS_MAX}
            AND (claimed_until IS NULL OR claimed_until < NOW())
          ORDER BY sequence ASC
          LIMIT ${OutboxService.PAR_PASSAGE}
            FOR UPDATE SKIP LOCKED
       )
   RETURNING id, event_id, event_name, rooms, payload, attempts, sequence
    `;
  }

  /**
   * Émet un lot, puis marque TOUT LE LOT livré en une seule écriture.
   *
   * Une écriture par ligne, c'était 200 allers-retours par lot : à une
   * poignée de millisecondes chacun, le lot passait plus de temps à se
   * marquer qu'à émettre. C'est ce coût-là, pas l'émission, qui faisait des
   * cinquante minutes de rattrapage.
   */
  private async emettreLot(
    server: NonNullable<RealtimeGateway['server']>,
    lot: LigneReservee[],
  ): Promise<{ rejoues: number; abandonnes: number }> {
    /**
     * `RETURNING` NE REND RIEN DANS L'ORDRE — il faut trier ici.
     *
     * Le `ORDER BY` du sous-select choisit QUELLES lignes sont réservées ;
     * il ne dit rien de l'ordre dans lequel `UPDATE … RETURNING` les rend.
     * PostgreSQL est libre, et il en use : mesuré sur une vraie base, quinze
     * lignes réservées ensemble ressortaient mélangées.
     *
     * Sans ce tri, un `order_ready` partait avant son `order_updated` — une
     * commande prête avant d'avoir avancé.
     */
    const ordonne = [...lot].sort((a, b) =>
      a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0,
    );

    const livrees: string[] = [];
    let abandonnes = 0;

    for (const ligne of ordonne) {
      try {
        for (const salon of ligne.rooms) server.to(salon).emit(ligne.event_name, ligne.payload);
        livrees.push(ligne.id);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await this.prisma.realtimeOutbox.update({
          where: { id: ligne.id },
          data: { lastError: message.slice(0, 500) },
        });
        // L'essai est deja compte par la reservation.
        if (ligne.attempts >= OutboxService.ESSAIS_MAX) abandonnes += 1;
      }
    }

    if (livrees.length > 0) {
      await this.prisma.realtimeOutbox.updateMany({
        where: { id: { in: livrees } },
        // Le bail est rendu en meme temps : la ligne est finie, elle n'a plus
        // a etre reservee par personne.
        data: { deliveredAt: new Date(), lastError: null, claimedUntil: null },
      });
    }

    return { rejoues: livrees.length, abandonnes };
  }

  /**
   * CE QU'IL RESTE, et depuis combien de temps.
   *
   * La profondeur seule ne distingue pas une rafale d'un blocage : cent
   * annonces déposées à l'instant ne sont pas un incident, une seule qui
   * attend depuis dix minutes en est un.
   */
  async mesurer(): Promise<{ enAttente: number; plusVieuxMs: number | null }> {
    const [enAttente, plusVieux] = await Promise.all([
      this.prisma.realtimeOutbox.count({ where: { deliveredAt: null } }),
      this.prisma.realtimeOutbox.findFirst({
        where: { deliveredAt: null },
        orderBy: { sequence: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    return {
      enAttente,
      plusVieuxMs: plusVieux ? Date.now() - plusVieux.createdAt.getTime() : null,
    };
  }

  private alerter(etat: { enAttente: number; plusVieuxMs: number | null }): void {
    if (etat.plusVieuxMs !== null && etat.plusVieuxMs >= OutboxService.RETARD_ALERTE_MS) {
      this.logger.error(
        `La plus vieille annonce attend ${Math.round(etat.plusVieuxMs / 1000)} s ` +
          `(${etat.enAttente} en attente). Un comptoir est aveugle depuis ce temps-la.`,
      );
      return;
    }
    if (etat.enAttente >= OutboxService.PROFONDEUR_ALERTE) {
      this.logger.warn(
        `${etat.enAttente} annonce(s) en attente apres la vidange : ` +
          `les depots arrivent plus vite qu'on ne les sert.`,
      );
    }
  }

  /**
   * LA REPRISE D'UNE LIGNE ABANDONNÉE — la procédure, en code.
   *
   * Passé dix essais, une ligne est laissée de côté pour ne pas masquer les
   * suivantes. Elle n'est pas perdue : elle attend qu'on ait réparé la cause
   * (`last_error` la nomme), puis qu'on la remette dans la file. Sans ce
   * geste il faudrait écrire du SQL à la main sur la production, un soir de
   * match, ce qui est exactement le moment où l'on ne veut pas le faire.
   *
   * Rend le nombre de lignes remises en file.
   */
  async reprendreLesAbandonnes(): Promise<number> {
    const { count } = await this.prisma.realtimeOutbox.updateMany({
      where: { deliveredAt: null, attempts: { gte: OutboxService.ESSAIS_MAX } },
      data: { attempts: 0, claimedUntil: null, lastError: null },
    });
    if (count > 0) this.logger.log(`${count} annonce(s) abandonnee(s) remise(s) en file.`);
    return count;
  }

  /** La purge des lignes livrées — une file d'attente ne s'accumule pas. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purger(): Promise<number> {
    const limite = new Date(Date.now() - OutboxService.JOURS_DE_GARDE * 86_400_000);
    const { count } = await this.prisma.realtimeOutbox.deleteMany({
      where: { deliveredAt: { not: null, lt: limite } },
    });
    if (count > 0) this.logger.log(`${count} ligne(s) d'outbox purgee(s).`);
    return count;
  }
}
