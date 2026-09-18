import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ClientsService } from './clients.service';
import { lireFiltre } from '../frequentation/frequentation.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Le fichier client d'un club — à l'écran, et en fichier.
 *
 * Le club se sert LUI-MÊME : il n'a personne à solliciter pour obtenir ses
 * données, et personne n'a besoin de se connecter à sa place pour les lui
 * envoyer.
 */
@UseGuards(JwtAuthGuard)
@Controller()
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  /** GET /api/v1/organizations/:orgId/clients */
  @Get('organizations/:orgId/clients')
  lister(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Query('venueId') venueId?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
  ) {
    return this.clients.lister(orgId, user.sub, lireFiltre({ venueId, du, au }));
  }

  /**
   * GET /api/v1/organizations/:orgId/clients/export
   *
   * Le même contenu, en CSV téléchargeable. `Content-Disposition` porte le nom
   * du fichier : sans lui, le navigateur enregistre « export » sans extension,
   * et le club se retrouve avec un fichier qu'aucun tableur ne veut ouvrir.
   */
  @Get('organizations/:orgId/clients/export')
  @Header('Cache-Control', 'no-store')
  async exporter(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
    @Query('venueId') venueId?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
  ): Promise<void> {
    const { csv, nomFichier } = await this.clients.exporterCsv(
      orgId,
      user.sub,
      lireFiltre({ venueId, du, au }),
    );
    res
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${nomFichier}"`)
      .send(csv);
  }
}
