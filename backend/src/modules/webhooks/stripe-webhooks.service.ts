import { Injectable, Logger } from '@nestjs/common';
import { StripeAccountStatus, type Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { OrderSplitsService } from '../order-splits/order-splits.service';

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
    private readonly splits: OrderSplitsService,
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

        case 'checkout.session.completed':
          await this.onCheckoutSessionCompleted(event);
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

  /**
   * Stripe a modifié un compte connecté — c'est celui d'un CLUB.
   *
   * Sans ce suivi, l'état affiché ne changerait que si quelqu'un pensait à
   * appuyer sur « Vérifier l'état ». Un club dont Stripe restreint le compte
   * apprendrait la nouvelle en découvrant que plus personne ne peut payer.
   */
  private async onAccountUpdated(account: Stripe.Account): Promise<void> {
    const club = await this.prisma.organization.findFirst({
      where: { stripeAccountId: account.id },
    });
    if (!club) {
      this.logger.warn(`account.updated pour un compte inconnu : ${account.id}`);
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

    await this.prisma.organization.update({
      where: { id: club.id },
      data: {
        stripeAccountStatus: newStatus,
        stripeChargesEnabled: chargesOk,
        ...(newStatus === StripeAccountStatus.ACTIVE && !club.stripeOnboardedAt && {
          stripeOnboardedAt: new Date(),
        }),
      },
    });

    this.logger.log(
      `Club ${club.id} — état Stripe mis à jour par webhook : ${newStatus} ` +
        `(encaissements=${chargesOk}, virements=${payoutsOk})`,
    );
  }

  /**
   * PHASE 25 — une part d'ardoise vient d'être AUTORISÉE (carte bloquée, rien
   * de prélevé). On verrouille les articles sur leur payeur.
   */
  private async onCheckoutSessionCompleted(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!session.metadata?.orderSplitShareId) {
      this.logger.log(`Checkout session sans ardoise (${session.id}) — ignorée`);
      return;
    }
    const intentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!intentId) {
      this.logger.warn(`Checkout session ${session.id} sans PaymentIntent`);
      return;
    }
    await this.splits.marquerPartAutorisee(session.id, intentId);
  }

  /**
   * Une part d'ardoise ne passe JAMAIS par ici.
   *
   * Quand on encaisse une part, Stripe émet `payment_intent.succeeded` comme
   * pour n'importe quel paiement. Sans ce filtre, le gestionnaire chercherait
   * un panier dans les métadonnées, n'en trouverait pas, et lèverait une erreur
   * à chaque tournée envoyée — Stripe réessaierait en boucle. Pire pour
   * `payment_failed` : il créerait une ligne de paiement orpheline portant
   * l'identifiant d'intention de la part, et la création de la commande
   * échouerait ensuite sur la contrainte d'unicité.
   *
   * L'ardoise pilote elle-même le cycle de vie de ses paiements.
   */
  private estPartDArdoise(intent: Stripe.PaymentIntent): boolean {
    return Boolean(intent.metadata?.orderSplitShareId);
  }

  private async onPaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (this.estPartDArdoise(intent)) {
      this.logger.log(`Part d'ardoise encaissée (${intent.id}) — gérée par l'ardoise`);
      return;
    }
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
    if (this.estPartDArdoise(intent)) {
      this.logger.log(`Part d'ardoise refusée (${intent.id}) — le convive peut réessayer`);
      return;
    }
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
