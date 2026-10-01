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
    // ─── Le journal d'idempotence, réclamé en UNE instruction ──
    //
    // C'était « chercher, puis créer ». Stripe livre le même événement deux
    // fois de suite — `checkout.session.completed` et `payment_intent.succeeded`
    // décrivent le même encaissement et arrivent à quelques millisecondes
    // d'intervalle, et une livraison peut être rejouée. Les deux appels
    // constataient donc l'absence de ligne, puis tentaient tous les deux de
    // l'écrire : le second recevait une violation d'unicité, et le webhook
    // répondait 500 à Stripe pour un doublon EMPÊCHÉ — qui n'est pas une panne.
    //
    // `createMany` + `skipDuplicates` laisse la base trancher
    // (`INSERT … ON CONFLICT DO NOTHING`) : un seul gagne, personne n'échoue.
    // Au passage, le chemin normal ne fait plus qu'une requête au lieu de deux.
    const { count } = await this.prisma.webhookEvent.createMany({
      data: [
        {
          stripeEventId: event.id,
          eventType: event.type,
          rawPayload: event as unknown as Prisma.InputJsonValue,
        },
      ],
      skipDuplicates: true,
    });

    if (count === 0) {
      // La ligne existait déjà. Traitée ? On s'arrête. Pas traitée ? C'est un
      // rejeu après un traitement interrompu : on continue, parce que perdre
      // un événement de PAIEMENT coûte infiniment plus cher que de le traiter
      // deux fois — les gestionnaires en aval sont idempotents pour cela.
      const deja = await this.prisma.webhookEvent.findUnique({
        where: { stripeEventId: event.id },
        select: { processedAt: true },
      });
      if (deja?.processedAt) {
        this.logger.debug(`Duplicate webhook ${event.id} (${event.type}) — already processed`);
        return;
      }
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

        case 'charge.refunded':
          await this.onChargeRefunded(event);
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
   * Un remboursement a été exécuté chez Stripe — d'où qu'il vienne.
   *
   * Trois origines possibles, et le client doit le voir dans les trois cas :
   * notre compensation d'ardoise, un geste commercial fait à la main depuis le
   * tableau de bord Stripe, ou une contestation. L'application savait déjà
   * AFFICHER un remboursement ; rien ne l'écrivait jamais.
   *
   * `charge.refunded` porte le cumul (`amount_refunded`) et le montant total de
   * la charge : c'est ce qui distingue un remboursement partiel d'un complet,
   * sans avoir à additionner les remboursements nous-mêmes.
   */
  private async onChargeRefunded(event: Stripe.Event): Promise<void> {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : (charge.payment_intent?.id ?? '');

    if (!paymentIntentId) {
      this.logger.warn(`charge.refunded sans payment_intent : ${charge.id}`);
      return;
    }

    await this.orders.recordRefund(
      paymentIntentId,
      { rembourseCents: charge.amount_refunded ?? 0, totalCents: charge.amount ?? 0 },
      event as unknown as Prisma.InputJsonValue,
    );
  }

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
    const intentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

    // Une part d'ardoise : l'ardoise gère elle-même son cycle de vie.
    if (session.metadata?.orderSplitShareId) {
      if (!intentId) {
        this.logger.warn(`Checkout session ${session.id} sans PaymentIntent`);
        return;
      }
      await this.splits.marquerPartAutorisee(session.id, intentId);
      return;
    }

    // ─── Commande ordinaire ────────────────────────────────────
    //
    // La commande naît normalement de `payment_intent.succeeded`. Elle peut
    // AUSSI naître ici, et c'est délibéré : ces deux événements décrivent le
    // même encaissement, et rien ne garantit que les deux soient cochés sur le
    // point de terminaison. Ne dépendre que du premier faisait de cette case à
    // cocher un point de défaillance unique — l'argent partait chez le club,
    // Stripe répondait 200, et aucune commande n'arrivait en cuisine. Le
    // symptôme, « j'ai payé et il ne se passe rien », ne désignait nulle part
    // sa cause.
    //
    // Le doublon est impossible : `createFromPaymentIntent` rend la commande
    // existante dès qu'un paiement porte déjà cet identifiant, et `Order.cartId`
    // est unique en base. Si les deux événements arrivent, le second ne fait
    // que relire ce que le premier a créé.
    if (!session.metadata?.cartId) {
      this.logger.log(`Checkout session ${session.id} sans panier — ignorée`);
      return;
    }
    if (session.payment_status !== 'paid') {
      this.logger.log(
        `Checkout session ${session.id} non réglée (${session.payment_status}) — ignorée`,
      );
      return;
    }
    if (!intentId) {
      this.logger.warn(
        `Checkout session ${session.id} réglée mais sans PaymentIntent — ` +
          'impossible de rattacher le paiement à une commande.',
      );
      return;
    }

    await this.orders.createFromPaymentIntent(
      intentId,
      {
        amount: session.amount_total ?? 0,
        currency: session.currency ?? 'eur',
        metadata: session.metadata,
      },
      event as unknown as Prisma.InputJsonValue,
    );
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
