import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { requireOrgAccess, MANAGE_ROLES, ALL_ORG_ROLES } from '../../common/helpers/require-org-access';
import { ExpoPushService } from './expo-push.service';
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
 */

export interface CreateScheduledPushInput {
  eventId?: string;
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
  ) {}

  async create(orgId: string, userId: string, dto: CreateScheduledPushInput) {
    await requireOrgAccess(this.prisma, userId, orgId, MANAGE_ROLES);
    if (!dto.title?.trim()) throw new BadRequestException('Titre requis.');
    const when = new Date(dto.scheduledAt);
    if (isNaN(when.getTime())) throw new BadRequestException('Date invalide.');

    // P2 — l'événement ciblé doit appartenir à l'organisation.
    if (dto.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: dto.eventId, organizationId: orgId },
        select: { id: true },
      });
      if (!event) throw new BadRequestException("L'événement n'appartient pas à cette organisation.");
    }

    return this.prisma.scheduledPush.create({
      data: {
        organizationId: orgId,
        eventId: dto.eventId ?? null,
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

  /** Jetons des clients ayant commandé dans l'org (et l'event si précisé). */
  private async resolveAudience(orgId: string, eventId: string | null): Promise<string[]> {
    const orders = await this.prisma.order.findMany({
      where: { organizationId: orgId, ...(eventId ? { eventId } : {}) },
      select: { userId: true },
      distinct: ['userId'],
    });
    const userIds = [...new Set(orders.map((o) => o.userId))];
    return this.pushTokens.tokensForUsers(userIds);
  }

  /** Traite une entrée due : envoie le push, met à jour le statut. */
  async process(id: string): Promise<void> {
    // P2 — claim atomique PENDING → PROCESSING : empêche le double envoi
    // si plusieurs instances/cron lisent la même entrée en même temps.
    const claim = await this.prisma.scheduledPush.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (claim.count === 0) return; // déjà pris en charge par un autre worker
    const sp = await this.prisma.scheduledPush.findUnique({ where: { id } });
    if (!sp) return;
    try {
      const tokens = await this.resolveAudience(sp.organizationId, sp.eventId);
      const result = await this.expoPush.send(
        tokens.map((to) => ({ to, title: sp.title, body: sp.body, data: { kind: sp.kind, eventId: sp.eventId } })),
      );
      if (result.invalidTokens.length > 0) await this.pushTokens.purgeInvalid(result.invalidTokens);
      await this.prisma.scheduledPush.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), sentCount: result.sent },
      });
      this.logger.log(`ScheduledPush ${id} (${sp.kind}) envoyé à ${result.sent} appareil(s)`);
    } catch (err) {
      this.logger.error(`ScheduledPush ${id} a échoué: ${err instanceof Error ? err.message : err}`);
      await this.prisma.scheduledPush.update({ where: { id }, data: { status: 'FAILED' } }).catch(() => {});
    }
  }

  /** Cron : traite les pushs/campagnes dont l'heure est passée. */
  @Cron(CronExpression.EVERY_MINUTE)
  async processDue(): Promise<void> {
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
