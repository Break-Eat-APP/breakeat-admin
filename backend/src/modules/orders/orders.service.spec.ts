import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CartStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../database/prisma.service';

const USER_ID = 'user-1';
const ORG_ID = 'org-1';
const VENUE_ID = 'venue-1';
const EVENT_ID = 'event-1';
const SUPPLIER_ID = 'supplier-1';
const PICKUP_POINT_ID = 'pp-1';
const CART_ID = 'cart-1';
const PRODUCT_ID = 'product-1';
const PAYMENT_INTENT_ID = 'pi_test_123';

function mockCart() {
  return {
    id: CART_ID,
    userId: USER_ID,
    eventId: EVENT_ID,
    supplierId: SUPPLIER_ID,
    pickupPointId: PICKUP_POINT_ID,
    status: CartStatus.CHECKOUT_PENDING,
    paymentIntentId: PAYMENT_INTENT_ID,
    items: [
      {
        id: 'item-1',
        productId: PRODUCT_ID,
        quantity: 2,
        // Frozen at checkout — same value live product would also report
        priceSnapshotCents: 800,
        product: { id: PRODUCT_ID, name: 'Burger', price: 800 },
      },
    ],
    event: { venueId: VENUE_ID, organizationId: ORG_ID },
  };
}

function mockIntent() {
  return {
    amount: 1600,
    currency: 'eur',
    metadata: { cartId: CART_ID },
  };
}

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;
  const transactionMock = jest.fn();

  beforeEach(async () => {
    transactionMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            payment: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
            },
            cart: { findUnique: jest.fn() },
            order: { findFirst: jest.fn() },
            $queryRaw: jest.fn().mockResolvedValue([{ nextval: BigInt(1) }]),
            $transaction: transactionMock,
          },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
    prisma = module.get(PrismaService);
  });

  describe('createFromPaymentIntent', () => {
    it('creates an Order, Items, Payment and AuditTrail in a single transaction', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());

      // Capture the transaction callback and run it against a mock tx
      transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => {
        const tx = {
          cart: { update: jest.fn() },
          order: { create: jest.fn().mockResolvedValue({ id: 'order-1', publicOrderNumber: 'BE-00000001' }) },
          payment: { upsert: jest.fn() },
          orderAuditTrail: { create: jest.fn() },
          stock: {
            findFirst: jest.fn().mockResolvedValue({ id: 'stock-1', quantity: 50, isAvailable: true }),
            findUnique: jest.fn().mockResolvedValue({ id: 'stock-1', quantity: 48, isAvailable: true }),
            // Atomic conditional decrement — succeeds
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn(),
          },
        };
        return cb(tx);
      });

      const order = await service.createFromPaymentIntent(
        PAYMENT_INTENT_ID,
        mockIntent(),
        { id: 'evt_test' } as never,
      );

      expect(order.publicOrderNumber).toBe('BE-00000001');
      expect(transactionMock).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — returns existing Order when Payment already exists', async () => {
      const existingOrder = { id: 'order-existing', publicOrderNumber: 'BE-00000007', status: OrderStatus.PAID };
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
        order: existingOrder,
      });

      const result = await service.createFromPaymentIntent(
        PAYMENT_INTENT_ID,
        mockIntent(),
        {} as never,
      );

      expect(result).toEqual(existingOrder);
      // Must NOT run the transaction
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws when PaymentIntent has no cartId in metadata', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createFromPaymentIntent(
          PAYMENT_INTENT_ID,
          { amount: 1600, currency: 'eur', metadata: {} },
          {} as never,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when cart paymentIntentId does not match the incoming PaymentIntent', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart(),
        paymentIntentId: 'pi_OTHER',
      });

      await expect(
        service.createFromPaymentIntent(
          PAYMENT_INTENT_ID,
          mockIntent(),
          {} as never,
        ),
      ).rejects.toThrow(); // ConflictException
    });

    it('refuses when CartItem has no price snapshot (checkout was skipped)', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      const cartNoSnapshot = mockCart();
      cartNoSnapshot.items = [
        {
          id: 'item-1',
          productId: PRODUCT_ID,
          quantity: 2,
          // priceSnapshotCents intentionally omitted (null)
          product: { id: PRODUCT_ID, name: 'Burger', price: 800 },
        } as never,
      ];
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(cartNoSnapshot);

      await expect(
        service.createFromPaymentIntent(PAYMENT_INTENT_ID, mockIntent(), {} as never),
      ).rejects.toThrow(/no price snapshot/);
    });

    it('refuses when computed total diverges from PaymentIntent amount (P1 #2 guard)', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());
      // PaymentIntent says 9999¢ but cart snapshots sum to 1600¢
      await expect(
        service.createFromPaymentIntent(
          PAYMENT_INTENT_ID,
          { amount: 9999, currency: 'eur', metadata: { cartId: CART_ID } },
          {} as never,
        ),
      ).rejects.toThrow(/does not match PaymentIntent amount/);
    });

    it('throws ConflictException when stock is insufficient (P1 #1 oversell guard)', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());

      // Transaction: updateMany.count === 0 means the WHERE quantity >= N failed
      transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => {
        const tx = {
          cart: { update: jest.fn() },
          order: { create: jest.fn().mockResolvedValue({ id: 'order-1', publicOrderNumber: 'BE-00000001' }) },
          payment: { upsert: jest.fn() },
          orderAuditTrail: { create: jest.fn() },
          stock: {
            findFirst: jest.fn().mockResolvedValue({ id: 'stock-1', quantity: 1, isAvailable: true }),
            findUnique: jest.fn(),
            // updateMany returns count=0 because WHERE quantity >= 2 failed
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            update: jest.fn(),
          },
        };
        return cb(tx);
      });

      await expect(
        service.createFromPaymentIntent(PAYMENT_INTENT_ID, mockIntent(), {} as never),
      ).rejects.toThrow(/Insufficient stock/);
    });

    it('upserts Payment when a FAILED row already exists (P1 #3 retry guard)', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null); // no order linked
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());

      const paymentUpsertSpy = jest.fn();
      transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => {
        const tx = {
          cart: { update: jest.fn() },
          order: { create: jest.fn().mockResolvedValue({ id: 'order-1', publicOrderNumber: 'BE-00000001' }) },
          payment: { upsert: paymentUpsertSpy },
          orderAuditTrail: { create: jest.fn() },
          stock: {
            findFirst: jest.fn().mockResolvedValue({ id: 'stock-1', quantity: 50, isAvailable: true }),
            findUnique: jest.fn().mockResolvedValue({ id: 'stock-1', quantity: 48, isAvailable: true }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn(),
          },
        };
        return cb(tx);
      });

      await service.createFromPaymentIntent(PAYMENT_INTENT_ID, mockIntent(), {} as never);

      // Must call upsert (NOT create) so retry after FAILED row works
      expect(paymentUpsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripePaymentIntentId: PAYMENT_INTENT_ID },
          update: expect.objectContaining({ status: PaymentStatus.SUCCEEDED, failureReason: null }),
        }),
      );
    });
  });

  describe('recordFailedPayment', () => {
    it('upserts a FAILED Payment with the failure reason', async () => {
      (prisma.payment.upsert as jest.Mock).mockResolvedValue({});

      await service.recordFailedPayment(
        PAYMENT_INTENT_ID,
        mockIntent(),
        'card_declined',
        {} as never,
      );

      const call = (prisma.payment.upsert as jest.Mock).mock.calls[0][0];
      expect(call.where.stripePaymentIntentId).toBe(PAYMENT_INTENT_ID);
      expect(call.create.status).toBe(PaymentStatus.FAILED);
      expect(call.create.failureReason).toBe('card_declined');
    });
  });
});
