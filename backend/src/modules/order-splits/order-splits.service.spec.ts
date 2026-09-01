import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CartStatus, OrderSplitShareStatus, OrderSplitStatus, OrderSplitUnitStatus } from '@prisma/client';
import { OrderSplitsService } from './order-splits.service';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { OrdersService } from '../orders/orders.service';

const HOTE = 'user-hote';
const CART = 'cart-1';
const SPLIT = 'split-1';
const CODE = 'ABC234';

describe('OrderSplitsService — l’ardoise', () => {
  let service: OrderSplitsService;
  let prisma: {
    cart: { findUnique: jest.Mock };
    orderSplit: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    orderSplitUnit: { updateMany: jest.Mock; findMany: jest.Mock };
    orderSplitShare: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    supplier: { findUnique: jest.Mock };
    organization: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let stripe: {
    createHostedCheckout: jest.Mock;
    capturePaymentIntent: jest.Mock;
    cancelPaymentIntent: jest.Mock;
  };
  let orders: { createFromSplit: jest.Mock };
  let actif = true;

  const panier = () => ({
    id: CART,
    userId: HOTE,
    eventId: 'evt-1',
    supplierId: 'sup-1',
    pickupPointId: 'pp-1',
    selectedSlotId: null,
    status: CartStatus.OPEN,
    event: { organizationId: 'org-1', venueId: 'venue-1' },
    items: [
      { productId: 'p-biere', quantity: 3, priceSnapshotCents: 550, product: { id: 'p-biere', name: 'Bière 50cl', price: 550 } },
      { productId: 'p-frites', quantity: 1, priceSnapshotCents: 300, product: { id: 'p-frites', name: 'Frites', price: 300 } },
    ],
  });

  const ardoise = (over: Record<string, unknown> = {}) => ({
    id: SPLIT,
    code: CODE,
    status: OrderSplitStatus.OPEN,
    hostUserId: HOTE,
    supplierId: 'sup-1',
    eventId: 'evt-1',
    expiresAt: new Date(Date.now() + 3_600_000),
    units: [],
    shares: [],
    ...over,
  });

  beforeEach(async () => {
    actif = true;
    prisma = {
      cart: { findUnique: jest.fn().mockResolvedValue(panier()) },
      orderSplit: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(ardoise()),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      orderSplitUnit: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      orderSplitShare: {
        create: jest.fn().mockResolvedValue({ id: 'share-1' }),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
      supplier: {
        // Buvette SANS compte propre : elle encaisse sur celui du club.
        findUnique: jest.fn().mockResolvedValue({
          name: 'Buvette Nord',
          organizationId: 'org-1',
          stripeAccountId: null,
          stripeAccountStatus: 'NOT_ONBOARDED',
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Club test',
          stripeAccountId: 'acct_club',
          stripeAccountStatus: 'ACTIVE',
        }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    stripe = {
      createHostedCheckout: jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://stripe/pay' }),
      capturePaymentIntent: jest.fn().mockResolvedValue({}),
      cancelPaymentIntent: jest.fn().mockResolvedValue({}),
    };
    orders = { createFromSplit: jest.fn().mockResolvedValue({ id: 'o-1', publicOrderNumber: 'BE-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderSplitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeService, useValue: stripe },
        { provide: OrdersService, useValue: orders },
        {
          provide: ConfigService,
          useValue: {
            get: (cle: string) =>
              cle === 'app.split.enabled' ? actif : 'https://app.breakeat.test',
          },
        },
      ],
    }).compile();

    service = module.get(OrderSplitsService);
  });

  // ─── L'interrupteur ──────────────────────────────────────────

  it('refuse tout quand la fonction est coupée — le parcours normal, lui, continue', async () => {
    actif = false;
    await expect(service.ouvrir(HOTE, CART)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.prendreSaPart({ code: CODE, unitIds: ['u-1'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ─── Ouverture ───────────────────────────────────────────────

  describe('ouvrir', () => {
    beforeEach(() => {
      prisma.orderSplit.create.mockImplementation(({ data }: { data: { code: string } }) =>
        Promise.resolve({ id: SPLIT, code: data.code }),
      );
      prisma.orderSplit.findUnique.mockResolvedValue({ ...ardoise(), units: [] });
    });

    it('découpe chaque ligne en UNITÉS : « 3 bières » donne trois cases', async () => {
      await service.ouvrir(HOTE, CART);
      const unites = prisma.orderSplit.create.mock.calls[0][0].data.units.create;
      expect(unites).toHaveLength(4);
      expect(unites.filter((u: { productName: string }) => u.productName === 'Bière 50cl')).toHaveLength(3);
      // Sans ce découpage, deux convives ne pourraient pas prendre une bière chacun.
    });

    it('fige le prix à la composition — il ne doit pas bouger sous le convive', async () => {
      await service.ouvrir(HOTE, CART);
      const unites = prisma.orderSplit.create.mock.calls[0][0].data.units.create;
      expect(unites[0].unitPriceCents).toBe(550);
    });

    it('émet un code lisible à voix haute (ni I, ni O, ni 0, ni 1)', async () => {
      for (let i = 0; i < 30; i++) {
        prisma.orderSplit.create.mockClear();
        await service.ouvrir(HOTE, CART);
        expect(prisma.orderSplit.create.mock.calls[0][0].data.code).not.toMatch(/[IO01]/);
      }
    });

    it('refuse le panier d’un autre', async () => {
      prisma.cart.findUnique.mockResolvedValue({ ...panier(), userId: 'quelqu-un-dautre' });
      await expect(service.ouvrir(HOTE, CART)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── Prendre sa part ─────────────────────────────────────────

  describe('prendreSaPart', () => {
    it('paie en AUTORISATION SEULE — rien n’est prélevé avant le départ', async () => {
      prisma.orderSplitUnit.updateMany.mockResolvedValue({ count: 2 });
      prisma.orderSplitUnit.findMany.mockResolvedValue([
        { unitPriceCents: 550 },
        { unitPriceCents: 300 },
      ]);

      const res = await service.prendreSaPart({
        code: CODE,
        unitIds: ['u-1', 'u-2'],
        claimantName: 'Marc',
      });

      expect(res.amountCents).toBe(850);
      expect(res.checkoutUrl).toBe('https://stripe/pay');
      // La capture différée est le cœur du dispositif : sans elle, une tournée
      // abandonnée laisserait des remboursements à faire.
      const args = stripe.createHostedCheckout.mock.calls[0][0];
      // L'argent va au compte du CLUB : la buvette n'a pas le sien.
      expect(args.destinationAccountId).toBe('acct_club');
      expect(args.metadata.orderSplitShareId).toBe('share-1');
    });

    it('refuse quand un article vient d’être pris, et rend ce qu’il avait réservé', async () => {
      // Deux unités demandées, une seule encore libre.
      prisma.orderSplitUnit.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.prendreSaPart({ code: CODE, unitIds: ['u-1', 'u-2'] }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // La part est close et l'unité prise au passage retourne au groupe :
      // sinon elle resterait bloquée sur un paiement qui n'aura pas lieu.
      expect(prisma.orderSplitShare.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: OrderSplitShareStatus.CANCELLED } }),
      );
      expect(stripe.createHostedCheckout).not.toHaveBeenCalled();
    });

    it('rend les articles si Stripe refuse d’ouvrir la page', async () => {
      prisma.orderSplitUnit.updateMany.mockResolvedValue({ count: 1 });
      prisma.orderSplitUnit.findMany.mockResolvedValue([{ unitPriceCents: 550 }]);
      stripe.createHostedCheckout.mockRejectedValue(new Error('stripe down'));

      await expect(service.prendreSaPart({ code: CODE, unitIds: ['u-1'] })).rejects.toThrow();
      expect(prisma.orderSplitUnit.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: { status: OrderSplitUnitStatus.FREE, shareId: null, reservedUntil: null },
        }),
      );
    });

    it('refuse quand NI la buvette NI le club ne peuvent encaisser', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        name: 'Club test',
        stripeAccountId: null,
        stripeAccountStatus: 'NOT_ONBOARDED',
      });
      await expect(
        service.prendreSaPart({ code: CODE, unitIds: ['u-1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── Envoi ───────────────────────────────────────────────────

  describe('envoyer', () => {
    it('refuse tant qu’un article n’est pas réglé', async () => {
      prisma.orderSplit.findUnique.mockResolvedValue(
        ardoise({
          units: [
            { status: OrderSplitUnitStatus.PAID },
            { status: OrderSplitUnitStatus.FREE },
          ],
        }),
      );
      await expect(service.envoyer(HOTE, CODE)).rejects.toBeInstanceOf(BadRequestException);
      expect(orders.createFromSplit).not.toHaveBeenCalled();
    });

    it('encaisse toutes les parts AVANT de créer la commande', async () => {
      prisma.orderSplit.findUnique.mockResolvedValue(
        ardoise({
          units: [{ status: OrderSplitUnitStatus.PAID }],
          shares: [
            { id: 's1', status: OrderSplitShareStatus.AUTHORIZED, stripePaymentIntentId: 'pi_1' },
            { id: 's2', status: OrderSplitShareStatus.AUTHORIZED, stripePaymentIntentId: 'pi_2' },
          ],
        }),
      );

      await service.envoyer(HOTE, CODE);

      expect(stripe.capturePaymentIntent).toHaveBeenCalledWith('pi_1');
      expect(stripe.capturePaymentIntent).toHaveBeenCalledWith('pi_2');
      // Une commande partie en cuisine sans encaissement serait servie gratuitement.
      expect(stripe.capturePaymentIntent.mock.invocationCallOrder[0]).toBeLessThan(
        orders.createFromSplit.mock.invocationCallOrder[0],
      );
    });

    it('ne crée AUCUNE commande si un encaissement échoue, et nomme le convive', async () => {
      prisma.orderSplit.findUnique.mockResolvedValue(
        ardoise({
          units: [{ status: OrderSplitUnitStatus.PAID }],
          shares: [
            { id: 's1', status: OrderSplitShareStatus.AUTHORIZED, stripePaymentIntentId: 'pi_1', claimantName: 'Marc' },
          ],
        }),
      );
      stripe.capturePaymentIntent.mockRejectedValue(new Error('expired'));

      await expect(service.envoyer(HOTE, CODE)).rejects.toThrow(/Marc/);
      expect(orders.createFromSplit).not.toHaveBeenCalled();
    });

    it('refuse à quelqu’un d’autre que l’hôte', async () => {
      prisma.orderSplit.findUnique.mockResolvedValue(ardoise({ units: [] }));
      await expect(service.envoyer('un-convive', CODE)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── Annulation ──────────────────────────────────────────────

  describe('annuler', () => {
    it('libère les autorisations — ce n’est pas un remboursement, rien n’a été pris', async () => {
      prisma.orderSplit.findUnique.mockResolvedValue(
        ardoise({
          shares: [
            { id: 's1', status: OrderSplitShareStatus.AUTHORIZED, stripePaymentIntentId: 'pi_1' },
            { id: 's2', status: OrderSplitShareStatus.PENDING, stripePaymentIntentId: null },
          ],
        }),
      );

      const res = await service.annuler(HOTE, CODE);

      expect(stripe.cancelPaymentIntent).toHaveBeenCalledWith('pi_1');
      expect(stripe.cancelPaymentIntent).toHaveBeenCalledTimes(1);
      expect(res.liberees).toBe(1);
    });
  });
});
