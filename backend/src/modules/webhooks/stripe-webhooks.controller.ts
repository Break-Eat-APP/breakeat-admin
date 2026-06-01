import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { StripeService } from '../payments/stripe.service';
import { StripeWebhooksService } from './stripe-webhooks.service';

/**
 * Receives Stripe webhook events.
 *
 * Wiring requirements (configured in main.ts in Bloc 5.5+):
 * - This route is mounted under `/webhooks/stripe`, OUTSIDE the global /api/v1 prefix
 *   so that Stripe can reach it at a stable URL.
 * - The request body must remain a raw Buffer (NOT parsed JSON) for signature verification.
 *   We register `express.raw({ type: 'application/json' })` middleware on this path only.
 * - JwtAuthGuard MUST NOT be applied here — Stripe doesn't carry our JWT.
 *   Authentication is done via signature verification.
 */
@Controller('webhooks/stripe')
export class StripeWebhooksController {
  private readonly logger = new Logger(StripeWebhooksController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly handlers: StripeWebhooksService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: true }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // express.raw middleware puts the raw body in req.body as a Buffer
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      throw new BadRequestException(
        'Webhook body is not a Buffer — ensure express.raw is registered on this route',
      );
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    await this.handlers.handleEvent(event);
    return { received: true };
  }
}
