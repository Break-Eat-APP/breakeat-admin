import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderActorType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * SimulatorService — generates synthetic load for demo and rush testing.
 *
 * Enabled only when DEMO_MODE=true (enforced by DemoGuard on all endpoints).
 *
 * Phase 6 deliverables (skeleton):
 *   seedEvent()   — creates a realistic mix of orders for an event (PAID / ACCEPTED / PREPARING)
 *   simulateRush() — rapidly creates N orders in PAID status to simulate rush load
 *   clearEvent()   — deletes all synthetic orders for an event (cleanup after demo)
 *
 * Phase 8 will add:
 *   progressOrders() — step all orders forward one state (simulates staff working)
 *   randomFailures()  — randomly cancel or recover some orders
 */
@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);

  // Synthetic order numbers use a different prefix so they can be identified and purged
  private static readonly DEMO_PREFIX = 'DEMO-';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seeds realistic order data for a given event.
   * Creates orders at various lifecycle stages to simulate a live event.
   *
   * @param eventId   The event to seed orders into
   * @param count     Total number of orders to create (default: 20)
   */
  async seedEvent(eventId: string, count = 20): Promise<{ created: number; eventId: string }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        eventSuppliers: {
          include: {
            supplier: {
              include: { products: { where: { status: 'ACTIVE' } } },
            },
          },
        },
        pickupPoints: true,
      },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const suppliers = event.eventSuppliers.map((es) => es.supplier);
    const pickupPoints = event.pickupPoints;
    if (suppliers.length === 0 || pickupPoints.length === 0) {
      throw new NotFoundException('Event has no suppliers or pickup points — cannot seed orders');
    }

    // Distribution across statuses to simulate a live event snapshot
    const statusDistribution: OrderStatus[] = [
      ...Array(Math.floor(count * 0.35)).fill(OrderStatus.PAID),       // 35% waiting
      ...Array(Math.floor(count * 0.25)).fill(OrderStatus.ACCEPTED),    // 25% accepted
      ...Array(Math.floor(count * 0.25)).fill(OrderStatus.PREPARING),   // 25% in kitchen
      ...Array(Math.floor(count * 0.15)).fill(OrderStatus.READY),       // 15% ready to pick up
    ];

    let created = 0;
    const demoUser = await this.getOrCreateDemoUser();

    for (const [idx, status] of statusDistribution.entries()) {
      const supplier = suppliers[idx % suppliers.length];
      const pickupPoint = pickupPoints[idx % pickupPoints.length];
      const products = supplier.products.slice(0, 3);
      if (products.length === 0) continue;

      const items = products.slice(0, 1 + (idx % 3)).map((p) => ({
        productId: p.id,
        productNameSnapshot: p.name,
        unitPriceCentsSnapshot: p.price,
        quantity: 1 + (idx % 2),
        lineTotalCents: p.price * (1 + (idx % 2)),
      }));

      const totalCents = items.reduce((s, i) => s + i.lineTotalCents, 0);
      const seq = await this.nextDemoSeq();

      await this.prisma.order.create({
        data: {
          publicOrderNumber: `${SimulatorService.DEMO_PREFIX}${String(seq).padStart(6, '0')}`,
          userId: demoUser.id,
          organizationId: event.organizationId,
          eventId: event.id,
          venueId: event.venueId,
          supplierId: supplier.id,
          pickupPointId: pickupPoint.id,
          status,
          subtotalCents: totalCents,
          totalCents,
          currency: 'eur',
          metadata: { demo: true, seedIdx: idx },
          items: { create: items },
        },
      });
      created++;
    }

    this.logger.log(`SimulatorService: seeded ${created} demo orders for event ${eventId}`);
    return { created, eventId };
  }

  /**
   * Creates N orders in PAID status to simulate a rush.
   */
  async simulateRush(
    eventId: string,
    count = 10,
  ): Promise<{ created: number; eventId: string }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        eventSuppliers: {
          include: {
            supplier: { include: { products: true } },
          },
        },
        pickupPoints: true,
      },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const suppliers = event.eventSuppliers
      .map((es) => es.supplier)
      .filter((s) => s.products.length > 0);
    if (suppliers.length === 0 || event.pickupPoints.length === 0) {
      throw new NotFoundException('Event has no suppliers/products or pickup points');
    }

    const demoUser = await this.getOrCreateDemoUser();
    let created = 0;

    for (let i = 0; i < count; i++) {
      const supplier = suppliers[i % suppliers.length];
      const product = supplier.products[0];
      const pickupPoint = event.pickupPoints[0];
      const seq = await this.nextDemoSeq();

      await this.prisma.order.create({
        data: {
          publicOrderNumber: `${SimulatorService.DEMO_PREFIX}${String(seq).padStart(6, '0')}`,
          userId: demoUser.id,
          organizationId: event.organizationId,
          eventId: event.id,
          venueId: event.venueId,
          supplierId: supplier.id,
          pickupPointId: pickupPoint.id,
          status: OrderStatus.PAID,
          subtotalCents: product.price,
          totalCents: product.price,
          currency: 'eur',
          metadata: { demo: true, rush: true, rushIdx: i },
          items: {
            create: [{
              productId: product.id,
              productNameSnapshot: product.name,
              unitPriceCentsSnapshot: product.price,
              quantity: 1,
              lineTotalCents: product.price,
            }],
          },
        },
      });
      created++;
    }

    this.logger.log(`SimulatorService: rush — ${created} demo orders created for event ${eventId}`);
    return { created, eventId };
  }

  /**
   * Deletes all demo orders (publicOrderNumber starting with DEMO-) for an event.
   */
  async clearEvent(eventId: string): Promise<{ deleted: number; eventId: string }> {
    const result = await this.prisma.order.deleteMany({
      where: {
        eventId,
        publicOrderNumber: { startsWith: SimulatorService.DEMO_PREFIX },
      },
    });
    this.logger.log(`SimulatorService: cleared ${result.count} demo orders for event ${eventId}`);
    return { deleted: result.count, eventId };
  }

  /**
   * Steps all active demo orders forward one state.
   * PAID→ACCEPTED, ACCEPTED→PREPARING, PREPARING→READY, READY→PICKED_UP, PICKED_UP→COMPLETED.
   * RECOVERED→ACCEPTED (re-enters workflow).
   * COMPLETED and CANCELLED are left unchanged.
   *
   * Each transition is recorded in the audit trail (actor = SYSTEM).
   * Realtime events are NOT emitted here — this is a bulk operation designed for demo speed.
   */
  async progressOrders(
    eventId: string,
  ): Promise<{ progressed: number; eventId: string }> {
    const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
      [OrderStatus.PAID]:      OrderStatus.ACCEPTED,
      [OrderStatus.ACCEPTED]:  OrderStatus.PREPARING,
      [OrderStatus.PREPARING]: OrderStatus.READY,
      [OrderStatus.READY]:     OrderStatus.PICKED_UP,
      [OrderStatus.PICKED_UP]: OrderStatus.COMPLETED,
      [OrderStatus.RECOVERED]: OrderStatus.ACCEPTED,
    };

    const demoOrders = await this.prisma.order.findMany({
      where: {
        eventId,
        publicOrderNumber: { startsWith: SimulatorService.DEMO_PREFIX },
        status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
      },
    });

    let progressed = 0;
    for (const order of demoOrders) {
      const next = NEXT_STATUS[order.status];
      if (!next) continue;

      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: order.id },
          data: { status: next },
        }),
        this.prisma.orderAuditTrail.create({
          data: {
            orderId: order.id,
            actorType: OrderActorType.SYSTEM,
            previousState: order.status,
            nextState: next,
            reason: 'Demo simulator progress step',
            metadata: { demo: true } as object,
          },
        }),
      ]);
      progressed++;
    }

    this.logger.log(
      `SimulatorService: progressed ${progressed} demo orders for event ${eventId}`,
    );
    return { progressed, eventId };
  }

  /**
   * Randomly cancels or recovers a subset of active demo orders.
   * Designed to stress-test the operator dashboard's recovery flow.
   *
   * @param eventId  Target event
   * @param failRate Fraction of active orders to affect (default 0.2 = 20%)
   *                 60% of affected orders → CANCELLED, 40% → RECOVERED
   */
  async randomFailures(
    eventId: string,
    failRate = 0.2,
  ): Promise<{ cancelled: number; recovered: number; eventId: string }> {
    // Clamp failRate to [0, 1] — a value > 1 would affect 100 % of orders which
    // is rarely intended and could wipe all demo orders accidentally.
    const rate = Math.max(0, Math.min(1, failRate));

    const demoOrders = await this.prisma.order.findMany({
      where: {
        eventId,
        publicOrderNumber: { startsWith: SimulatorService.DEMO_PREFIX },
        status: {
          in: [OrderStatus.PAID, OrderStatus.ACCEPTED, OrderStatus.PREPARING],
        },
      },
    });

    let cancelled = 0;
    let recovered = 0;

    for (const order of demoOrders) {
      const roll = Math.random();
      if (roll >= rate) continue;

      // 60% cancel, 40% recover
      const next = roll < rate * 0.6 ? OrderStatus.CANCELLED : OrderStatus.RECOVERED;

      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: order.id },
          data: { status: next },
        }),
        this.prisma.orderAuditTrail.create({
          data: {
            orderId: order.id,
            actorType: OrderActorType.SYSTEM,
            previousState: order.status,
            nextState: next,
            reason: `Demo random failure (${next.toLowerCase()})`,
            metadata: { demo: true } as object,
          },
        }),
      ]);

      if (next === OrderStatus.CANCELLED) cancelled++;
      else recovered++;
    }

    this.logger.log(
      `SimulatorService: random failures — cancelled ${cancelled}, recovered ${recovered} for event ${eventId}`,
    );
    return { cancelled, recovered, eventId };
  }

  /**
   * Returns a count of demo orders by status for an event.
   * Useful for the operator to understand the current demo state.
   */
  async getStats(
    eventId: string,
  ): Promise<{ stats: Record<string, number>; total: number; eventId: string }> {
    const orders = await this.prisma.order.findMany({
      where: {
        eventId,
        publicOrderNumber: { startsWith: SimulatorService.DEMO_PREFIX },
      },
      select: { status: true },
    });

    const stats: Record<string, number> = {};
    for (const { status } of orders) {
      stats[status] = (stats[status] ?? 0) + 1;
    }
    return { stats, total: orders.length, eventId };
  }

  // ─── Internals ───────────────────────────────────────────────

  /**
   * Returns a stable demo user, creating it if it doesn't exist.
   * The demo user is not a real account — it has no password or credentials.
   */
  private async getOrCreateDemoUser() {
    const DEMO_EMAIL = 'demo-simulator@break-eat.internal';
    const existing = await this.prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (existing) return existing;

    return this.prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        passwordHash: 'DEMO_NO_LOGIN',
        displayName: 'Demo Simulator',
        isActive: false, // cannot login
      },
    });
  }

  /**
   * Generates a monotone sequence number for demo order public IDs.
   * Uses the same PostgreSQL sequence as real orders but with DEMO- prefix.
   */
  private async nextDemoSeq(): Promise<bigint> {
    const rows = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('order_public_seq') AS nextval
    `;
    return rows[0]?.nextval ?? BigInt(0);
  }
}

// Re-export so the controller can use it without importing from the service path
export { OrderActorType };
