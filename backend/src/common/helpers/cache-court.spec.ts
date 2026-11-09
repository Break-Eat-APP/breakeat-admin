import { CACHE_LIEUX_MS_DEFAUT, CacheCourt, dureeCacheLieux } from './cache-court';

/**
 * Le cache de la découverte des lieux. Ce qui compte ici n'est pas qu'il
 * « marche » : c'est qu'il ne serve jamais une lecture périmée au-delà de sa
 * durée, jamais une erreur, et qu'une foule ne déclenche qu'UNE lecture.
 */
describe('CacheCourt', () => {
  let maintenant = 1_000;
  const horloge = () => maintenant;
  beforeEach(() => {
    maintenant = 1_000;
  });

  it('cent requêtes simultanées ne déclenchent qu’une seule lecture', async () => {
    const cache = new CacheCourt<number>(15_000, 500, horloge);
    let lectures = 0;
    const charger = () => new Promise<number>((r) => setTimeout(() => r(++lectures), 5));
    const resultats = await Promise.all(Array.from({ length: 100 }, () => cache.obtenir('lieux', charger)));
    expect(lectures).toBe(1);
    expect(new Set(resultats)).toEqual(new Set([1]));
  });

  it('relit après expiration, pas avant', async () => {
    const cache = new CacheCourt<number>(15_000, 500, horloge);
    let lectures = 0;
    const charger = async () => ++lectures;
    await cache.obtenir('k', charger);
    maintenant += 14_999;
    expect(await cache.obtenir('k', charger)).toBe(1);
    maintenant += 2;
    expect(await cache.obtenir('k', charger)).toBe(2);
  });

  it('n’enregistre pas un échec : la requête suivante réessaie', async () => {
    const cache = new CacheCourt<number>(15_000, 500, horloge);
    await expect(cache.obtenir('k', () => Promise.reject(new Error('base injoignable')))).rejects.toThrow();
    expect(await cache.obtenir('k', async () => 42)).toBe(42);
  });

  it('des clés différentes ne se mélangent pas', async () => {
    const cache = new CacheCourt<string>(15_000, 500, horloge);
    expect(await cache.obtenir('a', async () => 'A')).toBe('A');
    expect(await cache.obtenir('b', async () => 'B')).toBe('B');
    expect(await cache.obtenir('a', async () => 'autre')).toBe('A');
  });

  it('durée nulle : éteint, chaque appel relit', async () => {
    const cache = new CacheCourt<number>(0, 500, horloge);
    let lectures = 0;
    await cache.obtenir('k', async () => ++lectures);
    await cache.obtenir('k', async () => ++lectures);
    expect(lectures).toBe(2);
    expect(cache.taille).toBe(0);
  });

  it('ne grandit pas sans fin', async () => {
    const cache = new CacheCourt<number>(15_000, 3, horloge);
    for (let i = 0; i < 10; i++) await cache.obtenir(`k${i}`, async () => i);
    expect(cache.taille).toBeLessThanOrEqual(3);
    // les plus récentes sont gardées
    expect(await cache.obtenir('k9', async () => -1)).toBe(9);
  });
});

describe('dureeCacheLieux', () => {
  it('15 secondes par défaut', () => {
    expect(dureeCacheLieux(undefined)).toBe(CACHE_LIEUX_MS_DEFAUT);
    expect(CACHE_LIEUX_MS_DEFAUT).toBe(15_000);
  });
  it('se règle, et 0 éteint', () => {
    expect(dureeCacheLieux('5000')).toBe(5000);
    expect(dureeCacheLieux('0')).toBe(0);
  });
  it('une valeur absurde retombe sur le défaut', () => {
    expect(dureeCacheLieux('-3')).toBe(CACHE_LIEUX_MS_DEFAUT);
    expect(dureeCacheLieux('quinze')).toBe(CACHE_LIEUX_MS_DEFAUT);
    expect(dureeCacheLieux('  ')).toBe(CACHE_LIEUX_MS_DEFAUT);
  });
});
