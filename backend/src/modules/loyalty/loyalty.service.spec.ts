import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LoyaltyEntryKind, Prisma } from '@prisma/client';
import {
  LoyaltyService,
  LOYALTY_DISABLED,
  MIN_PAYABLE_CENTS,
  type LoyaltyConfig,
} from './loyalty.service';
import { PrismaService } from '../../database/prisma.service';

/**
 * Ces tests portent sur de l'argent : un point gagné a une valeur en euros,
 * et un point dépensé deux fois est une remise offerte.
 *
 * Le cœur du sujet est la CONCURRENCE. PostgreSQL tourne en READ COMMITTED :
 * deux requêtes simultanées peuvent lire le même solde. Toute logique qui lit
 * le solde puis écrit une valeur absolue perd un mouvement. On vérifie donc
 * que le service laisse la BASE arbitrer — `increment`, `decrement`, et un
 * `where` conditionnel — plutôt que d'arbitrer lui-même en mémoire.
 */
describe('LoyaltyService', () => {
  let service: LoyaltyService;
  let prisma: {
    venue: { findUnique: jest.Mock };
    event: { findUnique: jest.Mock };
    loyaltyAccount: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    loyaltyTransaction: { create: jest.Mock };
    order: { update: jest.Mock };
    $transaction: jest.Mock;
  };

  const CONFIG: LoyaltyConfig = { enabled: true, pointsPerEuro: 1, pointValueCents: 1 };
  const COMPTE = { id: 'compte-1', balance: 100 };

  beforeEach(async () => {
    prisma = {
      venue: { findUnique: jest.fn() },
      event: { findUnique: jest.fn() },
      loyaltyAccount: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        upsert: jest.fn().mockResolvedValue(COMPTE),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      loyaltyTransaction: { create: jest.fn() },
      order: { update: jest.fn() },
      // La vraie transaction passe un client au callback : on lui donne le
      // même mock, ce qui suffit pour observer les instructions émises.
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LoyaltyService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(LoyaltyService);
  });

  // ─── Calcul ───────────────────────────────────────────────────

  describe('pointsForAmount', () => {
    it('arrondit à l’entier inférieur : un point entamé n’est pas gagné', () => {
      expect(service.pointsForAmount(1990, { ...CONFIG, pointsPerEuro: 1 })).toBe(19);
    });

    it('ne crédite rien quand le programme est désactivé', () => {
      expect(service.pointsForAmount(5000, LOYALTY_DISABLED)).toBe(0);
    });

    it('ne crédite rien sur un montant nul ou négatif', () => {
      expect(service.pointsForAmount(0, CONFIG)).toBe(0);
      expect(service.pointsForAmount(-500, CONFIG)).toBe(0);
    });
  });

  describe('discountForPoints', () => {
    it('laisse toujours le minimum payable — jamais de note nulle', () => {
      const r = service.discountForPoints(10_000, 2_500, CONFIG);
      expect(r.discountCents).toBe(2_500 - MIN_PAYABLE_CENTS);
      // Le reste à payer est exactement le minimum accepté par le paiement.
      expect(2_500 - r.discountCents).toBe(MIN_PAYABLE_CENTS);
    });

    it('ne consomme que les points nécessaires quand le plafond s’applique', () => {
      // Remise maximale = 2 500 − 50 = 2 450 centimes ; un point vaut 5
      // centimes → 490 points. Le solde de 10 000 points n'est pas entamé
      // au-delà du nécessaire.
      const r = service.discountForPoints(10_000, 2_500, { ...CONFIG, pointValueCents: 5 });
      expect(r.pointsUsed).toBe(490);
      expect(r.discountCents).toBe(2_450);
    });

    it('arrondit à l’entier inférieur pour ne jamais passer sous le minimum', () => {
      // Remise maximale = 2 450 ; un point vaut 100 centimes → 24 points
      // (2 400), pas 25 (2 500) qui ramènerait la note à zéro.
      const r = service.discountForPoints(1_000, 2_500, { ...CONFIG, pointValueCents: 100 });
      expect(r.pointsUsed).toBe(24);
      expect(2_500 - r.discountCents).toBeGreaterThanOrEqual(MIN_PAYABLE_CENTS);
    });

    it('n’accorde aucune remise sur une note déjà sous le minimum', () => {
      const r = service.discountForPoints(10_000, 40, CONFIG);
      expect(r).toEqual({ pointsUsed: 0, discountCents: 0 });
    });

    it('applique la remise entière quand elle reste sous le plafond', () => {
      const r = service.discountForPoints(300, 2_500, CONFIG);
      expect(r.pointsUsed).toBe(300);
      expect(r.discountCents).toBe(300);
    });
  });

  // ─── Crédit ───────────────────────────────────────────────────

  describe('earnForOrder', () => {
    it('incrémente le solde côté base plutôt que d’écrire une valeur calculée', async () => {
      prisma.loyaltyAccount.update.mockResolvedValue({ balance: 120 });

      await service.earnForOrder({
        userId: 'u1', organizationId: 'o1', orderId: 'cmd-1', totalCents: 2_000, config: CONFIG,
      });

      // C'est ICI que se joue l'absence de perte de mouvement : `increment`
      // est résolu par PostgreSQL, deux crédits simultanés s'additionnent.
      expect(prisma.loyaltyAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { balance: { increment: 20 } } }),
      );
    });

    it('inscrit au grand livre le solde d’APRÈS l’incrément', async () => {
      prisma.loyaltyAccount.update.mockResolvedValue({ balance: 120 });

      await service.earnForOrder({
        userId: 'u1', organizationId: 'o1', orderId: 'cmd-1', totalCents: 2_000, config: CONFIG,
      });

      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: LoyaltyEntryKind.EARN, points: 20, balanceAfter: 120,
          }),
        }),
      );
    });

    it('absorbe un rejeu : une commande ne crédite qu’une fois', async () => {
      prisma.loyaltyAccount.update.mockResolvedValue({ balance: 120 });
      prisma.loyaltyTransaction.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('doublon', {
          code: 'P2002', clientVersion: '6',
        }),
      );

      const points = await service.earnForOrder({
        userId: 'u1', organizationId: 'o1', orderId: 'cmd-1', totalCents: 2_000, config: CONFIG,
      });

      expect(points).toBe(0);
    });

    it('n’ouvre pas de transaction quand il n’y a rien à créditer', async () => {
      await service.earnForOrder({
        userId: 'u1', organizationId: 'o1', orderId: 'cmd-1', totalCents: 50, config: CONFIG,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── Débit ────────────────────────────────────────────────────

  describe('redeemForOrderTx', () => {
    const tx = () => prisma as unknown as Prisma.TransactionClient;

    it('contrôle le solde et débite dans la même instruction', async () => {
      prisma.loyaltyAccount.updateMany.mockResolvedValue({ count: 1 });
      prisma.loyaltyAccount.findUniqueOrThrow.mockResolvedValue({ balance: 70 });

      await service.redeemForOrderTx(tx(), {
        userId: 'u1', organizationId: 'o1', orderId: 'cmd-1', points: 30,
      });

      // Le garde-fou `balance >= points` vit dans le WHERE : c'est ce qui
      // empêche deux commandes simultanées de dépenser le même solde.
      expect(prisma.loyaltyAccount.updateMany).toHaveBeenCalledWith({
        where: { id: COMPTE.id, balance: { gte: 30 } },
        data: { balance: { decrement: 30 } },
      });
    });

    it('refuse quand la ligne n’a pas été mise à jour (solde insuffisant)', async () => {
      // count: 0 = la base a refusé, soit parce que le solde était trop bas,
      // soit parce qu'une autre commande vient de le consommer.
      prisma.loyaltyAccount.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.redeemForOrderTx(tx(), {
          userId: 'u1', organizationId: 'o1', orderId: 'cmd-1', points: 500,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Aucun mouvement inscrit : pas de remise sans débit.
      expect(prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it('inscrit un mouvement négatif portant le solde d’après le débit', async () => {
      prisma.loyaltyAccount.updateMany.mockResolvedValue({ count: 1 });
      prisma.loyaltyAccount.findUniqueOrThrow.mockResolvedValue({ balance: 70 });

      await service.redeemForOrderTx(tx(), {
        userId: 'u1', organizationId: 'o1', orderId: 'cmd-1', points: 30,
      });

      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: LoyaltyEntryKind.REDEEM, points: -30, balanceAfter: 70,
          }),
        }),
      );
    });

    it('ne touche à rien quand aucun point n’est utilisé', async () => {
      await service.redeemForOrderTx(tx(), {
        userId: 'u1', organizationId: 'o1', orderId: 'cmd-1', points: 0,
      });

      expect(prisma.loyaltyAccount.updateMany).not.toHaveBeenCalled();
      expect(prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
    });
  });

  // ─── Configuration ────────────────────────────────────────────

  describe('getConfigForVenue', () => {
    it('renvoie le programme désactivé pour un lieu inconnu', async () => {
      prisma.venue.findUnique.mockResolvedValue(null);
      await expect(service.getConfigForVenue('inconnu')).resolves.toEqual(LOYALTY_DISABLED);
    });

    it('renvoie le programme désactivé quand le club ne l’a pas activé', async () => {
      prisma.venue.findUnique.mockResolvedValue({
        loyaltyEnabled: false, loyaltyPointsPerEuro: 5, loyaltyPointValueCents: 2,
      });
      await expect(service.getConfigForVenue('lieu-1')).resolves.toEqual(LOYALTY_DISABLED);
    });
  });
});
