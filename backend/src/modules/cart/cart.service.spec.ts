import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
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
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';

const USER_ID = 'user-1';
const EVENT_ID = 'event-1';
const VENUE_ID = 'venue-1';
const SUPPLIER_ID = 'supplier-1';
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
function mockCart(overrides: Partial<{ status: CartStatus; pickupPointId: string | null; paymentIntentId: string | null }> = {}) {
  return {
    id: CART_ID,
    userId: USER_ID,
    eventId: EVENT_ID,
    supplierId: SUPPLIER_ID,
    pickupPointId: PICKUP_POINT_ID,
    status: CartStatus.OPEN,
    paymentIntentId: null as string | null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        {
          provide: PrismaService,
          useValue: {
            event: { findUnique: jest.fn() },
            eventSupplier: { findFirst: jest.fn() },
            pickupPoint: { findUnique: jest.fn() },
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
            supplier: { findUnique: jest.fn() },
            // checkout freezes prices via $transaction([update, update, …])
            $transaction: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: StripeService,
          useValue: {
            createPaymentIntent: jest.fn(),
            retrievePaymentIntent: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CartService);
    prisma = module.get(PrismaService);
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

    it('rejects when an OPEN cart already exists for the same event+supplier', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue(mockEventSupplier());
      (prisma.cart.findFirst as jest.Mock).mockResolvedValue(mockCart());

      await expect(
        service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── addItem ─────────────────────────────────────────────────

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

    it('creates a PaymentIntent and transitions cart to CHECKOUT_PENDING', async () => {
      setupValidCheckout();
      const stripe = (service as unknown as { stripe: { createPaymentIntent: jest.Mock } }).stripe;
      stripe.createPaymentIntent.mockResolvedValue({
        id: 'pi_test',
        client_secret: 'pi_test_secret_123',
        amount: 1600,
        currency: 'eur',
      });

      const result = await service.checkout(CART_ID, USER_ID);

      expect(result.paymentIntentId).toBe('pi_test');
      expect(result.amountCents).toBe(1600);
      expect(stripe.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `cart_${CART_ID}`,
          destinationAccountId: 'acct_test',
        }),
      );
    });

    it('rejects checkout if supplier is not Stripe-ACTIVE', async () => {
      setupValidCheckout();
      (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({
        id: SUPPLIER_ID,
        stripeAccountId: 'acct_test',
        stripeAccountStatus: StripeAccountStatus.PENDING,
      });

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('rejects checkout if cart has no pickup point', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart({ pickupPointId: null }));

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('freezes prices + transitions ONLY after Stripe succeeds, in one transaction (P1 — snapshot timing)', async () => {
      setupValidCheckout();
      const stripe = (service as unknown as { stripe: { createPaymentIntent: jest.Mock } }).stripe;
      stripe.createPaymentIntent.mockResolvedValue({
        id: 'pi_test',
        client_secret: 'sec',
        amount: 1600,
        currency: 'eur',
      });
      const txSpy = (prisma as unknown as { $transaction: jest.Mock }).$transaction;
      txSpy.mockResolvedValueOnce([]);

      await service.checkout(CART_ID, USER_ID);

      // Stripe MUST be called before the freeze/transition transaction.
      const stripeOrder = stripe.createPaymentIntent.mock.invocationCallOrder[0];
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
      const stripe = (service as unknown as { stripe: { createPaymentIntent: jest.Mock } }).stripe;
      stripe.createPaymentIntent.mockRejectedValue(new Error('stripe unavailable'));
      const txSpy = (prisma as unknown as { $transaction: jest.Mock }).$transaction;

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow('stripe unavailable');

      // No snapshot write, no status flip: the freeze/transition transaction
      // must never run when the PaymentIntent could not be created. The cart
      // therefore stays OPEN, and computeView() re-reads live prices on retry.
      expect(txSpy).not.toHaveBeenCalled();
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
      expect(prisma.cart.update).not.toHaveBeenCalled();
    });

    it('returns existing PaymentIntent when cart is already CHECKOUT_PENDING (idempotency)', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(
        mockCart({ status: CartStatus.CHECKOUT_PENDING, paymentIntentId: 'pi_existing' }),
      );
      const stripe = (service as unknown as { stripe: { retrievePaymentIntent: jest.Mock; createPaymentIntent: jest.Mock } }).stripe;
      stripe.retrievePaymentIntent.mockResolvedValue({
        id: 'pi_existing',
        client_secret: 'sec_existing',
        amount: 1600,
        currency: 'eur',
      });

      const result = await service.checkout(CART_ID, USER_ID);

      expect(result.paymentIntentId).toBe('pi_existing');
      // Must NOT create a new intent
      expect(stripe.createPaymentIntent).not.toHaveBeenCalled();
    });
  });

  it('findOne throws NotFoundException for unknown cart', async () => {
    (prisma.cart.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.findOne('bad-id', USER_ID)).rejects.toThrow(NotFoundException);
  });
});
