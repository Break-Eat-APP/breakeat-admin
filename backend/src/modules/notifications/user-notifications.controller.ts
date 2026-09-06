import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { UserNotificationsService } from './user-notifications.service';

/**
 * La cloche de l'application.
 *
 * Deux gestes, et deux seulement : lire ce qui attend, et dire qu'on l'a lu.
 */
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class UserNotificationsController {
  constructor(private readonly notifications: UserNotificationsService) {}

  /** GET /api/v1/notifications — la liste, et le nombre de non-lues. */
  @Get()
  lister(@CurrentUser() user: JwtPayload) {
    return this.notifications.lister(user.sub);
  }

  /** POST /api/v1/notifications/lues — la cloche revient à zéro. */
  @Post('lues')
  @HttpCode(HttpStatus.OK)
  async toutMarquerLu(@CurrentUser() user: JwtPayload) {
    const marquees = await this.notifications.toutMarquerLu(user.sub);
    return { marquees };
  }
}
