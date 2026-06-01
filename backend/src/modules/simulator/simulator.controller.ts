import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DemoGuard } from '../../common/guards/demo.guard';
import { SimulatorService } from './simulator.service';

/**
 * SimulatorController — internal demo/rush endpoints.
 *
 * All routes are protected by DemoGuard:
 *   - Returns 403 unless DEMO_MODE=true
 *   - Must NEVER be reachable in production
 *
 * Base route: /internal/simulator
 */
@Controller('internal/simulator')
@UseGuards(DemoGuard)
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  /**
   * POST /internal/simulator/events/:eventId/seed?count=20
   * Creates a realistic mix of orders at various lifecycle stages.
   */
  @Post('events/:eventId/seed')
  @HttpCode(HttpStatus.CREATED)
  async seedEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('count', new ParseIntPipe({ optional: true })) count?: number,
  ) {
    return this.simulatorService.seedEvent(eventId, count ?? 20);
  }

  /**
   * POST /internal/simulator/events/:eventId/rush?count=10
   * Floods the event with N orders in PAID status to test rush handling.
   */
  @Post('events/:eventId/rush')
  @HttpCode(HttpStatus.CREATED)
  async simulateRush(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('count', new ParseIntPipe({ optional: true })) count?: number,
  ) {
    return this.simulatorService.simulateRush(eventId, count ?? 10);
  }

  /**
   * DELETE /internal/simulator/events/:eventId
   * Removes all DEMO-* orders for an event. Safe to call multiple times.
   */
  @Delete('events/:eventId')
  @HttpCode(HttpStatus.OK)
  async clearEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.simulatorService.clearEvent(eventId);
  }
}
