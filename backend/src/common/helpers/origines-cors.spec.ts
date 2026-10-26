import { originesCors, ORIGINES_LOCALES } from './origines-cors';

/**
 * HTTP ET WEBSOCKET DOIVENT LIRE LA MÊME CHOSE.
 *
 * `main.ts` nettoyait la liste ; la passerelle faisait un simple
 * `split(',')`. Les deux lisaient `CORS_ORIGINS` et n'en tiraient pas le même
 * résultat.
 *
 * `"https://a.fr, https://b.fr"` — écrit naturellement, avec l'espace après
 * la virgule — autorisait les deux origines en HTTP et **seule la première**
 * en WebSocket. La console du second club chargeait ses données par REST, et
 * son temps réel restait muet. Sans erreur côté serveur : le navigateur
 * refuse en silence.
 *
 * C'est le genre de panne qu'on cherche du côté du réseau pendant une heure.
 */
describe('origines CORS', () => {
  it('coupe les espaces autour de chaque origine', () => {
    expect(originesCors('https://a.fr, https://b.fr')).toEqual([
      'https://a.fr',
      'https://b.fr',
    ]);
  });

  /**
   * Un navigateur envoie `https://a.fr` comme origine, jamais `https://a.fr/`.
   * Une entrée avec barre finale ne correspond à rien et échoue en silence.
   */
  it('retire la barre oblique finale', () => {
    expect(originesCors('https://a.fr/')).toEqual(['https://a.fr']);
    expect(originesCors('https://a.fr///')).toEqual(['https://a.fr']);
  });

  it('écarte les entrées vides d’une virgule en trop', () => {
    expect(originesCors('https://a.fr,,https://b.fr,')).toEqual([
      'https://a.fr',
      'https://b.fr',
    ]);
  });

  it('préserve le chemin et le port', () => {
    expect(originesCors('http://localhost:3001')).toEqual(['http://localhost:3001']);
  });

  it('retombe sur les origines locales quand rien n’est posé', () => {
    expect(originesCors(undefined)).toEqual(ORIGINES_LOCALES);
  });

  /**
   * Une variable posée mais VIDE n'est pas « rien posé » : quelqu'un a voulu
   * n'autoriser personne. On ne doit pas lui rendre localhost.
   */
  it('une variable vide n’autorise personne, et ne retombe pas sur localhost', () => {
    expect(originesCors('')).toEqual([]);
  });

  /**
   * Le cas qui a motivé ce fichier : les deux lectures doivent donner
   * exactement la même liste, espace compris.
   */
  it('donne le même résultat quelle que soit l’écriture de la liste', () => {
    const serre = originesCors('https://a.fr,https://b.fr');
    const espace = originesCors('https://a.fr, https://b.fr');
    const bavard = originesCors(' https://a.fr/ ,  https://b.fr/ ');
    expect(espace).toEqual(serre);
    expect(bavard).toEqual(serre);
  });
});
