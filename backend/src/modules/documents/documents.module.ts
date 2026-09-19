import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

/**
 * Les documents d'un club — contrat signé et pièces associées.
 *
 * Le seul module qui accepte un TÉLÉVERSEMENT. Toute la surface d'attaque
 * associée tient donc ici : taille bornée par l'intercepteur ET par la base,
 * type vérifié sur le contenu et non sur ce que le navigateur annonce.
 */
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
