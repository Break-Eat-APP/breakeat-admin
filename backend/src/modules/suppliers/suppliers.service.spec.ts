import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';

// ─── Prisma mock ─────────────────────────────────────────────────

const prisma = {
  supplier: {
    findUnique: jest.fn(),
  },
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
