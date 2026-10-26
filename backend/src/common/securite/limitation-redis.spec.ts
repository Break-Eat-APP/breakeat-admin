import { LimitationRedis } from './limitation-redis';

/**
 * QUAND REDIS TOMBE EN PLEIN SERVICE.
 *
 * Ce fichier affirmait qu'une panne Redis laissait passer les requêtes avec
 * une limitation dégradée. C'était FAUX : `increment` attendait le script Lua
 * sans rien rattraper, et le garde Throttler attend cette promesse
 * directement. Redis coupé un soir de match, et toutes les routes protégées
 * renvoyaient une erreur — la connexion comprise.
 *
 * Un commentaire qui promet une propriété que le code n'a pas est pire qu'une
 * absence de commentaire : on cesse de vérifier. Ces tests sont là pour que
 * la promesse et le code ne puissent plus diverger.
 *
 * Les trois choses qui se décident ici :
 *
 *  · ON NE COUPE PAS LA VENTE pour protéger un compteur ;
 *  · ON NE LAISSE PAS TOUT PASSER non plus — une panne Redis ne doit pas
 *    ouvrir la porte à l'essai de mots de passe ;
 *  · ON REVIENT TOUT SEUL quand Redis répond de nouveau, sans redémarrage.
 */
describe('la limitation quand Redis lâche', () => {
  /** Un faux Redis dont on pilote la réponse coup par coup. */
  function fauxRedis() {
    const etat = { enPanne: false, appels: 0 };
    const redis = {
      defineCommand: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
      limiter: jest.fn(async () => {
        etat.appels += 1;
        if (etat.enPanne) throw new Error('Connection is closed.');
        // [coups, reste (ms), bloqué, reste du blocage (ms)]
        return [1, 60_000, 0, 0];
      }),
    };
    return { redis, etat };
  }

  const incr = (l: LimitationRedis) => l.increment('1.2.3.4', 60_000, 5, 0, 'ip');

  it('compte par Redis tant qu’il répond', async () => {
    const { redis, etat } = fauxRedis();
    const limitation = new LimitationRedis(redis as never);

    await expect(incr(limitation)).resolves.toEqual({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(etat.appels).toBe(1);

    await limitation.fermer();
  });

  /**
   * LE CAS QUI A MOTIVÉ CE FICHIER. Avant, cette promesse était rejetée et
   * la requête du client échouait.
   */
  it('NE REJETTE PAS quand Redis est injoignable', async () => {
    const { redis, etat } = fauxRedis();
    const limitation = new LimitationRedis(redis as never);
    etat.enPanne = true;

    const r = await incr(limitation);
    expect(r.totalHits).toBe(1);
    expect(r.isBlocked).toBe(false);

    await limitation.fermer();
  });

  /**
   * Dégradé ne veut pas dire absent : les compteurs en mémoire continuent de
   * compter, donc une rafale finit par être bloquée. Sans eux, une panne
   * Redis serait une fenêtre ouverte sur l'essai de mots de passe.
   */
  it('compte ENCORE pendant la panne, et finit par bloquer', async () => {
    const { redis, etat } = fauxRedis();
    const limitation = new LimitationRedis(redis as never);
    etat.enPanne = true;

    const coups: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      coups.push((await limitation.increment('9.9.9.9', 60_000, 3, 30_000, 'auth')).totalHits);
    }

    // Le compteur monte vraiment — ce n'est pas un « laissez tout passer ».
    expect(coups).toEqual([1, 2, 3, 4]);
    // Et au-delà de la limite (3), le garde voit le blocage.
    const dernier = await limitation.increment('9.9.9.9', 60_000, 3, 30_000, 'auth');
    expect(dernier.isBlocked).toBe(true);

    await limitation.fermer();
  });

  /**
   * Un drapeau « en panne » qu'il faudrait lever à la main survivrait au
   * rétablissement : les compteurs resteraient locaux jusqu'au prochain
   * redéploiement, sans que personne ne s'en aperçoive.
   */
  it('revient à Redis DÈS qu’il répond, sans redémarrage', async () => {
    const { redis, etat } = fauxRedis();
    const limitation = new LimitationRedis(redis as never);

    etat.enPanne = true;
    await incr(limitation);

    etat.enPanne = false;
    const r = await incr(limitation);
    // La valeur vient de Redis (60 s), pas du compteur local.
    expect(r.timeToExpire).toBe(60);
    expect(etat.appels).toBe(2);

    await limitation.fermer();
  });

  /**
   * Une panne produit une requête par client et par seconde. Une ligne de
   * journal par requête noierait la cause réelle sous ses propres symptômes.
   */
  it('n’écrit qu’une alerte, pas une par requête', async () => {
    const { redis, etat } = fauxRedis();
    const limitation = new LimitationRedis(redis as never);
    etat.enPanne = true;

    const erreurs = jest
      .spyOn((limitation as unknown as { logger: { error: (m: string) => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    for (let i = 0; i < 20; i += 1) await incr(limitation);

    expect(erreurs).toHaveBeenCalledTimes(1);
    expect(erreurs.mock.calls[0][0]).toContain('EN MÉMOIRE');

    erreurs.mockRestore();
    await limitation.fermer();
  });

  /**
   * Le stockage en mémoire pose des minuteries. Construit à la main, il n'est
   * pas câblé au cycle de vie de Nest : sans cet arrêt, le processus resterait
   * en vie après un SIGTERM — un déploiement qui ne se termine pas.
   */
  it('ferme aussi les minuteries du repli', async () => {
    const { redis } = fauxRedis();
    const limitation = new LimitationRedis(redis as never);
    const memoire = (limitation as unknown as { memoire: { onApplicationShutdown: () => void } })
      .memoire;
    const arret = jest.spyOn(memoire, 'onApplicationShutdown');

    await limitation.fermer();

    expect(arret).toHaveBeenCalled();
    expect(redis.quit).toHaveBeenCalled();
  });
});
