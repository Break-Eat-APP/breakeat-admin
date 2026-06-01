import { Injectable, Logger } from '@nestjs/common';
import { StripeAccountStatus, type Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';

/**
 * StripeWebhooksService dispatches incoming Stripe events to the right handler.
 *
 * Idempotency:
 * - Every event is recorded in `webhook_events` keyed by stripeEventId (UNIQUE).
 * - Duplicate deliveries return early without re-processing.
 *
 * Critical event handlers wired here:
 * - account.updated              → mirror chargesEnabled/payoutsEnabled to Supplier
 * - payment_intent.succeeded     → OrdersService.createFromPaymentIntent
 * - payment_intent.payment_failed → OrdersService.recordFailedPayment
 *
 * Unhandled events are logged + acknowledged (HTTP 200) so Stripe doesn't retry.
 */
@Injectable()
export class StripeWebhooksService {
  private readonly logger = new Logger(StripeWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async handleEvent(event: Stripe.Event): Promise<void> {
    // Idempotency log — atomic insert prevents double-processing
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (existing?.processedAt) {
      this.logger.debug(`Duplicate webhook ${event.id} (${event.type}) — already processed`);
      return;
    }
    if (!existing) {
      await this.prisma.webhookEvent.create({
        data: {
          stripeEventId: event.id,
          eventType: event.type,
          rawPayload: event as unknown as Prisma.InputJsonValue,
        },
      });
    }

    try {
      switch (event.type) {
        case 'account.updated':
          await this.onAccountUpdated(event.data.object as Stripe.Account);
          break;

        case 'payment_intent.succeeded':
          await this.onPaymentIntentSucceeded(event);
          break;

        case 'payment_intent.payment_failed':
          await this.onPaymentIntentFailed(event);
          break;

        default:
          this.logger.log(`Unhandled Stripe event type: ${event.type}`);
      }

      await this.prisma.webhookEvent.update({
        where: { stripeEventId: event.id },
        data: { processedAt: new Date() },
      });
    } catch (err) {
      this.logger.error(
        `Webhook handler error for ${event.type} (${event.id}): ${(err as Error).message}`,
      );
      // Re-throw so Stripe retries (we leave processedAt null)
      throw err;
    }
  }

  // ─── Handlers ────────────────────────────────────────────────

  private async onAccountUpdated(account: Stripe.Account): Promise<void> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { stripeAccountId: account.id },
    });
    if (!supplier) {
      this.logger.warn(`account.updated for unknown stripeAccountId ${account.id}`);
      return;
    }

    const chargesOk = account.charges_enabled === true;
    const payoutsOk = account.payouts_enabled === true;
    const newStatus: StripeAccountStatus =
      chargesOk && payoutsOk
        ? StripeAccountStatus.ACTIVE
        : account.details_submitted
          ? StripeAccountStatus.RESTRICTED
          : StripeAccountStatus.PENDING;

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        stripeAccountStatus: newStatus,
        stripeChargesEnabled: chargesOk,
        stripePayoutsEnabled: payoutsOk,
        ...(newStatus === StripeAccountStatus.ACTIVE && !supplier.stripeOnboardedAt && {
          stripeOnboardedAt: new Date(),
        }),
      },
    });

    this.logger.log(
      `Supplier ${supplier.id} Stripe status updated via webhook: ${newStatus} (charges=${chargesOk}, payouts=${payoutsOk})`,
    );
  }

  private async onPaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
    const intent = event.data.object as Stripe.PaymentIntent;
    await this.orders.createFromPaymentIntent(
      intent.id,
      {
        amount: intent.amount,
        currency: intent.currency,
        metadata: intent.metadata,
      },
      event as unknown as Prisma.InputJsonValue,
    );
  }

  private async onPaymentIntentFailed(event: Stripe.Event): Promise<void> {
    const intent = event.data.object as Stripe.PaymentIntent;
    const reason = intent.last_payment_error?.message ?? 'unknown';
    await this.orders.recordFailedPayment(
      intent.id,
      {
        amount: intent.amount,
        currency: intent.currency,
        metadata: intent.metadata,
      },
      reason,
      event as unknown as Prisma.InputJsonValue,
    );
  }
}
