import { Test, TestingModule } from '@nestjs/testing';
import type Stripe from 'stripe';
import { StripeWebhooksService } from './stripe-webhooks.service';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { OrderSplitsService } from '../order-splits/order-splits.service';

const STRIPE_EVENT_ID = 'evt_test_123';
const PAYMENT_INTENT_ID = 'pi_test_456';

function makeEvent(type: string, object: unknown): Stripe.Event {
  return {
    id: STRIPE_EVENT_ID,
    type,
    data: { object },
    object: 'event',
  } as unknown as Stripe.Event;
}

describe('StripeWebhooksService', () => {
  let service: StripeWebhooksService;
  let prisma: jest.Mocked<PrismaService>;
  let orders: jest.Mocked<OrdersService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhooksService,
        {
          provide: PrismaService,
          useValue: {
            webhookEvent: {
              findUnique: jest.fn(),
              // La réclamation du journal : `count: 1` = cet appel a gagné la
              // ligne. `count: 0` = elle existait déjà.
              createMany: jest.fn().mockResolvedValue({ count: 1 }),
              update: jest.fn(),
            },
            // `account.updated` suit desormais le compte du CLUB : c'est le
            // seul qui encaisse.
            organization: {
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: OrdersService,
          useValue: {
            createFromPaymentIntent: jest.fn(),
            recordFailedPayment: jest.fn(),
            recordRefund: jest.fn(),
          },
        },
        {
          // Phase 25 — les parts d'ardoise sont ecartees avant tout appel.
          provide: OrderSplitsService,
          useValue: { marquerPartAutorisee: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(StripeWebhooksService);
    prisma = module.get(PrismaService);
    orders = module.get(OrdersService);
  });

  it('skips already-processed events (idempotency)', async () => {
    // La ligne existait déjà (count 0) et porte une date de traitement.
    (prisma.webhookEvent.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue({
      stripeEventId: STRIPE_EVENT_ID,
      processedAt: new Date(),
    });

    const event = makeEvent('payment_intent.succeeded', { id: PAYMENT_INTENT_ID });
    await service.handleEvent(event);

    expect(orders.createFromPaymentIntent).not.toHaveBeenCalled();
  });

  it('RÉCLAME le journal en une instruction — deux livraisons simultanées ne se heurtent plus', async () => {
    // Le défaut : « chercher, puis créer ». Deux livraisons du même événement
    // constataient l'absence de ligne, puis tentaient tous deux de l'écrire. Le
    // second recevait une violation d'unicité, et le webhook répondait 500 à
    // Stripe pour un doublon EMPÊCHÉ — qui n'est pas une panne.
    const event = makeEvent('payment_intent.succeeded', { id: PAYMENT_INTENT_ID });
    await service.handleEvent(event);

    expect(prisma.webhookEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    // Le chemin normal ne lit même plus le journal : une seule requête.
    expect(prisma.webhookEvent.findUnique).not.toHaveBeenCalled();
  });

  it('REJOUE un événement dont le traitement n’avait pas abouti', async () => {
    // Ligne présente mais sans date de traitement : une tentative précédente
    // est morte en route. Perdre un événement de PAIEMENT coûte infiniment
    // plus cher que de le traiter deux fois.
    (prisma.webhookEvent.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue({
      stripeEventId: STRIPE_EVENT_ID,
      processedAt: null,
    });

    const event = makeEvent('payment_intent.succeeded', { id: PAYMENT_INTENT_ID });
    await service.handleEvent(event);

    expect(orders.createFromPaymentIntent).toHaveBeenCalled();
  });

  it('dispatches payment_intent.succeeded to OrdersService and marks event processed', async () => {
    (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue(null);

    const intent = {
      id: PAYMENT_INTENT_ID,
      amount: 1500,
      currency: 'eur',
      metadata: { cartId: 'cart-1' },
    };
    const event = makeEvent('payment_intent.succeeded', intent);

    await service.handleEvent(event);

    expect(prisma.webhookEvent.createMany).toHaveBeenCalled();
    expect(orders.createFromPaymentIntent).toHaveBeenCalledWith(
      PAYMENT_INTENT_ID,
      expect.objectContaining({ amount: 1500, currency: 'eur' }),
      expect.anything(),
    );
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeEventId: STRIPE_EVENT_ID },
      }),
    );
  });

  it('dispatches payment_intent.payment_failed to OrdersService with failure reason', async () => {
    (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue(null);

    const intent = {
      id: PAYMENT_INTENT_ID,
      amount: 1500,
      currency: 'eur',
      metadata: { cartId: 'cart-1' },
      last_payment_error: { message: 'card_declined' },
    };
    const event = makeEvent('payment_intent.payment_failed', intent);

    await service.handleEvent(event);

    expect(orders.recordFailedPayment).toHaveBeenCalledWith(
      PAYMENT_INTENT_ID,
      expect.anything(),
      'card_declined',
      expect.anything(),
    );
  });

  it('cree la commande depuis checkout.session.completed aussi', async () => {
    // `payment_intent.succeeded` et `checkout.session.completed` decrivent le
    // MEME encaissement. Rien ne garantit que les deux soient coches sur le
    // point de terminaison : n'en ecouter qu'un faisait de cette case a cocher
    // un point de defaillance unique -- argent encaisse, 200 rendu a Stripe, et
    // aucune commande en cuisine.
    (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue(null);

    const event = makeEvent('checkout.session.completed', {
      id: 'cs_test_1',
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: PAYMENT_INTENT_ID,
      amount_total: 200,
      currency: 'eur',
      metadata: { cartId: 'cart-1' },
    });

    await service.handleEvent(event);

    expect(orders.createFromPaymentIntent).toHaveBeenCalledWith(
      PAYMENT_INTENT_ID,
      expect.objectContaining({ amount: 200, metadata: { cartId: 'cart-1' } }),
      expect.anything(),
    );
  });

  it('ignore une session non reglee', async () => {
    // Une session peut se terminer sans paiement (virement en attente). Creer
    // la commande la enverrait en cuisine avant l'argent.
    (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue(null);

    const event = makeEvent('checkout.session.completed', {
      id: 'cs_test_2',
      object: 'checkout.session',
      payment_status: 'unpaid',
      payment_intent: PAYMENT_INTENT_ID,
      amount_total: 200,
      currency: 'eur',
      metadata: { cartId: 'cart-1' },
    });

    await service.handleEvent(event);

    expect(orders.createFromPaymentIntent).not.toHaveBeenCalled();
  });

  it('ignore une session sans panier', async () => {
    (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue(null);

    const event = makeEvent('checkout.session.completed', {
      id: 'cs_test_3',
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: PAYMENT_INTENT_ID,
      amount_total: 200,
      currency: 'eur',
      metadata: {},
    });

    await service.handleEvent(event);

    expect(orders.createFromPaymentIntent).not.toHaveBeenCalled();
  });

  it('met a jour l’etat Stripe DU CLUB sur account.updated', async () => {
    // Sans ce suivi, un club dont Stripe restreint le compte l'apprendrait en
    // decouvrant que plus personne ne peut payer.
    (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.organization.findFirst as jest.Mock).mockResolvedValue({
      id: 'club-1',
      stripeAccountId: 'acct_test',
      stripeOnboardedAt: null,
    });

    const event = makeEvent('account.updated', {
      id: 'acct_test',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });

    await service.handleEvent(event);

    const updateCall = (prisma.organization.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where.id).toBe('club-1');
    expect(updateCall.data.stripeChargesEnabled).toBe(true);
    expect(updateCall.data.stripeAccountStatus).toBe('ACTIVE');
    // First-time onboarded timestamp must be set
    expect(updateCall.data.stripeOnboardedAt).toBeInstanceOf(Date);
  });

  // ─── Remboursements ──────────────────────────────────────────

  describe('charge.refunded', () => {
    it('ENREGISTRE le remboursement sur la commande', async () => {
      // Le défaut : l'app savait AFFICHER un remboursement (bandeau bleu,
      // anneau bleu), l'API renvoyait déjà `paymentStatus`, et rien n'écrivait
      // jamais `REFUNDED`. Un remboursement fait depuis le tableau de bord
      // Stripe ne se voyait nulle part : le client lisait « Récupérée » et nous
      // écrivait pour savoir où était son argent.
      const event = makeEvent('charge.refunded', {
        id: 'ch_1',
        payment_intent: PAYMENT_INTENT_ID,
        amount: 1500,
        amount_refunded: 1500,
      });

      await service.handleEvent(event);

      expect(orders.recordRefund).toHaveBeenCalledWith(
        PAYMENT_INTENT_ID,
        { rembourseCents: 1500, totalCents: 1500 },
        expect.anything(),
      );
    });

    it('transmet le CUMUL rendu : c’est ce qui distingue un partiel', async () => {
      const event = makeEvent('charge.refunded', {
        id: 'ch_2',
        payment_intent: PAYMENT_INTENT_ID,
        amount: 1500,
        amount_refunded: 500,
      });

      await service.handleEvent(event);

      expect(orders.recordRefund).toHaveBeenCalledWith(
        PAYMENT_INTENT_ID,
        { rembourseCents: 500, totalCents: 1500 },
        expect.anything(),
      );
    });

    it('ignore une charge sans paiement rattaché, sans faire echouer le webhook', async () => {
      const event = makeEvent('charge.refunded', { id: 'ch_3', amount: 1500, amount_refunded: 1500 });

      await expect(service.handleEvent(event)).resolves.toBeUndefined();
      expect(orders.recordRefund).not.toHaveBeenCalled();
    });
  });
});
