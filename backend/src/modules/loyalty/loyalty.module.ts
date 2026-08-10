import { Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';

/**
 * LoyaltyModule — programme de fidélité (phase 20).
 * `LoyaltyService` est exporté : le panier l'utilise pour la remise, les
 * commandes pour créditer les points à la récupération.
 * (PrismaModule est global — pas d'import nécessaire, cf. les autres modules.)
 */
@Module({
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
