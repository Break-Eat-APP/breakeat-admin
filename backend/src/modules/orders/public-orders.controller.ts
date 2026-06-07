import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { GroupsService } from '../groups/groups.service';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * PublicOrdersController — read-only endpoints for public display screens.
 *
 * Auth is OPTIONAL (OptionalJwtAuthGuard): a venue screen can poll an
 * anonymous PUBLIC event, while PRIVATE events stay gated by group membership.
 *
 * These routes expose ONLY the minimum data needed (order number + pickup
 * point, no PII, no items, no financial data).
 *
 * Base path: /public/orders
 */
@UseGuards(OptionalJwtAuthGuard)
@Controller('public/orders')
export class PublicOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly groupsService: GroupsService,
  ) {}

  /**
   * GET /api/v1/public/orders/event/:eventId/ready
   *
   * Returns READY orders for a public display screen (venue TV, kiosk, etc.).
   *
   * Access (Phase 14.4 parity with PublicEventsController):
   *   - PUBLIC event  → anyone, including an anonymous screen.
   *   - PRIVATE event → only an authenticated caller who is a member of a group
   *     linked to the event. Everyone else gets an identical 404, so knowing a
   *     PRIVATE event's UUID never leaks its public order numbers.
   *
   * Response: Array of { id, publicOrderNumber, pickupPointId, updatedAt }
   * — no customer names, no items, no financial data.
   */
  @Get('event/:eventId/ready')
  async findReady(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const allowed = await this.groupsService.canAccessEvent(eventId, user?.sub ?? null);
    if (!allowed) throw new NotFoundException('Event not found');

    return this.ordersService.findReadyByEvent(eventId);
  }
}
