/**
 * Le lien du rapport Flaix d'un événement, sur une VRAIE base.
 *
 * Deux choses à prouver : le lien se pose APRÈS le match (sur un événement
 * terminé, que la modification ordinaire refuse), et seul un lien Flaix passe —
 * il s'affiche dans le dashboard d'un directeur, qui y tape son mot de passe.
 */
import { EventStatus } from '@prisma/client';
import { EventsService } from '../../src/modules/events/events.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

const RAPPORT = 'https://ops.flaixlabs.com/reports/events/8431';

/**
 * Un vrai MATCH. L'organisation du banc d'essai porte un lieu ouvert en
 * continu, dont l'unique événement est un contenant invisible — refusé partout
 * par conception, rapport Flaix compris.
 */
async function creerMatch(
  prisma: ReturnType<typeof monterServices>['prisma'],
  o: { org: { id: string }; venue: { id: string } },
) {
  return prisma.event.create({
    data: {
      organizationId: o.org.id,
      venueId: o.venue.id,
      name: 'OM – Nice',
      startAt: new Date('2026-09-20T19:00:00Z'),
      endAt: new Date('2026-09-20T21:00:00Z'),
    },
  });
}

decrire('rapport Flaix d’un événement (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const evenements = url ? new EventsService(s.prisma) : (null as never);

  let sa: string;
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
  });
  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  it('se pose sur un événement TERMINÉ — le rapport arrive après le match', async () => {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const match = await creerMatch(s.prisma, o);
    await s.prisma.event.update({ where: { id: match.id }, data: { status: EventStatus.ENDED } });

    // La modification ordinaire refuse un événement terminé…
    await expect(evenements.update(o.org.id, match.id, sa, { name: 'Autre nom' })).rejects.toThrow(/ENDED/);

    // …le rapport, lui, passe.
    const pose = await evenements.definirRapportFlaix(o.org.id, match.id, sa, RAPPORT);
    expect(pose.flaixReportUrl).toBe(RAPPORT);

    const relu = await s.prisma.event.findUniqueOrThrow({ where: { id: match.id } });
    expect(relu.flaixReportUrl).toBe(RAPPORT);
  });

  it('refuse un site qui imite Flaix, et ne touche pas au lien en place', async () => {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const match = await creerMatch(s.prisma, o);
    await evenements.definirRapportFlaix(o.org.id, match.id, sa, RAPPORT);

    await expect(
      evenements.definirRapportFlaix(o.org.id, match.id, sa, 'https://flaixlabs.com.pirate.fr/login'),
    ).rejects.toThrow(/Flaix/);

    const relu = await s.prisma.event.findUniqueOrThrow({ where: { id: match.id } });
    expect(relu.flaixReportUrl).toBe(RAPPORT);
  });

  it('un club ne pose rien sur l’événement d’un autre', async () => {
    const mien = await creerOrganisationComplete(s.prisma, unique('mien'), sa);
    const autre = await creerOrganisationComplete(s.prisma, unique('autre'), sa);
    const matchAutre = await creerMatch(s.prisma, autre);

    // L'identifiant de l'événement d'un autre club, présenté sous le mien.
    await expect(
      evenements.definirRapportFlaix(mien.org.id, matchAutre.id, sa, RAPPORT),
    ).rejects.toThrow(/not found/i);

    const relu = await s.prisma.event.findUniqueOrThrow({ where: { id: matchAutre.id } });
    expect(relu.flaixReportUrl).toBeNull();
  });

  it('un lien vide le retire', async () => {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const match = await creerMatch(s.prisma, o);
    await evenements.definirRapportFlaix(o.org.id, match.id, sa, RAPPORT);

    const retire = await evenements.definirRapportFlaix(o.org.id, match.id, sa, '   ');
    expect(retire.flaixReportUrl).toBeNull();
  });

  it('refusé sur le contenant invisible d’un lieu ouvert en continu', async () => {
    // Ce n'est pas un match : personne ne le voit, il n'a pas de rapport.
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    await expect(evenements.definirRapportFlaix(o.org.id, o.event.id, sa, RAPPORT)).rejects.toThrow(
      /continu/,
    );
  });

  it('la base elle-même refuse un lien qui n’est pas en https', async () => {
    // Le jour où une route oublierait le contrôle, la base refuserait encore.
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    await expect(
      s.prisma.event.update({
        where: { id: o.event.id },
        data: { flaixReportUrl: 'http://ops.flaixlabs.com/r/1' },
      }),
    ).rejects.toThrow();
  });
});
