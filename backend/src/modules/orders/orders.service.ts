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
  type Order,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

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
