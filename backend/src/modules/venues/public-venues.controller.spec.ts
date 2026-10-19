import { EventStatus, EventVisibility } from '@prisma/client';
import { PublicVenuesController } from './public-venues.controller';
import type { PrismaService } from '../../database/prisma.service';

// ─── Prisma mock ─────────────────────────────────────────────────
const prisma = {
  venue: { findMany: jest.fn() },
  groupMember: { findMany: jest.fn() },
  // Lu seulement quand un lien Flaix porte des etiquettes a remplir.
  user: { findUnique: jest.fn() },
};

function makeController() {
  return new PublicVenuesController(prisma as unknown as PrismaService);
}

// Un evenement tel que Prisma le rend : avec ses DATES. Les fixtures n'en
// portaient pas, et la resolution du lien Flaix du moment — qui se decide sur
// la date — n'avait rien a lire.
const EV = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'e-pub',
  name: 'Match',
  status: EventStatus.ACTIVE,
  visibility: EventVisibility.PUBLIC,
  startAt: new Date('2026-06-01T18:00:00Z'),
  endAt: new Date('2026-06-01T23:00:00Z'),
  isPermanentContainer: false,
  flaixOrderUrl: null,
  ...over,
});

const PUBLIC_VENUE = {
  id: 'v-pub',
  name: 'Stade Public',
  address: 'Paris',
  latitude: null,
  longitude: null,
  organization: { name: 'Org', logoUrl: null, primaryColor: null },
  events: [EV()],
};
const PRIVATE_VENUE = {
  id: 'v-priv',
  name: 'La Croix Rouge',
  address: 'Lyon',
  latitude: null,
  longitude: null,
  organization: { name: 'Org', logoUrl: null, primaryColor: null },
  events: [EV({ id: 'e-priv', visibility: EventVisibility.PRIVATE })],
};
// Lieu privé dont l'unique événement privé n'est PAS actif (ex. DRAFT) → doit rester masqué.
const PRIVATE_VENUE_DRAFT = {
  id: 'v-priv-draft',
  name: 'Club Confidentiel',
  address: 'Nice',
  latitude: null,
  longitude: null,
  organization: { name: 'Org', logoUrl: null, primaryColor: null },
  events: [EV({ id: 'e-priv-draft', status: EventStatus.DRAFT, visibility: EventVisibility.PRIVATE })],
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
    const res = await makeController().search(undefined, 'palais');

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

    const res = await makeController().search({ sub: 'member-uuid' } as never, 'palais');

    const priv = res.find((v) => v.id === 'v-priv');
    expect(priv).toBeDefined();
    expect(priv?.currentEventId).toBe('e-priv');
  });

  it('non-membre authentifié : le lieu privé reste masqué', async () => {
    (prisma.groupMember.findMany as jest.Mock).mockResolvedValue([
      { group: { events: [{ eventId: 'autre-event' }] } },
    ]);

    const res = await makeController().search({ sub: 'intruder-uuid' } as never, 'palais');

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

  // La proximite ne peut classer que ce qui a une position. Un lieu sans
  // coordonnees n'apparait donc pas par ce chemin — c'est au club de renseigner
  // son GPS. Il reste trouvable par la recherche (test suivant).
  it('geoloc : ecarte les lieux SANS coordonnees', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      { ...PUBLIC_VENUE, id: 'sans-gps', latitude: null, longitude: null },
      { ...PUBLIC_VENUE, id: 'proche', latitude: 43.30, longitude: 5.37 },
    ]);

    const res = await makeController().search(undefined, undefined, '43.30', '5.37', '50');

    expect(res.map((v) => v.id)).toEqual(['proche']);
  });

  // Le filet de securite : un lieu sans GPS reste atteignable en tapant un
  // mot-cle configure par le club sur son dashboard.
  it('recherche : un lieu sans coordonnees reste trouvable', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      { ...PUBLIC_VENUE, id: 'sans-gps', latitude: null, longitude: null },
    ]);

    const res = await makeController().search(undefined, 'spartiates', '43.30', '5.37', '10');

    expect(res.map((v) => v.id)).toEqual(['sans-gps']);
  });

  // Taper un nom est une intention explicite : elle doit primer sur la
  // proximite. Sinon chercher « spartiates » a 400 km ne renvoie rien, alors
  // que le nom correspond exactement.
  it('recherche par nom : la proximite ne filtre plus', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      { ...PUBLIC_VENUE, id: 'loin', latitude: 48.85, longitude: 2.35 },
    ]);

    const res = await makeController().search(undefined, 'spartiates', '43.30', '5.37', '10');

    expect(res.map((v) => v.id)).toEqual(['loin']);
  });

  // Ni position, ni recherche : aucun des deux chemins voulus n'est emprunte.
  // Lister tout le catalogue serait trompeur — un client verrait des clubs a
  // 400 km comme s'ils le concernaient.
  it('sans position ni recherche : ne renvoie rien', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      { ...PUBLIC_VENUE, id: 'v1', latitude: 43.30, longitude: 5.37 },
    ]);

    const res = await makeController().search(undefined);

    expect(res).toEqual([]);
  });

  // La PHOTO du lieu et le LOGO du club sont deux champs distincts, et l'app
  // ne les cadre pas pareil (voir `visuel-lieu.ts`). Les confondre — ce que
  // faisait l'API, qui ne renvoyait que le logo sous le nom `imageUrl` —
  // affichait un ecusson etire sur toute la largeur de la carte.
  it('renvoie la photo du lieu ET le logo du club, separement', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      {
        ...PUBLIC_VENUE,
        photoUrl: 'https://img/stade.jpg',
        organization: { name: 'Org', logoUrl: 'https://img/ecusson.png', primaryColor: null },
      },
    ]);

    const [v] = await makeController().search(undefined, 'stade');

    expect(v.photoUrl).toBe('https://img/stade.jpg');
    expect(v.imageUrl).toBe('https://img/ecusson.png');
  });

  it('un lieu sans photo renvoie null — a l’app de retomber sur le logo', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      {
        ...PUBLIC_VENUE,
        photoUrl: null,
        organization: { name: 'Org', logoUrl: 'https://img/ecusson.png', primaryColor: null },
      },
    ]);

    const [v] = await makeController().search(undefined, 'stade');

    expect(v.photoUrl).toBeNull();
    expect(v.imageUrl).toBe('https://img/ecusson.png');
  });

  // ─── Le lien Flaix du moment ────────────────────────────────
  //
  // Le geste qu'on remplace : aller changer LE lien unique du lieu avant
  // chaque match. Desormais chaque evenement porte le sien et c'est la DATE
  // qui tranche. Se tromper ici, c'est envoyer le public de samedi sur la
  // page de mardi.

  const LIEU_FLAIX = {
    ...PUBLIC_VENUE,
    id: 'v-flaix',
    flaixEnabled: true,
    // Le lien ouvre a 8 h, heure de Paris, le jour du match.
    ordersOpenAt: '08:00',
    timezone: 'Europe/Paris',
  };
  const COMMANDE = 'https://ops.flaixlabs.com/commande/samedi';

  it('ouvre le lien de l’evenement EN COURS', async () => {
    const debut = new Date(Date.now() - 60 * 60_000);
    const fin = new Date(Date.now() + 2 * 60 * 60_000);
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      { ...LIEU_FLAIX, events: [EV({ startAt: debut, endAt: fin, flaixOrderUrl: COMMANDE })] },
    ]);

    const [v] = await makeController().search(undefined, 'stade');

    expect(v.flaixOrderUrl).toBe(COMMANDE);
    expect(v.commandeOuvreA).toBeNull();
  });

  it('avant l’heure d’acces : pas de lien, mais l’HEURE d’ouverture', async () => {
    // « Ouvre a 8 h » fait revenir le client. « Ferme » ne le fait pas.
    // Un match DEMAIN : son lien n'ouvrira qu'au matin.
    const demain = new Date(Date.now() + 24 * 60 * 60_000);
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      {
        ...LIEU_FLAIX,
        events: [
          EV({
            startAt: demain,
            endAt: new Date(demain.getTime() + 3 * 60 * 60_000),
            flaixOrderUrl: COMMANDE,
          }),
        ],
      },
    ]);

    const [v] = await makeController().search(undefined, 'stade');

    expect(v.flaixOrderUrl).toBeNull();
    // L'heure exacte depend du fuseau : on verifie qu'elle est ANNONCEE, et
    // qu'elle tombe avant le coup d'envoi. Figer « 06:00Z » ferait tomber le
    // test a chaque changement d'heure.
    expect(v.commandeOuvreA).not.toBeNull();
    expect(new Date(v.commandeOuvreA as string).getTime()).toBeLessThanOrEqual(demain.getTime());
  });

  it('le lien d’un evenement PRIVE inaccessible ne fuit pas', async () => {
    // Sans ce filtre, l'adresse de commande d'une soiree reservee se lirait
    // dans la reponse publique — il suffirait de la coller dans un navigateur.
    const debut = new Date(Date.now() - 60 * 60_000);
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      {
        ...LIEU_FLAIX,
        events: [
          EV({
            id: 'e-prive',
            visibility: EventVisibility.PRIVATE,
            startAt: debut,
            endAt: new Date(Date.now() + 60 * 60_000),
            flaixOrderUrl: COMMANDE,
          }),
          EV({ id: 'e-pub-sans-lien', startAt: debut, endAt: new Date(Date.now() + 60 * 60_000) }),
        ],
      },
    ]);

    const [v] = await makeController().search(undefined, 'stade');

    expect(v.flaixOrderUrl).toBeNull();
  });

  it('un lieu NON bascule en Flaix n’ouvre aucun lien, meme deja colle', async () => {
    // UN interrupteur commande tout le relais : coller les liens de la saison
    // d'avance ne doit rien changer tant que le club n'a pas bascule.
    const debut = new Date(Date.now() - 60 * 60_000);
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      {
        ...LIEU_FLAIX,
        flaixEnabled: false,
        events: [
          EV({
            startAt: debut,
            endAt: new Date(Date.now() + 60 * 60_000),
            flaixOrderUrl: COMMANDE,
          }),
        ],
      },
    ]);

    const [v] = await makeController().search(undefined, 'stade');

    expect(v.flaixOrderUrl).toBeNull();
  });

  it('annonce le prochain evenement, Flaix ou non', async () => {
    const debut = new Date(Date.now() + 48 * 60 * 60_000);
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      {
        ...PUBLIC_VENUE,
        events: [
          EV({
            id: 'e-samedi',
            name: 'OM - Lyon',
            startAt: debut,
            endAt: new Date(debut.getTime() + 3 * 60 * 60_000),
          }),
        ],
      },
    ]);

    const [v] = await makeController().search(undefined, 'stade');

    expect(v.prochainEvenement).toEqual({
      id: 'e-samedi',
      name: 'OM - Lyon',
      startAt: debut.toISOString(),
    });
  });

  // ─── L'identite du client dans le lien ──────────────────────
  //
  // Le club colle un lien herite de son ancien back-office, avec des
  // etiquettes a remplir. Sans remplacement, Flaix recoit « [#firstname] » —
  // et, pire, le « # » tronque tout ce qui suit.

  it('remplit les etiquettes avec l’identite du client connecte', async () => {
    const debut = new Date(Date.now() - 60 * 60_000);
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      {
        ...LIEU_FLAIX,
        events: [
          EV({
            startAt: debut,
            endAt: new Date(Date.now() + 60 * 60_000),
            flaixOrderUrl:
              'https://commande.flaix.bo.synertic.net/o/x?firstname=[#firstname]&mail=[#mail]',
          }),
        ],
      },
    ]);
    (prisma.groupMember.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      firstName: 'Remi',
      lastName: 'Notta',
      email: 'remi@example.com',
      phone: null,
      displayName: 'Remi Notta',
    });

    const [v] = await makeController().search({ sub: 'u1' } as never, 'stade');

    expect(v.flaixOrderUrl).toBe(
      'https://commande.flaix.bo.synertic.net/o/x?firstname=Remi&mail=remi%40example.com',
    );
  });

  it('un visiteur ANONYME obtient l’adresse nue, sans etiquette', async () => {
    const debut = new Date(Date.now() - 60 * 60_000);
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      {
        ...LIEU_FLAIX,
        events: [
          EV({
            startAt: debut,
            endAt: new Date(Date.now() + 60 * 60_000),
            flaixOrderUrl:
              'https://commande.flaix.bo.synertic.net/o/x?firstname=[#firstname]&mail=[#mail]',
          }),
        ],
      },
    ]);

    const [v] = await makeController().search(undefined, 'stade');

    expect(v.flaixOrderUrl).toBe('https://commande.flaix.bo.synertic.net/o/x');
    // Et on n'est pas alle chercher une identite qui n'existe pas.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('un lien SANS etiquette ne declenche aucune lecture d’identite', async () => {
    // Une requete de moins a chaque frappe au clavier.
    const debut = new Date(Date.now() - 60 * 60_000);
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      {
        ...LIEU_FLAIX,
        events: [
          EV({ startAt: debut, endAt: new Date(Date.now() + 60 * 60_000), flaixOrderUrl: COMMANDE }),
        ],
      },
    ]);
    (prisma.groupMember.findMany as jest.Mock).mockResolvedValue([]);

    const [v] = await makeController().search({ sub: 'u1' } as never, 'stade');

    expect(v.flaixOrderUrl).toBe(COMMANDE);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

/**
 * UN LIEU PAR SON IDENTIFIANT — ce qui rend une tuile de favori cliquable.
 *
 * La liste ne suffit pas : un favori peut etre hors du rayon, ou avoir
 * disparu de l'ecran parce qu'une recherche est en cours. Ce qui compte ici,
 * c'est que cette seconde porte n'en soit pas une derobee : les regles de
 * confidentialite doivent valoir mot pour mot.
 */
describe('PublicVenuesController — un lieu par son identifiant', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rend le lieu demande, avec les memes champs que la liste', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([PUBLIC_VENUE]);

    const lieu = await makeController().parId('v-pub');

    expect(lieu.id).toBe('v-pub');
    expect(lieu.name).toBe('Stade Public');
    // La cible de navigation : sans elle, ouvrir le favori ne menerait
    // nulle part, ce qui etait precisement le defaut a corriger.
    expect(lieu.currentEventId).toBe('e-pub');
  });

  it('ne filtre PAS sur la distance : un favori lointain s’ouvre quand meme', async () => {
    // Le cas qui a motive la route. Le lieu est a 400 km, donc absent de la
    // liste de proximite ; sa tuile de favori, elle, est a l’ecran.
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([
      { ...PUBLIC_VENUE, latitude: 43.3, longitude: 5.4 },
    ]);

    const lieu = await makeController().parId('v-pub', undefined, '48.86', '2.35');

    expect(lieu.id).toBe('v-pub');
    expect(lieu.distanceKm).toBeGreaterThan(300);
  });

  it('un lieu PRIVE inaccessible repond 404, pas son contenu', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([PRIVATE_VENUE]);

    // 404 et non 403 : « interdit » confirmerait l’existence du lieu a qui
    // essaie des identifiants au hasard.
    await expect(makeController().parId('v-priv')).rejects.toThrow('Lieu introuvable.');
  });

  it('… mais un membre du groupe l’obtient', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([PRIVATE_VENUE]);
    (prisma.groupMember.findMany as jest.Mock).mockResolvedValue([
      { group: { events: [{ eventId: 'e-priv' }] } },
    ]);

    const lieu = await makeController().parId('v-priv', { sub: 'u-1' } as never);

    expect(lieu.id).toBe('v-priv');
  });

  it('un identifiant inconnu repond 404', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([]);

    await expect(makeController().parId('v-fantome')).rejects.toThrow('Lieu introuvable.');
  });

  it('ne lit QUE le lieu demande, et seulement s’il est en service', async () => {
    (prisma.venue.findMany as jest.Mock).mockResolvedValue([PUBLIC_VENUE]);

    await makeController().parId('v-pub');

    // Un club suspendu ne doit pas se laisser ouvrir par son identifiant : la
    // meme clause que la liste est posee ici, sinon la suspension ne tiendrait
    // qu’a moitie.
    const where = (prisma.venue.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toBe('v-pub');
    expect(where.status).toBe('ACTIVE');
    expect(where.organization).toBeDefined();
  });
});
