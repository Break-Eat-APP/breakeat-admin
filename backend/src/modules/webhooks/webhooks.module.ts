import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
// PHASE 25 — les parts d'ardoise ont leur propre cycle de vie de paiement.
import { OrderSplitsModule } from '../order-splits/order-splits.module';
import { StripeWebhooksController } from './stripe-webhooks.controller';
import { StripeWebhooksService } from './stripe-webhooks.service';

@Module({
  imports: [OrdersModule, OrderSplitsModule],
  controllers: [StripeWebhooksController],
  providers: [StripeWebhooksService],
})
export class WebhooksModule {}
