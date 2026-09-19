import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DocumentsService, type FichierRecu } from './documents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Les documents d'un club.
 *
 * AUCUNE adresse publique : le contenu ne sort que par une route
 * authentifiée, et le filtre porte à la fois sur le document ET sur le club.
 * Connaître un identifiant ne suffit donc pas à lire le contrat d'un autre.
 */
@UseGuards(JwtAuthGuard)
@Controller('organizations/:orgId/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  lister(@Param('orgId', ParseUUIDPipe) orgId: string, @CurrentUser() user: JwtPayload) {
    return this.documents.lister(orgId, user.sub);
  }

  /**
   * POST — dépôt d'un PDF.
   *
   * La borne de taille est posée ICI, dans l'intercepteur, et non seulement
   * dans le service : elle arrête le téléversement AVANT que dix méga-octets
   * ne traversent le réseau pour être refusés à l'arrivée.
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('fichier', { limits: { fileSize: DocumentsService.TAILLE_MAX, files: 1 } }),
  )
  deposer(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() fichier: FichierRecu,
  ) {
    return this.documents.deposer(orgId, user.sub, fichier);
  }

  /**
   * GET — le PDF lui-même.
   *
   * `inline` et non `attachment` : le club doit pouvoir LIRE son contrat sans
   * le télécharger. `no-store` parce qu'un document contractuel n'a rien à
   * faire dans le cache d'un navigateur partagé.
   */
  @Get(':documentId/fichier')
  @Header('Cache-Control', 'no-store')
  async fichier(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const document = await this.documents.contenu(orgId, user.sub, documentId);

    res
      .type(document.mimeType)
      // Le nom est encodé : un guillemet dans un nom de fichier casserait
      // l'en-tête, et les accents ne passent pas en ASCII.
      .header(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(document.name)}`,
      )
      .send(document.content);
  }

  @Delete(':documentId')
  supprimer(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documents.supprimer(orgId, user.sub, documentId);
  }
}
