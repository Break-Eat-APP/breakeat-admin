import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProductStatus, SlotStatus, FlagScope } from '@prisma/client';
import { GroupsService } from '../groups/groups.service';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * PublicEventsController — read-only endpoints for mobile customers.
 *
 * Auth is OPTIONAL (OptionalJwtAuthGuard): any customer can browse a PUBLIC
 * event anonymously, but a logged-in customer is recognised so that PRIVATE
 * events can be gated by group membership.
 *
 * PRIVATE-event rule (Phase 14.4): every route resolves access through
 * GroupsService.canAccessEvent(). A non-member (or anonymous visitor) gets an
 * identical 404 to a non-existent event — the existence of a PRIVATE event is
 * never leaked.
 *
 * Exposed data: event metadata, supplier list, product catalogue, available slots.
 * NOT exposed: financial data, PII, organisation internals, Stripe data.
 *
 * Base path: /api/v1/public/events
 */
@UseGuards(OptionalJwtAuthGuard)
@Controller('public/events')
export class PublicEventsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groupsService: GroupsService,
  ) {}

  /**
   * Throws 404 if the caller may not access this event (unknown event, or a
   * PRIVATE event the caller is not a group member of). Shared by every route.
   */
  private async assertAccessible(eventId: string, user?: JwtPayload): Promise<void> {
    const allowed = await this.groupsService.canAccessEvent(eventId, user?.sub ?? null);
    if (!allowed) throw new NotFoundException('Event not found');
  }

  /**
   * GET /api/v1/public/events/:eventId
   * Returns event info + attached suppliers (any status).
   */
  @Get(':eventId')
  async findEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    await this.assertAccessible(eventId, user);

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        venue: { select: { id: true, name: true, address: true } },
        organization: { select: { primaryColor: true, logoUrl: true } },
        eventSuppliers: {
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                preparationZone: true,
                status: true,
              },
            },
          },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    // White-label : la config « Apparence de l'app » (écran d'accueil) est éditée
    // côté dashboard et stockée en app-settings ; l'app cliente la lit ici.
    const appearanceSetting = await this.prisma.appSetting.findFirst({
      where: {
        key: 'app.appearance.home',
        scope: FlagScope.ORGANIZATION,
        scopeId: event.organizationId,
      },
      select: { value: true },
    });

    return {
      id: event.id,
      name: event.name,
      status: event.status,
      startAt: event.startAt,
      endAt: event.endAt,
      venue: event.venue,
      // Branding du club : couleur de l'événement en priorité, sinon celle de l'org.
      branding: {
        primaryColor: event.primaryColor ?? event.organization?.primaryColor ?? null,
        logoUrl: event.logoUrl ?? event.organization?.logoUrl ?? null,
      },
      // Config d'apparence (cartes d'accueil) — null si le club n'a rien configuré.
      appearance: appearanceSetting?.value ?? null,
      suppliers: event.eventSuppliers.map((es) => ({
        id: es.supplier.id,
        name: es.supplier.name,
        description: es.supplier.preparationZone ?? null,
        status: es.supplier.status,
      })),
    };
  }

  /**
   * GET /api/v1/public/events/:eventId/suppliers/:supplierId/products
   * Returns ACTIVE products grouped by category for a supplier at this event.
   */
  @Get(':eventId/suppliers/:supplierId/products')
  async findProducts(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    await this.assertAccessible(eventId, user);

    // Verify supplier is attached to this event
    const attached = await this.prisma.eventSupplier.findFirst({
      where: { eventId, supplierId },
    });
    if (!attached) throw new NotFoundException('Supplier not attached to this event');

    const products = await this.prisma.product.findMany({
      where: { supplierId, status: ProductStatus.ACTIVE },
      include: { category: { select: { id: true, name: true, sortOrder: true } } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    });

    // Group by category
    const byCategory = new Map<
      string,
      { category: { id: string; name: string; sortOrder: number }; products: typeof products }
    >();

    for (const p of products) {
      const cat = p.category ?? { id: 'uncategorized', name: 'Autres', sortOrder: 999 };
      if (!byCategory.has(cat.id)) {
        byCategory.set(cat.id, { category: cat, products: [] });
      }
      const entry = byCategory.get(cat.id);
      if (entry) entry.products.push(p);
    }

    const groups = Array.from(byCategory.values()).sort(
      (a, b) => a.category.sortOrder - b.category.sortOrder,
    );

    return { supplierId, eventId, groups };
  }

  /**
   * GET /api/v1/public/events/:eventId/slots
   * Returns OPEN slots for the event, ordered by startAt.
   */
  @Get(':eventId/slots')
  async findSlots(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    // assertAccessible also covers event existence (404 for unknown events).
    await this.assertAccessible(eventId, user);

    return this.prisma.slot.findMany({
      where: { eventId, status: SlotStatus.OPEN },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        label: true,
        startAt: true,
        endAt: true,
        capacity: true,
        currentLoad: true,
        status: true,
      },
    });
  }
}
