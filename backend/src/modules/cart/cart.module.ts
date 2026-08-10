import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { GroupsModule } from '../groups/groups.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [GroupsModule, LoyaltyModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
