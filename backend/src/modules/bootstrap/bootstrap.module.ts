import { Module } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service';
import { BootstrapController } from './bootstrap.controller';

/**
 * BootstrapModule — création de l'accès principal quand plus aucun compte
 * n'est utilisable. Module isolé et sans dépendance métier : il peut être
 * retiré du projet en supprimant une seule ligne de `app.module.ts`.
 */
@Module({
  controllers: [BootstrapController],
  providers: [BootstrapService],
})
export class BootstrapModule {}
