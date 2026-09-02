import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CartStatus,
  EventStatus,
  ProductStatus,
  StripeAccountStatus,
} from '@prisma/client';
import { CartService } from './cart.service';
import { SlotsService } from '../slots/slots.service';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { GroupsService } from '../groups/groups.service';
import { loyaltyDisabledProvider } from '../loyalty/loyalty.mock';

const USER_ID = 'user-1';
const EVENT_ID = 'event-1';
const VENUE_ID = 'venue-1';
const SUPPLIER_ID = 'supplier-1';
const ORG_ID = 'org-1';
const PICKUP_POINT_ID = 'pp-1';
const PRODUCT_ID = 'product-1';
const CART_ID = 'cart-1';
const ITEM_ID = 'item-1';

function mockEvent() {
  return { id: EVENT_ID, venueId: VENUE_ID, status: EventStatus.ACTIVE };
}
function mockEventSupplier() {
  return { eventId: EVENT_ID, supplierId: SUPPLIER_ID };
}
function mockPickup(supplierId: string | null = null) {
  return {
    id: PICKUP_POINT_ID,
    venueId: VENUE_ID,
    eventId: null,
    supplierId,
  };
}
function mockCart(
  overrides: Partial<{
    status: CartStatus;
    pickupPointId: string | null;
    paymentIntentId: string | null;
    orderGroupId: string | null;
  }> = {},
) {
  return {
    id: CART_ID,
    userId: USER_ID,
    eventId: EVENT_ID,
    supplierId: SUPPLIER_ID,
    pickupPointId: PICKUP_POINT_ID,
    status: CartStatus.OPEN,
    paymentIntentId: null as string | null,
    orderGroupId: null as string | null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    // Phase 20 — computeView lit le lieu (config fidélité) et l'org (solde)
    // via la relation `event`, obligatoire côté Prisma.
    redeemedPoints: 0,
    event: { venueId: VENUE_ID, organizationId: ORG_ID },
    ...overrides,
  };
}
function mockProduct() {
  return {
    id: PRODUCT_ID,
    supplierId: SUPPLIER_ID,
    name: 'Burger',
    price: 800,
    status: ProductStatus.ACTIVE,
    availableFrom: null as Date | null,
    availableUntil: null as Date | null,
  };
}
function mockStock(quantity = 50) {
  return { id: 'stock-1', productId: PRODUCT_ID, pickupPointId: null, quantity, isAvailable: true };
}

describe('CartService', () => {
  let service: CartService;
  let prisma: jest.Mocked<PrismaService>;
  let groups: { canAccessEvent: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        loyaltyDisabledProvider,
        {
          // Le paiement remplit desormais le creneau choisi (phase 23).
          // Les cas testes ici partent d’un panier SANS creneau : le service
          // n’est jamais sollicite, un mock vide suffit a l’injection.
          provide: SlotsService,
          useValue: { assignOrderToSlot: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: {
            event: { findUnique: jest.fn() },
            eventSupplier: { findFirst: jest.fn() },
            pickupPoint: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
            cart: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            cartItem: {
              findFirst: jest.fn(),
              upsert: jest.fn(),
              update: jest.fn(),
              deleteMany: jest.fn(),
            },
            product: { findUnique: jest.fn() },
            stock: { findFirst: jest.fn() },
            // Buvette OUVERTE par defaut : une buvette fermee ne prend plus de
            // commande, et chaque test de creation partirait sinon en erreur.
            // Le compte encaisseur est celui du CLUB : la buvette ne fournit
            // plus que son nom, son etat et l'organisation dont elle depend.
            organization: {
              findUnique: jest.fn().mockResolvedValue({
                stripeAccountId: 'acct_club',
                stripeAccountStatus: StripeAccountStatus.ACTIVE,
              }),
            },
            supplier: {
              findUnique: jest.fn().mockResolvedValue({
                name: 'Buvette Nord',
                status: 'OPEN',
                organizationId: ORG_ID,
              }),
            },
            // checkout freezes prices via $transaction([update, update, …])
            $transaction: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: StripeService,
          useValue: {
            createHostedCheckout: jest.fn(),
            retrievePaymentIntent: jest.fn(),
          },
        },
        {
          // L'adresse de retour apres paiement — une valeur suffit ici.
          provide: ConfigService,
          useValue: { get: () => 'https://app.breakeat.test' },
        },
        {
          provide: GroupsService,
          // Phase 14.4 — default: every event is accessible. Individual tests
          // can override canAccessEvent to exercise the PRIVATE-event gate.
          useValue: {
            canAccessEvent: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get(CartService);
    prisma = module.get(PrismaService);
    groups = module.get(GroupsService);
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('creates a cart with valid event + supplier + pickup point', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue(mockEventSupplier());
      (prisma.pickupPoint.findUnique as jest.Mock).mockResolvedValue(mockPickup());
      (prisma.cart.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.cart.create as jest.Mock).mockResolvedValue(mockCart());
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({ ...mockCart(), items: [] });

      const result = await service.create(USER_ID, {
        eventId: EVENT_ID,
        supplierId: SUPPLIER_ID,
        pickupPointId: PICKUP_POINT_ID,
      });

      expect(result.id).toBe(CART_ID);
      expect(result.subtotalCents).toBe(0);
      expect(result.totalCents).toBe(0);
    });

    it('rejects when event is not ACTIVE', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({
        ...mockEvent(),
        status: EventStatus.PAUSED,
      });

      await expect(
        service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when supplier is not attached to the event', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('REUTILISE un panier deja ouvert au lieu de bloquer le client', async () => {
      // Le code levait un conflit ici, alors que son propre commentaire disait
      // « reuse ». Un client dont le paiement echouait restait bloque 30 min
      // sur « Un panier est deja ouvert », sans pouvoir ni le reprendre ni en
      // ouvrir un autre.
      //
      // Un panier ouvert sur le MEME evenement et la MEME buvette est
      // exactement celui qu'il veut reprendre.
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue(mockEventSupplier());
      (prisma.cart.findFirst as jest.Mock).mockResolvedValue(mockCart());
      (prisma.cart.update as jest.Mock).mockResolvedValue(mockCart());
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart(),
        items: [],
        event: mockEvent(),
      });

      await service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID });

      // Aucun panier neuf : on reprend l'existant et on repousse son echeance.
      expect(prisma.cart.create).not.toHaveBeenCalled();
      expect(prisma.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockCart().id } }),
      );
    });

    it('rejects with 404 when the event is PRIVATE and the caller is not a member (Phase 14.4)', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      // Non-member: gate denies access → identical 404 to a missing event.
      groups.canAccessEvent.mockResolvedValue(false);

      await expect(
        service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID }),
      ).rejects.toThrow(NotFoundException);
      // The access gate runs before the supplier lookup — nothing leaks.
      expect(prisma.eventSupplier.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── addItem ─────────────────────────────────────────────────

    it('refuse une buvette FERMÉE — le bouton de l’opératrice doit avoir un effet', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue(mockEventSupplier());
      (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({
        name: 'Buvette Sud',
        status: 'CLOSED',
      });

      await expect(
        service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID }),
      ).rejects.toThrow(/fermée/);
    });

    it('choisit le comptoir de la buvette quand le client n’en désigne aucun', async () => {
      // L'app ne demande jamais de comptoir : le client a deja choisi sa buvette.
      // Sans ce repli, chaque commande echouait au paiement — « aucun point de
      // retrait » — alors que le club en avait bien cree un.
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue(mockEventSupplier());
      (prisma.pickupPoint.findFirst as jest.Mock).mockResolvedValue({ id: PICKUP_POINT_ID });
      (prisma.cart.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.cart.create as jest.Mock).mockResolvedValue(mockCart());
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({ ...mockCart(), items: [] });

      await service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID });

      expect((prisma.cart.create as jest.Mock).mock.calls[0][0].data.pickupPointId).toBe(
        PICKUP_POINT_ID,
      );
    });

  describe('addItem', () => {
    it('rejects when caller does not own the cart', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart(),
        userId: 'someone-else',
      });

      await expect(
        service.addItem(CART_ID, USER_ID, { productId: PRODUCT_ID, quantity: 1 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects items belonging to a different supplier', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        ...mockProduct(),
        supplierId: 'supplier-2',
      });

      await expect(
        service.addItem(CART_ID, USER_ID, { productId: PRODUCT_ID, quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when product is not ACTIVE', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        ...mockProduct(),
        status: ProductStatus.OUT_OF_STOCK,
      });

      await expect(
        service.addItem(CART_ID, USER_ID, { productId: PRODUCT_ID, quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── checkout ────────────────────────────────────────────────

  describe('checkout', () => {
    function setupValidCheckout() {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart(),
        items: [
          { id: ITEM_ID, productId: PRODUCT_ID, quantity: 2, product: mockProduct() },
        ],
      });
      (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({
        id: SUPPLIER_ID,
        stripeAccountId: 'acct_test',
        stripeAccountStatus: StripeAccountStatus.ACTIVE,
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct());
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(mockStock(50));
    }

    it('ouvre une page Stripe et engage le panier', async () => {
      setupValidCheckout();
      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });

      const result = await service.checkout(CART_ID, USER_ID);

      expect(result.checkoutUrl).toBe('https://stripe/pay/cs_test');
      expect(result.amountCents).toBe(1600);
      // `cartId` dans les métadonnées est ce qui relie le paiement à la
      // commande : le webhook le lit pour créer l'Order. Sans lui, on
      // encaisserait sans que rien n'arrive en cuisine.
      expect(stripe.createHostedCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `cart_${CART_ID}`,
          destinationAccountId: 'acct_club',
          captureMethod: 'automatic',
          metadata: expect.objectContaining({ cartId: CART_ID }),
        }),
      );
    });

    it('refuse le paiement tant que le CLUB ne peut pas encaisser', async () => {
      // L'argent va au compte du club, jamais a celui d'une buvette : c'est
      // donc son etat a lui qui autorise ou non le paiement.
      setupValidCheckout();
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        stripeAccountId: 'acct_club',
        stripeAccountStatus: StripeAccountStatus.PENDING,
      });

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('refuse le paiement si le club n’est pas relié du tout', async () => {
      setupValidCheckout();
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        stripeAccountId: null,
        stripeAccountStatus: StripeAccountStatus.NOT_ONBOARDED,
      });

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('encaisse sur le compte du CLUB, même si la buvette en porte un ancien', async () => {
      // Les colonnes `stripe*` de Supplier subsistent en base pour l'historique.
      // Les lire de nouveau ferait diverger la recette d'une buvette vers un
      // compte que plus aucun écran n'affiche.
      setupValidCheckout();
      (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({
        name: 'Buvette Nord',
        status: 'OPEN',
        organizationId: ORG_ID,
        stripeAccountId: 'acct_ANCIEN_DE_LA_BUVETTE',
        stripeAccountStatus: StripeAccountStatus.ACTIVE,
      });

      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });

      await service.checkout(CART_ID, USER_ID);

      expect(stripe.createHostedCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ destinationAccountId: 'acct_club' }),
      );
    });

    it('rejects checkout if cart has no pickup point', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart({ pickupPointId: null }));

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('freezes prices + transitions ONLY after Stripe succeeds, in one transaction (P1 — snapshot timing)', async () => {
      setupValidCheckout();
      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });
      const txSpy = (prisma as unknown as { $transaction: jest.Mock }).$transaction;
      txSpy.mockResolvedValueOnce([]);

      await service.checkout(CART_ID, USER_ID);

      // Stripe MUST be called before the freeze/transition transaction.
      const stripeOrder = stripe.createHostedCheckout.mock.invocationCallOrder[0];
      const txOrder = txSpy.mock.invocationCallOrder[0];
      expect(stripeOrder).toBeLessThan(txOrder);

      // One single transaction carries BOTH the price-snapshot updates AND the
      // CHECKOUT_PENDING status flip — so a cart is never OPEN-with-snapshot.
      expect(txSpy).toHaveBeenCalledTimes(1);
      expect(Array.isArray(txSpy.mock.calls[0][0])).toBe(true);
      expect(prisma.cartItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { priceSnapshotCents: 800 } }),
      );
      expect(prisma.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CartStatus.CHECKOUT_PENDING,
            paymentIntentId: 'pi_test',
          }),
        }),
      );
    });

    it('does NOT freeze prices or transition when Stripe fails — cart stays OPEN with live prices (P1 — snapshot timing)', async () => {
      setupValidCheckout();
      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockRejectedValue(new Error('stripe unavailable'));
      const txSpy = (prisma as unknown as { $transaction: jest.Mock }).$transaction;

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow('stripe unavailable');

      // No snapshot write, no status flip: the freeze/transition transaction
      // must never run when the PaymentIntent could not be created. The cart
      // therefore stays OPEN, and computeView() re-reads live prices on retry.
      expect(txSpy).not.toHaveBeenCalled();
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
      expect(prisma.cart.update).not.toHaveBeenCalled();
    });

    it('rejects with 403 when the owner lost PRIVATE-event access since cart creation (Phase 14.4)', async () => {
      setupValidCheckout();
      // Membership revoked after the cart was created.
      groups.canAccessEvent.mockResolvedValue(false);

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('rend LA MÊME page à un client qui revient sur le paiement', async () => {
      setupValidCheckout();
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart({ status: CartStatus.CHECKOUT_PENDING }),
        items: [{ id: ITEM_ID, productId: PRODUCT_ID, quantity: 2, product: mockProduct() }],
      });
      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });

      const result = await service.checkout(CART_ID, USER_ID);

      // Même clé d'idempotence ⇒ Stripe renvoie la session déjà créée. Un
      // client qui revient en arrière ne doit pas ouvrir un second paiement.
      expect(result.checkoutUrl).toBe('https://stripe/pay/cs_test');
      expect(stripe.createHostedCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: `cart_${CART_ID}` }),
      );
    });
  });

  it('findOne throws NotFoundException for unknown cart', async () => {
    (prisma.cart.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.findOne('bad-id', USER_ID)).rejects.toThrow(NotFoundException);
  });
});

// --- Stock : suivi explicite, pas obligatoire ------------------

describe('CartService — produit sans ligne de stock', () => {
  it('resolveStock renvoie null quand aucune ligne n existe', async () => {
    // Regle : absence de ligne = produit NON SUIVI, donc commandable.
    //
    // L'inverse bloquait tout le parcours : ni la creation d'un produit ni
    // l'assistant de demarrage ne posent de ligne de stock, si bien qu'aucun
    // produit cree normalement n'etait commandable.
    //
    // Ce test fige l'intention. S'il tombe, c'est qu'on est revenu a exiger
    // une ligne de stock — et le parcours de commande sera casse.
    const findFirst = jest.fn().mockResolvedValue(null);
    const faux = { stock: { findFirst } } as unknown as PrismaService;

    const resolve = (
      CartService.prototype as unknown as {
        resolveStock: (this: unknown, p: string, pp: string | null) => Promise<unknown>;
      }
    ).resolveStock;

    const res = await resolve.call({ prisma: faux }, 'prod-1', null);
    expect(res).toBeNull();
  });
});
