import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LiveActivityService, type WidgetStatus } from './live-activity.service';

/**
 * Événements métier envoyés par Flaix.
 *
 * Flaix décrit CE QUI SE PASSE côté opérationnel ; Break Eat décide comment
 * l'afficher. Aucun de ces événements ne porte de contenu d'interface.
 */
export type FlaixEventType =
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_READY'
  | 'ORDER_DELAYED'
  | 'ORDER_CANCELLED'
  | 'ORDER_COLLECTED'
  | 'PICKUP_SLOT_CHANGED'
  | 'PICKUP_POINT_CHANGED';

/** Enveloppe attendue (cf. FLAIX_CONTRACT.md — section Live Activity). */
export interface FlaixWebhookPayload {
  /** Identifiant unique de l'événement — clé d'idempotence. */
  eventId: string;
  event: FlaixEventType;
  /** Commande Break Eat concernée. */
  orderId: string;
  /** Statut opérationnel, quand l'événement en porte un. */
  status?: string;
  estimatedReadyAt?: string | null;
  slotId?: string | null;
  pickupPointId?: string;
  /** Horodatage d'émission (ISO) — sert à la protection anti-rejeu. */
  timestamp: string;
}

/** Correspondance statut Flaix → statut d'AFFICHAGE de la Live Activity. */
const FLAIX_STATUS_TO_WIDGET: Record<string, WidgetStatus> = {
  ORDER_CREATED: 'CREATED',
  CREATED: 'CREATED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  DELAYED: 'DELAYED',
  COLLECTED: 'COLLECTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'CANCELLED',
};

/** Fenêtre d'acceptation d'un événement (anti-rejeu). */
const MAX_EVENT_AGE_MS = 5 * 60 * 1000;

/**
 * FlaixWebhookService — SOURCE 2 du pipeline Live Activity.
 *
 * Flaix reste la source de vérité opérationnelle : Break Eat ne recalcule ni
 * les statuts ni les estimations, il les REÇOIT et les présente. Aucune
 * machine à états concurrente n'est introduite ici — `OrderStatus` (Break Eat)
 * n'est pas réécrit par un webhook ; seules les informations d'affichage
 * (estimation, créneau, point de retrait) sont persistées.
 *
 * Robustesse :
 *  - signature HMAC-SHA256 du corps brut (comparaison à temps constant) ;
 *  - fenêtre temporelle contre le rejeu d'un événement capturé ;
 *  - idempotence par `eventId` unique en base ;
 *  - journal complet (payload brut, succès/erreur) pour l'audit et le rejeu.
 */
@Injectable()
export class FlaixWebhookService {
  private readonly logger = new Logger(FlaixWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly liveActivity: LiveActivityService,
  ) {}

  /**
   * Vérifie la signature du corps BRUT.
   *
   * Le corps doit rester un Buffer non reparsé : re-sérialiser du JSON change
   * les octets (ordre des clés, espaces) et invaliderait la signature.
   */
  verifySignature(rawBody: Buffer, signature: string | undefined): void {
    const secret = this.config.get<string>('app.flaix.webhookSecret');
    if (!secret) {
      // Refus explicite : un webhook non signé ne doit jamais être accepté
      // « par défaut » simplement parce que la configuration est incomplète.
      throw new UnauthorizedException('Webhook Flaix non configuré');
    }
    if (!signature) {
      throw new UnauthorizedException('Signature manquante');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    // Longueurs différentes ⇒ timingSafeEqual lève : on court-circuite proprement.
    const provided = signature.replace(/^sha256=/, '');
    if (provided.length !== expected.length) {
      throw new UnauthorizedException('Signature invalide');
    }
    if (!timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'))) {
      throw new UnauthorizedException('Signature invalide');
    }
  }

  /** Valide la forme de l'enveloppe et la fraîcheur de l'événement. */
  parsePayload(rawBody: Buffer): FlaixWebhookPayload {
    let payload: FlaixWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as FlaixWebhookPayload;
    } catch {
      throw new BadRequestException('Corps JSON invalide');
    }
    if (!payload.eventId || !payload.event || !payload.orderId) {
      throw new BadRequestException('eventId, event et orderId sont requis');
    }

    const emittedAt = Date.parse(payload.timestamp);
    if (Number.isNaN(emittedAt)) {
      throw new BadRequestException('timestamp invalide');
    }
    if (Math.abs(Date.now() - emittedAt) > MAX_EVENT_AGE_MS) {
      // Protège contre le rejeu d'un événement intercepté plus tôt.
      throw new UnauthorizedException('Événement trop ancien (rejeu suspecté)');
    }
    return payload;
  }

  /**
   * Traite un événement Flaix.
   *
   * Renvoie `{ duplicate: true }` si l'événement a déjà été reçu : Flaix peut
   * réémettre (retry, doublon réseau) et NE DOIT PAS provoquer une seconde
   * mise à jour. On répond quand même 200 pour que Flaix cesse de réessayer.
   */
  async handle(payload: FlaixWebhookPayload): Promise<{ duplicate: boolean }> {
    // L'insertion joue le rôle de verrou : l'unicité de `eventId` fait échouer
    // un doublon même si deux livraisons arrivent en parallèle.
    try {
      await this.prisma.flaixWebhookEvent.create({
        data: {
          eventId: payload.eventId,
          eventType: payload.event,
          orderId: payload.orderId,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.log(`Événement Flaix ${payload.eventId} déjà traité — ignoré`);
        return { duplicate: true };
      }
      throw err;
    }

    try {
      await this.apply(payload);
      await this.prisma.flaixWebhookEvent.update({
        where: { eventId: payload.eventId },
        data: { processedAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // On garde la trace de l'échec : l'événement reste rejouable manuellement
      // sans être considéré comme traité.
      await this.prisma.flaixWebhookEvent.update({
        where: { eventId: payload.eventId },
        data: { error: message },
      });
      throw err;
    }

    return { duplicate: false };
  }

  /** Applique l'événement : persiste l'opérationnel puis pousse la Live Activity. */
  private async apply(payload: FlaixWebhookPayload): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: { id: true },
    });
    if (!order) {
      throw new BadRequestException(`Commande ${payload.orderId} introuvable`);
    }

    const widgetStatus = this.resolveWidgetStatus(payload);

    await this.liveActivity.applyOperationalUpdate(
      payload.orderId,
      {
        ...(payload.estimatedReadyAt !== undefined
          ? {
              estimatedReadyAt: payload.estimatedReadyAt
                ? new Date(payload.estimatedReadyAt)
                : null,
            }
          : {}),
        ...(payload.slotId !== undefined ? { slotId: payload.slotId } : {}),
        ...(payload.pickupPointId !== undefined
          ? { pickupPointId: payload.pickupPointId }
          : {}),
      },
      widgetStatus,
    );
  }

  /**
   * Détermine le statut d'affichage. Les événements explicites priment sur le
   * champ `status` ; sans indication, on laisse `undefined` pour que l'état
   * courant de la commande Break Eat serve de repli.
   */
  private resolveWidgetStatus(payload: FlaixWebhookPayload): WidgetStatus | undefined {
    switch (payload.event) {
      case 'ORDER_READY':
        return 'READY';
      case 'ORDER_DELAYED':
        return 'DELAYED';
      case 'ORDER_CANCELLED':
        return 'CANCELLED';
      case 'ORDER_COLLECTED':
        return 'COLLECTED';
      default:
        return payload.status ? FLAIX_STATUS_TO_WIDGET[payload.status] : undefined;
    }
  }
}
