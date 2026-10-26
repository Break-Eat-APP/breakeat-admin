import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

/**
 * LES COMPTEURS DE LIMITATION, PARTAGÉS ENTRE LES INSTANCES.
 *
 * Les compteurs par défaut vivent en mémoire. Avec une seule instance cela
 * suffit ; dès la seconde, chacune a les siens — et deux conséquences
 * opposées, toutes deux fâcheuses :
 *
 *   • la limite est MULTIPLIÉE par le nombre d'instances. 600 requêtes par
 *     minute deviennent 1 200 avec deux replicas, et il suffit de changer de
 *     replica pour repartir à zéro. La protection contre l'essai de mots de
 *     passe — 8 tentatives par quart d'heure — devient 16, puis 24 ;
 *   • et au redémarrage, tout repart à zéro. Un redéploiement efface les
 *     compteurs de blocage au moment précis où ils servaient.
 *
 * Redis les met en commun : une instance compte, toutes voient.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FENÊTRE FIXE, LÀ OÙ LA VERSION EN MÉMOIRE GLISSE.
 *
 * La version d'origine décrémente chaque coup après son délai, ce qui donne
 * une fenêtre glissante. Ici, le compteur expire en bloc. La différence se
 * voit sur les bords — quelqu'un peut consommer la fin d'une fenêtre et le
 * début de la suivante — et c'est assumé : une fenêtre fixe tient en une
 * instruction atomique, là où une fenêtre glissante demanderait de conserver
 * chaque horodatage. Pour une limite large (600/min) comme pour une limite
 * serrée (8/15 min), l'écart est sans portée pratique.
 *
 * ATOMICITÉ. Tout se joue dans UN script Lua : Redis l'exécute d'un seul
 * tenant. Lire puis écrire en deux allers-retours laisserait deux instances
 * compter le même coup une seule fois — exactement le trou qu'on vient
 * fermer.
 *
 * UNITÉS — le piège de cette interface. `ttl` et `blockDuration` arrivent en
 * MILLISECONDES ; `timeToExpire` et `timeToBlockExpire` se rendent en
 * SECONDES. Les confondre fausserait les limites d'un facteur mille.
 */

/**
 * Le script, tel que Redis l'exécute.
 *
 * KEYS[1] compte les coups, KEYS[2] porte le blocage.
 * ARGV : ttl (ms), limite, duree de blocage (ms).
 * Rend : coups, ms avant expiration, bloqué (0/1), ms avant déblocage.
 */
const SCRIPT = `
local cleCoups = KEYS[1]
local cleBlocage = KEYS[2]
local ttl = tonumber(ARGV[1])
local limite = tonumber(ARGV[2])
local dureeBlocage = tonumber(ARGV[3])

-- Déjà bloqué : on ne compte plus, on laisse le blocage s'écouler.
local resteBlocage = redis.call('PTTL', cleBlocage)
if resteBlocage > 0 then
  local coups = tonumber(redis.call('GET', cleCoups) or '0')
  local reste = redis.call('PTTL', cleCoups)
  if reste < 0 then reste = 0 end
  return { coups, reste, 1, resteBlocage }
end

local coups = redis.call('INCR', cleCoups)
if coups == 1 then
  redis.call('PEXPIRE', cleCoups, ttl)
end
local reste = redis.call('PTTL', cleCoups)
if reste < 0 then reste = 0 end

if coups > limite and dureeBlocage > 0 then
  redis.call('SET', cleBlocage, 1, 'PX', dureeBlocage)
  return { coups, reste, 1, dureeBlocage }
end

return { coups, reste, 0, 0 }
`;

/** Millisecondes vers secondes, arrondies au-dessus — comme la version d'origine. */
const enSecondes = (ms: number) => Math.ceil(ms / 1000);

export class LimitationRedis implements ThrottlerStorage {
  private readonly logger = new Logger('Limitation');

  /**
   * LE REPLI, QUAND REDIS TOMBE EN PLEIN SERVICE.
   *
   * Ce fichier affirmait qu'une panne de Redis laissait passer les requêtes
   * avec une limitation dégradée. **C'était faux** : `increment` attendait le
   * script Lua sans rien rattraper, et le garde Throttler attend cette
   * promesse directement. Redis coupé un soir de match, et toutes les routes
   * protégées renvoyaient une erreur — la connexion comprise.
   *
   * Un commentaire qui promet une propriété que le code n'a pas est pire
   * qu'une absence de commentaire : on cesse de vérifier.
   *
   * Pourquoi les compteurs EN MÉMOIRE plutôt que de laisser tout passer : une
   * panne Redis ne doit pas ouvrir la porte à l'essai de mots de passe. La
   * limite redevient alors locale à l'instance — donc multipliée par leur
   * nombre, exactement comme au démarrage sans `REDIS_URL`. C'est dégradé,
   * mais ça compte encore. Et ce n'est pas un choix nouveau : c'est le même
   * arbitrage, au même endroit, pour la même raison.
   *
   * Pourquoi pas fail-closed : refuser toutes les requêtes parce que le
   * compteur est injoignable, c'est éteindre la vente pour protéger un
   * compteur.
   */
  private readonly memoire = new ThrottlerStorageService();
  /** Quand la dernière alerte est partie — une panne ne doit pas noyer le journal. */
  private derniereAlerte = 0;

  constructor(private readonly redis: Redis) {
    this.redis.defineCommand('limiter', { numberOfKeys: 2, lua: SCRIPT });
  }

  async increment(
    cle: string,
    ttl: number,
    limite: number,
    dureeBlocage: number,
    nom: string,
  ): Promise<ThrottlerStorageRecord> {
    // Le nom du compteur entre dans la clé : `ip` et `adresse` ne comptent
    // pas la même chose et ne doivent jamais se mélanger.
    const racine = `limite:${nom}:${cle}`;

    try {
      const [coups, reste, bloque, resteBlocage] = (await (
        this.redis as unknown as {
          limiter: (...args: unknown[]) => Promise<[number, number, number, number]>;
        }
      ).limiter(racine, `${racine}:bloque`, ttl, limite, dureeBlocage)) as [
        number,
        number,
        number,
        number,
      ];

      return {
        totalHits: coups,
        timeToExpire: enSecondes(reste),
        isBlocked: bloque === 1,
        timeToBlockExpire: enSecondes(resteBlocage),
      };
    } catch (e) {
      this.signalerPanne(e);
      // On réessaie Redis à CHAQUE requête : dès qu'il répond de nouveau, les
      // compteurs redeviennent communs sans qu'on ait à redémarrer quoi que
      // ce soit. Un drapeau « en panne » qu'il faudrait lever à la main
      // survivrait au rétablissement.
      return this.memoire.increment(cle, ttl, limite, dureeBlocage, nom);
    }
  }

  /** Une ligne par minute au plus : une panne produit une requête par client. */
  private signalerPanne(e: unknown): void {
    const maintenant = Date.now();
    if (maintenant - this.derniereAlerte < 60_000) return;
    this.derniereAlerte = maintenant;
    this.logger.error(
      'Compteurs de limitation EN MÉMOIRE — Redis injoignable en cours de service : ' +
        `${e instanceof Error ? e.message : String(e)}. ` +
        'La limite redevient locale à chaque instance, donc multipliée par leur nombre.',
    );
  }

  async fermer(): Promise<void> {
    // Le stockage en mémoire pose des minuteries pour purger ses compteurs.
    // Construit à la main, il n'est pas câblé au cycle de vie de Nest : son
    // arrêt ne partirait jamais, et le processus resterait en vie après un
    // `SIGTERM` — un déploiement qui ne se termine pas.
    this.memoire.onApplicationShutdown();
    await this.redis.quit().catch(() => undefined);
  }
}

/**
 * Le stockage partagé, ou rien.
 *
 * Rendre `undefined` laisse Nest reprendre ses compteurs en mémoire. C'est le
 * même arbitrage que partout ailleurs au démarrage : sans Redis, une API qui
 * limite par instance vaut mieux qu'une API qui refuse de démarrer. On le DIT,
 * en revanche — une limitation qu'on croit globale et qui ne l'est pas est
 * pire qu'une limitation absente, parce qu'on cesse de la surveiller.
 */
export async function creerStockageLimitation(
  url: string | undefined,
  enLigne: boolean,
): Promise<LimitationRedis | undefined> {
  const logger = new Logger('Limitation');

  if (!url) {
    const message =
      'Compteurs de limitation EN MÉMOIRE (REDIS_URL absente). ' +
      'Avec plusieurs instances, la limite est multipliée par leur nombre.';
    if (enLigne) logger.error(message);
    else logger.log(message);
    return undefined;
  }

  try {
    const redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 5_000,
    });
    await redis.connect();
    // Un Redis qui tombe en cours de service ne doit pas couper l'API.
    // `LimitationRedis.increment` rattrape la panne et bascule sur des
    // compteurs EN MÉMOIRE — dégradés, mais ils comptent encore.
    redis.on('error', (e: Error) => logger.error(`Redis: ${e.message}`));
    logger.log('Compteurs de limitation partagés via Redis.');
    return new LimitationRedis(redis);
  } catch (e) {
    logger.error(
      `Compteurs de limitation EN MÉMOIRE — Redis injoignable : ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
    return undefined;
  }
}
