import { Body, Controller, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/** Au-delà, ce n'est plus une liste de favoris : c'est un annuaire. */
export const MAX_FAVORIS = 200;

export class RemplacerFavorisDto {
  @IsArray()
  @ArrayMaxSize(MAX_FAVORIS)
  // Toute version : les identifiants des lieux de démonstration ne sont pas
  // tous des v4, et refuser l'un d'eux ferait tomber toute la liste.
  @IsUUID('all', { each: true })
  venueIds!: string[];
}

/**
 * Les favoris du client CONNECTÉ. Chacun n'écrit que les siens : l'identifiant
 * vient du jeton, jamais de la requête.
 */
@UseGuards(JwtAuthGuard)
@Controller('favorite-venues')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  /** PUT /api/v1/favorite-venues — remplace la liste par celle du téléphone. */
  @Put()
  @HttpCode(HttpStatus.OK)
  remplacer(@CurrentUser() user: JwtPayload, @Body() dto: RemplacerFavorisDto) {
    return this.favorites.remplacer(user.sub, dto.venueIds);
  }
}
