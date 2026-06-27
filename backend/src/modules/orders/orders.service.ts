import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CartStatus,
  OrderActorType,
  OrderStatus,
  PaymentStatus,
  SlotKind,
  type Order,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OrderStateMachineService } from './order-state-machine.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SlotsService } from '../slots/slots.service';
import { OrderNotificationsService } from '../notifications/order-notifications.service';

/**
 * OrdersService — owns the Order lifecycle from PaymentIntent.succeeded onward.
 *
 * Critical guarantees (from /brain/ORDER_STATE_MACHINE.md):
 * - Orders are ONLY created after Stripe confirms the payment.
 * - Creation runs in a single transaction:
 *     Cart → CONVERTED
 *     Order + OrderItems (snapshots) + Payment + AuditTrail
 *     Stock decremented atomically
 * - Idempotency: keyed on stripePaymentIntentId. Calling twice yields the same Order.
 * - Realtime event emission happens AFTER the transaction commits (Phase 6).
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: OrderStateMachineService,
    private readonly realtimeService: RealtimeService,
    private readonly slotsService: SlotsService,
    private readonly orderNotifications: OrderNotificationsService,
  ) {}

  /**
   * Creates an Order from a successful Stripe PaymentIntent.
   * Called by the Stripe webhook handler (Bloc 5.5).
   *
   * @param paymentIntentId Stripe PaymentIntent id (must be in succeeded state)
   * @param rawEvent the Stripe Event object as JSON — stored on the Payment for forensics
   *
   * Idempotent: if a Payment row already exists with status=SUCCEEDED and is
   * linked to an Order, that Order is returned unchanged.
   */
  async createFromPaymentIntent(
    paymentIntentId: string,
    intent: { amount: number; currency: string; metadata?: Record<string, string> | null },
    rawEvent: Prisma.InputJsonValue,
  ): Promise<Order> {
    // Idempotency check — fast path
    const existingPayment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { order: true },
    });
    if (existingPayment?.order) {
      this.logger.warn(`Order already exists for PaymentIntent ${paymentIntentId} — skipping`);
      return existingPayment.order;
    }

    const cartId = intent.metadata?.cartId;
    if (!cartId) {
      throw new NotFoundException(
        `PaymentIntent ${paymentIntentId} has no cartId in metadata — cannot create Order`,
      );
    }

    // Load cart with items + product snapshot data
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        items: { include: { product: true } },
        event: { select: { venueId: true, organizationId: true } },
      },
    });
    if (!cart) {
      throw new NotFoundException(`Cart ${cartId} not found for PaymentIntent ${paymentIntentId}`);
    }
    if (cart.paymentIntentId !== paymentIntentId) {
      throw new ConflictException(
        `Cart ${cartId} is bound to a different PaymentIntent (${cart.paymentIntentId}) — refusing to create Order`,
      );
    }
    if (cart.status === CartStatus.CONVERTED) {
      // Edge case: cart converted but Payment row missing — recover by linking
      const order = await this.prisma.order.findFirst({
        where: { userId: cart.userId, eventId: cart.eventId, supplierId: cart.supplierId },
        orderBy: { createdAt: 'desc' },
      });
      if (order) return order;
    }
    const pickupPointId = cart.pickupPointId;
    if (!pickupPointId) {
      throw new NotFoundException('Cart has no pickupPointId — invariant violated');
    }
    if (cart.items.length === 0) {
      throw new NotFoundException('Cart has no items — invariant violated');
    }

    // Compute totals from the CartItem.priceSnapshotCents frozen at checkout time.
    // This guarantees Order.totalCents == Payment.amountCents == intent.amount
    // even if Product.price changed between checkout and webhook.
    let subtotalCents = 0;
    const itemSnapshots = cart.items.map((it) => {
      if (it.priceSnapshotCents === null || it.priceSnapshotCents === undefined) {
        throw new ConflictException(
          `CartItem ${it.id} has no price snapshot — checkout was never called on this cart`,
        );
      }
      const unitPrice = it.priceSnapshotCents;
      const lineTotal = unitPrice * it.quantity;
      subtotalCents += lineTotal;
      return {
        productId: it.productId,
        productNameSnapshot: it.product.name,
        unitPriceCentsSnapshot: unitPrice,
        quantity: it.quantity,
        lineTotalCents: lineTotal,
      };
    });

    // Defensive check: the frozen total MUST match what Stripe charged.
    // If they differ, something is wrong (snapshot tampering, currency mismatch, ...)
    // We refuse to create the Order rather than risk a financial discrepancy.
    if (subtotalCents !== intent.amount) {
      throw new ConflictException(
        `Order total (${subtotalCents}) does not match PaymentIntent amount (${intent.amount}) — refusing to create Order`,
      );
    }

    const publicOrderNumber = await this.generatePublicOrderNumber();

    // ─── Single transaction: cart→CONVERTED + Order + Items + Payment + Audit + Stock ───
    const order = await this.prisma.$transaction(async (tx) => {
      // 1. Mark cart converted
      await tx.cart.update({
        where: { id: cart.id },
        data: { status: CartStatus.CONVERTED },
      });

      // 2. Create Order
      const createdOrder = await tx.order.create({
        data: {
          publicOrderNumber,
          userId: cart.userId,
          organizationId: cart.event.organizationId,
          eventId: cart.eventId,
          venueId: cart.event.venueId,
          supplierId: cart.supplierId,
          pickupPointId,
          status: OrderStatus.PAID,
          paymentStatus: PaymentStatus.SUCCEEDED,
          subtotalCents,
          totalCents: subtotalCents,
          currency: intent.currency,
          items: { create: itemSnapshots },
        },
      });

      // 3. Upsert Payment — a FAILED row may already exist if the customer
      //    retried after a `payment_intent.payment_failed` event. We promote
      //    that row to SUCCEEDED instead of creating a duplicate (UNIQUE on
      //    stripePaymentIntentId would otherwise raise P2002).
      await tx.payment.upsert({
        where: { stripePaymentIntentId: paymentIntentId },
        create: {
          orderId: createdOrder.id,
          stripePaymentIntentId: paymentIntentId,
          status: PaymentStatus.SUCCEEDED,
          amountCents: intent.amount,
          currency: intent.currency,
          rawStripeEvent: rawEvent,
        },
        update: {
          orderId: createdOrder.id,
          status: PaymentStatus.SUCCEEDED,
          amountCents: intent.amount,
          currency: intent.currency,
          failureReason: null,
          rawStripeEvent: rawEvent,
        },
      });

      // 4. Audit trail — initial transition (null → PAID)
      await tx.orderAuditTrail.create({
        data: {
          orderId: createdOrder.id,
          actorType: OrderActorType.SYSTEM,
          previousState: null,
          nextState: OrderStatus.PAID,
          reason: 'Order created from successful PaymentIntent',
          metadata: { paymentIntentId },
        },
      });

      // 5. Decrement stock ATOMICALLY with a conditional update.
      //    The WHERE clause includes `quantity: { gte: item.quantity }` so
      //    two concurrent transactions cannot both decrement past zero. If
      //    insufficient stock, updateMany.count === 0 and we throw — the
      //    whole transaction rolls back (no Order created, no Cart converted).
      //    This prevents oversell during a rush.
      for (const item of cart.items) {
        const perPoint = await tx.stock.findFirst({
          where: { productId: item.productId, pickupPointId },
        });
        const target =
          perPoint ??
          (await tx.stock.findFirst({
            where: { productId: item.productId, pickupPointId: null },
          }));
        if (!target) {
          throw new ConflictException(
            `Stock row missing for product ${item.productId} during order creation`,
          );
        }

        const decremented = await tx.stock.updateMany({
          where: {
            id: target.id,
            quantity: { gte: item.quantity },
          },
          data: {
            quantity: { decrement: item.quantity },
          },
        });

        if (decremented.count === 0) {
          throw new ConflictException(
            `Insufficient stock for product ${item.productId}: requested ${item.quantity}, available ${target.quantity}`,
          );
        }

        // After decrement: if remaining quantity is 0, flip isAvailable=false.
        // We read once (safe inside this transaction).
        const refreshed = await tx.stock.findUnique({ where: { id: target.id } });
        if (refreshed && refreshed.quantity === 0 && refreshed.isAvailable) {
          await tx.stock.update({
            where: { id: target.id },
            data: { isAvailable: false },
          });
        }
      }

      return createdOrder;
    });

    this.logger.log(
      `Order created: ${order.id} (${publicOrderNumber}) from PaymentIntent ${paymentIntentId}`,
    );

    // Phase 6.2 — emit new_order AFTER transaction commit (outbox rule)
    this.realtimeService.emitNewOrder({
      orderId: order.id,
      publicOrderNumber: order.publicOrderNumber,
      organizationId: order.organizationId,
      venueId: order.venueId,
      eventId: order.eventId,
      supplierId: order.supplierId,
      pickupPointId: order.pickupPointId,
    });

    return order;
  }

  /**
   * Records a failed payment without creating an Order.
   * Cart remains in CHECKOUT_PENDING — the customer can retry checkout.
   */
  async recordFailedPayment(
    paymentIntentId: string,
    intent: { amount: number; currency: string; metadata?: Record<string, string> | null },
    failureReason: string,
    rawEvent: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.payment.upsert({
      where: { stripePaymentIntentId: paymentIntentId },
      create: {
        stripePaymentIntentId: paymentIntentId,
        status: PaymentStatus.FAILED,
        amountCents: intent.amount,
        currency: intent.currency,
        failureReason,
        rawStripeEvent: rawEvent,
      },
      update: {
        status: PaymentStatus.FAILED,
        failureReason,
        rawStripeEvent: rawEvent,
      },
    });

    this.logger.warn(`Payment failed: ${paymentIntentId} — ${failureReason}`);
  }

  // ─── Operator transitions ─────────────────────────────────────

  /**
   * Applies a validated state transition to an Order.
   *
   * Guarantees (from /brain/ORDER_STATE_MACHINE.md):
   * - Transition is validated BEFORE any DB write.
   * - DB update + audit trail are written in ONE transaction.
   * - Realtime event emission happens after commit (Phase 6.2).
   */
  async transition(
    orderId: string,
    to: OrderStatus,
    actorType: OrderActorType,
    actorId: string | null,
    reason?: string,
  ): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    // Guard: throws BadRequestException if transition is not in the allowed map
    this.stateMachine.assertTransition(order.status, to);

    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { status: to },
      }),
      this.prisma.orderAuditTrail.create({
        data: {
          orderId,
          actorType,
          actorId: actorId ?? null,
          previousState: order.status,
          nextState: to,
          reason: reason ?? null,
          metadata: {},
        },
      }),
    ]);

    this.logger.log(
      `Order ${orderId} transitioned ${order.status} → ${to} by ${actorType}${actorId ? ` (${actorId})` : ''}`,
    );

    // Phase 6.2 — emit realtime AFTER transaction commit (outbox rule)
    this.realtimeService.emitOrderUpdated({
      orderId: updated.id,
      organizationId: updated.organizationId,
      eventId: updated.eventId,
      previousStatus: order.status,
      nextStatus: to,
      actorType,
      reason: reason ?? null,
    });

    if (to === OrderStatus.READY) {
      this.realtimeService.emitOrderReady({
        orderId: updated.id,
        publicOrderNumber: updated.publicOrderNumber,
        organizationId: updated.organizationId,
        eventId: updated.eventId,
        pickupPointId: updated.pickupPointId,
      });
    }

    // C1 — notification push au client selon le modèle configuré pour ce statut.
    // Fire-and-forget : un échec d'envoi ne doit pas impacter la transition.
    void this.orderNotifications.notifyStatusChange({
      id: updated.id,
      userId: updated.userId,
      organizationId: updated.organizationId,
      status: updated.status,
      publicOrderNumber: updated.publicOrderNumber,
    });

    return updated;
  }

  /**
   * Returns all active orders for an event (excludes COMPLETED and CANCELLED).
   * Used by the operator dashboard snapshot endpoint.
   */
  async findActiveByEvent(eventId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        eventId,
        status: {
          notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
        },
      },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Returns active orders grouped by status for the operator dashboard.
   * Only returns the 5 "live" statuses (excludes terminal COMPLETED / CANCELLED).
   *
   * Phase 12.9: if supplierId is provided, only returns orders for that supplier.
   * An OPERATOR assigned to a specific supplier passes their supplierId so they
   * only see their own orders.
   *
   * Phase 11.4: each order is enriched with `slotKind` (resolved from the
   * order's pickup slot, defaulting to IMMEDIATE when none is assigned) and
   * each item with its product's `categoryId`. The configurable operator
   * screens filter the live order stream by slot kind and product category
   * client-side, so these two fields must travel with every order.
   *
   * Response shape:
   *   { eventId, counts: { PAID: n, … }, orders: { PAID: [...], … } }
   *   where each order = Order & { slotKind, items: (OrderItem & { categoryId })[] }
   */
  async findDashboardByEvent(eventId: string, supplierId?: string) {
    // Phase 11.4: PICKED_UP is included so the configurable "récupérées" screen
    // (default statuses = [PICKED_UP, RECOVERED]) can display collected orders.
    // COMPLETED + CANCELLED stay excluded — they are terminal and off-board.
    const DASHBOARD_STATUSES = [
      OrderStatus.PAID,
      OrderStatus.ACCEPTED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.PICKED_UP,
      OrderStatus.RECOVERED,
    ] as const;

    const orders = await this.prisma.order.findMany({
      where: {
        eventId,
        status: { in: [...DASHBOARD_STATUSES] },
        ...(supplierId ? { supplierId } : {}),
      },
      include: {
        items: true,
        slot: { select: { kind: true } },
        user: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // OrderItem has no `product` relation (productId is a snapshot FK), so we
    // resolve categoryId via a single batched lookup keyed on productId.
    const productIds = [
      ...new Set(orders.flatMap((o) => o.items.map((i) => i.productId))),
    ];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            categoryId: true,
            category: { select: { name: true } },
          },
        })
      : [];
    const categoryByProduct = new Map(
      products.map((p) => [
        p.id,
        { categoryId: p.categoryId, categoryName: p.category?.name ?? null },
      ]),
    );

    // Flatten the slot relation + resolved category into scalar fields the
    // operator screens can filter on directly (slotKind per order, categoryId
    // per item).
    const enriched = orders.map((order) => {
      const { slot, items, user, ...rest } = order;
      return {
        ...rest,
        slotKind: slot?.kind ?? SlotKind.IMMEDIATE,
        // displayName only — operators need a name to call out for pickup, but
        // never the customer's email/phone on the shared board.
        customerName: user?.displayName ?? null,
        items: items.map((item) => {
          const cat = categoryByProduct.get(item.productId);
          return {
            ...item,
            categoryId: cat?.categoryId ?? null,
            categoryName: cat?.categoryName ?? null,
          };
        }),
      };
    });
    type DashboardOrder = (typeof enriched)[number];

    const grouped: Record<string, DashboardOrder[]> = {};
    const counts: Record<string, number> = {};
    for (const s of DASHBOARD_STATUSES) {
      grouped[s] = [];
      counts[s] = 0;
    }
    for (const order of enriched) {
      if (order.status in grouped) {
        grouped[order.status].push(order);
        counts[order.status]++;
      }
    }

    return { eventId, counts, orders: grouped };
  }

  /**
   * Atomically assigns an order to a pickup slot.
   * Delegates to SlotsService.assignOrderToSlot (race-safe increment).
   *
   * Phase 8: exposed via PATCH /orders/:id/assign-slot — operator only.
   */
  async assignOrderToSlot(orderId: string, slotId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    let assigned!: Order;
    await this.prisma.$transaction(async (tx) => {
      await this.slotsService.assignOrderToSlot(orderId, slotId, tx);
      assigned = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    });

    this.logger.log(`Order ${orderId} assigned to slot ${slotId}`);
    return assigned;
  }

  /**
   * Returns READY orders for a public display screen (no auth required on caller side).
   * Only exposes the minimum fields needed for the public screen — no PII.
   *
   * Used by GET /public/orders/event/:eventId/ready (PublicOrdersController).
   */
  async findReadyByEvent(
    eventId: string,
  ): Promise<{ id: string; publicOrderNumber: string; pickupPointId: string; updatedAt: Date }[]> {
    return this.prisma.order.findMany({
      where: { eventId, status: OrderStatus.READY },
      select: { id: true, publicOrderNumber: true, pickupPointId: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
    });
  }

  /**
   * Returns the full audit trail for an order.
   */
  async findAuditTrail(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    return this.prisma.orderAuditTrail.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── Internals ───────────────────────────────────────────────

  /**
   * Generates a human-readable, unique order number using a PostgreSQL sequence.
   * Format: BE-XXXXXXXX (8 digits zero-padded).
   */
  private async generatePublicOrderNumber(): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('order_public_seq') AS nextval
    `;
    const seq = rows[0]?.nextval ?? BigInt(0);
    return `BE-${String(seq).padStart(8, '0')}`;
  }
}
