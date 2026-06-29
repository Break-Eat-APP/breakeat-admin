import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EventStatus, EventVisibility, Prisma, VenueStatus } from '@prisma/client';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * PublicVenuesController — découverte des lieux pour l'app mobile (Phase 16).
 *
 * Point d'entrée du parcours « click-and-collect » : l'utilisateur cherche un lieu
 * (par nom/adresse) et/ou laisse l'app le géolocaliser pour trier/filtrer par
 * proximité. Aucune authentification requise (navigation libre).
 *
 * GET /api/v1/public/venues?q=&lat=&lng=&radiusKm=
 *   - q        : filtre texte sur le nom ou l'adresse (insensible à la casse).
 *   - lat,lng  : position de l'utilisateur → calcule la distance (Haversine), trie
 *                par proximité et écarte les lieux hors rayon (les lieux SANS
 *                coordonnées restent listés — tolérance pendant le déploiement).
 *   - radiusKm : rayon de filtrage (défaut 150 km).
 *
 * Lieux privés (Phase 16.1) : un lieu n'apparaît que s'il a au moins un événement
 * accessible à l'appelant (PUBLIC, ou PRIVATE via appartenance à un groupe), TOUTES
 * visibilités/statuts confondus. Un lieu dont aucun événement n'est accessible est
 * masqué — sans révéler son existence — même si son événement privé n'est pas encore
 * actif (pas de fuite via « Bientôt »). `currentEventId` = premier événement accessible
 * ET actif (cible de navigation), sinon null (générique « Bientôt »). Les lieux sans
 * aucun événement restent listés (génériques, non confidentiels).
 */
@UseGuards(OptionalJwtAuthGuard)
@Controller('public/venues')
export class PublicVenuesController {
  /** Rayon par défaut au-delà duquel un lieu géolocalisé est écarté. */
  private static readonly DEFAULT_RADIUS_KM = 10;

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(
    @CurrentUser() user?: JwtPayload,
    @Query('q') q?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    const term = q?.trim();
    const where: Prisma.VenueWhereInput = {
      status: VenueStatus.ACTIVE,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { address: { contains: term, mode: 'insensitive' } },
              { searchTerms: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const venues = await this.prisma.venue.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        flaixEnabled: true,
        flaixVenueId: true,
        organization: { select: { name: true, logoUrl: true, primaryColor: true } },
        // TOUS les événements (id, statut, visibilité) : la confidentialité se décide
        // sur l'ensemble, pas seulement les actifs — sinon un lieu privé dont
        // l'événement privé n'est pas encore actif serait révélé en « Bientôt ».
        events: {
          orderBy: { startAt: 'asc' },
          select: { id: true, status: true, visibility: true },
        },
      },
    });

    // Ensemble des événements PRIVÉS accessibles à l'utilisateur (via ses groupes).
    const accessibleEventIds = new Set<string>();
    if (user?.sub) {
      const memberships = await this.prisma.groupMember.findMany({
        where: { userId: user.sub },
        select: { group: { select: { events: { select: { eventId: true } } } } },
      });
      for (const m of memberships) {
        for (const ge of m.group.events) accessibleEventIds.add(ge.eventId);
      }
    }
    const canAccess = (ev: { id: string; visibility: EventVisibility }) =>
      ev.visibility === EventVisibility.PUBLIC || accessibleEventIds.has(ev.id);

    const userLat = parseCoord(lat);
    const userLng = parseCoord(lng);
    const hasLocation = userLat !== null && userLng !== null;
    const radius = parsePositiveNumber(radiusKm) ?? PublicVenuesController.DEFAULT_RADIUS_KM;

    let result = venues
      .map((v) => {
        const accessible = v.events.filter(canAccess);
        // Lieu privé masqué : a des événements, mais AUCUN accessible (toutes visibilités
        // confondues) — on ne révèle pas son existence, même sans événement actif.
        if (v.events.length > 0 && accessible.length === 0) return null;
        // Cible de navigation : premier événement accessible ET actif.
        const currentEvent = accessible.find((e) => e.status === EventStatus.ACTIVE);

        const distanceKm =
          hasLocation && v.latitude !== null && v.longitude !== null
            ? haversineKm(userLat, userLng, v.latitude, v.longitude)
            : null;
        return {
          id: v.id,
          name: v.name,
          address: v.address,
          latitude: v.latitude,
          longitude: v.longitude,
          imageUrl: v.organization?.logoUrl ?? null,
          primaryColor: v.organization?.primaryColor ?? null,
          flaixEnabled: v.flaixEnabled,
          flaixVenueId: v.flaixVenueId,
          currentEventId: currentEvent?.id ?? null,
          distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (hasLocation) {
      // Quand la position est connue : on n'affiche que les lieux géolocalisés dans
      // le rayon. Les lieux sans coordonnées sont masqués (ils n'ont pas de position
      // exploitable pour un tri de proximité).
      result = result.filter((v) => v.distanceKm !== null && v.distanceKm <= radius);
      // Trie par distance croissante.
      result.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }

    return result;
  }
}

/** Parse une coordonnée décimale valide, sinon null. */
function parseCoord(raw?: string): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parsePositiveNumber(raw?: string): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Distance en kilomètres entre deux points (formule de Haversine). */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // rayon moyen de la Terre (km)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
