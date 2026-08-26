import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, SlotKind } from '@prisma/client';
import { SlotTemplatesService } from './slot-templates.service';
import { PrismaService } from '../../database/prisma.service';

const VENUE_ID = 'venue-1';
const ORG_ID = 'org-1';
const EVENT_ID = 'event-1';
const SUPPLIER_ID = 'sup-1';
const USER_ID = 'user-1';

const gabarit = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'tpl-1',
  venueId: VENUE_ID,
  supplierId: SUPPLIER_ID,
  kind: SlotKind.CUSTOM,
  label: '17h45',
  startMinutes: 1065,
  endMinutes: 1080,
  capacity: 20,
  isActive: true,
  ...o,
});

describe('SlotTemplatesService', () => {
  let service: SlotTemplatesService;
  let prisma: {
    venue: { findUnique: jest.Mock };
    supplier: { findUnique: jest.Mock };
    organizationMember: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    slotTemplate: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    slot: { create: jest.Mock; findMany: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      venue: { findUnique: jest.fn().mockResolvedValue({ organizationId: ORG_ID }) },
      supplier: { findUnique: jest.fn().mockResolvedValue({ organizationId: ORG_ID }) },
      organizationMember: { findUnique: jest.fn().mockResolvedValue({ orgRole: 'MANAGER' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ globalRole: 'CUSTOMER' }) },
      slotTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'tpl-1', ...data })),
        update: jest.fn(),
        delete: jest.fn(),
      },
      slot: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest.fn().mockResolvedValue([{ count: 2 }, {}]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SlotTemplatesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SlotTemplatesService);
  });

  // ─── Configuration ──────────────────────────────────────────────

  describe('create', () => {
    it('cree un creneau recurrent sur une buvette', async () => {
      const res = await service.create(
        VENUE_ID,
        { supplierId: SUPPLIER_ID, label: '17h45', kind: SlotKind.CUSTOM, startMinutes: 1065, endMinutes: 1080 },
        USER_ID,
      );

      expect(res.label).toBe('17h45');
      expect(prisma.slotTemplate.create).toHaveBeenCalledTimes(1);
    });

    it('refuse une plage qui finit avant de commencer', async () => {
      await expect(
        service.create(
          VENUE_ID,
          { supplierId: SUPPLIER_ID, label: 'absurde', kind: SlotKind.CUSTOM, startMinutes: 1080, endMinutes: 1065 },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.slotTemplate.create).not.toHaveBeenCalled();
    });

    it('refuse une buvette d’un AUTRE club', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ organizationId: 'org-2' });

      await expect(
        service.create(
          VENUE_ID,
          { supplierId: SUPPLIER_ID, label: '17h45', kind: SlotKind.CUSTOM, startMinutes: 1065, endMinutes: 1080 },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.slotTemplate.create).not.toHaveBeenCalled();
    });

    it('un equipier ne CONFIGURE pas les creneaux — c’est au club', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({ orgRole: 'OPERATOR' });

      await expect(
        service.create(
          VENUE_ID,
          { supplierId: SUPPLIER_ID, label: '17h45', kind: SlotKind.CUSTOM, startMinutes: 1065, endMinutes: 1080 },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findByVenue', () => {
    it('un equipier PEUT lire — il doit voir ses creneaux pour les ouvrir', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({ orgRole: 'OPERATOR' });

      await expect(service.findByVenue(VENUE_ID, USER_ID)).resolves.toEqual([]);
    });
  });

  // ─── Materialisation ────────────────────────────────────────────

  describe('ensureTodaySlots', () => {
    it('materialise un creneau par modele actif', async () => {
      prisma.slotTemplate.findMany.mockResolvedValue([gabarit(), gabarit({ id: 'tpl-2', label: 'Immédiat', startMinutes: 0, endMinutes: 1440 })]);

      await service.ensureTodaySlots(EVENT_ID, VENUE_ID, new Date('2026-08-26T10:00:00Z'));

      expect(prisma.slot.create).toHaveBeenCalledTimes(2);
      const premier = prisma.slot.create.mock.calls[0][0].data;
      expect(premier.templateId).toBe('tpl-1');
      expect(premier.label).toBe('17h45');
      // 1065 minutes = 17h45 UTC le jour demandé.
      expect((premier.startAt as Date).toISOString()).toBe('2026-08-26T17:45:00.000Z');
    });

    it('ignore les modeles desactives', async () => {
      prisma.slotTemplate.findMany.mockResolvedValue([]);

      const res = await service.ensureTodaySlots(EVENT_ID, VENUE_ID);

      expect(res).toEqual([]);
      expect(prisma.slot.create).not.toHaveBeenCalled();
    });

    it('absorbe le doublon : deuxieme visite du jour, aucune erreur', async () => {
      prisma.slotTemplate.findMany.mockResolvedValue([gabarit()]);
      prisma.slot.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('doublon', { code: 'P2002', clientVersion: 'x' }),
      );

      await expect(
        service.ensureTodaySlots(EVENT_ID, VENUE_ID),
      ).resolves.toEqual([]);
    });

    it('ne masque PAS une vraie erreur de base', async () => {
      prisma.slotTemplate.findMany.mockResolvedValue([gabarit()]);
      prisma.slot.create.mockRejectedValue(new Error('connexion perdue'));

      await expect(service.ensureTodaySlots(EVENT_ID, VENUE_ID)).rejects.toThrow('connexion perdue');
    });
  });

  // --- remove : ne pas laisser d'orphelins visibles ---------------

  describe('remove', () => {
    it('efface aussi les creneaux engendres que personne n a reserves', async () => {
      // La relation est en SetNull : supprimer le modele laissait vivre le
      // creneau du jour, qui continuait de s'afficher au client. Le club
      // supprimait, rechargeait, et le voyait revenir.
      //
      // Un creneau PORTEUR de commandes survit — quelqu'un a reserve.
      prisma.slotTemplate.findUnique.mockResolvedValue({
        ...gabarit(),
        venue: { organizationId: ORG_ID },
      });

      await service.remove('tpl-1', USER_ID);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.slot.deleteMany).toHaveBeenCalledWith({
        where: { templateId: 'tpl-1', currentLoad: 0 },
      });
    });
  });
});
