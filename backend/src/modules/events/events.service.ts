import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  requireOrgAccess,
  MANAGE_ROLES,
  ALL_ORG_ROLES,
} from '../../common/helpers/require-org-access';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import type { UpdateEventStatusDto } from './dto/update-event-status.dto';
import type { Event, EventSupplier, Supplier } from '@prisma/client';

export type EventWithSuppliers = Event & {
  eventSuppliers: (EventSupplier & { supplier: Supplier })[];
  // Present on single-event reads (findOne) so the admin UI can prefill the
  // "Accès & visibilité" group selector. Omitted on list reads.
  groups?: { groupId: string }[];
};

/**
 * EventsService owns all event lifecycle and supplier assignment logic.
 *
 * Key rules:
 * - An event belongs to one venue. Venue must belong to the same org.
 * - Status transitions are validated: cannot re-activate a CANCELLED event.
 * - Suppliers must belong to the same org before being attached.
 * - ENDED/CANCELLED events cannot be modified (guard in each write method).
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreateEventDto,
  ): Promise<Event> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    // Verify the venue belongs to this org
    const venue = await this.prisma.venue.findFirst({
      where: { id: dto.venueId, organizationId },
    });
    if (!venue) {
      throw new NotFoundException('Venue not found in this organization');
    }

    // Business rule: endAt must be after startAt
    if (new Date(dto.endAt) <= new Date(dto.startAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }

    const event = await this.prisma.event.create({
      data: {
        organizationId,
        venueId: dto.venueId,
        name: dto.name,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        activeFeatureFlags: (dto.activeFeatureFlags ?? {}) as object,
      },
    });

    this.logger.log(`Event created: ${event.id} ("${event.name}") in org ${organizationId}`);
    return event;
  }

  async findAllByOrg(organizationId: string, userId: string): Promise<EventWithSuppliers[]> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    return this.prisma.event.findMany({
      where: { organizationId },
      include: { eventSuppliers: { include: { supplier: true } } },
      orderBy: { startAt: 'desc' },
    });
  }

  async findOne(
    organizationId: string,
    eventId: string,
    userId: string,
  ): Promise<EventWithSuppliers> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
      include: {
        eventSuppliers: { include: { supplier: true } },
        groups: { select: { groupId: true } },
      },
    });

    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async update(
    organizationId: string,
    eventId: string,
    userId: string,
    dto: UpdateEventDto,
  ): Promise<Event> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!existing) throw new NotFoundException('Event not found');

    this.guardFinalized(existing);

    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }

    // Phase 14.7 — when groupIds are provided, every group must belong to this
    // org. Validated up-front so we never partially apply a cross-tenant set.
    const uniqueGroupIds =
      dto.groupIds !== undefined ? [...new Set(dto.groupIds)] : undefined;
    if (uniqueGroupIds !== undefined && uniqueGroupIds.length > 0) {
      const owned = await this.prisma.group.count({
        where: { id: { in: uniqueGroupIds }, organizationId },
      });
      if (owned !== uniqueGroupIds.length) {
        throw new BadRequestException(
          'One or more groups do not belong to this organization',
        );
      }
    }

    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.startAt !== undefined && { startAt: new Date(dto.startAt) }),
      ...(dto.endAt !== undefined && { endAt: new Date(dto.endAt) }),
      ...(dto.activeFeatureFlags !== undefined && {
        activeFeatureFlags: dto.activeFeatureFlags as object,
      }),
      // Phase 14.7 — access & visibility
      ...(dto.visibility !== undefined && { visibility: dto.visibility }),
      // Phase 12.8 — branding fields
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
      ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
    };

    // When groupIds are supplied we REPLACE the event's group links atomically:
    // update the scalar fields, wipe existing EventGroup rows, recreate the set.
    let updated: Event;
    if (uniqueGroupIds !== undefined) {
      updated = await this.prisma.$transaction(async (tx) => {
        const ev = await tx.event.update({ where: { id: eventId }, data });
        await tx.eventGroup.deleteMany({ where: { eventId } });
        if (uniqueGroupIds.length > 0) {
          await tx.eventGroup.createMany({
            data: uniqueGroupIds.map((groupId) => ({ eventId, groupId })),
            skipDuplicates: true,
          });
        }
        return ev;
      });
    } else {
      updated = await this.prisma.event.update({ where: { id: eventId }, data });
    }

    this.logger.log(`Event updated: ${eventId} in org ${organizationId}`);
    return updated;
  }

  /**
   * Changes the lifecycle status of an event.
   * Allowed transitions:
   *   DRAFT     → ACTIVE | CANCELLED
   *   ACTIVE    → PAUSED | ENDED | CANCELLED
   *   PAUSED    → ACTIVE | ENDED | CANCELLED
   *   ENDED     → (none — terminal)
   *   CANCELLED → (none — terminal)
   */
  async updateStatus(
    organizationId: string,
    eventId: string,
    userId: string,
    dto: UpdateEventStatusDto,
  ): Promise<Event> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!existing) throw new NotFoundException('Event not found');

    this.guardFinalized(existing);
    this.validateTransition(existing.status, dto.status);

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { status: dto.status },
    });

    this.logger.log(
      `Event status: ${eventId} ${existing.status} → ${dto.status} (by user ${userId})`,
    );
    return updated;
  }

  /**
   * Attaches a supplier to an event (creates EventSupplier row).
   * Supplier must belong to the same org.
   */
  async attachSupplier(
    organizationId: string,
    eventId: string,
    supplierId: string,
    userId: string,
  ): Promise<EventSupplier> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!event) throw new NotFoundException('Event not found');
    this.guardFinalized(event);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found in this organization');

    const existing = await this.prisma.eventSupplier.findUnique({
      where: { eventId_supplierId: { eventId, supplierId } },
    });
    if (existing) {
      throw new ConflictException('Supplier is already attached to this event');
    }

    const es = await this.prisma.eventSupplier.create({
      data: { eventId, supplierId },
    });

    this.logger.log(`Supplier ${supplierId} attached to event ${eventId}`);
    return es;
  }

  /**
   * Detaches a supplier from an event.
   */
  async detachSupplier(
    organizationId: string,
    eventId: string,
    supplierId: string,
    userId: string,
  ): Promise<void> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!event) throw new NotFoundException('Event not found');
    this.guardFinalized(event);

    const es = await this.prisma.eventSupplier.findUnique({
      where: { eventId_supplierId: { eventId, supplierId } },
    });
    if (!es) throw new NotFoundException('Supplier is not attached to this event');

    await this.prisma.eventSupplier.delete({
      where: { eventId_supplierId: { eventId, supplierId } },
    });

    this.logger.log(`Supplier ${supplierId} detached from event ${eventId}`);
  }

  // ─── Private guards ───────────────────────────────────────────

  /** Throws if the event is in a terminal state (ENDED or CANCELLED). */
  private guardFinalized(event: Event): void {
    if (event.status === EventStatus.ENDED || event.status === EventStatus.CANCELLED) {
      throw new BadRequestException(
        `Cannot modify an event with status ${event.status}`,
      );
    }
  }

  /** Validates the requested status transition. */
  private validateTransition(from: EventStatus, to: EventStatus): void {
    const allowed: Record<EventStatus, EventStatus[]> = {
      [EventStatus.DRAFT]:     [EventStatus.ACTIVE, EventStatus.CANCELLED],
      [EventStatus.ACTIVE]:    [EventStatus.PAUSED, EventStatus.ENDED, EventStatus.CANCELLED],
      [EventStatus.PAUSED]:    [EventStatus.ACTIVE, EventStatus.ENDED, EventStatus.CANCELLED],
      [EventStatus.ENDED]:     [],
      [EventStatus.CANCELLED]: [],
    };

    if (!allowed[from].includes(to)) {
      throw new BadRequestException(
        `Invalid transition: ${from} → ${to}. Allowed: ${allowed[from].join(', ') || 'none'}`,
      );
    }
  }
}
