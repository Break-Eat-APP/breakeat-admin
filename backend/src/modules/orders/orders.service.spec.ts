import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CartStatus, OrderActorType, OrderStatus, PaymentStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { OrderStateMachineService } from './order-state-machine.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SlotsService } from '../slots/slots.service';
import { OrderNotificationsService } from '../notifications/order-notifications.service';
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
const ORDER_ID = 'order-1';

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

function mockOrder(status: OrderStatus = OrderStatus.PAID) {
  return {
    id: ORDER_ID,
    publicOrderNumber: 'BE-00000001',
    userId: USER_ID,
    organizationId: ORG_ID,
    eventId: EVENT_ID,
    venueId: VENUE_ID,
    supplierId: SUPPLIER_ID,
    pickupPointId: PICKUP_POINT_ID,
    status,
    paymentStatus: PaymentStatus.SUCCEEDED,
    subtotalCents: 1600,
    totalCents: 1600,
    currency: 'eur',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;
  let realtime: jest.Mocked<RealtimeService>;
  let slotsService: jest.Mocked<SlotsService>;
  const transactionMock = jest.fn();

  beforeEach(async () => {
    transactionMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        OrderStateMachineService,
        {
          provide: RealtimeService,
          useValue: {
            emitNewOrder: jest.fn(),
            emitOrderUpdated: jest.fn(),
            emitOrderReady: jest.fn(),
          },
        },
        {
          provide: SlotsService,
          useValue: {
            assignOrderToSlot: jest.fn(),
          },
        },
        {
          provide: OrderNotificationsService,
          useValue: {
            notifyStatusChange: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            payment: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
            },
            cart: { findUnique: jest.fn() },
            product: { findMany: jest.fn() },
            order: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              findUniqueOrThrow: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
            },
            orderAuditTrail: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
            $queryRaw: jest.fn().mockResolvedValue([{ nextval: BigInt(1) }]),
            $transaction: transactionMock,
          },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
    prisma = module.get(PrismaService);
    realtime = module.get(RealtimeService);
    slotsService = module.get(SlotsService);
  });

  // ─── createFromPaymentIntent ──────────────────────────────────

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
      // Outbox rule: new_order emitted AFTER transaction
      expect(realtime.emitNewOrder).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-1', publicOrderNumber: 'BE-00000001' }),
      );
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

  // ─── recordFailedPayment ──────────────────────────────────────

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

  // ─── transition ───────────────────────────────────────────────

  describe('transition', () => {
    it('returns updated order on a valid transition (PAID → ACCEPTED)', async () => {
      const paidOrder = mockOrder(OrderStatus.PAID);
      const acceptedOrder = { ...paidOrder, status: OrderStatus.ACCEPTED };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(paidOrder);
      // $transaction array form — resolves to [updatedOrder, auditEntry]
      transactionMock.mockResolvedValue([acceptedOrder, {}]);

      const result = await service.transition(
        ORDER_ID,
        OrderStatus.ACCEPTED,
        OrderActorType.OPERATOR,
        USER_ID,
        'Accepted by operator',
      );

      expect(result.status).toBe(OrderStatus.ACCEPTED);
      expect(transactionMock).toHaveBeenCalledTimes(1);
    });

    it('emits order_updated realtime event AFTER transaction commit (outbox rule)', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder(OrderStatus.PAID));
      transactionMock.mockResolvedValue([mockOrder(OrderStatus.ACCEPTED), {}]);

      await service.transition(ORDER_ID, OrderStatus.ACCEPTED, OrderActorType.OPERATOR, USER_ID, 'ok');

      // Must emit AFTER $transaction — verify called with correct payload
      expect(realtime.emitOrderUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: ORDER_ID,
          previousStatus: OrderStatus.PAID,
          nextStatus: OrderStatus.ACCEPTED,
          actorType: OrderActorType.OPERATOR,
          reason: 'ok',
        }),
      );
      // order_ready NOT emitted for ACCEPTED
      expect(realtime.emitOrderReady).not.toHaveBeenCalled();
    });

    it('emits order_ready in addition to order_updated when transitioning to READY', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder(OrderStatus.PREPARING));
      transactionMock.mockResolvedValue([mockOrder(OrderStatus.READY), {}]);

      await service.transition(ORDER_ID, OrderStatus.READY, OrderActorType.OPERATOR, USER_ID);

      expect(realtime.emitOrderUpdated).toHaveBeenCalledTimes(1);
      expect(realtime.emitOrderReady).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: ORDER_ID }),
      );
    });

    it('does NOT emit realtime when transition is invalid (guard fires first)', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder(OrderStatus.COMPLETED));

      await expect(
        service.transition(ORDER_ID, OrderStatus.PAID, OrderActorType.OPERATOR, USER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(realtime.emitOrderUpdated).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when order does not exist', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.transition(ORDER_ID, OrderStatus.ACCEPTED, OrderActorType.OPERATOR, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException on illegal transition (COMPLETED → PAID) without touching DB', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder(OrderStatus.COMPLETED));

      await expect(
        service.transition(ORDER_ID, OrderStatus.PAID, OrderActorType.OPERATOR, USER_ID),
      ).rejects.toThrow(BadRequestException);

      // Guard fires BEFORE any DB write — transaction must NOT run
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on illegal transition (CANCELLED → ACCEPTED) without touching DB', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder(OrderStatus.CANCELLED));

      await expect(
        service.transition(ORDER_ID, OrderStatus.ACCEPTED, OrderActorType.OPERATOR, USER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('runs order update + audit trail in ONE $transaction (array form)', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder(OrderStatus.PAID));
      transactionMock.mockResolvedValue([mockOrder(OrderStatus.ACCEPTED), {}]);

      await service.transition(ORDER_ID, OrderStatus.ACCEPTED, OrderActorType.OPERATOR, USER_ID);

      // $transaction called once with an array of exactly 2 operations
      expect(transactionMock).toHaveBeenCalledTimes(1);
      const [ops] = transactionMock.mock.calls[0];
      expect(Array.isArray(ops)).toBe(true);
      expect(ops).toHaveLength(2);
    });

    it('traces full PAID → ACCEPTED → PREPARING → READY → PICKED_UP → COMPLETED chain', async () => {
      const chain: OrderStatus[] = [
        OrderStatus.PAID,
        OrderStatus.ACCEPTED,
        OrderStatus.PREPARING,
        OrderStatus.READY,
        OrderStatus.PICKED_UP,
        OrderStatus.COMPLETED,
      ];

      for (let i = 0; i < chain.length - 1; i++) {
        const from = chain[i];
        const to = chain[i + 1];
        (prisma.order.findUnique as jest.Mock).mockResolvedValueOnce(mockOrder(from));
        transactionMock.mockResolvedValueOnce([mockOrder(to), {}]);

        const result = await service.transition(ORDER_ID, to, OrderActorType.OPERATOR, USER_ID);
        expect(result.status).toBe(to);
      }

      expect(transactionMock).toHaveBeenCalledTimes(5);
    });

    it('follows PREPARING → RECOVERED → READY recovery path', async () => {
      // Step 1: PREPARING → RECOVERED
      (prisma.order.findUnique as jest.Mock).mockResolvedValueOnce(mockOrder(OrderStatus.PREPARING));
      transactionMock.mockResolvedValueOnce([mockOrder(OrderStatus.RECOVERED), {}]);

      const step1 = await service.transition(
        ORDER_ID,
        OrderStatus.RECOVERED,
        OrderActorType.OPERATOR,
        USER_ID,
        'Manual recovery',
      );
      expect(step1.status).toBe(OrderStatus.RECOVERED);

      // Step 2: RECOVERED → READY (re-enter flow at any non-terminal point)
      (prisma.order.findUnique as jest.Mock).mockResolvedValueOnce(mockOrder(OrderStatus.RECOVERED));
      transactionMock.mockResolvedValueOnce([mockOrder(OrderStatus.READY), {}]);

      const step2 = await service.transition(
        ORDER_ID,
        OrderStatus.READY,
        OrderActorType.OPERATOR,
        USER_ID,
      );
      expect(step2.status).toBe(OrderStatus.READY);
    });
  });

  // ─── findActiveByEvent ────────────────────────────────────────

  describe('findActiveByEvent', () => {
    it('returns active orders and excludes COMPLETED + CANCELLED', async () => {
      const activeOrders = [
        mockOrder(OrderStatus.PAID),
        mockOrder(OrderStatus.PREPARING),
      ];
      (prisma.order.findMany as jest.Mock).mockResolvedValue(activeOrders);

      const result = await service.findActiveByEvent(EVENT_ID);

      expect(result).toEqual(activeOrders);

      const callArg = (prisma.order.findMany as jest.Mock).mock.calls[0][0];
      expect(callArg.where.eventId).toBe(EVENT_ID);
      expect(callArg.where.status.notIn).toEqual(
        expect.arrayContaining([OrderStatus.COMPLETED, OrderStatus.CANCELLED]),
      );
    });

    it('includes order items for dashboard display', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);

      await service.findActiveByEvent(EVENT_ID);

      const callArg = (prisma.order.findMany as jest.Mock).mock.calls[0][0];
      expect(callArg.include).toEqual({ items: true });
    });

    it('orders results by createdAt asc (oldest first in queue)', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);

      await service.findActiveByEvent(EVENT_ID);

      const callArg = (prisma.order.findMany as jest.Mock).mock.calls[0][0];
      expect(callArg.orderBy).toEqual({ createdAt: 'asc' });
    });
  });

  // ─── findAuditTrail ───────────────────────────────────────────

  describe('findAuditTrail', () => {
    it('returns full audit trail ordered by createdAt asc', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder());
      const auditEntries = [
        { orderId: ORDER_ID, previousState: null, nextState: OrderStatus.PAID, createdAt: new Date('2026-01-01') },
        { orderId: ORDER_ID, previousState: OrderStatus.PAID, nextState: OrderStatus.ACCEPTED, createdAt: new Date('2026-01-02') },
      ];
      (prisma.orderAuditTrail.findMany as jest.Mock).mockResolvedValue(auditEntries);

      const result = await service.findAuditTrail(ORDER_ID);

      expect(result).toEqual(auditEntries);

      const callArg = (prisma.orderAuditTrail.findMany as jest.Mock).mock.calls[0][0];
      expect(callArg.where.orderId).toBe(ORDER_ID);
      expect(callArg.orderBy).toEqual({ createdAt: 'asc' });
    });

    it('throws NotFoundException when order does not exist', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findAuditTrail(ORDER_ID)).rejects.toThrow(NotFoundException);

      // Must not hit the audit trail table
      expect(prisma.orderAuditTrail.findMany as jest.Mock).not.toHaveBeenCalled();
    });
  });

  // ─── findDashboardByEvent ─────────────────────────────────────

  describe('findDashboardByEvent', () => {
    it('returns orders grouped by status with counts', async () => {
      const orders = [
        { ...mockOrder(OrderStatus.PAID), items: [] },
        { ...mockOrder(OrderStatus.PAID), id: 'order-2', items: [] },
        { ...mockOrder(OrderStatus.PREPARING), id: 'order-3', items: [] },
        { ...mockOrder(OrderStatus.READY), id: 'order-4', items: [] },
      ];
      (prisma.order.findMany as jest.Mock).mockResolvedValue(orders);

      const result = await service.findDashboardByEvent(EVENT_ID);

      expect(result.eventId).toBe(EVENT_ID);
      expect(result.counts.PAID).toBe(2);
      expect(result.counts.PREPARING).toBe(1);
      expect(result.counts.READY).toBe(1);
      expect(result.counts.ACCEPTED).toBe(0);
      expect(result.orders.PAID).toHaveLength(2);
      expect(result.orders.PREPARING).toHaveLength(1);
    });

    it('returns empty groups when no active orders', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.findDashboardByEvent(EVENT_ID);

      expect(result.counts.PAID).toBe(0);
      expect(result.orders.PAID).toEqual([]);
    });

    it('queries the active dashboard statuses incl. PICKED_UP (excludes COMPLETED + CANCELLED)', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);

      await service.findDashboardByEvent(EVENT_ID);

      const callArg = (prisma.order.findMany as jest.Mock).mock.calls[0][0];
      const queriedStatuses: string[] = callArg.where.status.in;
      expect(queriedStatuses).toContain(OrderStatus.PAID);
      expect(queriedStatuses).toContain(OrderStatus.PICKED_UP);
      expect(queriedStatuses).toContain(OrderStatus.RECOVERED);
      expect(queriedStatuses).not.toContain(OrderStatus.COMPLETED);
      expect(queriedStatuses).not.toContain(OrderStatus.CANCELLED);
    });

    it('enriches each order with slotKind, customerName and each item with categoryId (Phase 11.4)', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        {
          ...mockOrder(OrderStatus.PAID),
          slot: { kind: 'PAUSE_1' },
          user: { displayName: 'Leslie Zaragoza' },
          items: [
            { id: 'item-1', productId: 'prod-a', quantity: 2 },
            { id: 'item-2', productId: 'prod-b', quantity: 1 },
          ],
        },
        {
          ...mockOrder(OrderStatus.READY),
          id: 'order-2',
          slot: null,
          user: null,
          items: [{ id: 'item-3', productId: 'prod-a', quantity: 1 }],
        },
      ]);
      (prisma.product.findMany as jest.Mock).mockResolvedValue([
        { id: 'prod-a', categoryId: 'cat-food', category: { name: 'Salé' } },
        { id: 'prod-b', categoryId: 'cat-drink', category: { name: 'Boisson' } },
      ]);

      const result = await service.findDashboardByEvent(EVENT_ID);

      // Slot kind is flattened onto the order; null slot falls back to IMMEDIATE.
      expect(result.orders.PAID[0].slotKind).toBe('PAUSE_1');
      expect(result.orders.READY[0].slotKind).toBe('IMMEDIATE');
      // Customer display name is flattened; null user → null name.
      expect(result.orders.PAID[0].customerName).toBe('Leslie Zaragoza');
      expect(result.orders.READY[0].customerName).toBeNull();
      // categoryId + categoryName resolved per item from the batched lookup.
      expect(result.orders.PAID[0].items[0].categoryId).toBe('cat-food');
      expect(result.orders.PAID[0].items[0].categoryName).toBe('Salé');
      expect(result.orders.PAID[0].items[1].categoryId).toBe('cat-drink');
      expect(result.orders.PAID[0].items[1].categoryName).toBe('Boisson');
      expect(result.orders.READY[0].items[0].categoryId).toBe('cat-food');
      // Distinct productIds only (prod-a appears twice → queried once).
      const productQuery = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(productQuery.where.id.in.sort()).toEqual(['prod-a', 'prod-b']);
    });

    it('skips the product lookup entirely when no orders have items', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        { ...mockOrder(OrderStatus.PAID), slot: null, items: [] },
      ]);

      await service.findDashboardByEvent(EVENT_ID);

      expect(prisma.product.findMany as jest.Mock).not.toHaveBeenCalled();
    });
  });

  // ─── assignOrderToSlot ────────────────────────────────────────

  describe('assignOrderToSlot', () => {
    const SLOT_ID = 'slot-uuid';

    it('assigns order to slot and returns updated order', async () => {
      const assignedOrder = { ...mockOrder(), slotId: SLOT_ID };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder());
      (slotsService.assignOrderToSlot as jest.Mock).mockResolvedValue(undefined);
      (prisma.order.findUniqueOrThrow as jest.Mock).mockResolvedValue(assignedOrder);

      // $transaction runs the async callback in-line
      transactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb(prisma);
      });

      const result = await service.assignOrderToSlot(ORDER_ID, SLOT_ID);

      expect(slotsService.assignOrderToSlot).toHaveBeenCalledWith(ORDER_ID, SLOT_ID, prisma);
      expect(result.slotId).toBe(SLOT_ID);
    });

    it('throws NotFoundException when order does not exist', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.assignOrderToSlot(ORDER_ID, SLOT_ID)).rejects.toThrow(NotFoundException);
      expect(transactionMock).not.toHaveBeenCalled();
    });
  });

  // ─── findReadyByEvent ─────────────────────────────────────────

  describe('findReadyByEvent', () => {
    it('returns minimal READY order fields for the event', async () => {
      const readyOrders = [
        { id: 'r1', publicOrderNumber: 'BE-0001', pickupPointId: 'pp-1', updatedAt: new Date() },
        { id: 'r2', publicOrderNumber: 'BE-0002', pickupPointId: 'pp-2', updatedAt: new Date() },
      ];
      (prisma.order.findMany as jest.Mock).mockResolvedValue(readyOrders);

      const result = await service.findReadyByEvent(EVENT_ID);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('r1');
      expect(result[0].publicOrderNumber).toBe('BE-0001');
      expect(result[0].pickupPointId).toBe('pp-1');
    });

    it('returns empty array when no READY orders', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.findReadyByEvent(EVENT_ID);

      expect(result).toEqual([]);
    });

    it('queries only READY status with select projection (no PII)', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);

      await service.findReadyByEvent(EVENT_ID);

      const callArg = (prisma.order.findMany as jest.Mock).mock.calls[0][0];
      expect(callArg.where.status).toBe(OrderStatus.READY);
      expect(callArg.where.eventId).toBe(EVENT_ID);
      expect(callArg.select).toMatchObject({
        id: true,
        publicOrderNumber: true,
        pickupPointId: true,
        updatedAt: true,
      });
    });
  });
});
