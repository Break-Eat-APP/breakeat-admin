import {
  adresseDeLaRequete,
  concerneUneAuthentification,
  COMPTEURS,
  limiteIp,
  LIMITE_IP_DEFAUT,
  ESSAIS_ADRESSE,
  ESSAIS_ADRESSE_DEGRADE,
} from './limitation';
import { reinitialiserEtatDesCompteurs } from './limitation-redis';

/**
 * La limite du compteur d'adresse est RESOLUE a chaque requete : elle depend
 * de l'etat de Redis. On l'appelle donc, on ne la lit pas.
 */
const limiteAdresse = (): number => {
  const brut = COMPTEURS.find((c) => c.name === 'adresse')?.limit;
  return typeof brut === 'function'
    ? (brut as (c: unknown) => number)(undefined)
    : (brut as number);
};

/**
 * Ce que la limitation compte — et surtout ce qu'elle NE doit pas compter.
 *
 * Nos clients commandent depuis un stade, des centaines derrière le même wifi.
 * Une limite serrée par adresse IP bloquerait une buvette entière au coup
 * d'envoi : la protection deviendrait la panne. Ces tests figent ce choix, et
 * ils sont nés d'un essai réel qui avait bloqué un « voisin » de la même IP.
 */
describe('Limitation de débit', () => {
  // L'etat des compteurs est un module : sans remise a neuf, un test qui
  // simule la panne de Redis contaminerait les suivants.
  beforeEach(() => reinitialiserEtatDesCompteurs());

  const connexion = (email: unknown) => ({ url: '/api/v1/auth/login', body: { email }, ip: '1.2.3.4' });

  describe('l’adresse lue dans la requête', () => {
    it('est normalisée : casse et espaces ne créent pas un second compteur', () => {
      // Sans normalisation, « JO@… » et « jo@… » auraient chacun leurs huit
      // tentatives — la limite serait doublée d'un simple coup de majuscule.
      expect(adresseDeLaRequete(connexion('  JO@Exemple.FR '))).toBe('jo@exemple.fr');
    });

    it('est nulle quand il n’y en a pas, ou qu’elle n’est pas du texte', () => {
      expect(adresseDeLaRequete({ body: {} })).toBeNull();
      expect(adresseDeLaRequete({ body: { email: '   ' } })).toBeNull();
      // Un corps de requête est ce que l'appelant veut bien envoyer.
      expect(adresseDeLaRequete({ body: { email: { ruse: true } } })).toBeNull();
      expect(adresseDeLaRequete({})).toBeNull();
    });
  });

  describe('quand le compteur serré s’applique', () => {
    it('sur la connexion et l’inscription, si une adresse est fournie', () => {
      expect(concerneUneAuthentification(connexion('jo@exemple.fr'))).toBe(true);
      expect(
        concerneUneAuthentification({ url: '/api/v1/auth/register', body: { email: 'a@b.fr' } }),
      ).toBe(true);
    });

    it('JAMAIS sur une route ordinaire, même si elle porte une adresse', () => {
      // Une invitation d'équipier porte une adresse : sans cette règle, elle
      // hériterait d'une limite de huit par quart d'heure que personne n'a
      // voulue.
      expect(
        concerneUneAuthentification({
          url: '/api/v1/organizations/x/members/invite',
          body: { email: 'equipier@club.fr' },
        }),
      ).toBe(false);
    });

    it('jamais sur une authentification sans adresse', () => {
      // La connexion par Apple ne porte pas d'adresse : rien à compter.
      expect(concerneUneAuthentification({ url: '/api/v1/auth/login', body: {} })).toBe(false);
    });
  });

  describe('les deux compteurs', () => {
    const parNom = Object.fromEntries(COMPTEURS.map((c) => [c.name as string, c]));

    it('sont deux, et portent des noms explicites', () => {
      // `@SkipThrottle()` sans argument ne viserait qu'un compteur nommé
      // `default` : il n'en existe pas ici, et une route qu'on croirait
      // exemptée ne le serait pas.
      expect(Object.keys(parNom).sort()).toEqual(['adresse', 'ip']);
    });

    /**
     * UN STADE ENTIER PARTAGE UNE ADRESSE PUBLIQUE.
     *
     * Ce test affirmait que « 600 par minute n'attrape qu'un script, jamais
     * des clients ». C'était faux, et `limitation.ts` le dit depuis le 27/10 :
     * dix mille supporters derrière le wifi d'un stade, à une requête chacun,
     * et neuf mille quatre cents reçoivent un refus au coup d'envoi.
     *
     * Compté dans l'application : ouvrir l'app froid coûte UNE requête, une
     * commande entière une dizaine étalée sur des minutes. Le pic réel d'un
     * grand stade tient autour de dix à quinze mille par minute — il faut donc
     * un plafond qui les laisse passer tous.
     */
    it('laissent passer un stade entier : le coupe-circuit est haut', () => {
      expect(parNom.ip.limit).toBeGreaterThanOrEqual(20_000);
      expect(parNom.ip.ttl).toBe(60_000);
    });

    it('serrent l’authentification, sans l’étouffer', () => {
      // Assez pour se tromper plusieurs fois ; beaucoup trop peu pour essayer
      // une liste de mots de passe.
      expect(limiteAdresse()).toBeLessThanOrEqual(10);
      expect(limiteAdresse()).toBeGreaterThanOrEqual(3);
      expect(parNom.adresse.ttl).toBeGreaterThanOrEqual(600_000);
    });

    it('le compteur serré suit l’adresse, jamais l’IP', () => {
      const suivre = parNom.adresse.getTracker as (r: unknown) => string;
      const memeWifi = { url: '/api/v1/auth/login', ip: '82.64.0.1' };
      const a = suivre({ ...memeWifi, body: { email: 'ana@exemple.fr' } });
      const b = suivre({ ...memeWifi, body: { email: 'jo@exemple.fr' } });

      expect(a).toBe('adresse:ana@exemple.fr');
      expect(a).not.toBe(b);
    });
  });
});

/**
 * LE COUPE-CIRCUIT PAR IP — et pourquoi il ne prétend plus protéger.
 *
 * Ce fichier affirmait que 600 requêtes par minute « n'attrapent qu'un
 * script, jamais une foule ». C'était faux : dix mille supporters derrière le
 * wifi d'un stade partagent UNE adresse publique. À une requête chacun dans
 * la même minute, six cents passaient et neuf mille quatre cents recevaient
 * un refus — au coup d'envoi.
 *
 * Le seuil est donc monté au niveau d'un coupe-circuit, et surtout il se
 * règle sans redéployer : un soir de match, desserrer un étau qui étrangle
 * une buvette ne doit pas attendre cinq minutes de build.
 */
describe('le plafond par IP', () => {
  it('vaut 30 000 par défaut — un grand stade passe, un script non', () => {
    expect(limiteIp(undefined)).toBe(LIMITE_IP_DEFAUT);
    expect(LIMITE_IP_DEFAUT).toBe(30_000);
  });

  it('se règle par variable d’environnement', () => {
    expect(limiteIp('50000')).toBe(50_000);
    expect(limiteIp('1200')).toBe(1_200);
  });

  /**
   * UNE SAISIE ABSURDE NE DOIT NI OUVRIR EN GRAND NI TOUT FERMER. Un `0`
   * refuserait toutes les requêtes du lieu ; un texte donnerait `NaN`, que
   * le limiteur interpréterait n'importe comment. On retombe sur le défaut.
   */
  it('retombe sur le défaut quand la valeur est illisible', () => {
    for (const absurde of ['', '0', '-5', 'beaucoup', '12.5', 'NaN']) {
      expect(limiteIp(absurde)).toBe(LIMITE_IP_DEFAUT);
    }
  });

  it('le compteur ip porte bien ce plafond', () => {
    const ip = COMPTEURS.find((c) => c.name === 'ip');
    expect(ip?.limit).toBe(LIMITE_IP_DEFAUT);
    expect(ip?.ttl).toBe(60_000);
  });

  // ─── QUAND REDIS TOMBE ──────────────────────────────────────────

  /**
   * LE REPLI REND LES COMPTEURS LOCAUX À CHAQUE INSTANCE.
   *
   * Huit essais par quart d'heure devenaient donc huit PAR INSTANCE : avec
   * trois répliques, vingt-quatre — et personne ne l'avait décidé. On
   * resserre pour que le produit revienne près de ce qui était voulu.
   */
  describe('les compteurs en panne de Redis', () => {
    /** Fait échouer Redis une fois, ce qui pose l'état dégradé. */
    async function faireTomberRedis() {
      const { LimitationRedis } = await import('./limitation-redis');
      const redis = {
        defineCommand: () => undefined,
        limiter: () => Promise.reject(new Error('Redis injoignable')),
      };
      const stockage = new LimitationRedis(redis as never);
      await stockage.increment('cle', 1_000, 5, 0, 'adresse');
    }

    it('resserre les essais de mot de passe', async () => {
      expect(limiteAdresse()).toBe(ESSAIS_ADRESSE);

      await faireTomberRedis();

      expect(limiteAdresse()).toBe(ESSAIS_ADRESSE_DEGRADE);
      expect(ESSAIS_ADRESSE_DEGRADE).toBeLessThan(ESSAIS_ADRESSE);
    });

    /**
     * ET L'ASYMÉTRIE EST LE CŒUR DE LA DÉCISION.
     *
     * Resserrer le compteur d'adresse coûte quelques essais à quelqu'un qui a
     * oublié son mot de passe : il attend un quart d'heure. Resserrer le
     * coupe-circuit par IP coûterait LA VENTE D'UN STADE ENTIER, puisque tous
     * les téléphones partagent une adresse publique. On ne touche jamais au
     * plafond qui tient le stade ouvert.
     */
    it('ne touche PAS au coupe-circuit qui tient le stade ouvert', async () => {
      await faireTomberRedis();

      const ip = COMPTEURS.find((c) => c.name === 'ip');
      expect(ip?.limit).toBe(LIMITE_IP_DEFAUT);
    });
  });
});
