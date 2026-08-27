import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LiveActivityStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ApnsService } from './apns.service';

/**
 * État affiché par la Live Activity.
 *
 * ⚠️ Ce contrat doit rester IDENTIQUE au `ContentState` Swift de l'extension
 * (mêmes clés, mêmes types) : iOS ignore silencieusement une mise à jour dont
 * la charge utile ne se décode pas.
 */
export interface LiveActivityContentState {
  /** Statut destiné à l'AFFICHAGE (≠ OrderStatus, cf. mapWidgetStatus). */
  status: WidgetStatus;
  /** Libellé prêt à afficher, calculé côté serveur (une seule source de vérité). */
  statusLabel: string;
  orderNumber: string;
  pickupPoint: string | null;
  /** ISO 8601, ou null si aucune estimation disponible. */
  estimatedReadyAt: string | null;
  /** Créneau de retrait (ISO), quand la commande en a un. */
  slotStartAt: string | null;
  slotEndAt: string | null;
  /** Horodatage de la mise à jour — permet à l'app d'ignorer un message tardif. */
  updatedAt: string;
  /**
   * Le client a-t-il annoncé sa présence au comptoir ?
   *
   * Porté par l'état plutôt que déduit côté widget : c'est ce qui fait
   * disparaître le bouton « Je suis au comptoir » et le remplace par une
   * confirmation, sans que l'extension ait à interroger quoi que ce soit.
   */
  customerArrived: boolean;
}

/**
 * Statuts d'AFFICHAGE de la Live Activity.
 *
 * Volontairement distincts de `OrderStatus` : Break Eat ne doit pas se doter
 * d'une seconde machine à états. `DELAYED` n'existe pas côté commande — c'est
 * une information de présentation, portée par un événement Flaix.
 */
export type WidgetStatus =
  | 'CREATED'
  | 'PREPARING'
  | 'READY'
  | 'DELAYED'
  | 'COLLECTED'
  | 'CANCELLED';

const WIDGET_LABELS: Record<WidgetStatus, string> = {
  CREATED: 'Commande reçue',
  PREPARING: 'En préparation',
  READY: 'Commande prête',
  DELAYED: 'Léger retard',
  COLLECTED: 'Commande récupérée',
  CANCELLED: 'Commande annulée',
};

/** Statuts de commande qui closent définitivement la Live Activity. */
const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PICKED_UP,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
  OrderStatus.RECOVERED,
];

/** Combien de temps l'activité reste visible après la fin (Apple plafonne à 4 h). */
const DISMISS_AFTER_MS = 60 * 1000;
/** Au-delà, iOS grise l'activité comme potentiellement périmée. */
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * LiveActivityService — cycle de vie des Live Activities iOS.
 *
 * Deux sources d'événements alimentent le MÊME pipeline :
 *  1. les transitions de commande Break Eat (board opérateur) — actif aujourd'hui ;
 *  2. les webhooks Flaix — dès que le contrat Flaix existera.
 * En aval, le code est identique : construire un `ContentState` et pousser via APNs.
 *
 * Isolation stricte : toute écriture déclenchée par le client vérifie le
 * triplet (activité, commande, utilisateur). Une commande ne peut donc jamais
 * mettre à jour la Live Activity d'une autre commande, ni d'un autre client.
 */
@Injectable()
export class LiveActivityService {
  private readonly logger = new Logger(LiveActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apns: ApnsService,
  ) {}

  // ─── Enregistrement / cycle de vie côté app ─────────────────

  /**
   * L'app vient de démarrer une Live Activity : elle enregistre son identifiant
   * et le token push associé.
   *
   * Idempotent sur `(orderId, activityId)` : un rappel (rotation de token,
   * relance de l'app) met à jour la ligne existante au lieu d'en créer une
   * seconde pour la même activité.
   */
  async register(params: {
    userId: string;
    orderId: string;
    activityId: string;
    pushToken: string;
  }) {
    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      select: { id: true, userId: true, status: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    // Le client ne peut créer une activité que pour SA commande.
    if (order.userId !== params.userId) {
      throw new ForbiddenException('You do not own this order');
    }

    const activity = await this.prisma.liveActivity.upsert({
      where: {
        orderId_activityId: { orderId: params.orderId, activityId: params.activityId },
      },
      update: { pushToken: params.pushToken, status: LiveActivityStatus.ACTIVE },
      create: {
        userId: params.userId,
        orderId: params.orderId,
        activityId: params.activityId,
        pushToken: params.pushToken,
      },
    });

    this.logger.log(`Live Activity enregistrée pour la commande ${params.orderId}`);
    return activity;
  }

  /**
   * L'app signale la fin d'une activité (l'utilisateur l'a balayée, ou iOS l'a
   * close). On arrête d'émettre : inutile de pousser vers une activité morte.
   */
  async unregister(params: { userId: string; activityId: string }) {
    const activity = await this.prisma.liveActivity.findFirst({
      where: { activityId: params.activityId, userId: params.userId },
    });
    if (!activity) throw new NotFoundException('Live Activity not found');

    return this.prisma.liveActivity.update({
      where: { id: activity.id },
      data: { status: LiveActivityStatus.ENDED, endedAt: new Date() },
    });
  }

  // ─── Construction de l'état affiché ─────────────────────────

  /**
   * Traduit un statut de commande Break Eat en statut d'affichage.
   * `DELAYED` n'en fait pas partie : il ne peut venir que d'un événement Flaix.
   */
  mapWidgetStatus(status: OrderStatus): WidgetStatus {
    switch (status) {
      case OrderStatus.PAID:
      case OrderStatus.ACCEPTED:
        return 'CREATED';
      case OrderStatus.PREPARING:
        return 'PREPARING';
      case OrderStatus.READY:
        return 'READY';
      case OrderStatus.PICKED_UP:
      case OrderStatus.COMPLETED:
        return 'COLLECTED';
      case OrderStatus.CANCELLED:
      case OrderStatus.RECOVERED:
        return 'CANCELLED';
      default:
        return 'CREATED';
    }
  }

  /** Assemble l'état affichable d'une commande (créneau + buvette + estimation). */
  async buildContentState(
    orderId: string,
    overrideStatus?: WidgetStatus,
  ): Promise<LiveActivityContentState | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        publicOrderNumber: true,
        status: true,
        estimatedReadyAt: true,
        pickupPointId: true,
        customerArrivedAt: true,
        slot: { select: { startAt: true, endAt: true } },
      },
    });
    if (!order) return null;

    // `Order` porte l'identifiant du point de retrait mais pas de relation
    // Prisma vers `PickupPoint` : on résout le nom par une lecture dédiée
    // plutôt que d'ajouter une relation au schéma pour un seul libellé.
    const pickupPoint = await this.prisma.pickupPoint.findUnique({
      where: { id: order.pickupPointId },
      select: { name: true },
    });

    const status = overrideStatus ?? this.mapWidgetStatus(order.status);
    return {
      status,
      statusLabel: WIDGET_LABELS[status],
      orderNumber: order.publicOrderNumber,
      pickupPoint: pickupPoint?.name ?? null,
      estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
      slotStartAt: order.slot?.startAt.toISOString() ?? null,
      slotEndAt: order.slot?.endAt.toISOString() ?? null,
      updatedAt: new Date().toISOString(),
      customerArrived: Boolean(order.customerArrivedAt),
    };
  }

  // ─── Diffusion ──────────────────────────────────────────────

  /**
   * Pousse l'état courant d'une commande vers TOUTES ses activités actives
   * (l'utilisateur peut avoir plusieurs appareils).
   *
   * Termine automatiquement l'activité quand la commande atteint un état final :
   * une commande récupérée ou annulée n'a plus rien à suivre.
   */
  async pushOrderUpdate(orderId: string, overrideStatus?: WidgetStatus): Promise<number> {
    const activities = await this.prisma.liveActivity.findMany({
      where: { orderId, status: LiveActivityStatus.ACTIVE },
    });
    if (activities.length === 0) return 0;

    const contentState = await this.buildContentState(orderId, overrideStatus);
    if (!contentState) return 0;

    const isFinal =
      contentState.status === 'COLLECTED' || contentState.status === 'CANCELLED';
    const now = Date.now();

    let sent = 0;
    for (const activity of activities) {
      const result = await this.apns.sendLiveActivityUpdate(
        activity.pushToken,
        isFinal ? 'end' : 'update',
        contentState as unknown as Record<string, unknown>,
        {
          dismissalDate: isFinal ? new Date(now + DISMISS_AFTER_MS) : undefined,
          staleDate: isFinal ? undefined : new Date(now + STALE_AFTER_MS),
        },
      );

      if (result.ok) {
        sent++;
        if (isFinal) {
          await this.prisma.liveActivity.update({
            where: { id: activity.id },
            data: { status: LiveActivityStatus.ENDED, endedAt: new Date() },
          });
        }
      } else if (result.tokenInvalid) {
        // Token mort : on cesse d'émettre plutôt que de réessayer en boucle.
        await this.prisma.liveActivity.update({
          where: { id: activity.id },
          data: { status: LiveActivityStatus.STALE, endedAt: new Date() },
        });
        // `BadDeviceToken` ne veut presque jamais dire « token corrompu » : il
        // veut dire « ce token n'appartient pas à cet environnement ». Une build
        // TestFlight est signée en PRODUCTION ; si `APNS_ENV` reste sur sa
        // valeur par défaut (sandbox), Apple refuse chaque mise à jour et
        // l'activité reste figée sur son état de départ. Le message doit
        // désigner ce réglage, sinon on cherche du côté du téléphone.
        const piste =
          result.reason === 'BadDeviceToken'
            ? ` — vérifiez APNS_ENV (${this.apns.environmentLabel()}) : il doit correspondre à la signature de la build (TestFlight/App Store = production)`
            : '';
        this.logger.warn(
          `Token de Live Activity invalide (${result.reason}) — activité ${activity.id} marquée STALE${piste}`,
        );
      } else {
        this.logger.warn(
          `Échec d'envoi APNs (${result.status} ${result.reason ?? ''}) pour l'activité ${activity.id}`,
        );
      }
    }
    return sent;
  }

  /**
   * SOURCE 1 — transition de commande Break Eat (board opérateur).
   *
   * Appelée en fire-and-forget après une transition : un incident sur la Live
   * Activity ne doit jamais empêcher une commande d'avancer.
   */
  async onOrderStatusChanged(orderId: string, status: OrderStatus): Promise<void> {
    try {
      await this.pushOrderUpdate(orderId);
      if (TERMINAL_ORDER_STATUSES.includes(status)) {
        // Filet : si aucune activité n'a pu être notifiée (appareil hors ligne),
        // on les clôt tout de même côté serveur pour ne plus rien leur envoyer.
        await this.closeRemaining(orderId);
      }
    } catch (err) {
      this.logger.warn(
        `Mise à jour de Live Activity échouée (non bloquant) pour ${orderId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  /** Clôt les activités encore actives d'une commande terminée. */
  private async closeRemaining(orderId: string): Promise<void> {
    await this.prisma.liveActivity.updateMany({
      where: { orderId, status: LiveActivityStatus.ACTIVE },
      data: { status: LiveActivityStatus.ENDED, endedAt: new Date() },
    });
  }

  /**
   * Met à jour les informations opérationnelles calculées par Flaix
   * (estimation, créneau, point de retrait) puis pousse la mise à jour.
   *
   * On n'écrit QUE les champs fournis : un événement Flaix partiel ne doit pas
   * effacer une information encore valable.
   */
  async applyOperationalUpdate(
    orderId: string,
    data: { estimatedReadyAt?: Date | null; slotId?: string | null; pickupPointId?: string },
    overrideStatus?: WidgetStatus,
  ): Promise<void> {
    const patch: Prisma.OrderUpdateInput = {};
    if (data.estimatedReadyAt !== undefined) patch.estimatedReadyAt = data.estimatedReadyAt;
    if (data.slotId !== undefined) {
      patch.slot = data.slotId ? { connect: { id: data.slotId } } : { disconnect: true };
    }
    if (data.pickupPointId !== undefined) {
      patch.pickupPointId = data.pickupPointId;
    }
    if (Object.keys(patch).length > 0) {
      await this.prisma.order.update({ where: { id: orderId }, data: patch });
    }
    await this.pushOrderUpdate(orderId, overrideStatus);
  }
}
