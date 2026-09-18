import { FrequentationService } from './frequentation.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * La mesure d'audience — ce qu'elle compte, et ce qu'elle refuse d'écrire.
 */
describe('FrequentationService — signaler une visite', () => {
  const LIEU = 'aaaaaaaa-1111-4111-8111-111111111111';
  const EVENEMENT = 'bbbbbbbb-2222-4222-8222-222222222222';
  const ORG = 'cccccccc-3333-4333-8333-333333333333';

  function monter(overrides: Record<string, unknown> = {}) {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      frequentation: { upsert },
      venue: { findUnique: jest.fn().mockResolvedValue({ organizationId: ORG }) },
      event: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: ORG, venueId: LIEU }),
      },
      ...overrides,
    } as unknown as PrismaService;
    return { service: new FrequentationService(prisma), upsert, prisma };
  }

  it('rattache la visite au club DÉDUIT du lieu, pas à ce que dit l’app', async () => {
    // L'application pourrait se tromper, ou mentir. Le club se relit en base.
    const { service, upsert } = monter();
    await service.signaler({ visitorKey: 'installation-1', kind: 'VENUE_VIEW', venueId: LIEU });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create.organizationId).toBe(ORG);
    expect(upsert.mock.calls[0][0].create.venueId).toBe(LIEU);
  });

  it('n’écrit RIEN pour un lieu inconnu', async () => {
    // Sans ce garde-fou, n'importe qui pourrait gonfler la table avec des
    // identifiants inventés — la route est ouverte aux visiteurs non connectés.
    const { service, upsert } = monter({ venue: { findUnique: jest.fn().mockResolvedValue(null) } });
    await service.signaler({ visitorKey: 'installation-1', kind: 'VENUE_VIEW', venueId: LIEU });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('dédoublonne par fenêtre de trente minutes', async () => {
    const { service, upsert } = monter();
    await service.signaler({ visitorKey: 'installation-1', kind: 'MENU_VIEW', eventId: EVENEMENT });

    const appel = upsert.mock.calls[0][0];
    // La clé qui fait qu'un retour sur la carte épaissit la visite au lieu
    // d'en créer une seconde.
    expect(appel.where.visitorKey_scope_windowStart.scope).toBe(`MENU_VIEW:${LIEU}:${EVENEMENT}`);
    expect(appel.update.hits).toEqual({ increment: 1 });

    const debut: Date = appel.where.visitorKey_scope_windowStart.windowStart;
    expect(debut.getTime() % (30 * 60 * 1000)).toBe(0);
  });

  it('rattache le compte quand le visiteur est connecté, et rien sinon', async () => {
    const { service, upsert } = monter();
    await service.signaler({ visitorKey: 'k', kind: 'APP_OPEN' }, 'user-7');
    expect(upsert.mock.calls[0][0].create.userId).toBe('user-7');

    await service.signaler({ visitorKey: 'k', kind: 'APP_OPEN' });
    expect(upsert.mock.calls[1][0].create.userId).toBeNull();
  });

  it('une ouverture d’app sans destination n’est rattachée à aucun club', async () => {
    const { service, upsert } = monter();
    await service.signaler({ visitorKey: 'k', kind: 'APP_OPEN' });
    expect(upsert.mock.calls[0][0].create.organizationId).toBeNull();
    expect(upsert.mock.calls[0][0].create.scope).toBe('APP_OPEN:-:-');
  });

  it('se tait quand la base refuse : une mesure ne doit pas bloquer une commande', async () => {
    const { service } = monter({
      frequentation: { upsert: jest.fn().mockRejectedValue(new Error('base indisponible')) },
    });
    await expect(
      service.signaler({ visitorKey: 'k', kind: 'VENUE_VIEW', venueId: LIEU }),
    ).resolves.toBeUndefined();
  });
});

describe('FrequentationService — lire l’audience', () => {
  const ORG = 'cccccccc-3333-4333-8333-333333333333';
  const LIEU = 'aaaaaaaa-1111-4111-8111-111111111111';

  function monter(visites: unknown[], commandes: unknown[]) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ globalRole: 'SUPER_ADMIN' }) },
      frequentation: { findMany: jest.fn().mockResolvedValue(visites) },
      order: { groupBy: jest.fn().mockResolvedValue(commandes) },
      venue: { findMany: jest.fn().mockResolvedValue([{ id: LIEU, name: 'Vélodrome' }]) },
    } as unknown as PrismaService;
    return new FrequentationService(prisma);
  }

  const visite = (cle: string, jour: string, hits = 1, userId: string | null = null) => ({
    visitorKey: cle,
    userId,
    venueId: LIEU,
    hits,
    windowStart: new Date(jour),
  });

  it('compte les visiteurs UNIQUES, et les visites séparément', async () => {
    const service = monter(
      [
        visite('a', '2026-09-18T18:00:00Z', 3),
        visite('a', '2026-09-18T19:00:00Z', 1),
        visite('b', '2026-09-18T18:30:00Z', 2),
      ],
      [{ userId: 'u1' }],
    );

    const audience = await service.pourOrganisation(ORG, 'moi');

    // Deux appareils, six passages : les deux chiffres répondent à des
    // questions différentes, et confondre les deux fait croire au double.
    expect(audience.visiteursUniques).toBe(2);
    expect(audience.visites).toBe(6);
  });

  describe('le taux de conversion', () => {
    it('se calcule sur les visiteurs IDENTIFIÉS, des comptes des deux côtés', async () => {
      // Quatre visiteurs identifiés, deux d'entre eux ont commandé : 50 %.
      // Le visiteur anonyme (« e ») ne compte NI en haut NI en bas — il ne
      // pourrait jamais entrer au numérateur, l'inclure au dénominateur
      // écraserait le taux sans rien mesurer.
      const service = monter(
        [
          visite('a', '2026-09-18T18:00:00Z', 1, 'u1'),
          visite('b', '2026-09-18T18:00:00Z', 1, 'u2'),
          visite('c', '2026-09-18T18:00:00Z', 1, 'u3'),
          visite('d', '2026-09-18T18:00:00Z', 1, 'u4'),
          visite('e', '2026-09-18T18:00:00Z', 1, null),
        ],
        [{ userId: 'u1' }, { userId: 'u2' }],
      );

      const audience = await service.pourOrganisation(ORG, 'moi');
      expect(audience.visiteursUniques).toBe(5);
      expect(audience.visiteursConnectes).toBe(4);
      expect(audience.connectesAyantCommande).toBe(2);
      expect(audience.tauxConversion).toBe(50);
    });

    it('ne compte pas un acheteur qui n’a pas été vu', async () => {
      // Commande passée avant que la mesure n'existe, ou visite non
      // enregistrée : il compte comme CLIENT, jamais comme converti. Sans
      // cette règle, le taux pourrait dépasser 100 %.
      const service = monter(
        [visite('a', '2026-09-18T18:00:00Z', 1, 'u1')],
        [{ userId: 'u1' }, { userId: 'inconnu-au-bataillon' }],
      );

      const audience = await service.pourOrganisation(ORG, 'moi');
      expect(audience.clientsAyantCommande).toBe(2);
      expect(audience.connectesAyantCommande).toBe(1);
      expect(audience.tauxConversion).toBe(100);
    });

    it('ne dit rien quand aucun visiteur identifié n’est venu', async () => {
      // Afficher « 0 % » serait un jugement, pas une mesure.
      const anonymesSeulement = monter([visite('a', '2026-09-18T18:00:00Z')], []);
      expect((await anonymesSeulement.pourOrganisation(ORG, 'moi')).tauxConversion).toBeNull();

      const desert = monter([], []);
      expect((await desert.pourOrganisation(ORG, 'moi')).tauxConversion).toBeNull();
    });
  });

  it('distingue les visiteurs connectés des autres', async () => {
    const service = monter(
      [
        visite('a', '2026-09-18T18:00:00Z', 1, 'u1'),
        visite('b', '2026-09-18T18:00:00Z', 1, null),
      ],
      [],
    );
    const audience = await service.pourOrganisation(ORG, 'moi');
    expect(audience.visiteursUniques).toBe(2);
    expect(audience.visiteursConnectes).toBe(1);
  });

  it('découpe par jour, dans l’ordre', async () => {
    const service = monter(
      [
        visite('a', '2026-09-19T10:00:00Z'),
        visite('b', '2026-09-18T18:00:00Z'),
        visite('c', '2026-09-18T20:00:00Z'),
      ],
      [],
    );
    const audience = await service.pourOrganisation(ORG, 'moi');
    expect(audience.parJour.map((j) => j.jour)).toEqual(['2026-09-18', '2026-09-19']);
    expect(audience.parJour[0].visiteursUniques).toBe(2);
  });

  it('nomme les lieux, et supporte qu’un lieu ait disparu', async () => {
    const service = monter([visite('a', '2026-09-18T18:00:00Z')], []);
    const audience = await service.pourOrganisation(ORG, 'moi');
    expect(audience.parLieu[0]).toMatchObject({ nom: 'Vélodrome', visiteursUniques: 1 });
  });
});
