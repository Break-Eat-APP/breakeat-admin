import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../../database/prisma.service';
import { FlaixService } from './flaix.service';

/**
 * FlaixController — read-only endpoints for operator dashboards.
 *
 * All routes require authentication AND org membership on the target event.
 * Flaix write operations (recordDecision) are internal and called
 * programmatically from other services, never via HTTP.
 *
 * Routes:
 *   GET /flaix/event/:eventId/rush-status  — latest rush decision for an event
 *   GET /flaix/event/:eventId/decisions    — full decision audit log for an event
 */
@UseGuards(JwtAuthGuard)
@Controller('flaix')
export class FlaixController {
  constructor(
    private readonly flaixService: FlaixService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /api/v1/flaix/event/:eventId/rush-status
   * Returns the most recent RUSH_DECISION for the event, or null if none.
   * Caller must be a member of the event's organization.
   */
  @Get('event/:eventId/rush-status')
  async getRushStatus(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertOrgMemberForEvent(eventId, user.sub);
    return this.flaixService.getLatestRushDecision(eventId);
  }

  /**
   * GET /api/v1/flaix/event/:eventId/decisions
   * Returns all Flaix decisions for an event, most recent first.
   * Caller must be a member of the event's organization.
   */
  @Get('event/:eventId/decisions')
  async listDecisions(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertOrgMemberForEvent(eventId, user.sub);
    return this.flaixService.listDecisionsForEvent(eventId);
  }

  // ─── Internals ───────────────────────────────────────────────

  private async assertOrgMemberForEvent(eventId: string, userId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { organizationId: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: event.organizationId } },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }
  }
}
