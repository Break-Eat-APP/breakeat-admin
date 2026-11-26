import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Interval } from '@nestjs/schedule';
import { LiveActivityStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CANAL_COMMANDES, ExpoPushService } from '../notifications/expo-push.service';

import { PushTokensService } from '../notifications/push-tokens.service';
import { ApnsService } from '../live-activity/apns.service';
import {
  CommandesClientFlaixService,
  estPrete,
  estTerminal,
  type CommandeFlaix,
} from './commandes-client-flaix.service';
import { etatLiveActivity, statutWidget, type EtatLiveActivityFlaix } from './etat-widget-flaix';

/**
 * LE SUIVI DES COMMANDES FLAIX : « Ta commande est prête » ET LA LIVE ACTIVITY.
 *
 * Flaix ne prévient pas BreakEat quand une commande change d'état (pas de
 * webhook, décision de Rémi du 24/11). Le serveur interroge donc l'adresse de
 * suivi que Flaix prévoit pour cela (`/api/public/orders/<jeton>/status`,
 * contrat § 7) : toutes les 15 s jusqu'à « prête », puis toutes les 60 s
 * jusqu'à la remise.
 *
 * À chaque changement :
 *  · la Live Activity du client avance (même widget qu'une commande BreakEat) ;
 *  · au passage à « prête », la notification part, une fois (3 essais au plus) ;
 *  · à la remise ou à l'annulation, la Live Activity se ferme et le suivi
 *    s'arrête ; la date de remise est gardée (« Note ta commande », à venir).
 *
 * D'OÙ VIENNENT LES COMMANDES SUIVIES : de « Mes commandes » (la liste lue chez
 * Flaix) et de la page de commande dans l'app, à la fin du paiement
 * (`POST /flaix/commandes/:jeton/suivi`).
 *
 * EN BASE depuis le 24/11/2026 (`SuiviCommandeFlaix`) : la version en mémoire
 * perdait tout au redémarrage du serveur (ADR-0015).
 *
 * Le jeton est un droit d'accès (contrat § 7) : il ne va jamais dans un journal.
 */

const INTERVALLE_MS = 15_000;
/** Rythme jusqu'à « prête » : c'est là que la vitesse compte. */
const RYTHME_AVANT_PRETE_MS = 15_000;
/** Rythme ensuite, jusqu'à la remise : une minute de retard ne gêne personne. */
const RYTHME_APRES_PRETE_MS = 60_000;
/** Au-delà, une commande n'est plus suivie, quel que soit son état. */
const DUREE_MAX_MS = 12 * 60 * 60 * 1000;
/** Commandes relues par tour, au plus. */
const PAR_TOUR = 300;
/** Appels simultanés vers Flaix, au plus. */
const PAR_PAQUET = 10;
/** Essais d'envoi de la notification « prête », au plus (un par tour). */
const MAX_ESSAIS_ENVOI = 3;
/** Une Live Activity terminée reste visible une minute. */
const VISIBLE_APRES_FIN_MS = 60_000;
/** Une commande réservée par une instance n'est pas reprise par une autre avant. */
const RESERVATION_MS = 30_000;
/** Une heure après la fin d'une commande, on cesse de rattraper sa Live Activity. */
const ABANDON_APRES_FIN_MS = 60 * 60_000;
/** « Note ta commande » : 10 min après la remise (Rémi, 22/11/2026). */
const DELAI_RELANCE_NOTE_MS = 10 * 60_000;
/** Au-delà, la relance n'a plus de sens : on ne l'envoie plus. */
const RELANCE_NOTE_MAX_MS = 24 * 60 * 60_000;
/** Combien de temps une commande récupérée se note encore dans l'app. */
const NOTABLE_PENDANT_MS = 48 * 60 * 60_000;
/** Sans nouvelle, iOS grise l'activité au bout d'une heure. */
const PEREMPTION_MS = 60 * 60 * 1000;

type IssueEnvoi = 'envoyee' | 'personne' | 'echec';

interface Suivi {
  jeton: string;
  userId: string;
  numero: string;
  pointDeRetrait: string | null;
  passeeLe: Date;
  etat: string;
  preteAnnoncee: boolean;
  essaisAnnonce: number;
}

@Injectable()
export class SurveillanceCommandesFlaixService {
  private readonly logger = new Logger(SurveillanceCommandesFlaixService.name);
  private tourEnCours = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly commandes: CommandesClientFlaixService,
    @Optional() private readonly expoPush?: ExpoPushService,
    @Optional() private readonly pushTokens?: PushTokensService,
    @Optional() private readonly apns?: ApnsService,
  ) {}

  /**
   * Met sous surveillance les commandes EN COURS de ce client. Une commande
   * déjà prête est suivie aussi (pour sa Live Activity et sa remise), mais sa
   * notification n'est pas renvoyée : le client la voit déjà à l'écran.
   */
  async surveiller(userId: string, commandes: CommandeFlaix[]): Promise<void> {
    const enCours = commandes.filter((c) => c.enCours && c.id);
    if (enCours.length === 0) return;
    const cree = await this.prisma.suiviCommandeFlaix.createMany({
      data: enCours.map((c) => ({
        jeton: c.id,
        userId,
        numero: c.numero,
        pointDeRetrait: c.pointDeRetrait,
        passeeLe: new Date(c.passeeLe).getTime() ? new Date(c.passeeLe) : new Date(),
        etat: c.etat ?? 'queued',
        preteAnnoncee: c.prete,
        lieuFlaix: c.lieuId ?? null,
        evenementFlaix: c.evenementId ?? null,
      })),
      // Déjà suivie (par ce client) : rien à faire. Un jeton est unique chez Flaix.
      skipDuplicates: true,
    });
    // Le JOURNAL de chaque étape (25/11/2026) : sans lui, une commande bien
    // suivie ne laissait aucune trace, et un essai ne se vérifiait pas.
    // Le numéro seulement — jamais le jeton, qui est un droit d'accès.
    if (cree.count > 0) {
      this.logger.log(
        `Commande Flaix suivie : n° ${enCours.map((c) => c.numero).join(', ')} (${cree.count} nouvelle(s))`,
      );
    }
  }

  /**
   * La page de commande de l'app a vu passer ce jeton (fin du paiement) : on le
   * suit, et on rend l'état de départ de la Live Activity. 404 si la commande
   * n'est pas (encore) dans la liste Flaix du client — l'app réessaie.
   */
  async suivreDepuisLApp(
    userId: string,
    jeton: string,
    commandes: CommandeFlaix[],
  ): Promise<EtatLiveActivityFlaix> {
    const commande = commandes.find((c) => c.id === jeton);
    if (commande) await this.surveiller(userId, [commande]);
    const suivi = await this.prisma.suiviCommandeFlaix.findFirst({ where: { jeton, userId } });
    // Même réponse qu'on ne la connaisse pas ou qu'elle soit à un autre : un
    // jeton ne doit rien révéler de la commande d'un autre client.
    if (!suivi) {
      this.logger.warn(`Suivi demandé par l’app : commande pas (encore) dans la liste Flaix du client (${commandes.length} commande(s) lue(s))`);
      throw new NotFoundException('Commande introuvable pour le moment.');
    }
    this.logger.log(`Suivi demandé par l’app : commande n° ${suivi.numero}, état ${suivi.etat}`);
    return etatLiveActivity(suivi);
  }

  /**
   * L'ÉTAT EN DIRECT DES COMMANDES FLAIX SUIVIES DE CE CLIENT (25/11/2026).
   *
   * Lu dans NOTRE base, que la surveillance tient à jour toutes les 15 s : la
   * flamme de la barre du bas et « Mes commandes » peuvent le relire toutes les
   * 10 s sans jamais interroger Flaix en boucle (contrat Flaix, § 7). Les
   * commandes en cours, et celles terminées depuis moins d'une heure (la flamme
   * montre « récupérée » une minute).
   *
   * Le statut est rendu dans le vocabulaire d'une commande BreakEat (PAID,
   * PREPARING, READY, PICKED_UP, CANCELLED) : la flamme le lit sans changement.
   */
  async mesSuivis(userId: string, maintenant: Date = new Date()) {
    const suivis = await this.prisma.suiviCommandeFlaix.findMany({
      where: {
        userId,
        // Terminées depuis moins de 48 h : le temps de les noter.
        OR: [{ termine: false }, { updatedAt: { gt: new Date(maintenant.getTime() - NOTABLE_PENDANT_MS) } }],
      },
      orderBy: { passeeLe: 'desc' },
      take: 20,
      include: { note: { select: { stars: true } } },
    });
    const VERS_COMMANDE = {
      CREATED: 'PAID',
      PREPARING: 'PREPARING',
      READY: 'READY',
      COLLECTED: 'PICKED_UP',
      CANCELLED: 'CANCELLED',
    } as const;
    return suivis.map((s) => ({
      id: s.jeton,
      numero: s.numero,
      etat: s.etat,
      status: VERS_COMMANDE[statutWidget(s.etat)],
      createdAt: s.passeeLe.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      // Notable : récupérée, pas encore notée (26/11/2026).
      notable: s.remiseLe !== null && !s.note,
      note: s.note?.stars ?? null,
    }));
  }

  /**
   * LA NOTE D'UNE COMMANDE FLAIX (26/11/2026). Seulement SA commande, et
   * seulement une fois récupérée ; une seule note (la base l'impose).
   */
  async noter(
    userId: string,
    jeton: string,
    params: { stars: number; comment?: string | null },
  ): Promise<{ stars: number }> {
    const suivi = await this.prisma.suiviCommandeFlaix.findFirst({ where: { jeton, userId } });
    if (!suivi) throw new NotFoundException('Commande introuvable.');
    if (!suivi.remiseLe) {
      throw new BadRequestException('Tu pourras noter ta commande une fois que tu l’auras récupérée.');
    }
    const commentaire = params.comment?.trim() || null;
    try {
      await this.prisma.noteCommandeFlaix.create({
        data: {
          jeton,
          userId,
          stars: params.stars,
          comment: commentaire,
          numero: suivi.numero,
          pointDeRetrait: suivi.pointDeRetrait,
          lieuFlaix: suivi.lieuFlaix,
          evenementFlaix: suivi.evenementFlaix,
        },
      });
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Tu as déjà noté cette commande. Merci !');
      }
      throw e;
    }
    this.logger.log(`Commande Flaix n° ${suivi.numero} notée ${params.stars}/5`);
    return { stars: params.stars };
  }

  /**
   * « NOTE TA COMMANDE », 10 MIN APRÈS LA REMISE (26/11/2026). Une fois par
   * commande, pas pour une commande déjà notée, et plus au-delà de 24 h.
   */
  async relancerNotes(maintenant: Date): Promise<number> {
    if (!this.expoPush || !this.pushTokens) return 0;
    const dues = await this.prisma.suiviCommandeFlaix.findMany({
      where: {
        relanceNoteLe: null,
        note: null,
        remiseLe: {
          lte: new Date(maintenant.getTime() - DELAI_RELANCE_NOTE_MS),
          gt: new Date(maintenant.getTime() - RELANCE_NOTE_MAX_MS),
        },
      },
      take: 100,
    });
    let envoyees = 0;
    for (const s of dues) {
      // Marquée AVANT l'envoi : un échec ne relance pas en boucle, et deux tours
      // n'envoient jamais deux fois.
      const pris = await this.prisma.suiviCommandeFlaix.updateMany({
        where: { jeton: s.jeton, relanceNoteLe: null },
        data: { relanceNoteLe: maintenant },
      });
      if (pris.count === 0) continue;
      try {
        const jetons = await this.pushTokens.tokensForUsers([s.userId]);
        if (jetons.length === 0) continue;
        const canaux = (await this.pushTokens.canauxCommandes?.(jetons)) ?? new Set<string>();
        const r = await this.expoPush.send(
          jetons.map((to) => ({
            to,
            ...(canaux.has(to) ? { channelId: CANAL_COMMANDES } : {}),
            title: 'Note ta commande',
            body:
              `Commande n° ${s.numero}` +
              (s.pointDeRetrait ? ` chez ${s.pointDeRetrait}` : '') +
              ' : dis-nous comment ça s’est passé.',
            sound: 'default' as const,
            data: { type: 'noter_commande', source: 'flaix', jeton: s.jeton },
          })),
        );
        if (r.invalidTokens.length > 0) await this.pushTokens.purgeInvalid(r.invalidTokens);
        if (r.sent > 0) envoyees += 1;
        this.logger.log(`Commande Flaix n° ${s.numero} : « Note ta commande » envoyée (${r.sent} appareil(s))`);
      } catch (e: unknown) {
        this.logger.error(`Commande Flaix n° ${s.numero} : « Note ta commande » non envoyée (${String(e)})`);
      }
    }
    return envoyees;
  }

  /** L'app a démarré une Live Activity pour une commande Flaix qu'elle suit. */
  async enregistrerActivite(params: {
    userId: string;
    jeton: string;
    activityId: string;
    pushToken: string;
  }): Promise<void> {
    const suivi = await this.prisma.suiviCommandeFlaix.findFirst({
      where: { jeton: params.jeton, userId: params.userId },
      select: { jeton: true, numero: true },
    });
    if (!suivi) throw new NotFoundException('Commande introuvable.');
    await this.prisma.$transaction(async (tx) => {
      // Un même jeton push ne vise qu'une activité : une ancienne ligne qui le
      // porterait encore ferait échouer l'unicité.
      await tx.liveActivityFlaix.deleteMany({
        where: { pushToken: params.pushToken, NOT: { jeton: params.jeton, activityId: params.activityId } },
      });
      await tx.liveActivityFlaix.upsert({
        where: { jeton_activityId: { jeton: params.jeton, activityId: params.activityId } },
        update: { pushToken: params.pushToken, status: LiveActivityStatus.ACTIVE, endedAt: null },
        create: {
          jeton: params.jeton,
          userId: params.userId,
          activityId: params.activityId,
          pushToken: params.pushToken,
        },
      });
    });
    this.logger.log(`Live Activity Flaix enregistrée (commande n° ${suivi.numero})`);
  }

  @Interval(INTERVALLE_MS)
  async tourner(maintenant: Date = new Date()): Promise<void> {
    if (this.tourEnCours) return;
    this.tourEnCours = true;
    try {
      const dus = await this.prisma.suiviCommandeFlaix.findMany({
        where: { termine: false, prochaineLecture: { lte: maintenant } },
        orderBy: { prochaineLecture: 'asc' },
        take: PAR_TOUR,
      });
      for (let i = 0; i < dus.length; i += PAR_PAQUET) {
        await Promise.all(dus.slice(i, i + PAR_PAQUET).map((s) => this.reserverPuisVerifier(s, maintenant)));
      }
      await this.rattraperActivites(maintenant);
      await this.relancerNotes(maintenant);
    } catch (e: unknown) {
      this.logger.error(`Surveillance Flaix : tour interrompu (${String(e)})`);
    } finally {
      this.tourEnCours = false;
    }
  }

  /**
   * RÉSERVER LA COMMANDE AVANT DE LA TRAITER (audit Codex du 26/11/2026).
   * `tourEnCours` ne vaut que pour UNE instance du serveur : à deux, la même
   * commande pouvait être lue deux fois et la notification « prête » partir en
   * double. La mise à jour conditionnelle n'est gagnée que par une instance.
   */
  private async reserverPuisVerifier(s: Suivi & { prochaineLecture: Date }, maintenant: Date): Promise<void> {
    const pris = await this.prisma.suiviCommandeFlaix.updateMany({
      where: { jeton: s.jeton, prochaineLecture: s.prochaineLecture, termine: false },
      data: { prochaineLecture: new Date(maintenant.getTime() + RESERVATION_MS) },
    });
    if (pris.count === 0) return;
    await this.verifier(s, maintenant);
  }

  private async verifier(s: Suivi, maintenant: Date): Promise<void> {
    try {
      if (maintenant.getTime() - s.passeeLe.getTime() > DUREE_MAX_MS) {
        await this.prisma.suiviCommandeFlaix.update({ where: { jeton: s.jeton }, data: { termine: true } });
        await this.fermerActivites(s.jeton);
        return;
      }

      const lu = await this.commandes.lireEtat(s.jeton);
      if (!lu) {
        // Flaix muet : on retentera au rythme habituel.
        await this.prisma.suiviCommandeFlaix.update({
          where: { jeton: s.jeton },
          data: { prochaineLecture: new Date(maintenant.getTime() + RYTHME_AVANT_PRETE_MS) },
        });
        return;
      }

      const etat = lu.etat;
      const widget = statutWidget(etat);
      const fini = estTerminal(etat) || widget === 'COLLECTED' || widget === 'CANCELLED';
      const prete = estPrete(etat);

      let preteAnnoncee = s.preteAnnoncee;
      let essaisAnnonce = s.essaisAnnonce;
      if (prete && !preteAnnoncee) {
        const issue = await this.annoncer(s);
        if (issue === 'echec') {
          essaisAnnonce += 1;
          if (essaisAnnonce >= MAX_ESSAIS_ENVOI) {
            preteAnnoncee = true;
            this.logger.error(
              `Commande Flaix ${s.numero} prête : notification abandonnée après ${essaisAnnonce} essais`,
            );
          }
        } else {
          preteAnnoncee = true;
        }
      }

      // Une annonce « prête » encore à retenter garde le rythme rapide : le
      // client attend sa notification maintenant, pas dans une minute.
      const rythme = preteAnnoncee ? RYTHME_APRES_PRETE_MS : RYTHME_AVANT_PRETE_MS;
      await this.prisma.suiviCommandeFlaix.update({
        where: { jeton: s.jeton },
        data: {
          etat,
          preteAnnoncee,
          essaisAnnonce,
          termine: fini,
          ...(widget === 'COLLECTED' ? { remiseLe: maintenant } : {}),
          prochaineLecture: new Date(maintenant.getTime() + rythme),
        },
      });

      // La Live Activity n'est plus poussée ICI, au seul changement d'état :
      // un envoi raté n'était jamais rattrapé, ni une activité enregistrée
      // après le changement (audit Codex du 26/11/2026). `rattraperActivites`
      // pousse à chaque tour tant qu'une activité n'a pas reçu l'état courant.
      if (etat !== s.etat) this.logger.log(`Commande Flaix n° ${s.numero} : ${s.etat} → ${etat}`);
    } catch (e: unknown) {
      this.logger.error(`Surveillance Flaix : commande ${s.numero} non vérifiée (${String(e)})`);
    }
  }

  /**
   * FAIRE AVANCER LES LIVE ACTIVITIES — UN RATTRAPAGE, À CHAQUE TOUR
   * (audit Codex du 26/11/2026).
   *
   * Chaque activité retient le dernier état réellement reçu par l'iPhone
   * (`etatEnvoye`). Tant qu'il diffère de l'état courant de la commande, on
   * repousse : une erreur APNs passagère est reprise au tour suivant (15 s), et
   * une activité enregistrée APRÈS un changement reçoit l'état courant au tour
   * suivant. Au-delà d'une heure après la fin de la commande, on renonce.
   */
  async rattraperActivites(maintenant: Date): Promise<number> {
    if (!this.apns) return 0;
    const actives = await this.prisma.liveActivityFlaix.findMany({
      where: { status: LiveActivityStatus.ACTIVE },
      include: { suivi: true },
      take: 200,
    });
    let poussees = 0;
    for (const a of actives) {
      const s = a.suivi;
      if (s.termine && maintenant.getTime() - s.updatedAt.getTime() > ABANDON_APRES_FIN_MS) {
        await this.prisma.liveActivityFlaix.update({
          where: { id: a.id },
          data: { status: LiveActivityStatus.ENDED, endedAt: maintenant },
        });
        continue;
      }
      const etat = etatLiveActivity(s, maintenant);
      if (a.etatEnvoye === etat.status) continue;

      const finale = etat.status === 'COLLECTED' || etat.status === 'CANCELLED';
      const r = await this.apns.sendLiveActivityUpdate(
        a.pushToken,
        finale ? 'end' : 'update',
        etat as unknown as Record<string, unknown>,
        finale
          ? { dismissalDate: new Date(maintenant.getTime() + VISIBLE_APRES_FIN_MS) }
          : { staleDate: new Date(maintenant.getTime() + PEREMPTION_MS) },
      );
      if (r.ok) {
        poussees += 1;
        this.logger.log(`Live Activity Flaix n° ${s.numero} → ${etat.status}`);
        await this.prisma.liveActivityFlaix.update({
          where: { id: a.id },
          data: {
            etatEnvoye: etat.status,
            ...(finale ? { status: LiveActivityStatus.ENDED, endedAt: maintenant } : {}),
          },
        });
      } else if (r.tokenInvalid) {
        await this.prisma.liveActivityFlaix.update({
          where: { id: a.id },
          data: { status: LiveActivityStatus.STALE, endedAt: maintenant },
        });
      } else {
        // Passager : repris au tour suivant.
        this.logger.warn(`Live Activity Flaix n° ${s.numero} : APNs ${r.status} ${r.reason ?? ''}, nouvel essai au tour suivant`);
      }
    }
    return poussees;
  }

  /** Plus rien à envoyer à ces activités : on les clôt côté serveur. */
  private async fermerActivites(jeton: string): Promise<void> {
    await this.prisma.liveActivityFlaix.updateMany({
      where: { jeton, status: LiveActivityStatus.ACTIVE },
      data: { status: LiveActivityStatus.ENDED, endedAt: new Date() },
    });
  }

  private async annoncer(s: Suivi): Promise<IssueEnvoi> {
    if (!this.expoPush || !this.pushTokens) return 'personne';
    try {
      const jetons = await this.pushTokens.tokensForUsers([s.userId]);
      if (jetons.length === 0) {
        // Dit, et plus en silence (25/11/2026) : notifications refusées, ou
        // téléphone jamais enregistré — c'est la première chose à vérifier.
        this.logger.warn(`Commande Flaix ${s.numero} prête : aucun appareil enregistré pour ce client, notification impossible`);
        return 'personne';
      }
      const titre = 'Ta commande est prête';
      const corps =
        (s.numero ? `Commande n° ${s.numero} — ` : '') +
        (s.pointDeRetrait
          ? `à récupérer au point de retrait ${s.pointDeRetrait}.`
          : 'à récupérer au point de retrait.');
      const canaux = (await this.pushTokens.canauxCommandes?.(jetons)) ?? new Set<string>();
      const resultat = await this.expoPush.send(
        jetons.map((to) => ({
          to,
          ...(canaux.has(to) ? { channelId: CANAL_COMMANDES } : {}),
          title: titre,
          body: corps,
          sound: 'default' as const,
          // Même type qu'une commande BreakEat : l'app ouvre « Mes commandes ».
          data: { type: 'order_ready', source: 'flaix' },
        })),
      );
      if (resultat.invalidTokens.length > 0) await this.pushTokens.purgeInvalid(resultat.invalidTokens);
      this.logger.log(`Commande Flaix ${s.numero} prête : ${resultat.sent} appareil(s) prévenu(s)`);
      // `send` ne lève jamais : zéro appareil atteint, c'est un échec à retenter.
      return resultat.sent > 0 ? 'envoyee' : 'echec';
    } catch (e: unknown) {
      this.logger.error(`Commande Flaix ${s.numero} prête, notification non envoyée (${String(e)})`);
      return 'echec';
    }
  }
}
