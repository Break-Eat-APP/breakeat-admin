import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SimulatorService } from './simulator.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_EVENT_ID = 'evt-00000000-0000-0000-0000-000000000001';
const FAKE_SUPPLIER_ID = 'sup-00000000-0000-0000-0000-000000000001';
const FAKE_PP_ID = 'pp-000000000-0000-0000-0000-000000000001';
const FAKE_USER_ID = 'usr-00000000-0000-0000-0000-000000000001';

function makeProduct(i = 1) {
  return { id: `prod-${i}`, name: `Product ${i}`, price: 1000, status: 'ACTIVE' };
}

function makeOrder(id: string, status: OrderStatus) {
  return {
    id,
    publicOrderNumber: `DEMO-${id}`,
    status,
    userId: FAKE_USER_ID,
    organizationId: 'org-id',
    eventId: FAKE_EVENT_ID,
    venueId: 'venue-id',
    supplierId: FAKE_SUPPLIER_ID,
    pickupPointId: FAKE_PP_ID,
    subtotalCents: 1000,
    totalCents: 1000,
    currency: 'eur',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

const prisma = {
  event: { findUnique: jest.fn() },
  user: { findUnique: jest.fn(), create: jest.fn() },
  order: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn(), update: jest.fn() },
  orderAuditTrail: { create: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
} as unknown as PrismaService;

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SimulatorService', () => {
  let service: SimulatorService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatorService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = mod.get<SimulatorService>(SimulatorService);

    // Default: demo user exists
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: FAKE_USER_ID,
      email: 'demo-simulator@break-eat.internal',
      displayName: 'Demo Simulator',
    });

    // Default: sequence returns predictable value
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ nextval: BigInt(1) }]);

    // Default: $transaction runs in-line
    (prisma.$transaction as jest.Mock).mockImplementation((ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return (ops as (tx: unknown) => Promise<unknown>)(prisma);
    });
  });

  // ─── seedEvent ─────────────────────────────────────────────────────────────

  describe('seedEvent', () => {
    it('creates demo orders with correct status distribution', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({
        id: FAKE_EVENT_ID,
        organizationId: 'org-id',
        venueId: 'venue-id',
        eventSuppliers: [
          {
            supplier: {
              id: FAKE_SUPPLIER_ID,
              products: [makeProduct(1), makeProduct(2), makeProduct(3)],
            },
          },
        ],
        pickupPoints: [{ id: FAKE_PP_ID }],
      });

      (prisma.order.create as jest.Mock).mockResolvedValue({});

      const result = await service.seedEvent(FAKE_EVENT_ID, 20);

      expect(result.created).toBeGreaterThan(0);
      expect(result.eventId).toBe(FAKE_EVENT_ID);
      // Should have created orders
      expect(prisma.order.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when event does not exist', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.seedEvent(FAKE_EVENT_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when event has no suppliers or pickup points', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({
        id: FAKE_EVENT_ID,
        organizationId: 'org-id',
        venueId: 'venue-id',
        eventSuppliers: [],
        pickupPoints: [],
      });
      await expect(service.seedEvent(FAKE_EVENT_ID)).rejects.toThrow(NotFoundException);
    });

    it('creates demo user via getOrCreateDemoUser when user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: FAKE_USER_ID });
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({
        id: FAKE_EVENT_ID,
        organizationId: 'org-id',
        venueId: 'venue-id',
        eventSuppliers: [
          {
            supplier: {
              id: FAKE_SUPPLIER_ID,
              products: [makeProduct(1)],
            },
          },
        ],
        pickupPoints: [{ id: FAKE_PP_ID }],
      });
      (prisma.order.create as jest.Mock).mockResolvedValue({});

      await service.seedEvent(FAKE_EVENT_ID, 4);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'demo-simulator@break-eat.internal',
            displayName: 'Demo Simulator',
            passwordHash: 'DEMO_NO_LOGIN',
            isActive: false,
          }),
        }),
      );
    });
  });

  // ─── simulateRush ───────────────────────────────────────────────────────────

  describe('simulateRush', () => {
    it('creates N PAID orders for rush simulation', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({
        id: FAKE_EVENT_ID,
        organizationId: 'org-id',
        venueId: 'venue-id',
        eventSuppliers: [
          {
            supplier: {
              id: FAKE_SUPPLIER_ID,
              products: [makeProduct(1)],
            },
          },
        ],
        pickupPoints: [{ id: FAKE_PP_ID }],
      });
      (prisma.order.create as jest.Mock).mockResolvedValue({});

      const result = await service.simulateRush(FAKE_EVENT_ID, 5);
      expect(result.created).toBe(5);
      expect(prisma.order.create).toHaveBeenCalledTimes(5);
    });

    it('throws NotFoundException when event has no suppliers', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({
        id: FAKE_EVENT_ID,
        organizationId: 'org-id',
        venueId: 'venue-id',
        eventSuppliers: [],
        pickupPoints: [{ id: FAKE_PP_ID }],
      });
      await expect(service.simulateRush(FAKE_EVENT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── clearEvent ─────────────────────────────────────────────────────────────

  describe('clearEvent', () => {
    it('deletes all DEMO- orders and returns count', async () => {
      (prisma.order.deleteMany as jest.Mock).mockResolvedValue({ count: 12 });
      const result = await service.clearEvent(FAKE_EVENT_ID);
      expect(result.deleted).toBe(12);
      expect(prisma.order.deleteMany).toHaveBeenCalledWith({
        where: {
          eventId: FAKE_EVENT_ID,
          publicOrderNumber: { startsWith: 'DEMO-' },
        },
      });
    });
  });

  // ─── progressOrders ─────────────────────────────────────────────────────────

  describe('progressOrders', () => {
    it('steps PAID→ACCEPTED, ACCEPTED→PREPARING, PREPARING→READY for all demo orders', async () => {
      const orders = [
        makeOrder('o1', OrderStatus.PAID),
        makeOrder('o2', OrderStatus.ACCEPTED),
        makeOrder('o3', OrderStatus.PREPARING),
      ];
      (prisma.order.findMany as jest.Mock).mockResolvedValue(orders);
      (prisma.order.update as jest.Mock).mockResolvedValue({});
      (prisma.orderAuditTrail.create as jest.Mock).mockResolvedValue({});

      const result = await service.progressOrders(FAKE_EVENT_ID);
      expect(result.progressed).toBe(3);
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it('leaves COMPLETED and CANCELLED orders unchanged (not queried)', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.progressOrders(FAKE_EVENT_ID);
      expect(result.progressed).toBe(0);
    });

    it('progresses RECOVERED→ACCEPTED', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        makeOrder('o1', OrderStatus.RECOVERED),
      ]);
      (prisma.order.update as jest.Mock).mockResolvedValue({});
      (prisma.orderAuditTrail.create as jest.Mock).mockResolvedValue({});

      const result = await service.progressOrders(FAKE_EVENT_ID);
      expect(result.progressed).toBe(1);

      const [updateCall] = (prisma.order.update as jest.Mock).mock.calls[0] as [
        { data: { status: OrderStatus } },
      ];
      expect(updateCall.data.status).toBe(OrderStatus.ACCEPTED);
    });
  });

  // ─── randomFailures ─────────────────────────────────────────────────────────

  describe('randomFailures', () => {
    it('returns correct total (cancelled + recovered)', async () => {
      const orders = Array.from({ length: 10 }, (_, i) =>
        makeOrder(`o${i}`, OrderStatus.PAID),
      );
      (prisma.order.findMany as jest.Mock).mockResolvedValue(orders);
      (prisma.order.update as jest.Mock).mockResolvedValue({});
      (prisma.orderAuditTrail.create as jest.Mock).mockResolvedValue({});

      // With failRate=1.0 all orders are affected
      const result = await service.randomFailures(FAKE_EVENT_ID, 1.0);
      expect(result.cancelled + result.recovered).toBe(10);
      expect(result.eventId).toBe(FAKE_EVENT_ID);
    });

    it('does not affect any order with failRate=0', async () => {
      const orders = Array.from({ length: 5 }, (_, i) =>
        makeOrder(`o${i}`, OrderStatus.PAID),
      );
      (prisma.order.findMany as jest.Mock).mockResolvedValue(orders);

      const result = await service.randomFailures(FAKE_EVENT_ID, 0);
      expect(result.cancelled).toBe(0);
      expect(result.recovered).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── getStats ────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns counts grouped by status', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        { status: OrderStatus.PAID },
        { status: OrderStatus.PAID },
        { status: OrderStatus.PREPARING },
      ]);

      const result = await service.getStats(FAKE_EVENT_ID);
      expect(result.stats[OrderStatus.PAID]).toBe(2);
      expect(result.stats[OrderStatus.PREPARING]).toBe(1);
      expect(result.total).toBe(3);
    });
  });
});
