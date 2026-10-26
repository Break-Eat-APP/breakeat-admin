import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RealtimeGateway } from './realtime.gateway';

// ─── Payload types (from REALTIME_CONTRACTS.md) ─────────────────

export interface NewOrderPayload {
  orderId: string;
  publicOrderNumber: string;
  organizationId: string;
  venueId: string;
  eventId: string;
  supplierId: string;
  pickupPointId: string;
}

export interface OrderUpdatedPayload {
  orderId: string;
  organizationId: string;
  eventId: string;
  /** Buvette concernee : c'est le salon qu'ecoute un poste operateur. */
  supplierId: string;
  previousStatus: string;
  nextStatus: string;
  actorType: string;
  reason?: string | null;
}

export interface OrderReadyPayload {
  orderId: string;
  publicOrderNumber: string;
  organizationId: string;
  eventId: string;
  supplierId: string;
  pickupPointId: string;
}

/** PHASE 19 — le client signale sa présence au point de retrait. */
export interface CustomerArrivedPayload {
  orderId: string;
  publicOrderNumber: string;
  organizationId: string;
  eventId: string;
  supplierId: string;
  pickupPointId: string;
  arrivedAt: string;
}

/**
 * RealtimeService — business-level emit helper.
 *
 * Wraps RealtimeGateway.server and targets the correct rooms per event type.
 * MUST only be called AFTER the DB transaction has committed (outbox rule).
 *
 * Room targeting (from REALTIME_CONTRACTS.md):
 *   new_order     → organization + event + supplier rooms
 *   order_updated → order + organization + event rooms
 *   order_ready   → order + pickup-point + organization + event rooms
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  /**
   * DIFFUSER NE DOIT JAMAIS CASSER CE QUI VIENT D'ETRE FAIT.
   *
   * Toutes ces emissions ont lieu APRES le commit : la commande existe, elle
   * est payee, l'argent est encaisse. Prevenir les ecrans est une
   * COURTOISIE — pas une etape de l'operation.
   *
   * Or `this.gateway.server` peut ne pas etre pret (passerelle pas encore
   * initialisee) et `server.to(...)` lever un TypeError. Cette erreur
   * remontait jusqu'au webhook Stripe, qui repondait en echec — et Stripe
   * rejouait, sur une commande deja creee.
   *
   * On journalise donc, et on laisse passer. Une commande reussie ne doit
   * pas devenir un echec parce qu'un ecran n'a pas ete prevenu.
   *
   * CE QUI RATTRAPE UN EVENEMENT PERDU, c'est la reconciliation REST du
   * tableau de bord : il recharge son instantane regulierement, meme socket
   * connecte. Voir `apps/operator/src/hooks/useDashboard.ts`.
   */
  private diffuser(salons: string[], nom: string, enveloppe: unknown): void {
    try {
      const { server } = this.gateway;
      if (!server) {
        this.logger.warn(`${nom} non diffuse : passerelle temps reel pas encore prete.`);
        return;
      }
      for (const salon of salons) server.to(salon).emit(nom, enveloppe);
      this.logger.debug(`Emitted ${nom} to ${salons.length} rooms`);
    } catch (e) {
      this.logger.error(
        `${nom} non diffuse : ${e instanceof Error ? e.message : String(e)}. ` +
          `L'operation elle-meme a abouti ; les ecrans se rattraperont par REST.`,
      );
    }
  }

  /** Emitted once after Order is created from a successful PaymentIntent. */
  emitNewOrder(payload: NewOrderPayload): void {
    const envelope = {
      eventName: 'new_order',
      eventId: randomUUID(), // realtime dedup UUID — not the concert event id
      occurredAt: new Date().toISOString(),
      orderId: payload.orderId,
      publicOrderNumber: payload.publicOrderNumber,
      organizationId: payload.organizationId,
      venueId: payload.venueId,
      supplierIds: [payload.supplierId],
      pickupPointId: payload.pickupPointId,
      status: 'PAID',
    };

    this.diffuser(
      [
        `organization:${payload.organizationId}`,
        `event:${payload.eventId}`,
        `supplier:${payload.supplierId}`,
      ],
      'new_order',
      envelope,
    );
  }

  /** Emitted after every successful state transition. */
  emitOrderUpdated(payload: OrderUpdatedPayload): void {
    const envelope = {
      eventName: 'order_updated',
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      orderId: payload.orderId,
      previousStatus: payload.previousStatus,
      nextStatus: payload.nextStatus,
      actorType: payload.actorType,
      reason: payload.reason ?? null,
    };

    this.diffuser(
      [
        `order:${payload.orderId}`,
        `organization:${payload.organizationId}`,
        `event:${payload.eventId}`,
        // Salon de la BUVETTE : c'est celui qu'un poste ecoute. Sans lui, un
        // comptoir abonne a sa seule buvette ne verrait jamais avancer ses
        // propres commandes — il resterait fige jusqu'au prochain
        // rafraichissement complet.
        `supplier:${payload.supplierId}`,
      ],
      'order_updated',
      envelope,
    );
  }

  /**
   * PHASE 19 — le client a appuyé sur « Je suis arrivé ».
   *
   * Événement DÉDIÉ (et non `order_updated`) car le statut de la commande ne
   * change pas : le board opérateur applique une mise à jour optimiste basée sur
   * `nextStatus` et ignorerait donc un `order_updated` sans transition.
   * Ciblage identique à `new_order` : la buvette concernée doit voir l'appel.
   */
  emitCustomerArrived(payload: CustomerArrivedPayload): void {
    const envelope = {
      eventName: 'customer_arrived',
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      orderId: payload.orderId,
      publicOrderNumber: payload.publicOrderNumber,
      pickupPointId: payload.pickupPointId,
      arrivedAt: payload.arrivedAt,
    };

    this.diffuser(
      [
        `organization:${payload.organizationId}`,
        `event:${payload.eventId}`,
        `supplier:${payload.supplierId}`,
      ],
      'customer_arrived',
      envelope,
    );

    this.logger.debug(`Emitted customer_arrived [${payload.orderId}] to 3 rooms`);
  }

  /**
   * Emitted specifically when an order reaches READY status.
   * Drives the "pickup notification" on the customer app.
   */
  emitOrderReady(payload: OrderReadyPayload): void {
    const envelope = {
      eventName: 'order_ready',
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      orderId: payload.orderId,
      publicOrderNumber: payload.publicOrderNumber,
      pickupPointId: payload.pickupPointId,
    };

    this.diffuser(
      [
        `order:${payload.orderId}`,
        `pickup-point:${payload.pickupPointId}`,
        `organization:${payload.organizationId}`,
        `event:${payload.eventId}`,
        `supplier:${payload.supplierId}`,
      ],
      'order_ready',
      envelope,
    );

    this.logger.debug(`Emitted order_ready [${payload.orderId}] → pickup-point ${payload.pickupPointId}`);
  }
}
