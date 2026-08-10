import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { LoyaltyService } from './loyalty.service';

/**
 * LoyaltyController — consultation de la fidélité par le CLIENT.
 *
 * Un utilisateur ne peut lire que SON propre solde : l'identifiant du client
 * vient du JWT, jamais de l'URL. Seule l'organisation (le club) est un
 * paramètre, puisqu'un client a un solde distinct par club.
 *
 *   GET /loyalty/organizations/:organizationId          — solde + historique
 *   GET /loyalty/venues/:venueId/config                 — programme du lieu
 */
@UseGuards(JwtAuthGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  /** Solde du client connecté chez ce club + 20 derniers mouvements. */
  @Get('organizations/:organizationId')
  async getMySummary(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.loyalty.assertOrganizationExists(organizationId);
    return this.loyalty.getSummary(user.sub, organizationId);
  }

  /**
   * Programme de fidélité d'un lieu (activé ? quel taux ?). Permet à l'app de
   * n'afficher la section fidélité que si le club l'a activée.
   */
  @Get('venues/:venueId/config')
  async getVenueConfig(@Param('venueId', ParseUUIDPipe) venueId: string) {
    return this.loyalty.getConfigForVenue(venueId);
  }

  /**
   * Programme + solde du client connecté pour un lieu, en un seul appel.
   * C'est ce qu'utilise l'app : elle ne manipule que des lieux, jamais des
   * identifiants d'organisation.
   */
  @Get('venues/:venueId/me')
  async getVenueStatus(
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.loyalty.getVenueStatusForUser(venueId, user.sub);
  }
}
