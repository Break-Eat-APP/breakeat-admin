import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';

// ─── Prisma mock ─────────────────────────────────────────────────

const prisma = {
  supplier: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  order: { count: jest.fn() },
  user: { findUnique: jest.fn() },
  organizationMember: { findUnique: jest.fn() },
};

const stripe = {}; // non utilisé par findByReferralCode

// ─── Suite ───────────────────────────────────────────────────────

describe('SuppliersService.findByReferralCode (Codex P2)', () => {
  let service: SuppliersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeService, useValue: stripe },
      ],
    }).compile();
    service = module.get(SuppliersService);
  });

  it('résout un code valide SANS exiger l\'appartenance à l\'org (le code = la crédential)', async () => {
    (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({
      id: 'sup-1',
      name: 'Food Truck Tiers',
      isExternal: true,
      organization: { id: 'org-1', name: 'Club A' },
    });

    // 'outsider-uuid' n'est membre d'aucune org : la résolution doit tout de même réussir.
    const result = await service.findByReferralCode('BE-ABC234', 'outsider-uuid');

    expect(result).toEqual({
      id: 'sup-1',
      name: 'Food Truck Tiers',
      isExternal: true,
      organization: { id: 'org-1', name: 'Club A' },
    });
  });

  it('ne renvoie aucune donnée sensible (projection minimale)', async () => {
    (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({
      id: 'sup-1',
      name: 'Food Truck Tiers',
      isExternal: true,
      organization: { id: 'org-1', name: 'Club A' },
    });

    const result = await service.findByReferralCode('BE-ABC234', 'outsider-uuid');

    expect(result).not.toHaveProperty('stripeAccountId');
    expect(result).not.toHaveProperty('status');
    // Le select Prisma ne demande que les champs sûrs.
    const selectArg = (prisma.supplier.findUnique as jest.Mock).mock.calls[0][0].select;
    expect(selectArg).toMatchObject({ id: true, name: true, isExternal: true });
    expect(selectArg.stripeAccountId).toBeUndefined();
  });

  it('rejette un code inexistant', async () => {
    (prisma.supplier.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.findByReferralCode('BE-NOPE99', 'u')).rejects.toThrow(NotFoundException);
  });

  it('rejette (404 identique) une buvette non marquée externe — pas de fuite', async () => {
    (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({
      id: 'sup-2',
      name: 'Buvette interne',
      isExternal: false,
      organization: { id: 'org-1', name: 'Club A' },
    });

    await expect(service.findByReferralCode('BE-INTERN', 'u')).rejects.toThrow(NotFoundException);
  });
});


// ─── Suppression d'un point de retrait ───────────────────────────
//
// Le risque n'est pas de mal supprimer : c'est de supprimer un point de vente
// qui a encaissé. `Order.supplierId` porterait dans le vide, et le chiffre
// d'affaires passé deviendrait faux sans que personne ne s'en aperçoive.

describe('SuppliersService.remove', () => {
  let service: SuppliersService;
  const ORG = 'org-1';
  const SUP = 'sup-1';
  const USER = 'user-1';

  beforeEach(async () => {
    jest.clearAllMocks();
    // requireOrgAccess : l'appelant est ORG_ADMIN.
    prisma.user.findUnique.mockResolvedValue({ globalRole: 'CUSTOMER' });
    prisma.organizationMember.findUnique.mockResolvedValue({ orgRole: 'ORG_ADMIN' });

    const module = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeService, useValue: stripe },
      ],
    }).compile();
    service = module.get(SuppliersService);
  });

  it("supprime un point de retrait qui n'a jamais vendu", async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP, name: 'Buvette Nord' });
    prisma.order.count.mockResolvedValue(0);

    await service.remove(ORG, SUP, USER);

    expect(prisma.supplier.delete).toHaveBeenCalledWith({ where: { id: SUP } });
  });

  it("refuse dès qu'une commande y est rattachée", async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP, name: 'Buvette Nord' });
    prisma.order.count.mockResolvedValue(3);

    await expect(service.remove(ORG, SUP, USER)).rejects.toBeInstanceOf(BadRequestException);
    // Rien n'est détruit : l'historique de ventes reste intact.
    expect(prisma.supplier.delete).not.toHaveBeenCalled();
  });

  it('renvoie 404 sur un point de retrait inconnu', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);

    await expect(service.remove(ORG, SUP, USER)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.count).not.toHaveBeenCalled();
  });
});
