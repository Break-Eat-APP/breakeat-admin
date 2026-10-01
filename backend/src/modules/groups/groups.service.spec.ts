import { Test, TestingModule } from '@nestjs/testing';
import { EventVisibility, VenueOperatingMode } from '@prisma/client';
import { GroupsService } from './groups.service';
import { PrismaService } from '../../database/prisma.service';

const EVENT_ID = 'evt-1';
const USER_ID = 'user-1';

/**
 * `canAccessEvent` est le PASSAGE OBLIGÉ des lectures publiques et du panier.
 * Tout ce qu'il laisse passer est visible du monde entier ; tout ce qu'il
 * refuse devient un 404 indistinguable d'un événement qui n'existe pas.
 *
 * C'est donc ici que vivent les deux règles de visibilité : l'événement privé
 * réservé à ses groupes, et le contenant d'un lieu qui n'est plus ouvert en
 * continu.
 */
describe('GroupsService.canAccessEvent', () => {
  let service: GroupsService;
  let prisma: {
    event: { findUnique: jest.Mock };
    groupMember: { findFirst: jest.Mock };
  };

  /** Un événement ordinaire d'un lieu ouvert en continu. */
  const evenement = (over: Record<string, unknown> = {}) => ({
    visibility: EventVisibility.PUBLIC,
    isPermanentContainer: false,
    venue: { operatingMode: VenueOperatingMode.PERMANENT },
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(evenement()) },
      groupMember: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GroupsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(GroupsService);
  });

  it('un événement PUBLIC est accessible, même sans compte', async () => {
    await expect(service.canAccessEvent(EVENT_ID, null)).resolves.toBe(true);
  });

  it('un événement inconnu est refusé — même 404 qu’un privé non invité', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.canAccessEvent(EVENT_ID, USER_ID)).resolves.toBe(false);
  });

  it('un événement PRIVÉ est refusé à un visiteur anonyme', async () => {
    prisma.event.findUnique.mockResolvedValue(
      evenement({ visibility: EventVisibility.PRIVATE }),
    );
    await expect(service.canAccessEvent(EVENT_ID, null)).resolves.toBe(false);
  });

  it('un événement PRIVÉ s’ouvre à un membre d’un de ses groupes', async () => {
    prisma.event.findUnique.mockResolvedValue(
      evenement({ visibility: EventVisibility.PRIVATE }),
    );
    prisma.groupMember.findFirst.mockResolvedValue({ groupId: 'g-1' });

    await expect(service.canAccessEvent(EVENT_ID, USER_ID)).resolves.toBe(true);
  });

  it('le CONTENANT d’un lieu redevenu événementiel disparaît, même PUBLIC', async () => {
    // Le défaut : le panier refusait bien ce contenant endormi (statut PAUSED),
    // mais la lecture publique ne regardait pas son statut. Un ancien lien
    // affichait encore le lieu, ses buvettes et ses produits — avec un bouton
    // qui échouait au moment de commander.
    prisma.event.findUnique.mockResolvedValue(
      evenement({
        isPermanentContainer: true,
        venue: { operatingMode: VenueOperatingMode.EVENT_BASED },
      }),
    );

    await expect(service.canAccessEvent(EVENT_ID, USER_ID)).resolves.toBe(false);
  });

  it('le contenant d’un lieu TOUJOURS ouvert en continu reste accessible', async () => {
    prisma.event.findUnique.mockResolvedValue(
      evenement({
        isPermanentContainer: true,
        venue: { operatingMode: VenueOperatingMode.PERMANENT },
      }),
    );

    await expect(service.canAccessEvent(EVENT_ID, null)).resolves.toBe(true);
  });

  it('un événement PONCTUEL d’un lieu événementiel reste accessible', async () => {
    // La règle ne vise QUE les contenants : un match dans un stade qui n'ouvre
    // pas tous les jours est un événement parfaitement normal.
    prisma.event.findUnique.mockResolvedValue(
      evenement({
        isPermanentContainer: false,
        venue: { operatingMode: VenueOperatingMode.EVENT_BASED },
      }),
    );

    await expect(service.canAccessEvent(EVENT_ID, null)).resolves.toBe(true);
  });
});
