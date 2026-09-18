import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

/**
 * Le fichier client d'un club, déduit de ses commandes.
 *
 * Aucun import : PrismaModule est global. Module en lecture seule — il ne
 * collecte rien, il relit.
 */
@Module({
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
