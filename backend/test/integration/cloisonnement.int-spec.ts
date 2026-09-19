/**
 * LE CLOISONNEMENT — ce module ne doit JAMAIS mélanger deux lieux ni deux clubs.
 *
 * C'est la propriété qui décide si ces chiffres valent quelque chose. Un total
 * faux se remarque ; un total qui mélange deux lieux paraît juste, se cite en
 * réunion, et oriente des décisions. Personne ne s'en aperçoit avant longtemps.
 *
 * Le décor est donc volontairement piégeux : DEUX clubs, DEUX lieux chacun, et
 * des clients partagés entre eux — exactement la situation où une requête mal
 * filtrée laisse fuir quelque chose.
 *
 * Tout tourne sur une VRAIE base : c'est la seule façon de prouver qu'un filtre
 * est réellement appliqué. Une doublure répond ce qu'on lui a soufflé.
 */
import { ClientsService } from '../../src/modules/clients/clients.service';
import { FrequentationService } from '../../src/modules/frequentation/frequentation.service';
import { ScheduledPushService } from '../../src/modules/notifications/scheduled-push.service';
import { monterServices, unique, creerOrganisationComplete, creerCommande } from './banc';
import type { PrismaService } from '../../src/database/prisma.service';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('cloisonnement des données par club et par lieu (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const clients = url ? new ClientsService(s.prisma) : (null as never);
  const frequentation = url ? new FrequentationService(s.prisma) : (null as never);
  const campagnes = url
    ? new ScheduledPushService(
        s.prisma,
        {} as never,
        { tokensForUsers: async (ids: string[]) => ids.map((i) => `jeton:${i}`) } as never,
        {} as never,
      )
    : (null as never);

  /** Un second lieu pour un club, avec son événement et son point de retrait. */
  async function secondLieu(
    prisma: PrismaService,
    base: Awaited<ReturnType<typeof creerOrganisationComplete>>,
    nom: string,
  ) {
    const venue = await prisma.venue.create({
      data: {
        organizationId: base.org.id,
        name: nom,
        address: '2 rue Annexe',
        operatingMode: 'PERMANENT',
      },
    });
    const event = await prisma.event.create({
      data: {
        organizationId: base.org.id,
        venueId: venue.id,
        name: `Service ${nom}`,
        status: 'ACTIVE',
        startAt: new Date(),
        endAt: new Date('2099-12-31'),
        isPermanentContainer: true,
      },
    });
    const pickup = await prisma.pickupPoint.create({
      data: {
        organizationId: base.org.id,
        venueId: venue.id,
        eventId: event.id,
        supplierId: base.supplier.id,
        name: 'Comptoir annexe',
      },
    });
    return { ...base, venue, event, pickup };
  }

  let sa: string;
  // Club A : deux lieux. Club B : un lieu. Des clients qui se croisent.
  let clubA: Awaited<ReturnType<typeof creerOrganisationComplete>>;
  let clubAannexe: Awaited<ReturnType<typeof secondLieu>>;
  let clubB: Awaited<ReturnType<typeof creerOrganisationComplete>>;
  let fidele: string; // commande dans les DEUX lieux du club A
  let annexeSeul: string; // commande UNIQUEMENT à l'annexe de A
  let chezB: string; // commande uniquement chez B

  beforeAll(async () => {
    sa = (
      await s.prisma.user.create({
        data: {
          email: `${unique('sa')}@test.fr`,
          passwordHash: 'x',
          displayName: 'SA',
          globalRole: 'SUPER_ADMIN',
        },
      })
    ).id;

    clubA = await creerOrganisationComplete(s.prisma, unique('clubA'), sa);
    clubAannexe = await secondLieu(s.prisma, clubA, 'Annexe A');
    clubB = await creerOrganisationComplete(s.prisma, unique('clubB'), sa);

    const creerClient = async (nom: string) =>
      (
        await s.prisma.user.create({
          data: { email: `${unique('c')}@test.fr`, passwordHash: 'x', displayName: nom },
        })
      ).id;

    fidele = await creerClient('Fidèle Deuxlieux');
    annexeSeul = await creerClient('Annexe Seulement');
    chezB = await creerClient('Client de B');

    // Le fidèle : deux commandes au stade principal, une à l'annexe.
    await creerCommande(s.prisma, fidele, clubA);
    await creerCommande(s.prisma, fidele, clubA);
    await creerCommande(s.prisma, fidele, clubAannexe);
    await creerCommande(s.prisma, annexeSeul, clubAannexe);
    await creerCommande(s.prisma, chezB, clubB);

    // Des visites : le fidèle sur les deux lieux, un anonyme à l'annexe, un
    // visiteur chez B.
    await frequentation.signaler(
      { visitorKey: unique('v-fidele'), kind: 'MENU_VIEW', venueId: clubA.venue.id },
      fidele,
    );
    await frequentation.signaler(
      { visitorKey: unique('v-fidele2'), kind: 'MENU_VIEW', venueId: clubAannexe.venue.id },
      fidele,
    );
    await frequentation.signaler({
      visitorKey: unique('v-anonyme'),
      kind: 'MENU_VIEW',
      venueId: clubAannexe.venue.id,
    });
    await frequentation.signaler({
      visitorKey: unique('v-chezB'),
      kind: 'MENU_VIEW',
      venueId: clubB.venue.id,
    });
  });

  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  // ─── Le fichier client ──────────────────────────────────────

  describe('le fichier client', () => {
    it('d’un club ne contient AUCUN client d’un autre club', async () => {
      const chezA = await clients.lister(clubA.org.id, sa);
      const noms = chezA.map((c) => c.nom);

      expect(noms).toContain('Fidèle Deuxlieux');
      expect(noms).toContain('Annexe Seulement');
      expect(noms).not.toContain('Client de B');
    });

    it('filtré sur UN lieu ne montre que les clients de CE lieu', async () => {
      const principal = await clients.lister(clubA.org.id, sa, { venueId: clubA.venue.id });
      expect(principal.map((c) => c.nom)).toEqual(['Fidèle Deuxlieux']);

      const annexe = await clients.lister(clubA.org.id, sa, { venueId: clubAannexe.venue.id });
      expect(annexe.map((c) => c.nom).sort()).toEqual(['Annexe Seulement', 'Fidèle Deuxlieux']);
    });

    it('compte les commandes DU LIEU filtré, pas celles de tout le club', async () => {
      // Le piège : le fidèle a trois commandes au total, mais deux au stade
      // principal. Un filtre qui ne porterait que sur la liste des clients, et
      // pas sur leurs totaux, afficherait trois.
      const [auPrincipal] = await clients.lister(clubA.org.id, sa, { venueId: clubA.venue.id });
      expect(auPrincipal.commandes).toBe(2);

      const annexe = await clients.lister(clubA.org.id, sa, { venueId: clubAannexe.venue.id });
      expect(annexe.find((c) => c.nom === 'Fidèle Deuxlieux')?.commandes).toBe(1);

      const tout = await clients.lister(clubA.org.id, sa);
      expect(tout.find((c) => c.nom === 'Fidèle Deuxlieux')?.commandes).toBe(3);
    });

    it('ne liste les lieux fréquentés que DANS le club qui lit', async () => {
      const [leFidele] = await clients.lister(clubA.org.id, sa);
      expect(leFidele.lieux.sort()).toEqual([clubAannexe.venue.name, clubA.venue.name].sort());
      // Le nom du lieu de l'autre club ne doit apparaître nulle part.
      expect(leFidele.lieux).not.toContain(clubB.venue.name);
    });

    it('l’export CSV respecte le filtre de lieu', async () => {
      const { csv } = await clients.exporterCsv(clubA.org.id, sa, { venueId: clubA.venue.id });
      expect(csv).toContain('Fidèle Deuxlieux');
      expect(csv).not.toContain('Annexe Seulement');
      expect(csv).not.toContain('Client de B');
    });
  });

  // ─── La fréquentation ───────────────────────────────────────

  describe('la fréquentation', () => {
    it('sépare les visiteurs lieu par lieu', async () => {
      const audience = await frequentation.pourOrganisation(clubA.org.id, sa);
      const principal = audience.parLieu.find((l) => l.venueId === clubA.venue.id);
      const annexe = audience.parLieu.find((l) => l.venueId === clubAannexe.venue.id);

      expect(principal?.visiteursUniques).toBe(1);
      expect(annexe?.visiteursUniques).toBe(2);
      // Aucun lieu d'un autre club ne doit figurer dans cette lecture.
      expect(audience.parLieu.map((l) => l.venueId)).not.toContain(clubB.venue.id);
    });

    it('compte les clients de chaque lieu séparément', async () => {
      const audience = await frequentation.pourOrganisation(clubA.org.id, sa);
      expect(audience.parLieu.find((l) => l.venueId === clubA.venue.id)?.clients).toBe(1);
      expect(audience.parLieu.find((l) => l.venueId === clubAannexe.venue.id)?.clients).toBe(2);
    });

    it('filtrée sur un lieu, ne rapporte QUE ce lieu', async () => {
      const annexe = await frequentation.pourOrganisation(clubA.org.id, sa, {
        venueId: clubAannexe.venue.id,
      });
      expect(annexe.parLieu).toHaveLength(1);
      expect(annexe.parLieu[0].venueId).toBe(clubAannexe.venue.id);
      expect(annexe.visiteursUniques).toBe(2);
    });

    it('n’attribue à un club AUCUNE visite d’un autre', async () => {
      const chezB = await frequentation.pourOrganisation(clubB.org.id, sa);
      expect(chezB.visiteursUniques).toBe(1);
      expect(chezB.parLieu).toHaveLength(1);
      expect(chezB.parLieu[0].venueId).toBe(clubB.venue.id);
    });
  });

  // ─── Les campagnes ──────────────────────────────────────────

  describe('les campagnes', () => {
    it('visant un lieu ne partent QU’aux clients de ce lieu', async () => {
      const auPrincipal = await campagnes.resolveAudience(clubA.org.id, null, clubA.venue.id);
      expect(auPrincipal.sort()).toEqual([`jeton:${fidele}`]);

      const aLannexe = await campagnes.resolveAudience(clubA.org.id, null, clubAannexe.venue.id);
      expect(aLannexe.sort()).toEqual([`jeton:${annexeSeul}`, `jeton:${fidele}`].sort());
    });

    it('sans lieu, couvrent tout le club — et LUI SEUL', async () => {
      const toutLeClub = await campagnes.resolveAudience(clubA.org.id, null, null);
      expect(toutLeClub.sort()).toEqual([`jeton:${annexeSeul}`, `jeton:${fidele}`].sort());
      expect(toutLeClub).not.toContain(`jeton:${chezB}`);
    });

    it('d’un club ne touchent JAMAIS les clients d’un autre', async () => {
      const chezBseul = await campagnes.resolveAudience(clubB.org.id, null, null);
      expect(chezBseul).toEqual([`jeton:${chezB}`]);
      expect(chezBseul).not.toContain(`jeton:${fidele}`);
    });

    it('refusent un lieu qui appartient à un AUTRE club', async () => {
      // Le contrôle qui empêche de deviner un identifiant pour s'adresser à la
      // clientèle d'un concurrent.
      await expect(
        campagnes.create(clubA.org.id, sa, {
          title: 'Tentative',
          scheduledAt: new Date(Date.now() + 3600e3).toISOString(),
          venueId: clubB.venue.id,
        }),
      ).rejects.toThrow(/n'appartient pas|n’appartient pas/);
    });
  });
});
