import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, Prisma, VenueOperatingMode, VenueStatus } from '@prisma/client';
import { VenuesService } from './venues.service';
import { PrismaService } from '../../database/prisma.service';

/**
 * PHASE 22 — rythme d'exploitation.
 *
 * Ce qui est vérifié ici tient à une promesse produit : un restaurant se
 * configure UNE fois. Personne ne crée d'événement, personne n'en crée un
 * chaque matin. Si le contenant n'apparaît pas tout seul, le lieu ne peut
 * simplement pas encaisser de commande — `Order.eventId` est obligatoire.
 */
describe('VenuesService — mode permanent', () => {
  let service: VenuesService;
  let prisma: {
    venue: { create: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    event: { create: jest.Mock };
    organizationMember: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  const ORG_ID = 'org-1';
  const USER_ID = 'user-1';
  const VENUE_ID = 'venue-1';

  function mockVenue(mode: VenueOperatingMode) {
    return {
      id: VENUE_ID,
      organizationId: ORG_ID,
      name: 'Le Comptoir',
      address: '1 rue du Test',
      operatingMode: mode,
      status: VenueStatus.ACTIVE,
    };
  }

  beforeEach(async () => {
    prisma = {
      venue: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
      event: { create: jest.fn().mockResolvedValue({ id: 'evt-1' }) },
      // requireOrgAccess : l'appelant est ORG_ADMIN dans tous les cas testés.
      organizationMember: {
        findUnique: jest.fn().mockResolvedValue({
          userId: USER_ID,
          organizationId: ORG_ID,
          orgRole: 'ORG_ADMIN',
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: USER_ID, globalRole: 'CUSTOMER' }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [VenuesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(VenuesService);
  });

  describe('à la création du lieu', () => {
    it('pose le contenant tout seul pour un lieu permanent', async () => {
      prisma.venue.create.mockResolvedValue(mockVenue(VenueOperatingMode.PERMANENT));

      await service.create(ORG_ID, USER_ID, {
        name: 'Le Comptoir',
        address: '1 rue du Test',
        operatingMode: VenueOperatingMode.PERMANENT,
      });

      expect(prisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            venueId: VENUE_ID,
            isPermanentContainer: true,
            // ACTIVE d'emblée : il n'y a personne pour « ouvrir » un
            // restaurant chaque matin dans Break Eat.
            status: EventStatus.ACTIVE,
          }),
        }),
      );
    });

    it('ne crée aucun contenant pour un lieu événementiel', async () => {
      prisma.venue.create.mockResolvedValue(mockVenue(VenueOperatingMode.EVENT_BASED));

      await service.create(ORG_ID, USER_ID, { name: 'Stade', address: '2 rue du Stade' });

      expect(prisma.event.create).not.toHaveBeenCalled();
    });
  });

  describe('à la bascule de mode', () => {
    it('pose le contenant quand un lieu devient permanent', async () => {
      prisma.venue.findFirst.mockResolvedValue(mockVenue(VenueOperatingMode.EVENT_BASED));
      prisma.venue.update.mockResolvedValue(mockVenue(VenueOperatingMode.PERMANENT));

      await service.update(ORG_ID, VENUE_ID, USER_ID, {
        operatingMode: VenueOperatingMode.PERMANENT,
      });

      expect(prisma.event.create).toHaveBeenCalled();
    });

    it('se fie au mode RÉSULTANT, pas au mode d’avant', async () => {
      // Le lieu était permanent, il repasse en événementiel : aucun nouveau
      // contenant. Se fier au mode d'avant en créerait un inutile.
      prisma.venue.findFirst.mockResolvedValue(mockVenue(VenueOperatingMode.PERMANENT));
      prisma.venue.update.mockResolvedValue(mockVenue(VenueOperatingMode.EVENT_BASED));

      await service.update(ORG_ID, VENUE_ID, USER_ID, {
        operatingMode: VenueOperatingMode.EVENT_BASED,
      });

      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('reste silencieux si le contenant existe déjà', async () => {
      // P2002 = l'index unique partiel a joué. Deux enregistrements de suite,
      // ou deux requêtes concurrentes : le résultat voulu est le même, un seul
      // contenant. L'utilisateur ne doit voir aucune erreur.
      prisma.venue.findFirst.mockResolvedValue(mockVenue(VenueOperatingMode.PERMANENT));
      prisma.venue.update.mockResolvedValue(mockVenue(VenueOperatingMode.PERMANENT));
      prisma.event.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('doublon', {
          code: 'P2002',
          clientVersion: '6',
        }),
      );

      await expect(
        service.update(ORG_ID, VENUE_ID, USER_ID, { name: 'Le Comptoir rénové' }),
      ).resolves.toBeDefined();
    });

    it('laisse remonter une vraie panne base', async () => {
      // Tout sauf P2002 doit rester visible : masquer une panne de base
      // laisserait un lieu permanent sans contenant, donc incapable de vendre,
      // sans que rien ne le signale.
      prisma.venue.findFirst.mockResolvedValue(mockVenue(VenueOperatingMode.PERMANENT));
      prisma.venue.update.mockResolvedValue(mockVenue(VenueOperatingMode.PERMANENT));
      prisma.event.create.mockRejectedValue(new Error('connexion perdue'));

      await expect(
        service.update(ORG_ID, VENUE_ID, USER_ID, { name: 'x' }),
      ).rejects.toThrow('connexion perdue');
    });
  });
});
