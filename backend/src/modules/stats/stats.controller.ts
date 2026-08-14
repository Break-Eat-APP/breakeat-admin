import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StatsService, type PeriodGranularity } from './stats.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * StatsController — manager-dashboard analytics (Phase 15).
 *
 * Two read-only endpoints, both JWT-protected and gated to MANAGE_ROLES inside
 * the service (SUPER_ADMIN bypasses):
 *   - GET /api/v1/organizations/:orgId/stats — org overview + per-event rollup
 *   - GET /api/v1/events/:eventId/stats      — single-event analytics
 *
 * Empty controller base path: each route declares its full path so org-scoped
 * and event-scoped analytics live in one cohesive module.
 */
@UseGuards(JwtAuthGuard)
@Controller()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('organizations/:orgId/stats')
  getOrgStats(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.statsService.getOrgOverview(orgId, user.sub);
  }

  /**
   * GET /api/v1/organizations/:orgId/stats/periods
   *
   * Chiffre d'affaires découpé dans le temps — la lecture des lieux ouverts en
   * continu, où « par événement » n'a aucun sens.
   *
   * `granularity` : day (défaut) | week | month. `from` / `to` en ISO ;
   * omis, la fenêtre couvre les 30 derniers jours (ou 12 semaines / 12 mois).
   */
  @Get('organizations/:orgId/stats/periods')
  getPeriodStats(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Query('granularity') granularity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // Validé ici plutôt que silencieusement replié sur « day » : une faute de
    // frappe donnerait un graphique juste mais pas celui demandé, et personne
    // ne s'en apercevrait.
    const ALLOWED: PeriodGranularity[] = ['day', 'week', 'month'];
    if (granularity && !ALLOWED.includes(granularity as PeriodGranularity)) {
      throw new BadRequestException(`granularity doit valoir : ${ALLOWED.join(', ')}`);
    }
    return this.statsService.getPeriodStats(orgId, user.sub, {
      granularity: granularity as PeriodGranularity | undefined,
      from,
      to,
    });
  }

  @Get('events/:eventId/stats')
  getEventStats(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.statsService.getEventStats(eventId, user.sub);
  }
}
