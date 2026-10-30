import { FlagScope } from '@prisma/client';
import { PrismaService } from '../../src/database/prisma.service';
import { FeatureFlagsService } from '../../src/modules/feature-flags/feature-flags.service';
import { AppSettingsService } from '../../src/modules/app-settings/app-settings.service';

/**
 * L'INTERRUPTEUR GLOBAL — celui qui coupe l'ardoise.
 *
 * `app.split.enabled` arrête la fonction qui REMBOURSE de l'argent encaissé.
 * On a tenu à pouvoir l'arrêter en secondes sans redéployer. Deux choses
 * l'empêchaient, et aucune ne pouvait être vue par une doublure :
 *
 *  1. LE POSER NE MARCHAIT PAS DU TOUT. Les services écrivaient par `upsert`
 *     sur la clé composée `(key, scope, scopeId)` avec
 *     `(scopeId ?? null) as string`. Le cast fait taire TypeScript ; Prisma
 *     valide au runtime et refuse — « Argument `scopeId` must not be null ».
 *     L'API répondait 500.
 *
 *  2. ET RIEN NE GARANTISSAIT L'UNICITÉ. Dans PostgreSQL, deux NULL sont
 *     DISTINCTS pour une contrainte d'unicité : deux lignes
 *     `('app.split.enabled', 'GLOBAL', NULL)` pouvaient coexister, l'une à
 *     `true` et l'autre à `false`. Le lecteur fait `findFirst` sans ordre :
 *     l'interrupteur devenait un tirage au sort, définitivement.
 *
 * ── POURQUOI CES TESTS SONT D'INTÉGRATION, ET NE PEUVENT PAS NE PAS L'ÊTRE ──
 *
 * Les suites unitaires doublent `upsert` par un `jest.fn()`, qui accepte tout.
 * Le test « upserts a global flag » passait au vert pendant que le vrai chemin
 * levait. Et la sémantique des NULL dans un index unique est un comportement
 * de PostgreSQL : aucune doublure ne peut en témoigner.
 *
 * S'ignore sans `DATABASE_URL_TEST`, comme les autres : on ne fait jamais
 * échouer quelqu'un qui n'a pas monté l'infrastructure.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('les interrupteurs GLOBAUX (PostgreSQL réel)', () => {
  let prisma: PrismaService;
  let flags: FeatureFlagsService;
  let reglages: AppSettingsService;
  const CLE = 'essai.interrupteur.global';

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    flags = new FeatureFlagsService(prisma);
    reglages = new AppSettingsService(prisma);
  });

  afterAll(async () => {
    await prisma.featureFlag.deleteMany({ where: { key: CLE } });
    await prisma.appSetting.deleteMany({ where: { key: CLE } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.featureFlag.deleteMany({ where: { key: CLE } });
    await prisma.appSetting.deleteMany({ where: { key: CLE } });
  });

  // ─── 1. Le poser tout simplement ────────────────────────────────

  /**
   * LE TEST QUI MANQUAIT. Il échoue sur l'ancien code avec
   * « Argument `scopeId` must not be null » — pas sur une valeur fausse, sur
   * un refus net.
   */
  it('se POSE, tout simplement', async () => {
    const pose = await flags.set({ key: CLE, scope: FlagScope.GLOBAL, enabled: true });

    expect(pose.enabled).toBe(true);
    expect(pose.scopeId).toBeNull();
    expect(await flags.resolve(CLE)).toBe(true);
  });

  it('se BASCULE, et la lecture suit', async () => {
    await flags.set({ key: CLE, scope: FlagScope.GLOBAL, enabled: true });
    expect(await flags.resolve(CLE)).toBe(true);

    await flags.set({ key: CLE, scope: FlagScope.GLOBAL, enabled: false });

    expect(await flags.resolve(CLE)).toBe(false);
    // Et une seule ligne : basculer ne doit pas en ajouter une seconde.
    expect(await prisma.featureFlag.count({ where: { key: CLE } })).toBe(1);
  });

  it('le réglage global se pose aussi', async () => {
    const pose = await reglages.set({
      key: CLE,
      scope: FlagScope.GLOBAL,
      value: { actif: true },
    });

    expect(pose.scopeId).toBeNull();
    expect(pose.value).toEqual({ actif: true });
    expect(await prisma.appSetting.count({ where: { key: CLE } })).toBe(1);
  });

  // ─── 2. L'unicité, que seul PostgreSQL peut dire ────────────────

  /**
   * DEUX EXPLOITANTS QUI BASCULENT EN MÊME TEMPS.
   *
   * C'est le scénario d'un soir de match : on appelle le collègue, et tous
   * deux coupent l'ardoise. Sans l'index partiel, chacun écrivait SA ligne et
   * la lecture suivante tirait au sort.
   *
   * Les deux doivent réussir — « le dernier qui parle a raison » est la
   * sémantique d'un interrupteur — et il ne doit rester qu'UNE ligne.
   */
  it('deux écritures SIMULTANÉES ne laissent qu’UNE ligne', async () => {
    const resultats = await Promise.allSettled([
      flags.set({ key: CLE, scope: FlagScope.GLOBAL, enabled: true }),
      flags.set({ key: CLE, scope: FlagScope.GLOBAL, enabled: false }),
    ]);

    // Aucune des deux ne doit échouer : personne ne doit recevoir une erreur
    // en basculant un interrupteur.
    const refusees = resultats.filter((r) => r.status === 'rejected');
    expect(refusees).toEqual([]);

    expect(await prisma.featureFlag.count({ where: { key: CLE } })).toBe(1);
  });

  it('dix écritures simultanées non plus', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        flags.set({ key: CLE, scope: FlagScope.GLOBAL, enabled: i % 2 === 0 }),
      ),
    );

    expect(await prisma.featureFlag.count({ where: { key: CLE } })).toBe(1);
  });

  /**
   * ET LA BASE REFUSE D'ELLE-MÊME, sans passer par le service.
   *
   * C'est la propriété qu'on achète avec l'index partiel : du SQL à la main,
   * un semis, ou un futur chemin de code qui oublierait la règle se heurtent
   * au même mur.
   */
  it('la BASE refuse un second interrupteur global de même clé', async () => {
    await prisma.featureFlag.create({
      data: { key: CLE, scope: FlagScope.GLOBAL, scopeId: null, enabled: true },
    });

    await expect(
      prisma.featureFlag.create({
        data: { key: CLE, scope: FlagScope.GLOBAL, scopeId: null, enabled: false },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('la BASE refuse aussi un second réglage global de même clé', async () => {
    await prisma.appSetting.create({
      data: { key: CLE, scope: FlagScope.GLOBAL, scopeId: null, value: { a: 1 } },
    });

    await expect(
      prisma.appSetting.create({
        data: { key: CLE, scope: FlagScope.GLOBAL, scopeId: null, value: { a: 2 } },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  // ─── 3. Les portées nommées ne doivent pas avoir bougé ──────────

  /**
   * L'index partiel est AJOUTÉ, pas substitué : le chemin `upsert` des portées
   * nommées fonctionnait et doit continuer. Prisma y émet un
   * `ON CONFLICT (key, scope, scope_id)` qui a besoin de l'index d'origine.
   */
  it('une portée ORGANISATION s’écrit toujours par la clé composée', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Essai interrupteurs', slug: `essai-int-${Date.now()}`, status: 'ACTIVE' },
    });

    await flags.set({
      key: CLE,
      scope: FlagScope.ORGANIZATION,
      scopeId: org.id,
      enabled: true,
    });
    await flags.set({
      key: CLE,
      scope: FlagScope.ORGANIZATION,
      scopeId: org.id,
      enabled: false,
    });

    const lignes = await prisma.featureFlag.findMany({ where: { key: CLE } });
    expect(lignes).toHaveLength(1);
    expect(lignes[0].enabled).toBe(false);

    await prisma.featureFlag.deleteMany({ where: { key: CLE } });
    await prisma.organization.delete({ where: { id: org.id } });
  });

  /**
   * Et une portée nommée COEXISTE avec la globale : l'index partiel ne vise
   * que les lignes à `scope_id` nul. Sans cela, on aurait cassé la résolution
   * en cascade — événement, puis organisation, puis global.
   */
  it('une portée nommée coexiste avec l’interrupteur global', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Essai coexistence', slug: `essai-co-${Date.now()}`, status: 'ACTIVE' },
    });

    await flags.set({ key: CLE, scope: FlagScope.GLOBAL, enabled: false });
    await flags.set({
      key: CLE,
      scope: FlagScope.ORGANIZATION,
      scopeId: org.id,
      enabled: true,
    });

    expect(await prisma.featureFlag.count({ where: { key: CLE } })).toBe(2);
    // L'organisation l'emporte sur le global, comme la cascade le promet.
    expect(await flags.resolve(CLE, { orgId: org.id })).toBe(true);
    expect(await flags.resolve(CLE)).toBe(false);

    await prisma.featureFlag.deleteMany({ where: { key: CLE } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
