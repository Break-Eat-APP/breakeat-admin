import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrderGroupsService } from './order-groups.service';
import { PrismaService } from '../../database/prisma.service';

const EVENT = 'evt-1';
const BUVETTE = 'sup-nord';
const USER = 'user-1';

describe('OrderGroupsService', () => {
  let service: OrderGroupsService;
  let prisma: {
    eventSupplier: { findFirst: jest.Mock };
    orderGroup: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
    supplier: { findUnique: jest.Mock };
    order: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      eventSupplier: { findFirst: jest.fn().mockResolvedValue({ id: 'es-1' }) },
      orderGroup: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      supplier: { findUnique: jest.fn().mockResolvedValue({ name: 'Buvette Nord' }) },
      order: { count: jest.fn().mockResolvedValue(2) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderGroupsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(OrderGroupsService);
  });

  describe('ouvrir', () => {
    it('émet un code lisible à voix haute (ni I, ni O, ni 0, ni 1)', async () => {
      prisma.orderGroup.create.mockImplementation(
        ({ data }: { data: { code: string } }) =>
          Promise.resolve({ ...data, id: 'g-1', expiresAt: new Date(Date.now() + 3600_000) }),
      );

      // Un seul tirage prouverait peu : on en fait assez pour que la présence
      // d'un caractère interdit ne puisse pas passer par chance.
      for (let i = 0; i < 40; i++) {
        prisma.orderGroup.findFirst.mockResolvedValueOnce(null);
        const { code } = await service.ouvrir({ userId: USER, eventId: EVENT, supplierId: BUVETTE });
        expect(code).toHaveLength(6);
        expect(code).not.toMatch(/[IO01]/);
      }
    });

    it('rend le MÊME code au second appui — un nouveau invaliderait le partagé', async () => {
      prisma.orderGroup.findFirst.mockResolvedValue({
        id: 'g-1',
        code: 'ABC234',
        eventId: EVENT,
        supplierId: BUVETTE,
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const premier = await service.ouvrir({ userId: USER, eventId: EVENT, supplierId: BUVETTE });
      const second = await service.ouvrir({ userId: USER, eventId: EVENT, supplierId: BUVETTE });

      expect(premier.code).toBe('ABC234');
      expect(second.code).toBe('ABC234');
      expect(prisma.orderGroup.create).not.toHaveBeenCalled();
    });
  });

  describe('resoudrePourPanier — le code n’ouvre QUE sa buvette', () => {
    const groupe = {
      id: 'g-1',
      code: 'ABC234',
      eventId: EVENT,
      supplierId: BUVETTE,
      expiresAt: new Date(Date.now() + 3600_000),
    };

    it('rattache quand l’événement ET la buvette correspondent', async () => {
      prisma.orderGroup.findUnique.mockResolvedValue(groupe);
      expect(
        await service.resoudrePourPanier({ code: 'abc234', eventId: EVENT, supplierId: BUVETTE }),
      ).toBe('g-1');
    });

    it('refuse une AUTRE buvette — sinon le groupe arriverait coupé en deux', async () => {
      prisma.orderGroup.findUnique.mockResolvedValue(groupe);
      expect(
        await service.resoudrePourPanier({ code: 'ABC234', eventId: EVENT, supplierId: 'sup-sud' }),
      ).toBeNull();
    });

    it('ignore un code périmé plutôt que de bloquer la commande', async () => {
      prisma.orderGroup.findUnique.mockResolvedValue({
        ...groupe,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(
        await service.resoudrePourPanier({ code: 'ABC234', eventId: EVENT, supplierId: BUVETTE }),
      ).toBeNull();
    });

    it('ignore un code inconnu (faute de frappe) sans faire échouer le panier', async () => {
      prisma.orderGroup.findUnique.mockResolvedValue(null);
      expect(
        await service.resoudrePourPanier({ code: 'ZZZZZZ', eventId: EVENT, supplierId: BUVETTE }),
      ).toBeNull();
    });
  });

  describe('rejoindre', () => {
    it('refuse une invitation expirée', async () => {
      prisma.orderGroup.findUnique.mockResolvedValue({
        id: 'g-1',
        code: 'ABC234',
        eventId: EVENT,
        supplierId: BUVETTE,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.rejoindre('ABC234')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ne renvoie rien de personnel : buvette et nombre de commandes', async () => {
      prisma.orderGroup.findUnique.mockResolvedValue({
        id: 'g-1',
        code: 'ABC234',
        eventId: EVENT,
        supplierId: BUVETTE,
        createdBy: USER,
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const vue = await service.rejoindre('abc234');

      expect(vue).toEqual({
        code: 'ABC234',
        eventId: EVENT,
        supplierId: BUVETTE,
        supplierName: 'Buvette Nord',
        orderCount: 2,
        expiresAt: expect.any(String),
      });
      // Le code circule par SMS : il ne doit jamais trainer l'identite de l'hote.
      expect(JSON.stringify(vue)).not.toContain(USER);
    });
  });
});
