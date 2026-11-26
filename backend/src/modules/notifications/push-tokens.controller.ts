import { Body, Controller, Delete, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { IsBoolean, IsString, IsNotEmpty, IsOptional } from 'class-validator';
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

  /** Android : la catégorie « Commandes » est créée sur l'appareil (26/11/2026). */
  @IsBoolean()
  @IsOptional()
  canalCommandes?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('push-tokens')
export class PushTokensController {
  constructor(private readonly pushTokens: PushTokensService) {}

  /** POST /api/v1/push-tokens — enregistre le jeton de l'appareil courant. */
  @Post()
  @HttpCode(HttpStatus.OK)
  register(@CurrentUser() user: JwtPayload, @Body() dto: RegisterPushTokenDto) {
    return this.pushTokens.register(user.sub, dto.token, dto.platform, dto.canalCommandes);
  }

  /** DELETE /api/v1/push-tokens — désenregistre (déconnexion). */
  @Delete()
  @HttpCode(HttpStatus.OK)
  unregister(@CurrentUser() user: JwtPayload, @Body() dto: RegisterPushTokenDto) {
    return this.pushTokens.unregister(user.sub, dto.token);
  }
}

/**
 * POST /api/v1/push-tokens/retrait — retire un jeton SANS session : le retrait
 * rejoué après une déconnexion faite sans réseau (BUG-2026-045). Voir
 * `PushTokensService.retirerParJeton`. Sous la limitation globale.
 */
@Controller('push-tokens/retrait')
export class PushTokensRetraitController {
  constructor(private readonly pushTokens: PushTokensService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  retirer(@Body() dto: RegisterPushTokenDto) {
    return this.pushTokens.retirerParJeton(dto.token);
  }
}
