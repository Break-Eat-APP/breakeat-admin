import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrderGroupsService } from './order-groups.service';
import { CreateOrderGroupDto } from './dto/create-order-group.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Invitations « commander à plusieurs ».
 *
 * Ouvrir une invitation demande d'être connecté ; la RÉSOUDRE, non : l'ami qui
 * reçoit le code doit voir où il atterrit avant de créer un compte. Rien de
 * personnel n'est exposé — nom de la buvette et nombre de commandes, rien de plus.
 */
@Controller()
export class OrderGroupsController {
  constructor(private readonly service: OrderGroupsService) {}

  /** POST /api/v1/order-groups — ouvre (ou retrouve) mon invitation. */
  @UseGuards(JwtAuthGuard)
  @Post('order-groups')
  ouvrir(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrderGroupDto) {
    return this.service.ouvrir({
      userId: user.sub,
      eventId: dto.eventId,
      supplierId: dto.supplierId,
    });
  }

  /** GET /api/v1/public/order-groups/:code — où mène ce code ? */
  @Get('public/order-groups/:code')
  rejoindre(@Param('code') code: string) {
    return this.service.rejoindre(code);
  }
}
