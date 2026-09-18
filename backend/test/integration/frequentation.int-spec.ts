/**
 * La fréquentation, sur une VRAIE base.
 *
 * Le cœur du dispositif n'est pas dans le code : c'est un index unique
 * PostgreSQL sur (visiteur, périmètre, fenêtre). C'est lui qui fait qu'un
 * client revenant dix fois sur la carte compte pour une visite et non dix — et
 * qu'une table de mesure ne gonfle pas indéfiniment. Une doublure ne prouverait
 * rien de tout cela : elle accepterait ce qu'on lui donne.
 */
import { FrequentationService } from '../../src/modules/frequentation/frequentation.service';
import { ClientsService } from '../../src/modules/clients/clients.service';
import { monterServices, unique, creerOrganisationComplete, creerCommande } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('fréquentation et fichier client (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const frequentation = url ? new FrequentationService(s.prisma) : (null as never);
  const clients = url ? new ClientsService(s.prisma) : (null as never);

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

  it('dix passages dans la même demi-heure font UNE visite', async () => {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const cle = unique('installation');

    for (let i = 0; i < 10; i++) {
      await frequentation.signaler({ visitorKey: cle, kind: 'MENU_VIEW', eventId: o.event.id });
    }

    const lignes = await s.prisma.frequentation.findMany({ where: { visitorKey: cle } });
    expect(lignes).toHaveLength(1);
    expect(lignes[0].hits).toBe(10);

    const audience = await frequentation.pourOrganisation(o.org.id, sa);
    expect(audience.visiteursUniques).toBe(1);
    expect(audience.visites).toBe(10);
  });

  it('deux appareils font deux visiteurs', async () => {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    await frequentation.signaler({ visitorKey: unique('a'), kind: 'VENUE_VIEW', venueId: o.venue.id });
    await frequentation.signaler({ visitorKey: unique('b'), kind: 'VENUE_VIEW', venueId: o.venue.id });

    const audience = await frequentation.pourOrganisation(o.org.id, sa);
    expect(audience.visiteursUniques).toBe(2);
  });

  it('un lieu inventé n’écrit aucune ligne', async () => {
    const avant = await s.prisma.frequentation.count();
    await frequentation.signaler({
      visitorKey: unique('pirate'),
      kind: 'VENUE_VIEW',
      venueId: '99999999-9999-4999-8999-999999999999',
    });
    expect(await s.prisma.frequentation.count()).toBe(avant);
  });

  it('la visite survit à la suppression du lieu qu’elle mesure', async () => {
    // Aucune clé étrangère, volontairement : fermer un lieu ne doit pas effacer
    // l'histoire de sa saison.
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const cle = unique('installation');
    await frequentation.signaler({ visitorKey: cle, kind: 'VENUE_VIEW', venueId: o.venue.id });

    await s.prisma.frequentation.updateMany({
      where: { visitorKey: cle },
      data: { venueId: '11111111-1111-4111-8111-111111111111' },
    });

    const audience = await frequentation.pourOrganisation(o.org.id, sa);
    expect(audience.parLieu[0].nom).toBe('Lieu supprimé');
  });

  it('le fichier client d’un club ne contient QUE ses clients', async () => {
    const mien = await creerOrganisationComplete(s.prisma, unique('mien'), sa);
    const autre = await creerOrganisationComplete(s.prisma, unique('autre'), sa);

    const chezMoi = await s.prisma.user.create({
      data: { email: `${unique('a')}@test.fr`, passwordHash: 'x', displayName: 'Chez moi' },
    });
    const ailleurs = await s.prisma.user.create({
      data: { email: `${unique('b')}@test.fr`, passwordHash: 'x', displayName: 'Ailleurs' },
    });

    await creerCommande(s.prisma, chezMoi.id, mien);
    await creerCommande(s.prisma, ailleurs.id, autre);

    const fichier = await clients.lister(mien.org.id, sa);
    expect(fichier.map((c) => c.nom)).toEqual(['Chez moi']);
  });

  it('l’export CSV rend exactement ce que la liste affiche', async () => {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const client = await s.prisma.user.create({
      data: { email: `${unique('jo')}@test.fr`, passwordHash: 'x', displayName: 'Jo Bricole' },
    });
    await creerCommande(s.prisma, client.id, o);

    const liste = await clients.lister(o.org.id, sa);
    const { csv, lignes } = await clients.exporterCsv(o.org.id, sa);

    expect(lignes).toBe(liste.length);
    expect(csv).toContain('Jo Bricole');
    expect(csv.startsWith('﻿')).toBe(true);
  });
});
