/**
 * BLOC 10.1 — Rush & Load Tests for SimulatorService
 *
 * These tests verify that the SimulatorService handles high-volume order creation
 * (50 / 100 orders) and that no orders are lost through multiple progressOrders()
 * and randomFailures() cycles.
 *
 * Strategy: a stateful in-memory mock that mirrors real Prisma behaviour,
 * so we can assert "N in → N accounted for" at every step.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SimulatorService } from './simulator.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const EVENT_ID = 'evt-rush-0000-0000-0000-000000000001';
const SUPPLIER_ID = 'sup-rush-0000-0000-0000-000000000001';
const PP_ID = 'pp-rush-00000-0000-0000-0000-000000000001';
const USER_ID = 'usr-rush-0000-0000-0000-000000000001';
const DEMO_PREFIX = 'DEMO-';

function makeEventFixture() {
  return {
    id: EVENT_ID,
    organizationId: 'org-rush-id',
    venueId: 'venue-rush-id',
    eventSuppliers: [
      {
        supplier: {
          id: SUPPLIER_ID,
          products: [
            { id: 'p1', name: 'Burger', price: 900, status: 'ACTIVE' },
            { id: 'p2', name: 'Fries', price: 350, status: 'ACTIVE' },
            { id: 'p3', name: 'Soda', price: 250, status: 'ACTIVE' },
          ],
        },
      },
    ],
    pickupPoints: [{ id: PP_ID }],
  };
}

// ─── Stateful in-memory store ────────────────────────────────────────────────

type MockOrder = {
  id: string;
  publicOrderNumber: string;
  status: OrderStatus;
  userId: string;
  organizationId: string;
  eventId: string;
  venueId: string;
  supplierId: string;
  pickupPointId: string;
  subtotalCents: number;
  totalCents: number;
  currency: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

let store: MockOrder[] = [];
let seqCounter = 0;

function buildPrismaMock() {
  return {
    event: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: USER_ID }),
      create: jest.fn().mockResolvedValue({ id: USER_ID }),
    },
    order: {
      create: jest.fn().mockImplementation(({ data }: { data: Partial<MockOrder> }) => {
        const order: MockOrder = {
          id: `order-${store.length + 1}`,
          publicOrderNumber: data.publicOrderNumber ?? `DEMO-${store.length + 1}`,
          status: data.status ?? OrderStatus.PAID,
          userId: data.userId ?? USER_ID,
          organizationId: data.organizationId ?? 'org-id',
          eventId: data.eventId ?? EVENT_ID,
          venueId: data.venueId ?? 'venue-id',
          supplierId: data.supplierId ?? SUPPLIER_ID,
          pickupPointId: data.pickupPointId ?? PP_ID,
          subtotalCents: data.subtotalCents ?? 1000,
          totalCents: data.totalCents ?? 1000,
          currency: 'eur',
          metadata: (data.metadata as Record<string, unknown>) ?? {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.push(order);
        return Promise.resolve(order);
      }),
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        let result = store.filter(
          (o) =>
            o.eventId === (where.eventId as string | undefined) &&
            o.publicOrderNumber.startsWith(DEMO_PREFIX),
        );
        // Filter by status.notIn
        const notIn = (where.status as { notIn?: OrderStatus[] } | undefined)?.notIn;
        if (notIn) {
          result = result.filter((o) => !notIn.includes(o.status));
        }
        // Filter by status.in
        const statusIn = (where.status as { in?: OrderStatus[] } | undefined)?.in;
        if (statusIn) {
          result = result.filter((o) => statusIn.includes(o.status));
        }
        // Filter by status (exact)
        const statusExact = typeof where.status === 'string' ? (where.status as OrderStatus) : null;
        if (statusExact) {
          result = result.filter((o) => o.status === statusExact);
        }
        return Promise.resolve(result);
      }),
      update: jest.fn().mockImplementation(
        ({ where, data }: { where: { id: string }; data: { status: OrderStatus } }) => {
          const order = store.find((o) => o.id === where.id);
          if (order) order.status = data.status;
          return Promise.resolve(order ?? {});
        },
      ),
      deleteMany: jest.fn().mockImplementation(
        ({ where }: { where: { eventId: string } }) => {
          const before = store.length;
          store = store.filter((o) => o.eventId !== where.eventId);
          return Promise.resolve({ count: before - store.length });
        },
      ),
    },
    orderAuditTrail: {
      create: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockImplementation(() => {
      seqCounter++;
      return Promise.resolve([{ nextval: BigInt(seqCounter) }]);
    }),
    $transaction: jest.fn().mockImplementation((ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return (ops as (tx: unknown) => Promise<unknown>)(null);
    }),
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SimulatorService — Rush & Load Tests (BLOC 10.1)', () => {
  let service: SimulatorService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    store = [];
    seqCounter = 0;
    prisma = buildPrismaMock();

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatorService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = mod.get<SimulatorService>(SimulatorService);
  });

  // ─── 50-order rush ─────────────────────────────────────────────────────────

  describe('50-order rush', () => {
    it('creates exactly 50 PAID orders', async () => {
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      const result = await service.simulateRush(EVENT_ID, 50);

      expect(result.created).toBe(50);
      expect(prisma.order.create).toHaveBeenCalledTimes(50);
    });

    it('all 50 orders have DEMO- prefix', async () => {
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      await service.simulateRush(EVENT_ID, 50);

      const demoOrders = store.filter((o) => o.publicOrderNumber.startsWith(DEMO_PREFIX));
      expect(demoOrders).toHaveLength(50);
    });

    it('all 50 orders are in PAID status', async () => {
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      await service.simulateRush(EVENT_ID, 50);

      const paidOrders = store.filter((o) => o.status === OrderStatus.PAID);
      expect(paidOrders).toHaveLength(50);
    });

    it('all 50 order IDs are unique', async () => {
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      await service.simulateRush(EVENT_ID, 50);

      const ids = store.map((o) => o.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(50);
    });
  });

  // ─── 100-order rush ─────────────────────────────────────────────────────────

  describe('100-order rush', () => {
    it('creates exactly 100 PAID orders', async () => {
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      const result = await service.simulateRush(EVENT_ID, 100);

      expect(result.created).toBe(100);
      expect(store).toHaveLength(100);
    });

    it('all 100 public order numbers are unique (no seq collision)', async () => {
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      await service.simulateRush(EVENT_ID, 100);

      const numbers = store.map((o) => o.publicOrderNumber);
      const unique = new Set(numbers);
      expect(unique.size).toBe(100);
    });
  });

  // ─── progressOrders — no loss ───────────────────────────────────────────────

  describe('progressOrders — no order loss', () => {
    async function setupOrders(count: number) {
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      await service.simulateRush(EVENT_ID, count);
      // Override event lookup not needed for progressOrders
    }

    it('50 PAID orders all progress to ACCEPTED after one cycle', async () => {
      await setupOrders(50);

      const result = await service.progressOrders(EVENT_ID);

      // All 50 should have been progressed
      expect(result.progressed).toBe(50);

      // No order is left behind — they all moved to ACCEPTED
      const acceptedCount = store.filter((o) => o.status === OrderStatus.ACCEPTED).length;
      expect(acceptedCount).toBe(50);
    });

    it('50 orders — 6 progress cycles — total accounted for equals 50', async () => {
      await setupOrders(50);

      // Lifecycle: PAID→ACCEPTED→PREPARING→READY→PICKED_UP→COMPLETED
      for (let cycle = 0; cycle < 6; cycle++) {
        await service.progressOrders(EVENT_ID);
      }

      // After 6 steps all PAID orders should be COMPLETED
      const completedCount = store.filter((o) => o.status === OrderStatus.COMPLETED).length;
      expect(completedCount).toBe(50);

      // Total in store hasn't changed — no phantom creates or deletes
      expect(store).toHaveLength(50);
    });

    it('count is conserved through mixed statuses: progressed + unchanged = N', async () => {
      // Seed 20 orders with the distribution from seedEvent (mix of statuses)
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      await service.seedEvent(EVENT_ID, 20);

      const totalBefore = store.length;

      // Run a progress cycle
      const result = await service.progressOrders(EVENT_ID);
      const totalAfter = store.length;

      // Orders conserved (no creates or deletes during progress)
      expect(totalAfter).toBe(totalBefore);
      // All returned as progressed (none were COMPLETED/CANCELLED in seed)
      expect(result.progressed).toBe(totalBefore);
    });
  });

  // ─── Combined: rush + randomFailures + progressOrders ──────────────────────

  describe('combined rush → randomFailures → progressOrders', () => {
    it('total order count is conserved across all operations', async () => {
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      await service.simulateRush(EVENT_ID, 30);

      const N = store.length;
      expect(N).toBe(30);

      // Apply failures at 100% rate so all orders are affected
      const failures = await service.randomFailures(EVENT_ID, 1.0);
      expect(failures.cancelled + failures.recovered).toBe(N);

      // Store should still have all 30 orders (just different statuses)
      expect(store).toHaveLength(N);

      // Progress the RECOVERED orders
      const progress = await service.progressOrders(EVENT_ID);

      // Total still N
      expect(store).toHaveLength(N);

      // RECOVERED→ACCEPTED, so progressed count = failures.recovered
      expect(progress.progressed).toBe(failures.recovered);
    });

    it('clearEvent removes all demo orders, leaving store empty', async () => {
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      await service.simulateRush(EVENT_ID, 20);
      expect(store).toHaveLength(20);

      const result = await service.clearEvent(EVENT_ID);
      expect(result.deleted).toBe(20);
      expect(store).toHaveLength(0);
    });
  });

  // ─── getStats consistency ───────────────────────────────────────────────────

  describe('getStats — counts are always consistent', () => {
    it('getStats totals match store length at every cycle', async () => {
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      await service.simulateRush(EVENT_ID, 40);

      for (let cycle = 0; cycle < 4; cycle++) {
        await service.progressOrders(EVENT_ID);
        const stats = await service.getStats(EVENT_ID);

        // Sum of all status counts must equal store length
        const sum = Object.values(stats.stats).reduce((a, b) => a + b, 0);
        expect(sum).toBe(store.length);
        expect(stats.total).toBe(store.length);
      }
    });

    it('getStats after randomFailures reflects correct split', async () => {
      prisma.event.findUnique.mockResolvedValue(makeEventFixture());
      await service.simulateRush(EVENT_ID, 20);

      const failures = await service.randomFailures(EVENT_ID, 1.0);
      const stats = await service.getStats(EVENT_ID);

      const cancelledStat = stats.stats[OrderStatus.CANCELLED] ?? 0;
      const recoveredStat = stats.stats[OrderStatus.RECOVERED] ?? 0;

      expect(cancelledStat + recoveredStat).toBe(failures.cancelled + failures.recovered);
      expect(stats.total).toBe(20);
    });
  });
});
