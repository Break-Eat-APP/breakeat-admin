import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FrequentationService, type FiltreFrequentation } from './frequentation.service';
import { SignalerVisiteDto } from './dto/signaler-visite.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * La mesure d'audience : une route pour écrire, une pour lire.
 *
 * Écrire est ouvert aux visiteurs NON connectés, et c'est tout l'intérêt : le
 * visiteur qui regarde la carte sans commander est précisément celui que les
 * commandes ne voient pas. Lire est réservé au club concerné.
 */
@Controller()
export class FrequentationController {
  constructor(private readonly frequentation: FrequentationService) {}

  /**
   * POST /api/v1/frequentation
   *
   * Répond 204 quoi qu'il arrive. Une mesure d'audience ne doit jamais
   * empêcher un client de commander : si elle échoue, elle se tait.
   */
  @Post('frequentation')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async signaler(@Body() dto: SignalerVisiteDto, @CurrentUser() user?: JwtPayload): Promise<void> {
    await this.frequentation.signaler(dto, user?.sub);
  }

  /**
   * GET /api/v1/organizations/:orgId/frequentation
   *
   * `venueId`, `eventId`, `du`, `au` (ISO) restreignent la lecture. Sans eux,
   * tout l'historique du club.
   */
  @Get('organizations/:orgId/frequentation')
  @UseGuards(JwtAuthGuard)
  async pourOrganisation(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Query('venueId') venueId?: string,
    @Query('eventId') eventId?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
  ) {
    return this.frequentation.pourOrganisation(orgId, user.sub, lireFiltre({ venueId, eventId, du, au }));
  }
}

/**
 * Traduit les paramètres d'adresse en filtre, et REFUSE une date illisible.
 *
 * Une date mal formée donnée à `new Date` produit `Invalid Date`, que Prisma
 * transmet sans broncher : la requête ne renvoie rien, et l'écran affiche un
 * club sans aucune visite. Mieux vaut le dire que laisser croire à un désert.
 */
export function lireFiltre(params: {
  venueId?: string;
  eventId?: string;
  du?: string;
  au?: string;
}): FiltreFrequentation {
  const date = (valeur: string | undefined, nom: string): Date | undefined => {
    if (!valeur) return undefined;
    const d = new Date(valeur);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`Date « ${nom} » illisible`);
    return d;
  };
  return {
    ...(params.venueId ? { venueId: params.venueId } : {}),
    ...(params.eventId ? { eventId: params.eventId } : {}),
    ...(date(params.du, 'du') ? { du: date(params.du, 'du') } : {}),
    ...(date(params.au, 'au') ? { au: date(params.au, 'au') } : {}),
  };
}
