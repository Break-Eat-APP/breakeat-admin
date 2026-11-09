/**
 * UN DÉLAI MAXIMAL POUR LES LECTURES.
 *
 * Les requêtes de l'app n'avaient aucun délai (audit du 09/11). Au coup
 * d'envoi, si le serveur sature, un écran tournait dans le vide jusqu'à la
 * limite du système — une minute sur iPhone —, sans rien dire au client.
 *
 * SEULEMENT POUR LES LECTURES (GET). Couper une ÉCRITURE — une commande, un
 * paiement — que le serveur est peut-être en train d'enregistrer ferait croire
 * à un échec alors qu'elle existe : le client recommencerait. Les écritures
 * gardent le délai du système.
 */
export const DELAI_LECTURE_MS = 15_000;

export class DelaiDepasse extends Error {
  constructor() {
    super('Le serveur met trop de temps à répondre. Réessaie dans un instant.');
    this.name = 'DelaiDepasse';
  }
}

/**
 * `fetch`, avec un délai pour les lectures. Une requête qui porte déjà son
 * propre signal d'annulation le garde : on ne remplace pas celui de l'appelant.
 */
export async function fetchAvecDelai(
  url: string,
  init: RequestInit,
  delaiMs: number = DELAI_LECTURE_MS,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const methode = (init.method ?? 'GET').toUpperCase();
  if (methode !== 'GET' || init.signal) return fetchFn(url, init);

  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), delaiMs);
  try {
    return await fetchFn(url, { ...init, signal: controle.signal });
  } catch (e: unknown) {
    if (controle.signal.aborted) throw new DelaiDepasse();
    throw e;
  } finally {
    clearTimeout(minuterie);
  }
}
