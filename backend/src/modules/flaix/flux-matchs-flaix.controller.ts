import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ImportMatchsFlaixService } from './import-matchs-flaix.service';
import { ApercuFluxFlaixDto, ReglerFluxFlaixDto } from './dto/flux-flaix.dto';

/**
 * LE CALENDRIER FLAIX D'UN LIEU (25/11/2026) — « Événements & configuration ».
 *
 * Le club colle le lien de son calendrier Flaix, voit l'aperçu, puis active la
 * synchronisation. Droits vérifiés à chaque appel : membre du club avec un
 * rôle de gestion (`requireOrgAccess`), et le lieu doit être à CE club.
 */
@UseGuards(JwtAuthGuard)
@Controller('organizations/:orgId/venues/:venueId/flux-flaix')
export class FluxMatchsFlaixController {
  constructor(private readonly flux: ImportMatchsFlaixService) {}

  @Get()
  reglage(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.flux.reglage(user.sub, orgId, venueId);
  }

  /** Ce que la synchronisation ferait — rien n'est écrit. */
  @Post('apercu')
  @HttpCode(200)
  apercu(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ApercuFluxFlaixDto,
  ) {
    return this.flux.apercu(user.sub, orgId, venueId, dto.lien);
  }

  @Put()
  regler(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReglerFluxFlaixDto,
  ) {
    return this.flux.regler(user.sub, orgId, venueId, dto);
  }
}
