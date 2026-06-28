import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  requireOrgAccess,
  MANAGE_ROLES,
  ALL_ORG_ROLES,
} from '../../common/helpers/require-org-access';
import type { CreateVenueDto } from './dto/create-venue.dto';
import type { UpdateVenueDto } from './dto/update-venue.dto';
import type { Venue } from '@prisma/client';

/**
 * VenuesService owns all venue persistence logic.
 *
 * Access rules:
 * - Read: any org member (ALL_ORG_ROLES)
 * - Write: ORG_ADMIN or MANAGER only (MANAGE_ROLES)
 */
@Injectable()
export class VenuesService {
  private readonly logger = new Logger(VenuesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreateVenueDto,
  ): Promise<Venue> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const venue = await this.prisma.venue.create({
      data: {
        organizationId,
        name: dto.name,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        searchTerms: dto.searchTerms,
        flaixEnabled: dto.flaixEnabled,
        flaixVenueId: dto.flaixVenueId,
        timezone: dto.timezone ?? 'Europe/Paris',
        status: dto.status,
      },
    });

    this.logger.log(`Venue created: ${venue.id} ("${venue.name}") in org ${organizationId}`);
    return venue;
  }

  async findAllByOrg(organizationId: string, userId: string): Promise<Venue[]> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    return this.prisma.venue.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, venueId: string, userId: string): Promise<Venue> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    const venue = await this.prisma.venue.findFirst({
      where: { id: venueId, organizationId },
    });

    if (!venue) throw new NotFoundException('Venue not found');
    return venue;
  }

  async update(
    organizationId: string,
    venueId: string,
    userId: string,
    dto: UpdateVenueDto,
  ): Promise<Venue> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.venue.findFirst({
      where: { id: venueId, organizationId },
    });
    if (!existing) throw new NotFoundException('Venue not found');

    const updated = await this.prisma.venue.update({
      where: { id: venueId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.searchTerms !== undefined && { searchTerms: dto.searchTerms }),
        ...(dto.flaixEnabled !== undefined && { flaixEnabled: dto.flaixEnabled }),
        ...(dto.flaixVenueId !== undefined && { flaixVenueId: dto.flaixVenueId }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    this.logger.log(`Venue updated: ${venueId} in org ${organizationId}`);
    return updated;
  }
}
