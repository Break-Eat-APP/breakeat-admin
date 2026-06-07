import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CartStatus,
  EventStatus,
  OrderActorType,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  StripeAccountStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { GroupsService } from '../groups/groups.service';
import type { CreateCartDto } from './dto/create-cart.dto';
import type { UpdateCartDto } from './dto/update-cart.dto';
import type { AddCartItemDto } from './dto/add-cart-item.dto';
import type { UpdateCartItemDto } from './dto/update-cart-item.dto';

/** Cart TTL — 30 minutes from creation. */
const CART_TTL_MS = 30 * 60 * 1000;

/** Shape returned to the API: cart + items + computed totals. */
export interface CartWithTotals {
  id: string;
  userId: string;
  eventId: string;
  supplierId: string;
  pickupPointId: string | null;
  status: CartStatus;
  expiresAt: Date;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
  }>;
  subtotalCents: number;
  totalCents: number;
  currency: string;
}

/**
 * CartService owns the customer-side cart lifecycle.
 *
 * Critical rules from /brain:
 * - V1 = single-vendor: ONE cart targets ONE supplier within ONE event.
 * - Cart items reference live products — prices are NOT snapshotted here.
 *   The snapshot happens at Order creation (Bloc 5.6).
 * - Stock is NOT decremented at cart time, only at Order creation.
 * - A cart belongs to exactly one user — checked on every operation.
 * - A cart can only be modified while in OPEN status. CHECKOUT_PENDING,
 *   CONVERTED, EXPIRED and ABANDONED are terminal for editing.
 */
/** Response payload of POST /carts/:id/checkout */
export interface CheckoutResponse {
  cartId: string;
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
  currency: string;
  status: CartStatus;
}

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly groups: GroupsService,
  ) {}

  // ─── Create / Read ───────────────────────────────────────────

  /**
   * Creates a new cart bound to the caller.
   *
   * Guards:
   * - Event must exist and be ACTIVE.
   * - Supplier must be attached to the event.
   * - PickupPoint (if provided) must belong to the same event/venue/supplier scope.
   * - Caller cannot have another OPEN cart for the same event+supplier — reuse it instead.
   */
  async create(userId: string, dto: CreateCartDto): Promise<CartWithTotals> {
    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Phase 14.4 — PRIVATE events require group membership. A non-member gets
    // the same 404 as a missing event (checked BEFORE the status check below so
    // the existence/state of a private event is never leaked to a non-member).
    if (!(await this.groups.canAccessEvent(dto.eventId, userId))) {
      throw new NotFoundException('Event not found');
    }

    if (event.status !== EventStatus.ACTIVE) {
      throw new BadRequestException('Event is not active — cannot create cart');
    }

    // Supplier must be attached to this event via the EventSupplier junction.
    const eventSupplier = await this.prisma.eventSupplier.findFirst({
      where: { eventId: dto.eventId, supplierId: dto.supplierId },
    });
    if (!eventSupplier) {
      throw new BadRequestException('Supplier is not attached to this event');
    }

    if (dto.pickupPointId) {
      await this.assertPickupPointCompatible(
        dto.pickupPointId,
        dto.eventId,
        dto.supplierId,
        event.venueId,
      );
    }

    // Reuse an existing OPEN cart if any
    const existingOpen = await this.prisma.cart.findFirst({
      where: {
        userId,
        eventId: dto.eventId,
        supplierId: dto.supplierId,
        status: CartStatus.OPEN,
      },
    });
    if (existingOpen) {
      throw new ConflictException(
        `An OPEN cart already exists for this event/supplier (id=${existingOpen.id})`,
      );
    }

    const expiresAt = new Date(Date.now() + CART_TTL_MS);

    const cart = await this.prisma.cart.create({
      data: {
        userId,
        eventId: dto.eventId,
        supplierId: dto.supplierId,
        pickupPointId: dto.pickupPointId ?? null,
        expiresAt,
      },
    });

    this.logger.log(`Cart created: ${cart.id} user=${userId} event=${dto.eventId} supplier=${dto.supplierId}`);
    return this.computeView(cart.id);
  }

  /** Reads a cart + items + totals. Caller must own it. */
  async findOne(cartId: string, userId: string): Promise<CartWithTotals> {
    await this.requireOwnership(cartId, userId);
    return this.computeView(cartId);
  }

  // ─── Cart metadata (pickup point) ────────────────────────────

  async update(
    cartId: string,
    userId: string,
    dto: UpdateCartDto,
  ): Promise<CartWithTotals> {
    const cart = await this.requireOwnership(cartId, userId);
    this.requireEditable(cart.status);

    if (dto.pickupPointId !== undefined) {
      const event = await this.prisma.event.findUnique({
        where: { id: cart.eventId },
        select: { venueId: true },
      });
      if (!event) throw new NotFoundException('Cart event no longer exists');

      await this.assertPickupPointCompatible(
        dto.pickupPointId,
        cart.eventId,
        cart.supplierId,
        event.venueId,
      );
    }

    await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        ...(dto.pickupPointId !== undefined && { pickupPointId: dto.pickupPointId }),
      },
    });

    return this.computeView(cartId);
  }

  // ─── Items ───────────────────────────────────────────────────

  /**
   * Adds (or merges) an item. If the product already exists in the cart,
   * the quantity is incremented.
   */
  async addItem(
    cartId: string,
    userId: string,
    dto: AddCartItemDto,
  ): Promise<CartWithTotals> {
    const cart = await this.requireOwnership(cartId, userId);
    this.requireEditable(cart.status);

    await this.assertProductOrderable(dto.productId, cart.supplierId, cart.pickupPointId);

    await this.prisma.cartItem.upsert({
      where: {
        cartId_productId: { cartId, productId: dto.productId },
      },
      create: {
        cartId,
        productId: dto.productId,
        quantity: dto.quantity,
      },
      update: {
        // Increment when the product is already in the cart
        quantity: { increment: dto.quantity },
      },
    });

    // After upsert, re-check that the cumulative quantity doesn't exceed stock
    await this.assertCumulativeQuantityWithinStock(cartId, dto.productId, cart.pickupPointId);

    this.logger.log(`Cart item added: cart=${cartId} product=${dto.productId} +${dto.quantity}`);
    return this.computeView(cartId);
  }

  async updateItem(
    cartId: string,
    itemId: string,
    userId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartWithTotals> {
    const cart = await this.requireOwnership(cartId, userId);
    this.requireEditable(cart.status);

    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
    });
    if (!item) throw new NotFoundException('Cart item not found');

    await this.assertProductOrderable(item.productId, cart.supplierId, cart.pickupPointId);

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
    });

    await this.assertCumulativeQuantityWithinStock(cartId, item.productId, cart.pickupPointId);

    return this.computeView(cartId);
  }

  async removeItem(
    cartId: string,
    itemId: string,
    userId: string,
  ): Promise<CartWithTotals> {
    const cart = await this.requireOwnership(cartId, userId);
    this.requireEditable(cart.status);

    const result = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cartId },
    });
    if (result.count === 0) throw new NotFoundException('Cart item not found');

    return this.computeView(cartId);
  }

  // ─── Checkout ────────────────────────────────────────────────

  /**
   * Transitions an OPEN cart to CHECKOUT_PENDING and creates a Stripe PaymentIntent.
   *
   * Guards:
   * - Cart must be OPEN.
   * - Cart must have a pickupPointId.
   * - Cart must have at least one item.
   * - Every item must still be orderable (price re-read, stock re-checked).
   * - Supplier must have stripeAccountStatus = ACTIVE.
   *
   * Idempotency:
   * - Stripe idempotencyKey = `cart_${cartId}` — calling /checkout twice for the
   *   same cart returns the SAME PaymentIntent, never a duplicate.
   * - If a paymentIntentId is already stored on the cart, we return its current
   *   state instead of creating a new one.
   */
  async checkout(cartId: string, userId: string): Promise<CheckoutResponse> {
    const cart = await this.requireOwnership(cartId, userId);

    // Phase 14.4 — re-verify PRIVATE-event access (membership may have been
    // revoked between cart creation and checkout).
    await this.assertEventStillAccessible(cart.eventId, userId);

    // Allow re-entry: if cart is already CHECKOUT_PENDING and has a PaymentIntent,
    // return it. Otherwise, only OPEN carts can checkout.
    if (cart.status === CartStatus.CHECKOUT_PENDING && cart.paymentIntentId) {
      const existing = await this.stripe.retrievePaymentIntent(cart.paymentIntentId);
      return {
        cartId: cart.id,
        paymentIntentId: existing.id,
        clientSecret: existing.client_secret ?? '',
        amountCents: existing.amount,
        currency: existing.currency,
        status: cart.status,
      };
    }
    if (cart.status !== CartStatus.OPEN) {
      throw new BadRequestException(`Cart is ${cart.status} and cannot be checked out`);
    }

    if (!cart.pickupPointId) {
      throw new BadRequestException('Cart has no pickup point — set one before checkout');
    }

    // Supplier must be Stripe-ready
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: cart.supplierId },
    });
    if (!supplier) throw new NotFoundException('Cart supplier no longer exists');
    if (!supplier.stripeAccountId) {
      throw new BadRequestException('Supplier has not completed Stripe onboarding');
    }
    if (supplier.stripeAccountStatus !== StripeAccountStatus.ACTIVE) {
      throw new BadRequestException(
        `Supplier Stripe account is ${supplier.stripeAccountStatus} — cannot receive payments`,
      );
    }

    // Re-verify every item (in case stock changed since add)
    const view = await this.computeView(cartId);
    if (view.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }
    for (const item of view.items) {
      await this.assertProductOrderable(item.productId, cart.supplierId, cart.pickupPointId);
    }
    if (view.totalCents <= 0) {
      throw new BadRequestException('Cart total must be > 0');
    }

    // Capture the exact unit prices that back the PaymentIntent amount.
    // These get frozen onto the CartItems — but ONLY after Stripe confirms,
    // and atomically with the CHECKOUT_PENDING transition (see below). A
    // failed Stripe call must NEVER leave an OPEN cart carrying snapshots.
    const frozenPrices = view.items.map((it) => ({
      id: it.id,
      priceSnapshotCents: it.unitPriceCents,
    }));

    // ─── Stripe call (idempotent by cartId) ────────────────────
    // Performed BEFORE any DB mutation. If it throws, the cart stays OPEN
    // with live prices and no snapshot — the next /checkout recomputes the
    // total from scratch instead of reusing a stale frozen value.
    const intent = await this.stripe.createPaymentIntent({
      amountCents: view.totalCents,
      currency: view.currency,
      destinationAccountId: supplier.stripeAccountId,
      idempotencyKey: `cart_${cart.id}`,
      metadata: {
        cartId: cart.id,
        userId: cart.userId,
        eventId: cart.eventId,
        supplierId: cart.supplierId,
        pickupPointId: cart.pickupPointId ?? '',
      },
    });

    // ─── Freeze prices + transition, atomically ────────────────
    // Snapshot write and status flip happen in ONE transaction. After this
    // commit the cart is CHECKOUT_PENDING and its total is FROZEN: the future
    // Order.totalCents derives from these snapshots, guaranteeing consistency
    // even if Product.price changes between checkout and webhook delivery.
    // Because the snapshot and the status are written together, a cart can
    // never be OPEN-with-snapshot, and computeView() only trusts snapshots
    // once the cart has left OPEN (defensive guard below).
    await this.prisma.$transaction([
      ...frozenPrices.map((fp) =>
        this.prisma.cartItem.update({
          where: { id: fp.id },
          data: { priceSnapshotCents: fp.priceSnapshotCents },
        }),
      ),
      this.prisma.cart.update({
        where: { id: cart.id },
        data: {
          status: CartStatus.CHECKOUT_PENDING,
          paymentIntentId: intent.id,
        },
      }),
    ]);

    this.logger.log(
      `Checkout: cart=${cart.id} → PaymentIntent ${intent.id} amount=${intent.amount}¢`,
    );

    return {
      cartId: cart.id,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret ?? '',
      amountCents: intent.amount,
      currency: intent.currency,
      status: CartStatus.CHECKOUT_PENDING,
    };
  }

  // ─── Demo checkout (DEMO_MODE only — bypasses Stripe) ────────

  /**
   * POST /api/v1/carts/:id/demo-checkout
   *
   * Creates a PAID order directly from the cart without going through Stripe.
   * Only callable when DEMO_MODE=true (enforced by DemoGuard in the controller).
   *
   * Simplified vs real checkout:
   * - No pickupPointId required (uses first pickup point of the event, or null)
   * - No stock validation (demo products may not have stock entries)
   * - No Stripe payment intent
   * - Cart + items must still be valid
   */
  async demoCheckout(
    cartId: string,
    userId: string,
  ): Promise<{ orderId: string; publicOrderNumber: string; totalCents: number; status: OrderStatus }> {
    const cart = await this.requireOwnership(cartId, userId);

    // Phase 14.4 — re-verify PRIVATE-event access before converting to an order.
    await this.assertEventStillAccessible(cart.eventId, userId);

    if (cart.status !== CartStatus.OPEN) {
      throw new BadRequestException(`Cart is ${cart.status} — only OPEN carts can demo-checkout`);
    }

    const view = await this.computeView(cartId);
    if (view.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Load event to get organizationId and venueId
    const event = await this.prisma.event.findUnique({
      where: { id: cart.eventId },
      select: { organizationId: true, venueId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Resolve a pickup point — Order.pickupPointId is non-nullable in the schema.
    // Use the cart's pickupPointId first, then fall back to the first pickup point of the event.
    let pickupPointId = cart.pickupPointId;
    if (!pickupPointId) {
      const pp = await this.prisma.pickupPoint.findFirst({
        where: { eventId: cart.eventId },
        select: { id: true },
      });
      if (!pp) {
        throw new NotFoundException(
          'No pickup point found for this event. Create one in the admin panel first.',
        );
      }
      pickupPointId = pp.id;
    }

    // Snapshot prices and compute total
    const subtotalCents = view.items.reduce((sum, it) => sum + it.lineTotalCents, 0);
    const itemSnapshots = view.items.map((it) => ({
      productId: it.productId,
      productNameSnapshot: it.productName,
      unitPriceCentsSnapshot: it.unitPriceCents,
      quantity: it.quantity,
      lineTotalCents: it.lineTotalCents,
    }));

    const publicOrderNumber = `DEMO-${Date.now().toString(36).toUpperCase()}`;

    const order = await this.prisma.$transaction(async (tx) => {
      // 1. Freeze prices on cart items
      for (const it of view.items) {
        await tx.cartItem.update({
          where: { cartId_productId: { cartId, productId: it.productId } },
          data: { priceSnapshotCents: it.unitPriceCents },
        });
      }

      // 2. Mark cart converted
      await tx.cart.update({
        where: { id: cartId },
        data: { status: CartStatus.CONVERTED },
      });

      // 3. Create Order in PAID status
      const createdOrder = await tx.order.create({
        data: {
          publicOrderNumber,
          userId: cart.userId,
          organizationId: event.organizationId,
          eventId: cart.eventId,
          venueId: event.venueId,
          supplierId: cart.supplierId,
          pickupPointId,
          status: OrderStatus.PAID,
          paymentStatus: PaymentStatus.SUCCEEDED,
          subtotalCents,
          totalCents: subtotalCents,
          currency: 'eur',
          items: { create: itemSnapshots },
        },
      });

      // 4. Fake payment row (no Stripe, demo only)
      await tx.payment.create({
        data: {
          orderId: createdOrder.id,
          stripePaymentIntentId: `demo_${createdOrder.id}`,
          status: PaymentStatus.SUCCEEDED,
          amountCents: subtotalCents,
          currency: 'eur',
          rawStripeEvent: { demo: true },
        },
      });

      // 5. Audit trail
      await tx.orderAuditTrail.create({
        data: {
          orderId: createdOrder.id,
          actorType: OrderActorType.SYSTEM,
          previousState: null,
          nextState: OrderStatus.PAID,
          reason: 'Demo checkout — payment bypassed',
          metadata: { demo: true },
        },
      });

      return createdOrder;
    });

    this.logger.log(`Demo checkout: cart=${cartId} → order=${order.id} (${publicOrderNumber})`);
    return {
      orderId: order.id,
      publicOrderNumber: order.publicOrderNumber,
      totalCents: subtotalCents,
      status: OrderStatus.PAID,
    };
  }

  // ─── Internals ───────────────────────────────────────────────

  /**
   * Computes the read-model view: cart + items + totals.
   * Prices are read live from Product — never trusted from the cart row.
   */
  async computeView(cartId: string): Promise<CartWithTotals> {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        items: {
          include: { product: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!cart) throw new NotFoundException('Cart not found');

    let subtotal = 0;
    const items = cart.items.map((it) => {
      // A snapshot is only authoritative once the cart has LEFT the OPEN
      // state (i.e. a checkout succeeded and froze it inside the
      // CHECKOUT_PENDING transaction). While OPEN we ALWAYS read the live
      // product price, so a stray/leftover snapshot can never surface a
      // stale total on a re-opened or retried cart.
      const unitPrice =
        cart.status === CartStatus.OPEN
          ? it.product.price
          : it.priceSnapshotCents ?? it.product.price;
      const lineTotal = unitPrice * it.quantity;
      subtotal += lineTotal;
      return {
        id: it.id,
        productId: it.productId,
        productName: it.product.name,
        unitPriceCents: unitPrice,
        quantity: it.quantity,
        lineTotalCents: lineTotal,
      };
    });

    return {
      id: cart.id,
      userId: cart.userId,
      eventId: cart.eventId,
      supplierId: cart.supplierId,
      pickupPointId: cart.pickupPointId,
      status: cart.status,
      expiresAt: cart.expiresAt,
      items,
      subtotalCents: subtotal,
      totalCents: subtotal, // V1: no tax/fee/discount
      currency: 'eur',
    };
  }

  /**
   * Ensures the cart exists and is owned by the caller.
   * Returns the raw cart row for downstream checks.
   */
  private async requireOwnership(cartId: string, userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { id: cartId } });
    if (!cart) throw new NotFoundException('Cart not found');
    if (cart.userId !== userId) throw new ForbiddenException('You do not own this cart');
    return cart;
  }

  private requireEditable(status: CartStatus): void {
    if (status !== CartStatus.OPEN) {
      throw new BadRequestException(`Cart is ${status} and cannot be modified`);
    }
  }

  /**
   * Phase 14.4 — throws 403 if the cart owner no longer has access to a PRIVATE
   * event (e.g. removed from the gating group). PUBLIC events always pass.
   */
  private async assertEventStillAccessible(eventId: string, userId: string): Promise<void> {
    if (!(await this.groups.canAccessEvent(eventId, userId))) {
      throw new ForbiddenException('You no longer have access to this private event');
    }
  }

  /**
   * Validates that the product belongs to the cart's supplier, is ACTIVE,
   * fits its time-window, and has stock available at the chosen pickup point (or global).
   */
  private async assertProductOrderable(
    productId: string,
    supplierId: string,
    pickupPointId: string | null,
  ): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.supplierId !== supplierId) {
      throw new BadRequestException('Product does not belong to this cart supplier');
    }
    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException(`Product is ${product.status} — not orderable`);
    }
    const now = new Date();
    if (product.availableFrom && product.availableFrom > now) {
      throw new BadRequestException('Product is not available yet');
    }
    if (product.availableUntil && product.availableUntil < now) {
      throw new BadRequestException('Product availability window has ended');
    }

    // Stock lookup: per-pickup-point first, fall back to global
    const stock = await this.resolveStock(productId, pickupPointId);
    if (!stock) {
      throw new BadRequestException('No stock entry configured for this product');
    }
    if (!stock.isAvailable) {
      throw new BadRequestException('Product is currently unavailable');
    }
    if (stock.quantity <= 0) {
      throw new BadRequestException('Product is out of stock');
    }
  }

  /**
   * After upsert/update, verify that the total cart quantity for this product
   * does not exceed the resolved stock.quantity. Roll back on overage.
   */
  private async assertCumulativeQuantityWithinStock(
    cartId: string,
    productId: string,
    pickupPointId: string | null,
  ): Promise<void> {
    const stock = await this.resolveStock(productId, pickupPointId);
    if (!stock) return; // assertProductOrderable already handled missing stock

    const item = await this.prisma.cartItem.findFirst({
      where: { cartId, productId },
    });
    if (!item) return;

    if (item.quantity > stock.quantity) {
      // Roll back the over-quantity by capping at stock OR removing? Cap is friendlier.
      await this.prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity: stock.quantity },
      });
      throw new BadRequestException(
        `Requested quantity exceeds stock — capped at ${stock.quantity}`,
      );
    }
  }

  private async resolveStock(productId: string, pickupPointId: string | null) {
    if (pickupPointId) {
      const perPoint = await this.prisma.stock.findFirst({
        where: { productId, pickupPointId },
      });
      if (perPoint) return perPoint;
    }
    // fall back to global stock
    return this.prisma.stock.findFirst({
      where: { productId, pickupPointId: null },
    });
  }

  private async assertPickupPointCompatible(
    pickupPointId: string,
    eventId: string,
    supplierId: string,
    venueId: string,
  ): Promise<void> {
    const pp = await this.prisma.pickupPoint.findUnique({
      where: { id: pickupPointId },
    });
    if (!pp) throw new NotFoundException('Pickup point not found');

    if (pp.venueId !== venueId) {
      throw new BadRequestException('Pickup point is in a different venue than the event');
    }
    if (pp.eventId !== null && pp.eventId !== eventId) {
      throw new BadRequestException('Pickup point is scoped to a different event');
    }
    if (pp.supplierId !== null && pp.supplierId !== supplierId) {
      throw new BadRequestException('Pickup point is scoped to a different supplier');
    }
  }
}
