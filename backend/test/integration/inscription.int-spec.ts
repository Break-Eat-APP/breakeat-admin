import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';
import { UsersService } from '../../src/modules/users/users.service';

/**
 * L'INSCRIPTION — LE CONFLIT, LA PREUVE DES CGU, ET LE NUMÉRO.
 *
 * Trois constats d'audit se règlent au même endroit, et aucun des trois ne
 * pouvait être vu par une doublure :
 *
 *  1. UNE INSCRIPTION CONCURRENTE RENDAIT 500. `create` lit par `findUnique`,
 *     calcule Argon2 — plusieurs dizaines de millisecondes — puis insère. Deux
 *     requêtes franchissent la lecture ensemble sans peine. L'index unique
 *     faisait son travail, mais le `P2002` du perdant remontait au filtre
 *     général : le client lisait « Erreur inconnue » pour une adresse déjà
 *     prise. Il faut DEUX vraies transactions concurrentes pour l'observer.
 *
 *  2. L'ACCEPTATION DES CGU N'ÉTAIT CONSERVÉE NULLE PART. L'écran imposait une
 *     case décochée, mais la réponse ne quittait pas le téléphone. On affirmait
 *     dans les CGU elles-mêmes recueillir l'acceptation à l'inscription.
 *     La contrainte qui tient version et date ensemble est une contrainte de
 *     la base : seule la base peut en témoigner.
 *
 *  3. LE TÉLÉPHONE N'ÉTAIT PAS NORMALISÉ. « 06 12 34 56 78 »,
 *     « +33 6 12 34 56 78 » et « 0033612345678 » sont le même numéro et
 *     donnaient trois valeurs. Ici on vérifie ce qui est ÉCRIT, pas ce que la
 *     fonction rend — c'est la colonne qui compte.
 *
 * S'ignore sans `DATABASE_URL_TEST` : on ne fait jamais échouer quelqu'un qui
 * n'a pas monté l'infrastructure.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('l’inscription (PostgreSQL réel)', () => {
  let prisma: PrismaService;
  let users: UsersService;

  /** Toutes les adresses d'essai portent ce suffixe, et rien d'autre ne le porte. */
  const DOMAINE = '@essai-inscription.invalid';
  const adresse = (quoi: string) => `${quoi}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${DOMAINE}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    users = new UsersService(prisma);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAINE } } });
    await prisma.$disconnect();
  });

  // ─── 1. Deux inscriptions au même instant ───────────────────────

  /**
   * LE TEST QUI MANQUAIT.
   *
   * L'audit le dit : « le test de réinscription concurrente vérifie seulement
   * qu'une requête réussit, pas que l'autre retourne un conflit HTTP
   * compréhensible ». C'est ce « compréhensible » qu'on vérifie — un code 409,
   * pas une erreur Prisma devenue 500.
   */
  it('rend un CONFLIT, pas une erreur serveur, au perdant de la course', async () => {
    const email = adresse('course');

    const [a, b] = await Promise.allSettled([
      users.create({ email, password: 'motdepasse1', firstName: 'Ada', lastName: 'Lovelace' }),
      users.create({ email, password: 'motdepasse2', firstName: 'Ada', lastName: 'Lovelace' }),
    ]);

    const reussies = [a, b].filter((r) => r.status === 'fulfilled');
    const refusees = [a, b].filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    // Un seul compte, c'est l'index unique qui le garantit — il le faisait déjà.
    expect(reussies).toHaveLength(1);
    expect(await prisma.user.count({ where: { email } })).toBe(1);

    // CE QUI CHANGE : la forme du refus.
    expect(refusees).toHaveLength(1);
    const refus: unknown = refusees[0].reason;
    expect(refus).toBeInstanceOf(ConflictException);
    expect((refus as ConflictException).getStatus()).toBe(409);
  });

  /**
   * Le cas SÉQUENTIEL marchait déjà — la lecture préalable l'attrape. On le
   * garde pour que la correction du cas concurrent ne le casse pas : les deux
   * chemins doivent rendre le même refus, sinon le client voit deux messages
   * différents pour la même situation.
   */
  it('rend le même conflit quand l’adresse est déjà prise, sans course', async () => {
    const email = adresse('sequentiel');
    await users.create({ email, password: 'motdepasse1' });

    await expect(users.create({ email, password: 'motdepasse2' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // ─── 2. La preuve des CGU ───────────────────────────────────────

  it('conserve la version des CGU et l’horodate elle-même', async () => {
    const email = adresse('cgu');
    const avant = new Date();

    const cree = await users.create({
      email,
      password: 'motdepasse1',
      cguVersion: 'Version du 19 octobre 2026',
    });

    const enBase = await prisma.user.findUniqueOrThrow({ where: { id: cree.id } });
    expect(enBase.cguVersion).toBe('Version du 19 octobre 2026');
    expect(enBase.cguAcceptedAt).not.toBeNull();

    // LA DATE EST CELLE DU SERVEUR. Un client pourrait envoyer n'importe
    // laquelle — une horloge de téléphone se règle à la main.
    const quand = enBase.cguAcceptedAt as Date;
    expect(quand.getTime()).toBeGreaterThanOrEqual(avant.getTime() - 1000);
    expect(quand.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('laisse les deux colonnes vides quand rien n’est transmis', async () => {
    const cree = await users.create({ email: adresse('sans-cgu'), password: 'motdepasse1' });
    const enBase = await prisma.user.findUniqueOrThrow({ where: { id: cree.id } });
    expect(enBase.cguVersion).toBeNull();
    expect(enBase.cguAcceptedAt).toBeNull();
  });

  /**
   * LA CONTRAINTE, ET PAS SEULEMENT L'INTENTION.
   *
   * Une version sans date ne se situe pas dans le temps ; une date sans
   * version ne dit pas à quoi on a consenti. Ni l'une ni l'autre ne vaudrait
   * comme trace, et l'écart passerait inaperçu — d'où une contrainte de la
   * base plutôt qu'une discipline d'appelant.
   *
   * On insère en SQL BRUT, exprès : le service ne sait pas produire cet état,
   * et c'est bien ce qu'on veut vérifier — que personne ne puisse le produire.
   */
  it('refuse une version sans date, et une date sans version', async () => {
    const moitie = async (colonne: string, valeur: string) => {
      const email = adresse('moitie');
      return prisma.$executeRawUnsafe(
        `INSERT INTO "users" ("id","email","display_name","updated_at","${colonne}")
         VALUES (gen_random_uuid(), $1, 'Essai', NOW(), ${valeur})`,
        email,
      );
    };

    await expect(moitie('cgu_version', `'Version du 19 octobre 2026'`)).rejects.toThrow(
      /users_cgu_complet/,
    );
    await expect(moitie('cgu_accepted_at', 'NOW()')).rejects.toThrow(/users_cgu_complet/);
  });

  // ─── 3. Le téléphone, tel qu'il est ÉCRIT ───────────────────────

  it('écrit le même numéro quelle qu’en soit l’écriture', async () => {
    const ecritures = ['06 12 34 56 78', '+33 6 12 34 56 78', '0033612345678', '612345678'];

    const stockes: Array<string | null> = [];
    for (const ecriture of ecritures) {
      const cree = await users.create({
        email: adresse('tel'),
        password: 'motdepasse1',
        phone: ecriture,
      });
      const enBase = await prisma.user.findUniqueOrThrow({ where: { id: cree.id } });
      stockes.push(enBase.phone);
    }

    expect(new Set(stockes).size).toBe(1);
    expect(stockes[0]).toBe('+33612345678');
  });

  /**
   * CE QUE L'ANCIENNE RÈGLE LAISSAIT ENTRER.
   *
   * `/^\+?[\d\s\-().]{7,20}$/` accepte la ponctuation seule : neuf tirets
   * étaient un numéro valide, et le comptoir héritait d'un champ rempli avec
   * lequel il ne pouvait joindre personne. Le DTO le refuse désormais ; si
   * malgré tout une telle valeur atteignait le service, elle ne doit pas être
   * ÉCRITE comme un numéro.
   */
  it('n’écrit pas un numéro là où il n’y a aucun chiffre', async () => {
    const cree = await users.create({
      email: adresse('ponctuation'),
      password: 'motdepasse1',
      phone: '---------',
    });
    const enBase = await prisma.user.findUniqueOrThrow({ where: { id: cree.id } });
    expect(enBase.phone).toBeNull();
  });

  /**
   * PAS D'UNICITÉ SUR LE TÉLÉPHONE, et c'est un choix.
   *
   * Un foyer partage un fixe ; deux parents partagent un portable. Et un champ
   * NON VÉRIFIÉ rendu unique se retourne en arme : il suffirait de s'inscrire
   * avec le numéro d'un autre pour l'empêcher, lui, de s'inscrire.
   *
   * Ce test existe pour que le jour où quelqu'un ajoutera cette contrainte, il
   * tombe ici et lise pourquoi.
   */
  it('accepte deux comptes sur le même numéro', async () => {
    const numero = '06 99 88 77 66';
    const un = await users.create({ email: adresse('foyer-a'), password: 'motdepasse1', phone: numero });
    const deux = await users.create({ email: adresse('foyer-b'), password: 'motdepasse1', phone: numero });

    const [a, b] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: un.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: deux.id } }),
    ]);
    expect(a.phone).toBe('+33699887766');
    expect(b.phone).toBe('+33699887766');
  });
});
