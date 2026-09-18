import { Module } from '@nestjs/common';
import { FrequentationController } from './frequentation.controller';
import { FrequentationService } from './frequentation.service';

/**
 * La mesure d'audience : l'application signale, le club lit.
 *
 * Le seul module de l'API qui ÉCRIVE sur une route ouverte aux visiteurs non
 * connectés — c'est justement ce visiteur-là qu'aucune commande ne voit.
 */
@Module({
  controllers: [FrequentationController],
  providers: [FrequentationService],
  exports: [FrequentationService],
})
export class FrequentationModule {}
