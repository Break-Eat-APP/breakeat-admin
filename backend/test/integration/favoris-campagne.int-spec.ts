import { FavoritesService } from '../../src/modules/favorites/favorites.service';
import { ScheduledPushService } from '../../src/modules/notifications/scheduled-push.service';
import { PushTokensService } from '../../src/modules/notifications/push-tokens.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

/**
 * LES FAVORIS ATTEIGNENT-ILS LES CAMPAGNES, SUR UNE VRAIE BASE ? (21/11/2026)
 *
 * Un lieu piloté par Flaix n'a aucune commande BreakEat : ses campagnes
 * partaient vers zéro appareil. Le téléphone copie désormais les favoris du
 * client connecté, et le ciblage devient « a commandé OU suit ce lieu ».
 *
 * Ce que seul un vrai Postgres dit : la table en UUID accepte les clés réelles,
 * la jointure sur le club filtre bien, et un favori d'un AUTRE club ne passe
 * jamais.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('favoris et ciblage des campagnes (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const favoris = url ? new FavoritesService(s.prisma) : (null as never);
  const campagnes = url
    ? new ScheduledPushService(s.prisma, {} as never, new PushTokensService(s.prisma), {} as never)
    : (null as never);

  let club: Awaited<ReturnType<typeof creerOrganisationComplete>>;
  let autreClub: Awaited<ReturnType<typeof creerOrganisationComplete>>;
  let fan: string;
  let fanAilleurs: string;

  async function client(nom: string, jeton: string): Promise<string> {
    const u = await s.prisma.user.create({
      data: { email: `${unique(nom)}@test.fr`, passwordHash: 'x', displayName: nom },
    });
    await s.prisma.pushToken.create({ data: { userId: u.id, token: jeton, platform: 'ios' } });
    return u.id;
  }

  beforeAll(async () => {
    const sa = await s.prisma.user.create({
      data: {
        email: `${unique('sa')}@test.fr`,
        passwordHash: 'x',
        displayName: 'SA',
        globalRole: 'SUPER_ADMIN',
      },
    });
    club = await creerOrganisationComplete(s.prisma, unique('club-flaix'), sa.id);
    autreClub = await creerOrganisationComplete(s.prisma, unique('autre-club'), sa.id);
    fan = await client('fan', `ExponentPushToken[${unique('fan')}]`);
    fanAilleurs = await client('fan-ailleurs', `ExponentPushToken[${unique('ailleurs')}]`);
  });

  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  it('un lieu SANS commande atteint ceux qui le suivent', async () => {
    await favoris.remplacer(fan, [club.venue.id]);
    await favoris.remplacer(fanAilleurs, [autreClub.venue.id]);

    const parLieu = await campagnes['destinataires'](club.org.id, null, club.venue.id);
    const parClub = await campagnes['destinataires'](club.org.id, null, null);
    const parMatch = await campagnes['destinataires'](club.org.id, club.event.id, null);

    for (const r of [parLieu, parClub, parMatch]) {
      expect(r.userIds).toContain(fan);
      // Un favori d'un autre club ne passe JAMAIS.
      expect(r.userIds).not.toContain(fanAilleurs);
      expect(r.tokens).toHaveLength(1);
    }
  });

  it('retirer le favori retire le client de la campagne', async () => {
    await favoris.remplacer(fan, []);
    const r = await campagnes['destinataires'](club.org.id, null, club.venue.id);
    expect(r.userIds).not.toContain(fan);
  });

  it('renvoyer la même liste ne crée pas de doublon', async () => {
    await favoris.remplacer(fan, [club.venue.id]);
    await favoris.remplacer(fan, [club.venue.id, club.venue.id]);
    expect(await s.prisma.venueFavorite.count({ where: { userId: fan } })).toBe(1);
  });

  it('un lieu inconnu est écarté sans faire tomber le reste', async () => {
    const r = await favoris.remplacer(fan, [
      club.venue.id,
      '00000000-0000-4000-8000-000000000000',
    ]);
    expect(r.venueIds).toEqual([club.venue.id]);
  });

  it('la suppression du lieu emporte ses favoris', async () => {
    // Un lieu neuf, sans événement ni comptoir : rien d'autre ne le retient.
    const ephemere = await s.prisma.venue.create({
      data: {
        organizationId: autreClub.org.id,
        name: unique('lieu-ephemere'),
        address: '2 rue du Test',
      },
    });
    await favoris.remplacer(fanAilleurs, [ephemere.id]);
    expect(await s.prisma.venueFavorite.count({ where: { venueId: ephemere.id } })).toBe(1);

    await s.prisma.venue.delete({ where: { id: ephemere.id } });
    expect(await s.prisma.venueFavorite.count({ where: { venueId: ephemere.id } })).toBe(0);
  });
});
