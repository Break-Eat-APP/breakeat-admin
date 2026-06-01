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
        suppliers: {
          include: {
            products: { where: { status: 'ACTIVE' } },
          },
        },
        pickupPoints: true,
      },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const suppliers = event.suppliers;
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
        suppliers: { include: { products: true } },
        pickupPoints: true,
      },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const suppliers = event.suppliers.filter((s) => s.products.length > 0);
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
        firstName: 'Demo',
        lastName: 'Simulator',
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
