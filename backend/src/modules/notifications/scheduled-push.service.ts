import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { requireOrgAccess, MANAGE_ROLES, ALL_ORG_ROLES } from '../../common/helpers/require-org-access';
import { ExpoPushService } from './expo-push.service';
import { UserNotificationsService } from './user-notifications.service';
import { PushTokensService } from './push-tokens.service';

/**
 * ScheduledPushService — pushs programmés (C2) + campagnes promo auto (C3).
 *
 * - kind 'PUSH' : notification simple envoyée à l'heure prévue.
 * - kind 'DISCOUNT_CAMPAIGN' : campagne (ex. -50 % fin de match) qui envoie un
 *   push d'annonce. ⚠️ L'application réelle de la remise au panier se branche au
 *   checkout (invariant Stripe) — pièce de suivi ; ici on planifie + on annonce.
 *
 * Un cron (chaque minute) traite les entrées dont l'heure est passée.
 * organizationId nullable (Phase 17) : null = broadcast plateforme tous utilisateurs.
 */

export interface CreateScheduledPushInput {
  eventId?: string;
  /** Cible un LIEU du club. Absent = tous ses clients. */
  venueId?: string;
  kind?: 'PUSH' | 'DISCOUNT_CAMPAIGN';
  title: string;
  body?: string;
  discountPercent?: number;
  scheduledAt: string; // ISO
}

@Injectable()
export class ScheduledPushService {
  private readonly logger = new Logger(ScheduledPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
    private readonly pushTokens: PushTokensService,
    private readonly userNotifications: UserNotificationsService,
  ) {}

  async create(orgId: string, userId: string, dto: CreateScheduledPushInput) {
    await requireOrgAccess(this.prisma, userId, orgId, MANAGE_ROLES);
    if (!dto.title?.trim()) throw new BadRequestException('Titre requis.');
    const when = new Date(dto.scheduledAt);
    if (isNaN(when.getTime())) throw new BadRequestException('Date invalide.');

    if (dto.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: dto.eventId, organizationId: orgId },
        select: { id: true },
      });
      if (!event) throw new BadRequestException("L'événement n'appartient pas à cette organisation.");
    }

    // Le lieu doit appartenir au club. Sans cette vérification, un club
    // pourrait adresser un message aux clients d'un autre en devinant un
    // identifiant.
    if (dto.venueId) {
      const lieu = await this.prisma.venue.findFirst({
        where: { id: dto.venueId, organizationId: orgId },
        select: { id: true },
      });
      if (!lieu) throw new BadRequestException("Ce lieu n'appartient pas à cette organisation.");
    }

    return this.prisma.scheduledPush.create({
      data: {
        organizationId: orgId,
        eventId: dto.eventId ?? null,
        venueId: dto.venueId ?? null,
        kind: dto.kind ?? 'PUSH',
        title: dto.title.trim(),
        body: dto.body?.trim() ?? '',
        discountPercent: dto.kind === 'DISCOUNT_CAMPAIGN' ? (dto.discountPercent ?? 50) : null,
        scheduledAt: when,
        createdBy: userId,
      },
    });
  }

  async list(orgId: string, userId: string) {
    await requireOrgAccess(this.prisma, userId, orgId, ALL_ORG_ROLES);
    return this.prisma.scheduledPush.findMany({
      where: { organizationId: orgId },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async cancel(orgId: string, id: string, userId: string) {
    await requireOrgAccess(this.prisma, userId, orgId, MANAGE_ROLES);
    const existing = await this.prisma.scheduledPush.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Push programmé introuvable.');
    if (existing.status !== 'PENDING') throw new BadRequestException('Seuls les pushs en attente peuvent être annulés.');
    return this.prisma.scheduledPush.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /**
   * Résout les jetons push cibles.
   * - orgId null → tous les utilisateurs de la plateforme (jetons enregistrés) ;
   * - orgId défini → ceux qui ont commandé dans l'org, restreints à
   *   l'événement ou au LIEU quand l'un des deux est précisé.
   */
  async resolveAudience(
    orgId: string | null,
    eventId: string | null,
    venueId: string | null = null,
  ): Promise<string[]> {
    return (await this.destinataires(orgId, eventId, venueId)).tokens;
  }

  /**
   * Le public d'une campagne : ses JETONS pour l'envoi, ses UTILISATEURS pour
   * la cloche.
   *
   * Les deux se calculent ensemble parce qu'ils décrivent le même public. Les
   * séparer laisserait dériver l'un de l'autre — une notification archivée pour
   * quelqu'un qui ne l'a pas reçue, ou l'inverse.
   *
   * Un client sans jeton (permission refusée, appareil neuf) est tout de même
   * archivé : il retrouvera l'annonce sur sa cloche à sa prochaine ouverture.
   */
  private async destinataires(
    orgId: string | null,
    eventId: string | null,
    venueId: string | null = null,
  ): Promise<{ tokens: string[]; userIds: string[] }> {
    if (orgId === null) {
      // Diffusion plateforme : on ne connaît que les appareils enregistrés.
      const rows = await this.prisma.pushToken.findMany({ select: { token: true, userId: true } });
      return {
        tokens: rows.map((r) => r.token),
        userIds: [...new Set(rows.map((r) => r.userId))],
      };
    }
    // Segmenter PAR LIEU : un club qui tient plusieurs adresses n'a aucune
    // raison d'annoncer une soirée au Vélodrome aux clients de son annexe. Le
    // message arriverait à des gens qu'il ne concerne pas — et c'est ainsi
    // qu'on se fait couper les notifications.
    const orders = await this.prisma.order.findMany({
      where: {
        organizationId: orgId,
        ...(eventId ? { eventId } : {}),
        ...(venueId ? { venueId } : {}),
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const userIds = [...new Set(orders.map((o) => o.userId))];
    return { tokens: await this.pushTokens.tokensForUsers(userIds), userIds };
  }

  /** Traite une entrée due : envoie le push, met à jour le statut. */
  async process(id: string): Promise<void> {
    const claim = await this.prisma.scheduledPush.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (claim.count === 0) return;
    const sp = await this.prisma.scheduledPush.findUnique({ where: { id } });
    if (!sp) return;
    try {
      const { tokens, userIds } = await this.destinataires(
        sp.organizationId,
        sp.eventId,
        sp.venueId,
      );

      // Archivé AVANT l'envoi, et sans dépendre de son succès : un push balayé
      // de l'écran n'existe plus, la cloche est le seul endroit où l'annonce
      // survit. Un client sans jeton la retrouvera quand même.
      await this.userNotifications.archiver({
        userIds,
        organizationId: sp.organizationId,
        title: sp.title,
        body: sp.body,
      });

      const result = await this.expoPush.send(
        tokens.map((to) => ({ to, title: sp.title, body: sp.body, data: { kind: sp.kind, eventId: sp.eventId } })),
      );
      if (result.invalidTokens.length > 0) await this.pushTokens.purgeInvalid(result.invalidTokens);

      /**
       * « ENVOYÉ » NE DOIT SE DIRE QUE SI QUELQUE CHOSE EST PARTI.
       *
       * `ExpoPushService.send()` ne lève jamais : il absorbe les erreurs
       * réseau et rend un résumé. Une campagne dont TOUS les lots avaient
       * échoué — Expo injoignable, coupure réseau — était donc marquée
       * `SENT` avec `sentCount: 0`. Le club lisait « envoyé » pour une
       * annonce que personne n'avait reçue, et ne s'en apercevait qu'au
       * silence du stade.
       *
       * ZÉRO DESTINATAIRE N'EST PAS UN ÉCHEC, en revanche : si personne
       * n'a de jeton — appareils neufs, notifications refusées —, il n'y
       * avait rien à envoyer, et l'annonce vit déjà sur la cloche, archivée
       * plus haut. La distinction se joue sur ce qu'on a TENTÉ.
       */
      const tente = tokens.length;
      const abouti = tente === 0 || result.sent > 0;

      /**
       * `sentAt` EST UNE DATE D'ENVOI, PAS UNE DATE DE TENTATIVE.
       *
       * Elle était posée dans les deux cas. Une campagne `FAILED` portait
       * donc une heure d'envoi — « échouée, envoyée à 18 h 42 ». Le club qui
       * relit ses annonces ne sait plus laquelle est partie, et un rapport
       * qui compte les envois par date compte des envois qui n'ont pas eu
       * lieu.
       *
       * Rien n'est perdu : `updatedAt` garde l'heure de la tentative, et
       * l'échec est journalisé juste en dessous. Ici, l'absence de date EST
       * l'information — c'est ce qui distingue « jamais parti » de « parti ».
       */
      await this.prisma.scheduledPush.update({
        where: { id },
        data: {
          status: abouti ? 'SENT' : 'FAILED',
          ...(abouti ? { sentAt: new Date() } : {}),
          sentCount: result.sent,
        },
      });

      if (!abouti) {
        this.logger.error(
          `ScheduledPush ${id} (${sp.kind}) ÉCHOUÉ : ${tente} jeton(s) visé(s), aucun envoi abouti.`,
        );
      } else if (result.failed > 0) {
        // Succès partiel : il est dans `sentCount`, mais il doit aussi se lire
        // dans les journaux — un envoi à moitié passé ne se devine pas.
        this.logger.warn(
          `ScheduledPush ${id} (${sp.kind}) partiel : ${result.sent} envoyé(s), ${result.failed} échoué(s).`,
        );
      } else {
        this.logger.log(`ScheduledPush ${id} (${sp.kind}) envoyé à ${result.sent} appareil(s)`);
      }
    } catch (err) {
      this.logger.error(`ScheduledPush ${id} a échoué: ${err instanceof Error ? err.message : err}`);
      await this.prisma.scheduledPush.update({ where: { id }, data: { status: 'FAILED' } }).catch(() => {});
    }
  }

  /**
   * Une campagne restée en PROCESSING n'a plus personne pour la finir.
   *
   * Le passage `PENDING` → `PROCESSING` empêche deux instances de traiter la
   * même campagne. Mais si le processus meurt entre ce passage et la fin, la
   * ligne reste `PROCESSING` POUR TOUJOURS : `processDue` ne regarde que les
   * `PENDING`, et plus rien ne la reprend. Un redéploiement au mauvais
   * moment suffisait — et la campagne disparaissait en silence.
   *
   * ON NE LA REJOUE PAS, ON LA MARQUE ÉCHOUÉE. L'archivage a lieu AVANT
   * l'envoi : la rejouer dupliquerait les entrées de la cloche, et peut-être
   * les notifications elles-mêmes si la mort est survenue après l'envoi.
   * Une annonce reçue deux fois agace ; une annonce manquée se rattrape en
   * la recréant, ce que le club peut faire lui-même — à condition de le
   * savoir, et c'est tout l'objet de ce relevé.
   *
   * Un quart d'heure : bien au-delà de la durée d'un envoi normal, donc une
   * ligne encore `PROCESSING` après ce délai n'est plus en cours, elle est
   * abandonnée.
   */
  private async libererLesBloquees(): Promise<void> {
    const limite = new Date(Date.now() - 15 * 60_000);
    const bloquees = await this.prisma.scheduledPush.findMany({
      where: { status: 'PROCESSING', updatedAt: { lt: limite } },
      select: { id: true, kind: true },
    });
    if (bloquees.length === 0) return;

    await this.prisma.scheduledPush.updateMany({
      where: { id: { in: bloquees.map((b) => b.id) } },
      data: { status: 'FAILED' },
    });
    for (const { id, kind } of bloquees) {
      this.logger.error(
        `ScheduledPush ${id} (${kind}) abandonné : resté en cours plus de 15 minutes, ` +
          `probablement interrompu par un redéploiement. Marqué ÉCHOUÉ — à recréer si besoin.`,
      );
    }
  }

  /** Cron : traite les pushs/campagnes dont l'heure est passée. */
  @Cron(CronExpression.EVERY_MINUTE)
  async processDue(): Promise<void> {
    await this.libererLesBloquees();
    const due = await this.prisma.scheduledPush.findMany({
      where: { status: 'PENDING', scheduledAt: { lte: new Date() } },
      select: { id: true },
      take: 50,
    });
    for (const { id } of due) {
      await this.process(id);
    }
  }
}
