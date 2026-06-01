import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * OrdersController exposes the customer-facing reads of an Order.
 * Operator-facing routes (accept, prepare, ready, …) come in Phase 6.
 */
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly prisma: PrismaService) {}

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
}
