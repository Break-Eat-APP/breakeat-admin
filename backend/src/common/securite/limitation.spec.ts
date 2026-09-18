import { adresseDeLaRequete, concerneUneAuthentification, COMPTEURS } from './limitation';

/**
 * Ce que la limitation compte — et surtout ce qu'elle NE doit pas compter.
 *
 * Nos clients commandent depuis un stade, des centaines derrière le même wifi.
 * Une limite serrée par adresse IP bloquerait une buvette entière au coup
 * d'envoi : la protection deviendrait la panne. Ces tests figent ce choix, et
 * ils sont nés d'un essai réel qui avait bloqué un « voisin » de la même IP.
 */
describe('Limitation de débit', () => {
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

    it('laissent passer une foule : la limite par IP est large', () => {
      // Un stade entier partage une adresse publique. 600 par minute n'attrape
      // qu'un script, jamais des clients.
      expect(parNom.ip.limit).toBeGreaterThanOrEqual(500);
      expect(parNom.ip.ttl).toBe(60_000);
    });

    it('serrent l’authentification, sans l’étouffer', () => {
      // Assez pour se tromper plusieurs fois ; beaucoup trop peu pour essayer
      // une liste de mots de passe.
      expect(parNom.adresse.limit).toBeLessThanOrEqual(10);
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
