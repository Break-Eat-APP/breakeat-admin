import { Global, Module } from '@nestjs/common';
import { StripeService } from './stripe.service';

/**
 * PaymentsModule owns the Stripe integration.
 *
 * Marked @Global() so that StripeService can be injected from SuppliersModule
 * (Connect onboarding) and CheckoutModule (PaymentIntent) without re-importing
 * everywhere.
 *
 * Webhook handling and Order creation will be added in Bloc 5.5 / 5.6.
 */
@Global()
@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentsModule {}
