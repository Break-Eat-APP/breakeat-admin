import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CartStatus, EventStatus, ProductStatus, StripeAccountStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { GroupsService } from '../groups/groups.service';
import { LoyaltyService, MIN_PAYABLE_CENTS } from '../loyalty/loyalty.service';
import { SlotsService } from '../slots/slots.service';
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
  /** PHASE 20 — fidélité appliquée à ce panier. */
  loyalty: {
    /** Le club a-t-il activé le programme sur ce lieu ? */
    enabled: boolean;
    /** Solde du client chez ce club (0 si programme désactivé). */
    balance: number;
    /** Points effectivement appliqués (peut être < demandé si plafonné). */
    pointsUsed: number;
    /** Réduction correspondante, déjà déduite de `totalCents`. */
    discountCents: number;
    /** Valeur d'un point en centimes — permet à l'app de simuler un montant. */
    pointValueCents: number;
  };
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
  /**
   * Page de paiement hébergée par Stripe. L'app l'ouvre, le client paie, le
   * webhook crée la commande. Aucun numéro de carte ne passe par notre code.
   */
  checkoutUrl: string;
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
    private readonly loyaltyService: LoyaltyService,
    private readonly slotsService: SlotsService,
    private readonly config: ConfigService,
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
    // RÉUTILISER, et non refuser.
    //
    // Le commentaire ci-dessus disait « reuse » depuis l'origine, mais le code
    // levait un conflit : un client dont le paiement échouait — pour une
    // rupture de stock, une session expirée, n'importe quoi — restait bloqué
    // 30 minutes sur « Un panier est déjà ouvert », sans aucun recours. Il ne
    // pouvait ni reprendre ce panier, ni en ouvrir un autre.
    //
    // Or un panier ouvert sur le MÊME événement et la MÊME buvette, c'est
    // exactement celui que le client veut reprendre. On le lui rend, et on
    // repousse son échéance puisqu'il s'en sert à l'instant.
    //
    // Le point de retrait est actualisé s'il en a choisi un autre entre-temps.
    if (existingOpen) {
      await this.prisma.cart.update({
        where: { id: existingOpen.id },
        data: {
          expiresAt: new Date(Date.now() + CART_TTL_MS),
          ...(dto.pickupPointId !== undefined && { pickupPointId: dto.pickupPointId ?? null }),
        },
      });
      this.logger.log(`Cart reused: ${existingOpen.id} user=${userId} event=${dto.eventId}`);
      return this.computeView(existingOpen.id);
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

    this.logger.log(
      `Cart created: ${cart.id} user=${userId} event=${dto.eventId} supplier=${dto.supplierId}`,
    );
    return this.computeView(cart.id);
  }

  /** Reads a cart + items + totals. Caller must own it. */
  async findOne(cartId: string, userId: string): Promise<CartWithTotals> {
    await this.requireOwnership(cartId, userId);
    return this.computeView(cartId);
  }

  // ─── Cart metadata (pickup point) ────────────────────────────

  async update(cartId: string, userId: string, dto: UpdateCartDto): Promise<CartWithTotals> {
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
  async addItem(cartId: string, userId: string, dto: AddCartItemDto): Promise<CartWithTotals> {
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

  async removeItem(cartId: string, itemId: string, userId: string): Promise<CartWithTotals> {
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

    // Re-entrée : un client qui revient sur l'écran de paiement doit retrouver
    // LA MÊME page, pas une seconde. La clé d'idempotence `cart_<id>` s'en
    // charge côté Stripe — le même appel renvoie la même session, donc la même
    // adresse. On laisse donc repasser un panier déjà engagé.
    if (cart.status !== CartStatus.OPEN && cart.status !== CartStatus.CHECKOUT_PENDING) {
      throw new BadRequestException(`Cart is ${cart.status} and cannot be checked out`);
    }

    if (!cart.pickupPointId) {
      throw new BadRequestException(
        'Aucun point de retrait n’est associé à cette commande. ' +
          'Le club doit en créer un pour cette buvette dans son back-office.',
      );
    }

    // Supplier must be Stripe-ready
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: cart.supplierId },
    });
    if (!supplier) throw new NotFoundException('Cart supplier no longer exists');
    if (!supplier.stripeAccountId) {
      throw new BadRequestException(
        'Cette buvette n’est pas encore reliée à Stripe : elle ne peut pas encaisser. ' +
          'À faire depuis sa fiche dans le back-office, bouton « Se connecter à Stripe ».',
      );
    }
    if (supplier.stripeAccountStatus !== StripeAccountStatus.ACTIVE) {
      // Le statut brut ne dit rien a un utilisateur : on traduit ce qu'il
      // implique, et surtout ce qu'il reste a faire.
      const explication: Record<string, string> = {
        PENDING:
          'son inscription Stripe n’est pas terminée — Stripe attend encore des informations',
        RESTRICTED: 'Stripe a restreint ce compte',
        REJECTED: 'Stripe a refusé ce compte',
        NOT_ONBOARDED: 'elle n’a pas commencé son inscription Stripe',
      };
      throw new BadRequestException(
        `Cette buvette ne peut pas encaisser : ${
          explication[supplier.stripeAccountStatus] ?? supplier.stripeAccountStatus
        }. Ouvre sa fiche dans le back-office et appuie sur « Vérifier l’état ».`,
      );
    }

    // Re-verify every item (in case stock changed since add)
    const view = await this.computeView(cartId);
    if (view.items.length === 0) {
      throw new BadRequestException('Ton panier est vide.');
    }
    for (const item of view.items) {
      await this.assertProductOrderable(item.productId, cart.supplierId, cart.pickupPointId);
    }
    // Même seuil que la remise fidélité : le paiement refuse en dessous, autant
    // le dire ici avec un message compréhensible plutôt que de laisser Stripe
    // renvoyer une erreur technique au dernier écran.
    if (view.totalCents < MIN_PAYABLE_CENTS) {
      throw new BadRequestException(
        `Le montant à payer doit être d’au moins ${(MIN_PAYABLE_CENTS / 100).toFixed(2)} €`,
      );
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
    //
    // Page HÉBERGÉE par Stripe plutôt que des champs de carte dans l'app :
    // aucun numéro de carte ne traverse notre code, il n'y a pas de bibliothèque
    // native à embarquer, et la même page sert l'ardoise. Apple Pay reste
    // disponible.
    //
    // `metadata.cartId` est ce qui relie le paiement à la commande : le webhook
    // `payment_intent.succeeded` le lit pour créer l'Order. Le retirer casserait
    // la création de commande sans autre signe qu'un paiement encaissé et aucune
    // commande en cuisine.
    const webUrl = this.config.get<string>('app.split.webUrl') ?? '';
    const session = await this.stripe.createHostedCheckout({
      amountCents: view.totalCents,
      currency: view.currency,
      destinationAccountId: supplier.stripeAccountId,
      productName: `Commande ${supplier.name}`,
      captureMethod: 'automatic',
      successUrl: `${webUrl}/commandes?paye=1`,
      cancelUrl: `${webUrl}/panier?annule=1`,
      idempotencyKey: `cart_${cart.id}`,
      metadata: {
        cartId: cart.id,
        userId: cart.userId,
        eventId: cart.eventId,
        supplierId: cart.supplierId,
        pickupPointId: cart.pickupPointId ?? '',
      },
    });
    const intent = {
      id:
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent?.id ?? ''),
      amount: view.totalCents,
      currency: view.currency,
      url: session.url ?? '',
    };

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

    this.logger.log(`Checkout: cart=${cart.id} → page Stripe, ${intent.amount}¢`);

    return {
      cartId: cart.id,
      /** Adresse de la page de paiement Stripe — l'app l'ouvre, c'est tout. */
      checkoutUrl: intent.url,
      amountCents: intent.amount,
      currency: intent.currency,
      status: CartStatus.CHECKOUT_PENDING,
    };
  }

  /**
   * PHASE 20 — le client choisit combien de points utiliser sur son panier.
   *
   * On enregistre une INTENTION (nombre de points), pas un montant : la valeur
   * du point peut changer côté club, et le plafonnement dépend du sous-total.
   * Le calcul réel est refait à chaque lecture du panier, puis figé à la commande.
   */
  async setRedeemedPoints(cartId: string, userId: string, points: number): Promise<CartWithTotals> {
    if (!Number.isInteger(points) || points < 0) {
      throw new BadRequestException('points doit être un entier positif ou nul');
    }
    const cart = await this.requireOwnership(cartId, userId);
    if (cart.status !== CartStatus.OPEN) {
      throw new BadRequestException('Ce panier n’est plus modifiable');
    }

    const event = await this.prisma.event.findUnique({
      where: { id: cart.eventId },
      select: { venueId: true, organizationId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const config = await this.loyaltyService.getConfigForVenue(event.venueId);
    if (!config.enabled && points > 0) {
      throw new BadRequestException("Le programme de fidélité n'est pas actif sur ce lieu");
    }
    if (points > 0) {
      const balance = await this.loyaltyService.getBalance(userId, event.organizationId);
      if (points > balance) {
        throw new BadRequestException(`Solde insuffisant : ${balance} point(s) disponible(s)`);
      }
    }

    await this.prisma.cart.update({ where: { id: cartId }, data: { redeemedPoints: points } });
    return this.computeView(cartId);
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
        // PHASE 20 — le programme de fidélité est configuré sur le LIEU, le
        // solde est porté par l'ORGANISATION : on remonte les deux via l'événement.
        event: { select: { venueId: true, organizationId: true } },
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
          : (it.priceSnapshotCents ?? it.product.price);
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

    // PHASE 20 — remise fidélité. Recalculée à chaque lecture (et non figée sur
    // le panier) : le club peut changer la valeur du point, et le plafonnement
    // dépend du sous-total, qui bouge quand le client modifie son panier.
    const config = await this.loyaltyService.getConfigForVenue(cart.event.venueId);
    const balance = config.enabled
      ? await this.loyaltyService.getBalance(cart.userId, cart.event.organizationId)
      : 0;
    // On ne peut pas dépenser plus que le solde réel, même si le panier porte
    // une intention plus ancienne (points déjà utilisés ailleurs entre-temps).
    const requested = Math.min(cart.redeemedPoints, balance);
    const { pointsUsed, discountCents } = this.loyaltyService.discountForPoints(
      requested,
      subtotal,
      config,
    );

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
      totalCents: subtotal - discountCents, // V1: pas de taxe/frais, remise fidélité seulement
      currency: 'eur',
      loyalty: {
        enabled: config.enabled,
        balance,
        pointsUsed,
        discountCents,
        pointValueCents: config.pointValueCents,
      },
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

    // Stock lookup: per-pickup-point first, fall back to global.
    //
    // ABSENCE de ligne de stock = produit NON SUIVI, donc commandable.
    //
    // L'inverse bloquait tout : ni la création d'un produit, ni l'assistant de
    // démarrage ne posent de ligne de stock, si bien qu'AUCUN produit créé par
    // le parcours normal n'était commandable. Le client se voyait refuser son
    // panier avec « No stock entry configured for this product » — un message
    // qui décrit une table vide, pas un problème qu'il puisse résoudre.
    //
    // Le suivi de stock devient donc explicite : une buvette qui vend des
    // nachos à un match n'en fait pas, et n'a pas à en déclarer pour vendre.
    // Celle qui en veut crée la ligne, et les contrôles ci-dessous s'appliquent.
    // Aucune ligne = aucune intention de suivre.
    //
    // `assertCumulativeQuantityWithinStock` traitait déjà l'absence ainsi
    // (`if (!stock) return`) : les deux contrôles se contredisaient dans le
    // même fichier.
    const stock = await this.resolveStock(productId, pickupPointId);
    if (!stock) return;

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
