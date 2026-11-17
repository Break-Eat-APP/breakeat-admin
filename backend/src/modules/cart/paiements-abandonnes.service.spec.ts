import { CartStatus } from '@prisma/client';
import {
  DELAI_ABANDON_MS,
  DELAI_PAGE_HEBERGEE_MS,
  PaiementsAbandonnesService,
} from './paiements-abandonnes.service';
import type { PrismaService } from '../../database/prisma.service';
import type { StripeService } from '../payments/stripe.service';
import type { LoyaltyService } from '../loyalty/loyalty.service';
import type { SlotsService } from '../slots/slots.service';

jest.mock('../stock/retenue-stock', () => ({ rendreLeStock: jest.fn() }));
const { rendreLeStock } = require('../stock/retenue-stock') as { rendreLeStock: jest.Mock };

/**
 * Les paiements abandonnés rendent ce qu'ils retenaient (audit Codex du
 * 17/11/2026) — sans jamais toucher à un paiement qui peut encore aboutir.
 */
describe('PaiementsAbandonnesService', () => {
  const MAINTENANT = new Date('2026-11-21T21:00:00Z');
  const VIEUX = new Date(MAINTENANT.getTime() - DELAI_ABANDON_MS - 60_000);

  let prisma: {
    cart: { findMany: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  let stripe: { retrievePaymentIntent: jest.Mock; cancelPaymentIntent: jest.Mock };
  let loyalty: { releaseHoldForCart: jest.Mock };
  let slots: { libererUnePlace: jest.Mock };
  let service: PaiementsAbandonnesService;

  beforeEach(() => {
    rendreLeStock.mockReset();
    prisma = {
      cart: {
        findMany: jest.fn().mockResolvedValue([{ id: 'panier', paymentIntentId: 'pi_1', updatedAt: VIEUX }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          selectedSlotId: 'mi-temps',
          slotReservedAt: VIEUX,
          stockReservedAt: VIEUX,
          pickupPointId: 'comptoir',
          items: [{ productId: 'biere', quantity: 2 }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    stripe = {
      retrievePaymentIntent: jest.fn().mockResolvedValue({ status: 'requires_payment_method' }),
      cancelPaymentIntent: jest.fn().mockResolvedValue({ status: 'canceled' }),
    };
    loyalty = { releaseHoldForCart: jest.fn().mockResolvedValue(0) };
    slots = { libererUnePlace: jest.fn().mockResolvedValue(undefined) };
    service = new PaiementsAbandonnesService(
      prisma as unknown as PrismaService,
      stripe as unknown as StripeService,
      loyalty as unknown as LoyaltyService,
      slots as unknown as SlotsService,
    );
  });

  it('ne lit que les paniers en attente de paiement depuis plus de 30 minutes', async () => {
    await service.liberer(MAINTENANT);

    const filtre = prisma.cart.findMany.mock.calls[0][0].where;
    expect(filtre.status).toBe(CartStatus.CHECKOUT_PENDING);
    expect(filtre.updatedAt).toEqual({ lt: new Date(MAINTENANT.getTime() - DELAI_ABANDON_MS) });
  });

  it('abandonné : annulé chez Stripe, PUIS points, place du créneau et stock rendus', async () => {
    const n = await service.liberer(MAINTENANT);

    expect(n).toBe(1);
    expect(stripe.cancelPaymentIntent).toHaveBeenCalledWith('pi_1');
    expect(prisma.cart.updateMany).toHaveBeenCalledWith({
      where: { id: 'panier', status: CartStatus.CHECKOUT_PENDING },
      data: { status: CartStatus.ABANDONED },
    });
    expect(loyalty.releaseHoldForCart).toHaveBeenCalledWith('panier');
    expect(slots.libererUnePlace).toHaveBeenCalledWith('mi-temps');
    expect(rendreLeStock).toHaveBeenCalledWith(prisma, 'comptoir', [{ productId: 'biere', quantity: 2 }]);
    expect(prisma.cart.update).toHaveBeenCalledWith({
      where: { id: 'panier' },
      data: { slotReservedAt: null, stockReservedAt: null },
    });
  });

  it.each(['succeeded', 'processing', 'requires_capture'])(
    'un paiement « %s » peut encore aboutir : on ne touche à RIEN',
    async (statut) => {
      stripe.retrievePaymentIntent.mockResolvedValue({ status: statut });

      expect(await service.liberer(MAINTENANT)).toBe(0);
      expect(stripe.cancelPaymentIntent).not.toHaveBeenCalled();
      expect(prisma.cart.updateMany).not.toHaveBeenCalled();
      expect(slots.libererUnePlace).not.toHaveBeenCalled();
      expect(rendreLeStock).not.toHaveBeenCalled();
    },
  );

  it('Stripe refuse l’annulation (le client vient de payer) : rien n’est rendu', async () => {
    stripe.cancelPaymentIntent.mockRejectedValue(new Error('already succeeded'));

    expect(await service.liberer(MAINTENANT)).toBe(0);
    expect(prisma.cart.updateMany).not.toHaveBeenCalled();
    expect(rendreLeStock).not.toHaveBeenCalled();
  });

  it('déjà rendu par une autre instance : on ne rend pas deux fois', async () => {
    prisma.cart.updateMany.mockResolvedValue({ count: 0 });

    expect(await service.liberer(MAINTENANT)).toBe(0);
    expect(loyalty.releaseHoldForCart).not.toHaveBeenCalled();
    expect(slots.libererUnePlace).not.toHaveBeenCalled();
    expect(rendreLeStock).not.toHaveBeenCalled();
  });

  it('une erreur sur un panier n’arrête pas les autres', async () => {
    prisma.cart.findMany.mockResolvedValue([
      { id: 'casse', paymentIntentId: 'pi_casse', updatedAt: VIEUX },
      { id: 'panier', paymentIntentId: 'pi_1', updatedAt: VIEUX },
    ]);
    stripe.retrievePaymentIntent
      .mockRejectedValueOnce(new Error('Stripe indisponible'))
      .mockResolvedValueOnce({ status: 'requires_payment_method' });

    expect(await service.liberer(MAINTENANT)).toBe(1);
  });

  it('page hébergée sans paiement connu : attendue jusqu’à son expiration chez Stripe', async () => {
    prisma.cart.findMany.mockResolvedValue([{ id: 'web', paymentIntentId: '', updatedAt: VIEUX }]);

    expect(await service.liberer(MAINTENANT)).toBe(0);
    expect(prisma.cart.updateMany).not.toHaveBeenCalled();

    const expiree = new Date(MAINTENANT.getTime() - DELAI_PAGE_HEBERGEE_MS - 60_000);
    prisma.cart.findMany.mockResolvedValue([{ id: 'web', paymentIntentId: '', updatedAt: expiree }]);

    expect(await service.liberer(MAINTENANT)).toBe(1);
    expect(stripe.retrievePaymentIntent).not.toHaveBeenCalled();
  });
});
