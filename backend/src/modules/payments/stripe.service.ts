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
 * - Paiements en « destination charges » (`transfer_data.destination`) : la
 *   charge naît sur le compte Break Eat, les fonds partent vers le compte du
 *   club. Jamais de charges directes ni de virements manuels.
 * - AUCUNE commission n'est prélevée à la source (`STRIPE_PLATFORM_FEE_BPS = 0`) :
 *   Break Eat facture sa part au club en fin de mois, hors Stripe.
 *
 *   ⚠️ Conséquence de ce montage : en destination charge, les FRAIS STRIPE sont
 *   supportés par le compte à l'origine de la charge — donc par Break Eat, et
 *   non par le club. Sans commission à la source, chaque transaction coûte à la
 *   plateforme. Le passage en charges DIRECTES (les frais suivent alors le
 *   club) est un autre montage, à décider en connaissance de cause.
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
    // Par defaut AUCUNE commission prelevee au paiement : Break Eat facture sa
    // part au club en fin de mois, hors Stripe. Mettre `STRIPE_PLATFORM_FEE_BPS`
    // a une valeur non nulle reactive le prelevement a la source.
    this.platformFeeBps = this.config.get<number>('app.stripe.platformFeeBps') ?? 0;
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
   * La commission n'est jointe que si elle est configurée (zéro par défaut).
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
        ...(applicationFeeAmount > 0 ? { application_fee_amount: applicationFeeAmount } : {}),
        transfer_data: { destination: params.destinationAccountId },
        metadata: params.metadata,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  /**
   * Page de paiement HÉBERGÉE par Stripe, en AUTORISATION SEULE.
   *
   * Deux propriétés en font le cœur de « l'ardoise » :
   *
   *  1. Hébergée : le convive n'installe rien. Il ouvre un lien dans son
   *     navigateur, paie avec Apple Pay ou sa carte, c'est fini. Nous n'avons
   *     ni page de paiement à écrire, ni numéro de carte à faire transiter.
   *
   *  2. `capture_method: 'manual'` : la somme est BLOQUÉE sur la carte, pas
   *     prélevée. On encaisse au départ de la commande. Si la tournée capote,
   *     il n'y a rien à rembourser — une autorisation non capturée se libère
   *     d'elle-même (7 jours pour une carte en ligne).
   *
   * `payment_method_types: ['card']` est explicite : la capture différée n'est
   * pas supportée par tous les moyens de paiement (ni SEPA, ni iDEAL). Laisser
   * Stripe en proposer un ferait échouer l'autorisation au pire moment.
   * Apple Pay et Google Pay passent par `card` — ils restent disponibles.
   */
  async createHostedCheckout(params: {
    amountCents: number;
    currency: string;
    destinationAccountId: string;
    productName: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
    metadata?: Record<string, string>;
    /**
     * `manual` pour une part d'ardoise (on encaisse au départ de la commande),
     * `automatic` pour une commande seule (il n'y a rien à attendre).
     */
    captureMethod?: 'automatic' | 'manual';
  }): Promise<Stripe.Checkout.Session> {
    // Commission a la source : omise quand elle vaut zero.
    //
    // Stripe refuse `application_fee_amount: 0` — et surtout, envoyer le champ
    // a zero laisserait croire, a la lecture, qu'une commission est prelevee.
    // Sans lui, la totalite part vers le compte du club.
    const applicationFeeAmount = Math.floor((params.amountCents * this.platformFeeBps) / 10_000);
    const commission =
      applicationFeeAmount > 0 ? { application_fee_amount: applicationFeeAmount } : {};

    return this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: params.currency,
              unit_amount: params.amountCents,
              product_data: { name: params.productName },
            },
          },
        ],
        payment_intent_data: {
          capture_method: params.captureMethod ?? 'manual',
          ...commission,
          transfer_data: { destination: params.destinationAccountId },
          metadata: params.metadata,
        },
        metadata: params.metadata,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  /**
   * Encaisse une autorisation. Appelé au DÉPART de la commande, jamais avant :
   * c'est ce qui garantit qu'on ne prélève personne pour une tournée qui
   * n'aura pas lieu.
   */
  async capturePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.capture(paymentIntentId);
  }

  /**
   * Libère une autorisation non capturée (convive qui se retire, hôte qui
   * annule). Rien n'a été prélevé : ce n'est pas un remboursement.
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.cancel(paymentIntentId);
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
