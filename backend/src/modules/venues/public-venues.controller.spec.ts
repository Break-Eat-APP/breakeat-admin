import { EventStatus, EventVisibility } from '@prisma/client';
import { PublicVenuesController } from './public-venues.controller';
import type { PrismaService } from '../../database/prisma.service';

// ─── Prisma mock ─────────────────────────────────────────────────
const prisma = {
  venue: { findMany: jest.fn() },
  groupMember: { findMany: jest.fn() },
};

function makeController() {
  return new PublicVenuesController(prisma as unknown as PrismaService);
}

const PUBLIC_VENUE = {
  id: 'v-pub',
  name: 'Stade Public',
  address: 'Paris',
  latitude: null,
  longitude: null,
  organization: { name: 'Org', logoUrl: null, primaryColor: null },
  events: [{ id: 'e-pub', status: EventStatus.ACTIVE, visibility: EventVisibility.PUBLIC }],
};
const PRIVATE_VENUE = {
  id: 'v-priv',
  name: 'La Croix Rouge',
  address: 'Lyon',
  latitude: null,
  longitude: null,
  organization: { name: 'Org', logoUrl: null, primaryColor: null },
  events: [{ id: 'e-priv', status: EventStatus.ACTIVE, visibility: EventVisibility.PRIVATE }],
};
// Lieu privé dont l'unique événement privé n'est PAS actif (ex. DRAFT) → doit rester masqué.
const PRIVATE_VENUE_DRAFT = {
  id: 'v-priv-draft',
  name: 'Club Confidentiel',
  address: 'Nice',
  latitude: null,
  longitude: null,
  organization: { name: 'Org', logoUrl: null, primaryColor: null },
  events: [{ id: 'e-priv-draft', status: EventStatus.DRAFT, visibility: EventVisibility.PRIVATE }],
};
const NO_EVENT_VENUE = {
  id: 'v-none',
  name: 'Salle Vide',
  address: 'Lille',
  latitude: null,
  longitude: null,
  organization: { name: 'Org', logoUrl: null, primaryColor: null },
  events: [],
};

describe('PublicVenuesController — lieux privés (Phase 16.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      PUBLIC_VENUE,
      PRIVATE_VENUE,
      PRIVATE_VENUE_DRAFT,
      NO_EVENT_VENUE,
    ]);
  });

  it('anonyme : masque les lieux privés (même non-actifs), garde public + sans-événement', async () => {
    const res = await makeController().search(undefined);

    const ids = res.map((v) => v.id);
    expect(ids).toContain('v-pub');
    expect(ids).toContain('v-none');
    expect(ids).not.toContain('v-priv');
    // Lieu privé dont l'événement privé n'est pas actif → reste masqué (pas de fuite « Bientôt »).
    expect(ids).not.toContain('v-priv-draft');
    // Le lieu public pointe vers son événement actif.
    expect(res.find((v) => v.id === 'v-pub')?.currentEventId).toBe('e-pub');
    // Le lieu sans événement reste listé en « Bientôt » (currentEventId null).
    expect(res.find((v) => v.id === 'v-none')?.currentEventId).toBeNull();
    // Pas de requête d'appartenance sans utilisateur.
    expect(prisma.groupMember.findMany).not.toHaveBeenCalled();
  });

  it('membre du groupe : le lieu privé apparaît avec son événement', async () => {
    (prisma.groupMember.findMany as jest.Mock).mockResolvedValue([
      { group: { events: [{ eventId: 'e-priv' }] } },
    ]);

    const res = await makeController().search({ sub: 'member-uuid' } as never);

    const priv = res.find((v) => v.id === 'v-priv');
    expect(priv).toBeDefined();
    expect(priv?.currentEventId).toBe('e-priv');
  });

  it('non-membre authentifié : le lieu privé reste masqué', async () => {
    (prisma.groupMember.findMany as jest.Mock).mockResolvedValue([
      { group: { events: [{ eventId: 'autre-event' }] } },
    ]);

    const res = await makeController().search({ sub: 'intruder-uuid' } as never);

    expect(res.map((v) => v.id)).not.toContain('v-priv');
  });

  it('géoloc : trie par distance et écarte les lieux hors rayon', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      { ...PUBLIC_VENUE, id: 'far', latitude: 48.85, longitude: 2.35 }, // Paris
      { ...PUBLIC_VENUE, id: 'near', latitude: 43.30, longitude: 5.37 }, // Marseille
    ]);

    // Utilisateur proche de Marseille, rayon 50 km → exclut Paris.
    const res = await makeController().search(undefined, undefined, '43.30', '5.37', '50');

    expect(res.map((v) => v.id)).toEqual(['near']);
    expect(res[0].distanceKm).toBeLessThanOrEqual(50);
  });
});
