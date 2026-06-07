import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
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

  @Get('events/:eventId/stats')
  getEventStats(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.statsService.getEventStats(eventId, user.sub);
  }
}
