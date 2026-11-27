/**
 * LES NOTES DES COMMANDES FLAIX DANS « AVIS » (27/11/2026), sur une VRAIE base.
 *
 * Rémi notait ses commandes Flaix et ne voyait rien dans « Avis » : la page ne
 * lisait que les notes des commandes BreakEat. On prouve ici qu'une note Flaix
 * arrive dans SON club — par le match, à défaut par le lieu — et jamais dans
 * celui d'un autre, et que le jeton Flaix ne sort pas.
 */
import { StatsService } from '../../src/modules/stats/stats.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('avis : les notes des commandes Flaix (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const stats = url ? new StatsService(s.prisma) : (null as never);

  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  const utilisateur = async () =>
    (
      await s.prisma.user.create({
        data: { email: `${unique('u')}@test.fr`, passwordHash: 'x', displayName: 'U' },
      })
    ).id;

  /** Un club Flaix : son lieu porte un nom court Flaix, son match un identifiant Flaix. */
  async function clubFlaix(adminId: string) {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), adminId);
    const lieu = unique('lieu');
    const match = unique('match');
    await s.prisma.venue.update({ where: { id: o.venue.id }, data: { flaixEnabled: true, flaixVenueId: lieu } });
    await s.prisma.event.create({
      data: {
        organizationId: o.org.id,
        venueId: o.venue.id,
        name: 'Match',
        startAt: new Date(),
        endAt: new Date(Date.now() + 3 * 3600_000),
        flaixEventId: match,
      },
    });
    return { orgId: o.org.id, lieu, match };
  }

  async function noter(
    userId: string,
    p: { stars: number; comment?: string; lieu?: string | null; match?: string | null; numero: string },
  ) {
    const jeton = unique('jeton').replace(/[^A-Za-z0-9_-]/g, '');
    await s.prisma.suiviCommandeFlaix.create({
      data: {
        jeton,
        userId,
        numero: p.numero,
        passeeLe: new Date(),
        etat: 'delivered',
        termine: true,
        lieuFlaix: p.lieu ?? null,
        evenementFlaix: p.match ?? null,
      },
    });
    await s.prisma.noteCommandeFlaix.create({
      data: {
        jeton,
        userId,
        stars: p.stars,
        comment: p.comment ?? null,
        numero: p.numero,
        pointDeRetrait: 'Burger king',
        lieuFlaix: p.lieu ?? null,
        evenementFlaix: p.match ?? null,
      },
    });
    return jeton;
  }

  it('une note Flaix arrive dans son club, par le match ou par le lieu, jamais chez un autre', async () => {
    const adminA = await utilisateur();
    const adminB = await utilisateur();
    const client = await utilisateur();
    const a = await clubFlaix(adminA);
    const b = await clubFlaix(adminB);

    const parMatch = await noter(client, { stars: 5, comment: 'Rapide !', match: a.match, lieu: a.lieu, numero: '1001' });
    await noter(client, { stars: 3, lieu: a.lieu, match: unique('inconnu'), numero: '1002' });
    // Le lieu de A, mais le match est celui de B : la note est à B.
    await noter(client, { stars: 1, comment: 'Froid', lieu: a.lieu, match: b.match, numero: '1003' });

    const avisA = await stats.getOrgRatings(a.orgId, adminA);
    expect(avisA.total).toBe(2);
    expect(avisA.moyenne).toBe(4);
    expect(avisA.repartition.find((r) => r.stars === 5)?.nombre).toBe(1);
    expect(avisA.repartition.find((r) => r.stars === 3)?.nombre).toBe(1);
    expect(avisA.notes.map((n) => n.commande).sort()).toEqual(['1001', '1002']);
    const premiere = avisA.notes.find((n) => n.commande === '1001');
    expect(premiere).toMatchObject({ stars: 5, comment: 'Rapide !', buvette: 'Burger king' });
    // Le jeton Flaix est un droit d'accès : il ne sort jamais.
    expect(JSON.stringify(avisA)).not.toContain(parMatch);

    const avisB = await stats.getOrgRatings(b.orgId, adminB);
    expect(avisB.total).toBe(1);
    expect(avisB.notes[0]).toMatchObject({ stars: 1, comment: 'Froid', commande: '1003' });
  });

  it('un club sans lieu Flaix ne voit aucune note Flaix', async () => {
    const admin = await utilisateur();
    const o = await creerOrganisationComplete(s.prisma, unique('club'), admin);
    const avis = await stats.getOrgRatings(o.org.id, admin);
    expect(avis).toMatchObject({ total: 0, moyenne: null, notes: [] });
  });
});
