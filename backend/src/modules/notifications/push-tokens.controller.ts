import { Body, Controller, Delete, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { PushTokensService } from './push-tokens.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

class RegisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsOptional()
  platform?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('push-tokens')
export class PushTokensController {
  constructor(private readonly pushTokens: PushTokensService) {}

  /** POST /api/v1/push-tokens — enregistre le jeton de l'appareil courant. */
  @Post()
  @HttpCode(HttpStatus.OK)
  register(@CurrentUser() user: JwtPayload, @Body() dto: RegisterPushTokenDto) {
    return this.pushTokens.register(user.sub, dto.token, dto.platform);
  }

  /** DELETE /api/v1/push-tokens — désenregistre (déconnexion). */
  @Delete()
  @HttpCode(HttpStatus.OK)
  unregister(@CurrentUser() user: JwtPayload, @Body() dto: RegisterPushTokenDto) {
    return this.pushTokens.unregister(user.sub, dto.token);
  }
}
