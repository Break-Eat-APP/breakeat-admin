import { Module } from '@nestjs/common';
import { OrderSplitsService } from './order-splits.service';
import { OrderSplitsController } from './order-splits.controller';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersModule } from '../orders/orders.module';

/**
 * PHASE 25 — « l'ardoise ». Module ENTIEREMENT additif : rien du parcours de
 * commande existant ne passe par ici. Le retirer, c'est supprimer ce dossier et
 * la ligne correspondante dans `app.module.ts`.
 */
@Module({
  imports: [PaymentsModule, OrdersModule],
  controllers: [OrderSplitsController],
  providers: [OrderSplitsService],
  exports: [OrderSplitsService],
})
export class OrderSplitsModule {}
