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
 * DANS L'ORDRE D'ARRIVÉE. Un `order_updated` rejoué avant son `new_order`
 * afficherait une commande qui avance avant d'exister.
 */
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
  async rejouer(): Promise<{ rejoues: number; abandonnes: number }> {
    const { server } = this.gateway;
    if (!server) {
      // La passerelle n'est pas prête : rien n'est perdu, les lignes
      // attendent. C'est exactement la panne que cette table couvre.
      return { rejoues: 0, abandonnes: 0 };
    }

    const enAttente = await this.prisma.realtimeOutbox.findMany({
      where: { deliveredAt: null, attempts: { lt: OutboxService.ESSAIS_MAX } },
      orderBy: { createdAt: 'asc' },
      take: OutboxService.PAR_PASSAGE,
    });
    if (enAttente.length === 0) return { rejoues: 0, abandonnes: 0 };

    let rejoues = 0;
    let abandonnes = 0;

    for (const ligne of enAttente) {
      try {
        for (const salon of ligne.rooms) server.to(salon).emit(ligne.eventName, ligne.payload);
        await this.prisma.realtimeOutbox.update({
          where: { id: ligne.id },
          data: { deliveredAt: new Date(), attempts: { increment: 1 }, lastError: null },
        });
        rejoues += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const essais = ligne.attempts + 1;
        await this.prisma.realtimeOutbox.update({
          where: { id: ligne.id },
          data: { attempts: essais, lastError: message.slice(0, 500) },
        });
        if (essais >= OutboxService.ESSAIS_MAX) abandonnes += 1;
      }
    }

    if (rejoues > 0) {
      this.logger.log(`${rejoues} evenement(s) rejoue(s) — ils n'etaient jamais arrives.`);
    }
    if (abandonnes > 0) {
      // Au niveau ERREUR : une ligne abandonnée est un écran qui ne saura
      // jamais. Cela doit se voir, pas se deviner.
      this.logger.error(
        `${abandonnes} evenement(s) ABANDONNE(S) apres ${OutboxService.ESSAIS_MAX} essais. ` +
          `Voir realtime_outbox.last_error.`,
      );
    }
    return { rejoues, abandonnes };
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
