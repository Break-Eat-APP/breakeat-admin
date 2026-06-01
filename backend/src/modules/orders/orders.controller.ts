import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { OrderActorType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { OrdersService } from './orders.service';
import { TransitionOrderDto } from './dto/transition-order.dto';

/**
 * OrdersController
 *
 * Customer routes:
 *   GET  /orders/:id              — view own order
 *   GET  /orders/:id/audit        — view audit trail (own order)
 *
 * Operator routes (require membership in the order's organization):
 *   PATCH /orders/:id/accept           PAID        → ACCEPTED
 *   PATCH /orders/:id/start-preparing  ACCEPTED    → PREPARING
 *   PATCH /orders/:id/mark-ready       PREPARING   → READY
 *   PATCH /orders/:id/mark-picked-up   READY       → PICKED_UP
 *   PATCH /orders/:id/recover          any → RECOVERED
 *   PATCH /orders/:id/cancel           PAID/ACCEPTED/PREPARING → CANCELLED
 *
 * Dashboard (operator):
 *   GET  /orders/event/:eventId/active — active orders snapshot
 */
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  // ─── Customer ────────────────────────────────────────────────

  /** GET /api/v1/orders/:id — caller must own the order. */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, payments: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== user.sub) {
      throw new ForbiddenException('You do not own this order');
    }
    return order;
  }

  /** GET /api/v1/orders/:id/audit — audit trail (own order). */
  @Get(':id/audit')
  async getAuditTrail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== user.sub) {
      throw new ForbiddenException('You do not own this order');
    }
    return this.ordersService.findAuditTrail(id);
  }

  // ─── Operator dashboard snapshot ─────────────────────────────

  /**
   * GET /api/v1/orders/event/:eventId/active
   * Returns all non-terminal orders for an event.
   * Caller must be a member of the event's organization.
   */
  @Get('event/:eventId/active')
  async findActiveByEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertOperatorAccess(eventId, user.sub);
    return this.ordersService.findActiveByEvent(eventId);
  }

  // ─── Operator transitions ─────────────────────────────────────

  /** PATCH /api/v1/orders/:id/accept — PAID → ACCEPTED */
  @Patch(':id/accept')
  async accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertOperatorAccessByOrder(id, user.sub);
    return this.ordersService.transition(id, OrderStatus.ACCEPTED, OrderActorType.OPERATOR, user.sub, dto.reason);
  }

  /** PATCH /api/v1/orders/:id/start-preparing — ACCEPTED → PREPARING */
  @Patch(':id/start-preparing')
  async startPreparing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertOperatorAccessByOrder(id, user.sub);
    return this.ordersService.transition(id, OrderStatus.PREPARING, OrderActorType.OPERATOR, user.sub, dto.reason);
  }

  /** PATCH /api/v1/orders/:id/mark-ready — PREPARING → READY */
  @Patch(':id/mark-ready')
  async markReady(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertOperatorAccessByOrder(id, user.sub);
    return this.ordersService.transition(id, OrderStatus.READY, OrderActorType.OPERATOR, user.sub, dto.reason);
  }

  /** PATCH /api/v1/orders/:id/mark-picked-up — READY → PICKED_UP */
  @Patch(':id/mark-picked-up')
  async markPickedUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertOperatorAccessByOrder(id, user.sub);
    return this.ordersService.transition(id, OrderStatus.PICKED_UP, OrderActorType.OPERATOR, user.sub, dto.reason);
  }

  /** PATCH /api/v1/orders/:id/recover — any allowed → RECOVERED */
  @Patch(':id/recover')
  async recover(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertOperatorAccessByOrder(id, user.sub);
    return this.ordersService.transition(
      id,
      OrderStatus.RECOVERED,
      OrderActorType.OPERATOR,
      user.sub,
      dto.reason ?? 'Manual recovery by operator',
    );
  }

  /** PATCH /api/v1/orders/:id/cancel — PAID/ACCEPTED/PREPARING → CANCELLED */
  @Patch(':id/cancel')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertOperatorAccessByOrder(id, user.sub);
    return this.ordersService.transition(
      id,
      OrderStatus.CANCELLED,
      OrderActorType.OPERATOR,
      user.sub,
      dto.reason ?? 'Cancelled by operator',
    );
  }

  // ─── Internals ───────────────────────────────────────────────

  /**
   * Verifies the caller is a member of the organization that owns the event.
   */
  private async assertOperatorAccess(eventId: string, userId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { organizationId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    await this.assertOrgMember(event.organizationId, userId);
  }

  /**
   * Verifies the caller is a member of the organization that owns the order.
   */
  private async assertOperatorAccessByOrder(orderId: string, userId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { organizationId: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    await this.assertOrgMember(order.organizationId, userId);
  }

  private async assertOrgMember(organizationId: string, userId: string): Promise<void> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }
  }
}
