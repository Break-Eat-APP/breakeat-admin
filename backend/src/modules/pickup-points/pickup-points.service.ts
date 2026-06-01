import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  requireOrgAccess,
  MANAGE_ROLES,
  ALL_ORG_ROLES,
} from '../../common/helpers/require-org-access';
import type { CreatePickupPointDto } from './dto/create-pickup-point.dto';
import type { UpdatePickupPointDto } from './dto/update-pickup-point.dto';
import type { PickupPoint } from '@prisma/client';

/**
 * PickupPointsService manages physical pickup locations.
 *
 * A pickup point belongs to an org and a venue.
 * It can optionally be scoped to an event and/or a specific supplier.
 *
 * Access rules:
 * - Read: any org member
 * - Write: ORG_ADMIN or MANAGER
 */
@Injectable()
export class PickupPointsService {
  private readonly logger = new Logger(PickupPointsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreatePickupPointDto,
  ): Promise<PickupPoint> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    // Verify venue belongs to org
    const venue = await this.prisma.venue.findFirst({
      where: { id: dto.venueId, organizationId },
    });
    if (!venue) throw new NotFoundException('Venue not found in this organization');

    // Optionally verify event belongs to org AND shares the same venue
    if (dto.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: dto.eventId, organizationId },
      });
      if (!event) throw new NotFoundException('Event not found in this organization');

      // A pickup point must be in the same venue as its event
      if (event.venueId !== dto.venueId) {
        throw new BadRequestException(
          'venueId must match the event venue (event.venueId)',
        );
      }
    }

    // Optionally verify supplier belongs to org
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, organizationId },
      });
      if (!supplier) throw new NotFoundException('Supplier not found in this organization');
    }

    const pp = await this.prisma.pickupPoint.create({
      data: {
        organizationId,
        venueId: dto.venueId,
        eventId: dto.eventId ?? null,
        supplierId: dto.supplierId ?? null,
        name: dto.name,
        status: dto.status,
      },
    });

    this.logger.log(`PickupPoint created: ${pp.id} ("${pp.name}") in org ${organizationId}`);
    return pp;
  }

  /**
   * Lists pickup points for an org.
   * Optional filters: venueId, eventId, supplierId (via query parameters at controller level).
   */
  async findAllByOrg(
    organizationId: string,
    userId: string,
    filters?: { venueId?: string; eventId?: string; supplierId?: string },
  ): Promise<PickupPoint[]> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    return this.prisma.pickupPoint.findMany({
      where: {
        organizationId,
        ...(filters?.venueId && { venueId: filters.venueId }),
        ...(filters?.eventId && { eventId: filters.eventId }),
        ...(filters?.supplierId && { supplierId: filters.supplierId }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async update(
    organizationId: string,
    pickupPointId: string,
    userId: string,
    dto: UpdatePickupPointDto,
  ): Promise<PickupPoint> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.pickupPoint.findFirst({
      where: { id: pickupPointId, organizationId },
    });
    if (!existing) throw new NotFoundException('Pickup point not found');

    const updated = await this.prisma.pickupPoint.update({
      where: { id: pickupPointId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    this.logger.log(`PickupPoint updated: ${pickupPointId} in org ${organizationId}`);
    return updated;
  }
}
