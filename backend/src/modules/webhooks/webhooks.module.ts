import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { StripeWebhooksController } from './stripe-webhooks.controller';
import { StripeWebhooksService } from './stripe-webhooks.service';

@Module({
  imports: [OrdersModule],
  controllers: [StripeWebhooksController],
  providers: [StripeWebhooksService],
})
export class WebhooksModule {}
