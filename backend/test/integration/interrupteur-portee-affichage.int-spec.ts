import { FlagScope } from '@prisma/client';
import { PrismaService } from '../../src/database/prisma.service';
import { FeatureFlagsService } from '../../src/modules/feature-flags/feature-flags.service';
import { OrderSplitsService } from '../../src/modules/order-splits/order-splits.service';

/**
 * L'INTERRUPTEUR DE L'ARDOISE, VU PAR L'APPLICATION.
 *
 * Le serveur sait résoudre une portée ÉVÉNEMENT, puis ORGANISATION, puis
 * GLOBALE. `ouvrir` s'en sert : il charge le panier, en tire le club et
 * l'événement, et autorise en conséquence.
 *
 * Mais la route qui décide de l'AFFICHAGE du bouton ne passait aucune portée.
 * L'application ne connaît que l'événement, et l'ignorait aussi. Résultat, les
 * deux se contredisaient :
 *
 *   · ardoise ACTIVÉE pour un club, globalement coupée → le serveur accepte,
 *     le bouton reste caché. Une fonction activée, et invisible.
 *   · ardoise COUPÉE pour un club, globalement active → le bouton s'affiche,
 *     et le refus n'arrive qu'au clic, sur un panier déjà composé.
 *
 * ── POURQUOI D'INTÉGRATION ──────────────────────────────────────
 *
 * La résolution par portée lit trois lignes dans `feature_flags`, et la
 * remontée de l'organisation depuis l'événement est une jointure. Doubler
 * Prisma ne prouverait que l'ordre des appels qu'on a écrit soi-même — pas que
 * la bonne ligne gagne.
 *
 * S'ignore sans `DATABASE_URL_TEST`.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

const CLE = 'app.split.enabled';

decrire('la portée de l’interrupteur à l’affichage (PostgreSQL réel)', () => {
  let prisma: PrismaService;
  let flags: FeatureFlagsService;
  let service: OrderSplitsService;
  let orgId: string;
  let eventId: string;
  let autreEventId: string;

  const slug = `portee-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    flags = new FeatureFlagsService(prisma);

    /**
     * LA VARIABLE D'ENVIRONNEMENT RÉPOND « NON ».
     *
     * C'est le défaut quand aucun flag n'existe, et il compte : il permet de
     * distinguer « personne n'a rien décidé » d'« un flag dit non ».
     *
     * Stripe et le service de commandes ne sont pas montés : `estActive` et
     * `estActivePourAffichage` n'y touchent pas. `null` plutôt qu'une doublure
     * complaisante — si un jour ce chemin les appelle, il doit tomber ici,
     * bruyamment, et pas rendre une réponse inventée.
     */
    const config = { get: () => false } as never;
    service = new OrderSplitsService(prisma, null as never, null as never, config, flags);

    const org = await prisma.organization.create({
      data: { name: `Club ${slug}`, slug },
    });
    orgId = org.id;

    const venue = await prisma.venue.create({
      data: { organizationId: orgId, name: `Stade ${slug}`, address: '1 rue du Stade' },
    });

    const match = await prisma.event.create({
      data: {
        organizationId: orgId,
        venueId: venue.id,
        name: 'OM – Nice',
        startAt: new Date('2026-09-20T19:00:00Z'),
        endAt: new Date('2026-09-20T21:00:00Z'),
      },
    });
    eventId = match.id;

    const autre = await prisma.event.create({
      data: {
        organizationId: orgId,
        venueId: venue.id,
        name: 'OM – Lyon',
        startAt: new Date('2026-09-27T19:00:00Z'),
        endAt: new Date('2026-09-27T21:00:00Z'),
      },
    });
    autreEventId = autre.id;
  });

  afterAll(async () => {
    await prisma.featureFlag.deleteMany({ where: { key: CLE, scopeId: { in: [eventId, autreEventId, orgId] } } });
    await prisma.event.deleteMany({ where: { organizationId: orgId } });
    await prisma.venue.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.featureFlag.deleteMany({
      where: { key: CLE, scopeId: { in: [eventId, autreEventId, orgId] } },
    });
    // Les lignes GLOBALES de cette clé n'appartiennent pas à ce test : on ne
    // les touche pas, et on ne s'appuie pas sur leur absence — les assertions
    // ci-dessous portent sur un ÉCART entre deux portées, pas sur une valeur
    // absolue.
  });

  // ─── Le défaut, dans les deux sens ──────────────────────────────

  /**
   * LE CAS QUI RENDAIT UNE FONCTION ACTIVÉE INVISIBLE.
   *
   * Avant : `estActive()` sans portée ne voyait que le global, donc `false`.
   * Le bouton restait caché alors qu'`ouvrir` aurait accepté.
   */
  it('voit l’interrupteur posé sur L’ÉVÉNEMENT', async () => {
    await flags.set({ key: CLE, scope: FlagScope.EVENT, scopeId: eventId, enabled: true });

    expect(await service.estActivePourAffichage(eventId)).toBe(true);
    // Sans l'événement, la même question ne voit toujours que le global.
    expect(await service.estActivePourAffichage(undefined)).toBe(false);
  });

  /**
   * LE CAS INVERSE : un bouton visible qui refuse au clic.
   *
   * Le club a coupé l'ardoise pour cet événement ; sans la portée, l'affichage
   * suivait le global et montrait le bouton. Le client composait son panier
   * avant de l'apprendre.
   */
  it('voit l’interrupteur COUPÉ sur l’événement, là où le global dit oui', async () => {
    await flags.set({ key: CLE, scope: FlagScope.GLOBAL, enabled: true });
    await flags.set({ key: CLE, scope: FlagScope.EVENT, scopeId: eventId, enabled: false });

    try {
      expect(await service.estActivePourAffichage(eventId)).toBe(false);
      // L'autre match du même club n'est pas concerné : il suit le global.
      expect(await service.estActivePourAffichage(autreEventId)).toBe(true);
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: CLE, scope: FlagScope.GLOBAL } });
    }
  });

  it('retombe sur la portée du CLUB quand l’événement ne dit rien', async () => {
    await flags.set({ key: CLE, scope: FlagScope.ORGANIZATION, scopeId: orgId, enabled: true });

    expect(await service.estActivePourAffichage(eventId)).toBe(true);
    expect(await service.estActivePourAffichage(autreEventId)).toBe(true);
    expect(await service.estActivePourAffichage(undefined)).toBe(false);
  });

  /**
   * L'ÉVÉNEMENT L'EMPORTE SUR LE CLUB. C'est l'ordre annoncé — événement, puis
   * club, puis global — et c'est ce qui permet de couper UN match sans couper
   * la saison.
   */
  it('fait gagner l’événement sur le club', async () => {
    await flags.set({ key: CLE, scope: FlagScope.ORGANIZATION, scopeId: orgId, enabled: true });
    await flags.set({ key: CLE, scope: FlagScope.EVENT, scopeId: eventId, enabled: false });

    expect(await service.estActivePourAffichage(eventId)).toBe(false);
    expect(await service.estActivePourAffichage(autreEventId)).toBe(true);
  });

  // ─── Ce qui ne doit RIEN casser ─────────────────────────────────

  /**
   * UN IDENTIFIANT INCONNU NE CACHE RIEN NI N'OUVRE RIEN.
   *
   * Cette route décide d'un AFFICHAGE ; elle ne garde aucune action. Refuser
   * sur un identifiant inconnu cacherait le bouton pour une faute de frappe,
   * alors que `assertActive` — qui travaille sur un panier dont l'événement
   * existe forcément — reste seul à autoriser ou refuser.
   */
  it('répond la portée globale sur un événement inconnu', async () => {
    const inexistant = '00000000-0000-0000-0000-000000000000';
    expect(await service.estActivePourAffichage(inexistant)).toBe(false);

    await flags.set({ key: CLE, scope: FlagScope.GLOBAL, enabled: true });
    try {
      expect(await service.estActivePourAffichage(inexistant)).toBe(true);
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: CLE, scope: FlagScope.GLOBAL } });
    }
  });

  /**
   * LA PAGE DES CONVIVES N'A PAS D'ÉVÉNEMENT EN MAIN.
   *
   * Elle s'ouvre depuis un lien reçu par message. L'argument doit donc rester
   * facultatif, et l'absence doit se comporter comme avant.
   */
  it('accepte de répondre sans événement du tout', async () => {
    await expect(service.estActivePourAffichage()).resolves.toBe(false);
    await expect(service.estActivePourAffichage('')).resolves.toBe(false);
  });
});
