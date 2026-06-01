import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * StripeService — single point of contact with the Stripe SDK.
 *
 * No other service should instantiate `new Stripe(...)`. This wrapper:
 * - centralises the API version pin (`STRIPE_API_VERSION`);
 * - exposes typed helpers for Connect onboarding, PaymentIntents and webhook verification;
 * - keeps webhook signature verification on a single code path.
 *
 * Critical guarantees:
 * - We use the standard Stripe marketplace pattern: destination charges
 *   (`transfer_data.destination`) + `application_fee_amount` for the platform fee.
 *   We never use direct charges or separate manual transfers in V1.
 * - Connect account type = "standard" for V1 (suppliers manage their own dashboard).
 * - Webhook signature verification uses `constructEvent` — never trust raw body.
 */
@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  private stripe!: Stripe;
  private webhookSecret = '';
  private platformFeeBps = 0;
  private connectReturnUrl = '';
  private connectRefreshUrl = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const secretKey = this.config.get<string>('app.stripe.secretKey') ?? '';
    const apiVersion = this.config.get<string>('app.stripe.apiVersion') ?? '2024-12-18.acacia';
    this.webhookSecret = this.config.get<string>('app.stripe.webhookSecret') ?? '';
    this.platformFeeBps = this.config.get<number>('app.stripe.platformFeeBps') ?? 500;
    this.connectReturnUrl = this.config.get<string>('app.stripe.connect.returnUrl') ?? '';
    this.connectRefreshUrl = this.config.get<string>('app.stripe.connect.refreshUrl') ?? '';

    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY is empty — Stripe calls will fail at runtime');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: apiVersion as Stripe.LatestApiVersion,
      typescript: true,
      appInfo: { name: 'break-eat-backend', version: '0.1.0' },
    });
  }

  /**
   * Direct SDK access for advanced cases. Prefer the typed helpers below.
   */
  get sdk(): Stripe {
    return this.stripe;
  }

  // ─── Connect ─────────────────────────────────────────────────

  /**
   * Creates a Stripe Connect Standard account for a supplier.
   * Returns the new accountId — persist it on Supplier.stripeAccountId.
   */
  async createConnectAccount(params: {
    email: string;
    country?: string;
    businessName?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Account> {
    return this.stripe.accounts.create({
      type: 'standard',
      country: params.country ?? 'FR',
      email: params.email,
      business_profile: params.businessName ? { name: params.businessName } : undefined,
      metadata: params.metadata,
    });
  }

  /**
   * Creates a one-time onboarding URL the supplier must follow to complete KYC.
   * Account links expire — generate a fresh one each call.
   */
  async createOnboardingLink(accountId: string): Promise<Stripe.AccountLink> {
    return this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: this.connectRefreshUrl,
      return_url: this.connectReturnUrl,
      type: 'account_onboarding',
    });
  }

  /**
   * Reads the live state of a Connect account.
   * Use to refresh Supplier.stripeAccountStatus.
   */
  async retrieveAccount(accountId: string): Promise<Stripe.Account> {
    return this.stripe.accounts.retrieve(accountId);
  }

  // ─── PaymentIntents ──────────────────────────────────────────

  /**
   * Creates a PaymentIntent with the supplier's Connect account as destination.
   * Uses destination charges with application_fee_amount = platform commission.
   *
   * @param amountCents total amount in cents (already includes everything)
   * @param destinationAccountId the supplier's connected account
   * @param idempotencyKey the cart id — guarantees no duplicate PaymentIntent
   */
  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    destinationAccountId: string;
    idempotencyKey: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.PaymentIntent> {
    const applicationFeeAmount = Math.floor((params.amountCents * this.platformFeeBps) / 10_000);

    return this.stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: params.currency,
        application_fee_amount: applicationFeeAmount,
        transfer_data: { destination: params.destinationAccountId },
        metadata: params.metadata,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  /**
   * Retrieves a PaymentIntent. Used by webhook handlers and reconciliation jobs.
   */
  async retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  // ─── Webhooks ────────────────────────────────────────────────

  /**
   * Constructs and verifies a Stripe webhook event from the raw request body.
   * Throws StripeSignatureVerificationError if the signature is invalid.
   *
   * IMPORTANT: pass the RAW request body (Buffer), not a parsed JSON.
   */
  constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
