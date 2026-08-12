import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  requireOrgAccess,
  MANAGE_ROLES,
  ALL_ORG_ROLES,
} from '../../common/helpers/require-org-access';
import { EventStatus, Prisma, VenueOperatingMode } from '@prisma/client';
import type { CreateVenueDto } from './dto/create-venue.dto';
import type { UpdateVenueDto } from './dto/update-venue.dto';
import type { Venue } from '@prisma/client';

/**
 * Fin du contenant permanent.
 *
 * `Event.endAt` est obligatoire en base : un lieu ouvert en continu n'a pourtant
 * pas de fin. Plutôt que de rendre la colonne nullable — ce qui obligerait tout
 * le code qui lit une date de fin à gérer un cas « jamais » — on pose une date
 * volontairement hors d'atteinte. Aucune logique ne compare à cette borne
 * aujourd'hui (l'ouverture se décide sur `status`), elle sert de sentinelle
 * lisible si quelqu'un ouvre la table.
 */
const FIN_LOINTAINE = new Date('2099-12-31T23:59:59.000Z');

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
        buvettePlanUrl: dto.buvettePlanUrl,
        loyaltyEnabled: dto.loyaltyEnabled,
        loyaltyPointsPerEuro: dto.loyaltyPointsPerEuro,
        loyaltyPointValueCents: dto.loyaltyPointValueCents,
        operatingMode: dto.operatingMode,
        timezone: dto.timezone ?? 'Europe/Paris',
        status: dto.status,
      },
    });

    await this.ensurePermanentContainer(venue);

    this.logger.log(`Venue created: ${venue.id} ("${venue.name}") in org ${organizationId}`);
    return venue;
  }

  /**
   * Garantit qu'un lieu PERMANENT possède son contenant, et un seul.
   *
   * Appelé à la création du lieu et à chaque bascule de mode : un lieu qui
   * devient permanent doit pouvoir encaisser une commande dans la seconde, sans
   * qu'on ait pensé à créer quoi que ce soit.
   *
   * Ne fait rien pour un lieu EVENT_BASED, et ne supprime jamais un contenant
   * existant si le lieu repasse en événementiel : les commandes déjà passées y
   * sont rattachées. Il devient simplement dormant.
   */
  private async ensurePermanentContainer(venue: Venue): Promise<void> {
    if (venue.operatingMode !== VenueOperatingMode.PERMANENT) return;

    try {
      await this.prisma.event.create({
        data: {
          organizationId: venue.organizationId,
          venueId: venue.id,
          name: 'Service continu',
          startAt: new Date(),
          endAt: FIN_LOINTAINE,
          // ACTIVE d'emblée : un lieu permanent est ouvert par définition, il
          // n'y a personne pour venir « lancer » quoi que ce soit chaque matin.
          status: EventStatus.ACTIVE,
          isPermanentContainer: true,
        },
      });
      this.logger.log(`Contenant permanent créé pour le lieu ${venue.id}`);
    } catch (err) {
      // P2002 = l'index unique partiel a joué : le contenant existe déjà, soit
      // qu'on repasse ici, soit qu'une requête concurrente l'ait devancé. C'est
      // le résultat voulu dans les deux cas.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }
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
        ...(dto.buvettePlanUrl !== undefined && { buvettePlanUrl: dto.buvettePlanUrl }),
        ...(dto.loyaltyEnabled !== undefined && { loyaltyEnabled: dto.loyaltyEnabled }),
        ...(dto.loyaltyPointsPerEuro !== undefined && {
          loyaltyPointsPerEuro: dto.loyaltyPointsPerEuro,
        }),
        ...(dto.loyaltyPointValueCents !== undefined && {
          loyaltyPointValueCents: dto.loyaltyPointValueCents,
        }),
        ...(dto.operatingMode !== undefined && { operatingMode: dto.operatingMode }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    // Après la mise à jour, pas avant : c'est le mode RÉSULTANT qui décide.
    await this.ensurePermanentContainer(updated);

    this.logger.log(`Venue updated: ${venueId} in org ${organizationId}`);
    return updated;
  }
}
