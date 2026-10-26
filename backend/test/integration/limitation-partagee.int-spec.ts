import { Redis } from 'ioredis';
import { LimitationRedis } from '../../src/common/securite/limitation-redis';

/**
 * LES COMPTEURS DE LIMITATION SONT-ILS PARTAGÉS ENTRE LES INSTANCES ?
 *
 * En mémoire, chaque instance a les siens. Deux conséquences, opposées et
 * toutes deux fâcheuses :
 *
 *   • la limite est MULTIPLIÉE par le nombre d'instances — 8 tentatives de
 *     mot de passe par quart d'heure deviennent 16 avec deux replicas, et il
 *     suffit de changer d'instance pour repartir à zéro ;
 *   • un redéploiement efface les blocages au moment précis où ils servaient.
 *
 * Aucune doublure ne répond à cette question : il faut deux instances de
 * stockage distinctes, branchées sur le même Redis, et vérifier qu'elles
 * comptent ENSEMBLE.
 *
 * La suite s'IGNORE sans `REDIS_URL_TEST`, comme les autres : on ne fait
 * jamais échouer quelqu'un qui n'a pas monté l'infrastructure.
 */
const url = process.env.REDIS_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('limitation de débit partagée (Redis réel)', () => {
  let a: LimitationRedis;
  let b: LimitationRedis;
  let menage: Redis;

  beforeAll(() => {
    // DEUX clients distincts : ils représentent deux instances de l'API.
    a = new LimitationRedis(new Redis(url as string));
    b = new LimitationRedis(new Redis(url as string));
    menage = new Redis(url as string);
  });

  afterAll(async () => {
    await Promise.allSettled([a.fermer(), b.fermer(), menage.quit()]);
  });

  /** Une clé neuve par test : les compteurs ne doivent pas se croiser. */
  const cle = () => `essai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it('deux instances comptent sur le MÊME compteur', async () => {
    const k = cle();

    const premier = await a.increment(k, 60_000, 10, 0, 'ip');
    const second = await b.increment(k, 60_000, 10, 0, 'ip');
    const troisieme = await a.increment(k, 60_000, 10, 0, 'ip');

    // En mémoire, `b` aurait rendu 1 — son propre premier coup.
    expect(premier.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(troisieme.totalHits).toBe(3);
  });

  /**
   * Le cas qui compte vraiment : changer d'instance ne doit pas rendre des
   * tentatives. C'est exactement ce qu'un attaquant essaierait.
   */
  it('changer d’instance ne remet PAS le compteur à zéro', async () => {
    const k = cle();
    for (let i = 0; i < 8; i += 1) {
      await (i % 2 === 0 ? a : b).increment(k, 900_000, 8, 0, 'adresse');
    }

    const suivant = await b.increment(k, 900_000, 8, 0, 'adresse');
    expect(suivant.totalHits).toBe(9);
  });

  it('bloque au-delà de la limite, et le blocage vaut pour les deux', async () => {
    const k = cle();
    for (let i = 0; i < 3; i += 1) {
      await a.increment(k, 60_000, 3, 30_000, 'adresse');
    }

    // Le 4e dépasse : il déclenche le blocage sur l'instance A…
    const depassement = await a.increment(k, 60_000, 3, 30_000, 'adresse');
    expect(depassement.isBlocked).toBe(true);

    // …et l'instance B le voit, sans avoir rien compté elle-même.
    const vuDeB = await b.increment(k, 60_000, 3, 30_000, 'adresse');
    expect(vuDeB.isBlocked).toBe(true);
    expect(vuDeB.timeToBlockExpire).toBeGreaterThan(0);
  });

  /**
   * `ip` et `adresse` ne comptent pas la même chose — un stade entier partage
   * une IP. Les mélanger bloquerait une buvette au coup d'envoi.
   */
  it('les deux compteurs ne se mélangent jamais', async () => {
    const k = cle();
    await a.increment(k, 60_000, 10, 0, 'ip');
    await a.increment(k, 60_000, 10, 0, 'ip');

    const surAdresse = await a.increment(k, 60_000, 10, 0, 'adresse');
    expect(surAdresse.totalHits).toBe(1);
  });

  /**
   * Les unités sont le piège de cette interface : entrées en millisecondes,
   * sorties en secondes. Les confondre fausserait les limites d'un facteur
   * mille sans que rien ne le signale.
   */
  it('rend le délai restant en SECONDES, pas en millisecondes', async () => {
    const { timeToExpire } = await a.increment(cle(), 60_000, 10, 0, 'ip');
    expect(timeToExpire).toBeGreaterThan(0);
    expect(timeToExpire).toBeLessThanOrEqual(60);
  });
});
