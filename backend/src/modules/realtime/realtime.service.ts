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
  pickupPointId: string;
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

    const { server } = this.gateway;
    server.to(`organization:${payload.organizationId}`).emit('new_order', envelope);
    server.to(`event:${payload.eventId}`).emit('new_order', envelope);
    server.to(`supplier:${payload.supplierId}`).emit('new_order', envelope);

    this.logger.debug(`Emitted new_order [${payload.orderId}] to 3 rooms`);
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

    const { server } = this.gateway;
    server.to(`order:${payload.orderId}`).emit('order_updated', envelope);
    server.to(`organization:${payload.organizationId}`).emit('order_updated', envelope);
    server.to(`event:${payload.eventId}`).emit('order_updated', envelope);

    this.logger.debug(
      `Emitted order_updated [${payload.orderId}] ${payload.previousStatus} → ${payload.nextStatus}`,
    );
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

    const { server } = this.gateway;
    server.to(`order:${payload.orderId}`).emit('order_ready', envelope);
    server.to(`pickup-point:${payload.pickupPointId}`).emit('order_ready', envelope);
    server.to(`organization:${payload.organizationId}`).emit('order_ready', envelope);
    server.to(`event:${payload.eventId}`).emit('order_ready', envelope);

    this.logger.debug(`Emitted order_ready [${payload.orderId}] → pickup-point ${payload.pickupPointId}`);
  }
}
