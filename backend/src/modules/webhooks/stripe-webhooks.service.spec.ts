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
              create: jest.fn(),
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
    (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue({
      stripeEventId: STRIPE_EVENT_ID,
      processedAt: new Date(),
    });

    const event = makeEvent('payment_intent.succeeded', { id: PAYMENT_INTENT_ID });
    await service.handleEvent(event);

    expect(orders.createFromPaymentIntent).not.toHaveBeenCalled();
    // No new insert needed when event already known
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
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

    expect(prisma.webhookEvent.create).toHaveBeenCalled();
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
});
