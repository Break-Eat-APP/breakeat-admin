import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { GroupsModule } from '../groups/groups.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
// PHASE 23 — le paiement remplit le creneau choisi.
import { SlotsModule } from '../slots/slots.module';

@Module({
  imports: [GroupsModule, LoyaltyModule, SlotsModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
