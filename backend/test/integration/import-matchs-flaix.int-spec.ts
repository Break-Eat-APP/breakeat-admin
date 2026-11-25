/**
 * L'IMPORT DU FLUX DES MATCHS FLAIX, sur une VRAIE base (24/11/2026).
 *
 * À prouver : un match du flux crée un événement avec ses points de retrait ;
 * un deuxième passage ne double rien ; un événement saisi à la main est adopté ;
 * une annulation chez Flaix annule chez nous ; le mode « journal » n'écrit rien.
 */
import { EventStatus } from '@prisma/client';
import { ImportMatchsFlaixService } from '../../src/modules/flaix/import-matchs-flaix.service';
import { EventsService } from '../../src/modules/events/events.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

const MAINTENANT = new Date('2026-11-24T17:00:00+01:00');

function flux(statut = 'a_venir', debut = '2026-11-25T20:30:00+01:00') {
  return {
    lieu: { id: 'stade-test' },
    evenements: [
      {
        id: 'u2',
        idInterne: 108,
        nom: 'U2',
        debut,
        fin: '2026-11-25T23:00:00+01:00',
        statut,
        affiche: { png: 'https://commande.flaix.bo.synertic.net/api/public/events/108/cover.png' },
        commande: { lien: 'https://commande.flaix.bo.synertic.net/o/u2' },
      },
    ],
  };
}

decrire('import du flux des matchs Flaix (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const service = (mode: string) =>
    new ImportMatchsFlaixService(s.prisma, { get: (k: string) => (k === 'app.flaix.fluxImport' ? mode : undefined) } as never);

  let sa: string;
  beforeAll(async () => {
    sa = (
      await s.prisma.user.create({
        data: { email: `${unique('sa')}@test.fr`, passwordHash: 'x', displayName: 'SA', globalRole: 'SUPER_ADMIN' },
      })
    ).id;
  });
  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  async function lieuFlaix() {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    await s.prisma.venue.update({ where: { id: o.venue.id }, data: { flaixEnabled: true, flaixVenueId: 'stade-test' } });
    return o;
  }

  const importes = (venueId: string) =>
    s.prisma.event.findMany({ where: { venueId, isPermanentContainer: false }, include: { eventSuppliers: true } });

  it('crée l’événement avec ses points de retrait, puis ne double rien', async () => {
    const o = await lieuFlaix();
    const imp = service('actif');

    const b1 = await imp.importerLieu(o.venue.id, o.org.id, 'stade-test', flux(), MAINTENANT);
    expect(b1).toMatchObject({ crees: 1, modifies: 0 });
    const [ev] = await importes(o.venue.id);
    expect(ev).toMatchObject({ name: 'U2', flaixEventId: '108', status: EventStatus.DRAFT });
    expect(ev.flaixOrderUrl).toContain('/o/u2?firstname=[#firstname]');
    expect(ev.posterUrl).toContain('cover.png');
    expect(ev.eventSuppliers).toHaveLength(1);

    const b2 = await imp.importerLieu(o.venue.id, o.org.id, 'stade-test', flux(), MAINTENANT);
    expect(b2).toMatchObject({ crees: 0, modifies: 0 });
    expect(await importes(o.venue.id)).toHaveLength(1);
  });

  it('adopte un événement saisi à la main au lieu de le doubler', async () => {
    const o = await lieuFlaix();
    const lienClub = 'https://commande.flaix.bo.synertic.net/o/u2?mail=[#mail]';
    const main = await s.prisma.event.create({
      data: {
        organizationId: o.org.id,
        venueId: o.venue.id,
        name: 'Concert U2',
        startAt: new Date('2026-11-25T19:30:00Z'),
        endAt: new Date('2026-11-25T22:00:00Z'),
        flaixOrderUrl: lienClub,
      },
    });

    const b = await service('actif').importerLieu(o.venue.id, o.org.id, 'stade-test', flux(), MAINTENANT);
    expect(b).toMatchObject({ crees: 0, modifies: 1 });
    const tous = await importes(o.venue.id);
    expect(tous).toHaveLength(1);
    expect(tous[0]).toMatchObject({ id: main.id, flaixEventId: '108', name: 'U2', flaixOrderUrl: lienClub });
  });

  it('suit un changement d’heure, puis une annulation', async () => {
    const o = await lieuFlaix();
    const imp = service('actif');
    await imp.importerLieu(o.venue.id, o.org.id, 'stade-test', flux(), MAINTENANT);

    await imp.importerLieu(o.venue.id, o.org.id, 'stade-test', flux('a_venir', '2026-11-25T21:00:00+01:00'), MAINTENANT);
    let [ev] = await importes(o.venue.id);
    expect(ev.startAt.toISOString()).toBe('2026-11-25T20:00:00.000Z');

    await imp.importerLieu(o.venue.id, o.org.id, 'stade-test', flux('annule'), MAINTENANT);
    [ev] = await importes(o.venue.id);
    expect(ev.status).toBe(EventStatus.CANCELLED);
  });

  describe('le calendrier Flaix réglé par le club (25/11/2026)', () => {
    let lecture: jest.SpyInstance;
    beforeEach(() => {
      lecture = jest.spyOn(global, 'fetch').mockImplementation(async () =>
        new Response(JSON.stringify(flux()), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    });
    afterEach(() => lecture.mockRestore());

    const LIEN = 'https://commande.flaix.bo.synertic.net/l/stade-test';

    it('l’aperçu montre ce qui serait créé, sans rien écrire', async () => {
      const o = await lieuFlaix();
      const a = await service('').apercu(sa, o.org.id, o.venue.id, LIEN, MAINTENANT);
      expect(a.lieu).toBe('stade-test');
      expect(a.evenements).toEqual([expect.objectContaining({ cle: '108', nom: 'U2', action: 'creer' })]);
      expect(await importes(o.venue.id)).toHaveLength(0);
    });

    it('l’activation garde le nom court et synchronise tout de suite', async () => {
      const o = await lieuFlaix();
      const r = await service('').regler(sa, o.org.id, o.venue.id, { lien: LIEN, actif: true }, MAINTENANT);
      expect(r).toMatchObject({ lieu: 'stade-test', actif: true, bilan: { crees: 1 } });
      const v = await s.prisma.venue.findUniqueOrThrow({ where: { id: o.venue.id } });
      expect(v).toMatchObject({ flaixVenueId: 'stade-test', flaixFluxActif: true });
      expect(await importes(o.venue.id)).toHaveLength(1);
    });

    it('refuse d’activer un lieu qui ne passe pas par Flaix, et un lien qui n’est pas Flaix', async () => {
      const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
      await expect(service('').regler(sa, o.org.id, o.venue.id, { lien: LIEN, actif: true })).rejects.toThrow(
        /ne passe pas par Flaix/,
      );
      await expect(service('').apercu(sa, o.org.id, o.venue.id, 'https://pirate.fr/l/x')).rejects.toThrow(
        /non reconnu/,
      );
    });

    it('le lieu d’un autre club est introuvable', async () => {
      const o = await lieuFlaix();
      const autreAdmin = (
        await s.prisma.user.create({
          data: { email: `${unique('admin')}@test.fr`, passwordHash: 'x', displayName: 'Autre club' },
        })
      ).id;
      const autre = await creerOrganisationComplete(s.prisma, unique('club'), autreAdmin);
      await expect(service('').reglage(autreAdmin, autre.org.id, o.venue.id)).rejects.toThrow(/introuvable/);
    });
  });

  it('verrouille le nom, les horaires et le lien d’un événement importé, pas sa visibilité', async () => {
    const o = await lieuFlaix();
    await service('actif').importerLieu(o.venue.id, o.org.id, 'stade-test', flux(), MAINTENANT);
    const [ev] = await importes(o.venue.id);
    const evenements = new EventsService(s.prisma);

    await expect(evenements.update(o.org.id, ev.id, sa, { name: 'Autre' })).rejects.toThrow(/calendrier Flaix/);
    await expect(
      evenements.definirLiensCommandeFlaix(o.org.id, sa, [{ eventId: ev.id, url: 'https://commande.flaix.bo.synertic.net/o/x' }]),
    ).rejects.toThrow(/calendrier Flaix/);
    await expect(evenements.update(o.org.id, ev.id, sa, { visibility: 'PRIVATE' as never })).resolves.toMatchObject({
      visibility: 'PRIVATE',
    });
  });

  it('en mode journal, lit sans rien écrire', async () => {
    const o = await lieuFlaix();
    const b = await service('journal').importerLieu(o.venue.id, o.org.id, 'stade-test', flux(), MAINTENANT);
    expect(b).toMatchObject({ crees: 0, modifies: 0 });
    expect(await importes(o.venue.id)).toHaveLength(0);
  });
});
