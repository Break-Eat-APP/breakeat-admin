import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, OrgStatus } from '@prisma/client';
import { BackofficeService } from './backoffice.service';
import { PrismaService } from '../../database/prisma.service';

/**
 * Unit tests for BackofficeService.
 *
 * Focus areas:
 *  - KPI math: CA HT derived from TTC at the configured 10% rate, average
 *    baskets, and the divide-by-zero guard when there are no paid orders.
 *  - Organisation CRUD: slug-uniqueness conflicts, 404s, and the
 *    activate/deactivate → ACTIVE/SUSPENDED mapping.
 */
describe('BackofficeService', () => {
  let service: BackofficeService;
  let prisma: {
    order: { aggregate: jest.Mock };
    user: { count: jest.Mock };
    organization: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    group: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      order: { aggregate: jest.fn() },
      user: { count: jest.fn() },
      organization: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      group: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackofficeService,
        { provide: PrismaService, useValue: prisma },
        // Configured reporting VAT rate = 10% (resto sur place).
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(0.1) } },
      ],
    }).compile();

    service = module.get(BackofficeService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGlobalKpis', () => {
    it('derives CA HT from TTC at 10% and computes average baskets', async () => {
      // 4 paid orders totalling 11_000 cents TTC (110.00€).
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalCents: 11_000 },
        _count: { _all: 4 },
      });
      prisma.user.count.mockResolvedValue(42);
      prisma.organization.count.mockResolvedValue(3);

      const kpis = await service.getGlobalKpis();

      // Only SUCCEEDED payments count toward CA.
      expect(prisma.order.aggregate).toHaveBeenCalledWith({
        where: { paymentStatus: PaymentStatus.SUCCEEDED },
        _sum: { totalCents: true },
        _count: { _all: true },
      });

      expect(kpis.revenue.caTtcCents).toBe(11_000);
      // 11000 / 1.10 = 10000 exactly.
      expect(kpis.revenue.caHtCents).toBe(10_000);
      expect(kpis.revenue.vatRate).toBe(0.1);

      expect(kpis.ordersCount).toBe(4);
      // 11000 / 4 = 2750 TTC ; 10000 / 4 = 2500 HT.
      expect(kpis.averageBasket.ttcCents).toBe(2_750);
      expect(kpis.averageBasket.htCents).toBe(2_500);

      expect(kpis.accountsCount).toBe(42);
      expect(kpis.organizationsCount).toBe(3);
    });

    it('rounds CA HT to the nearest cent for non-round totals', async () => {
      // 999 cents TTC → 999 / 1.10 = 908.18… → rounds to 908.
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalCents: 999 },
        _count: { _all: 1 },
      });
      prisma.user.count.mockResolvedValue(1);
      prisma.organization.count.mockResolvedValue(1);

      const kpis = await service.getGlobalKpis();

      expect(kpis.revenue.caHtCents).toBe(908);
      expect(kpis.averageBasket.htCents).toBe(908);
    });

    it('returns zeroes and avoids divide-by-zero when there are no paid orders', async () => {
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalCents: null },
        _count: { _all: 0 },
      });
      prisma.user.count.mockResolvedValue(0);
      prisma.organization.count.mockResolvedValue(0);

      const kpis = await service.getGlobalKpis();

      expect(kpis.revenue.caTtcCents).toBe(0);
      expect(kpis.revenue.caHtCents).toBe(0);
      expect(kpis.ordersCount).toBe(0);
      expect(kpis.averageBasket.ttcCents).toBe(0);
      expect(kpis.averageBasket.htCents).toBe(0);
    });
  });

  describe('createOrganization', () => {
    it('creates an org shell when the slug is free', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Club X', slug: 'club-x' });

      const result = await service.createOrganization({ name: 'Club X', slug: 'club-x' });

      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: { name: 'Club X', slug: 'club-x' },
      });
      expect(result.id).toBe('org-1');
    });

    it('rejects a duplicate slug with 409', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'existing', slug: 'club-x' });

      await expect(
        service.createOrganization({ name: 'Club X', slug: 'club-x' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.organization.create).not.toHaveBeenCalled();
    });
  });

  describe('updateOrganization', () => {
    it('throws 404 when the org does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOrganization('missing', { name: 'New' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a slug already taken by another org', async () => {
      prisma.organization.findUnique
        .mockResolvedValueOnce({ id: 'org-1', slug: 'old-slug' }) // target lookup
        .mockResolvedValueOnce({ id: 'org-2', slug: 'taken' }); // clash lookup

      await expect(
        service.updateOrganization('org-1', { slug: 'taken' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('updates only the provided fields', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'club-x' });
      prisma.organization.update.mockResolvedValue({ id: 'org-1', name: 'Renamed' });

      await service.updateOrganization('org-1', { name: 'Renamed' });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { name: 'Renamed' },
      });
    });
  });

  describe('setOrganizationStatus', () => {
    it('maps activate → ACTIVE', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      prisma.organization.update.mockResolvedValue({ id: 'org-1', status: OrgStatus.ACTIVE });

      await service.setOrganizationStatus('org-1', true);

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: OrgStatus.ACTIVE },
      });
    });

    it('maps deactivate → SUSPENDED', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      prisma.organization.update.mockResolvedValue({ id: 'org-1', status: OrgStatus.SUSPENDED });

      await service.setOrganizationStatus('org-1', false);

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: OrgStatus.SUSPENDED },
      });
    });

    it('throws 404 for an unknown org', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.setOrganizationStatus('missing', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
