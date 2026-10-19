import { ApiError } from '@lib/api/mobile-api';

/**
 * LA PHRASE DU SERVEUR, extraite de sa réponse.
 *
 * Une erreur d'API porte le CORPS BRUT de la réponse — du JSON. L'afficher tel
 * quel montrait au client `{"message":…,"statusCode":401}` : il retenait
 * « 401 » et perdait la seule information utile, la phrase qui dit POURQUOI.
 *
 * Vit ici, et non dans un écran : deux écrans en avaient besoin, et deux
 * copies d'une même extraction finissent par diverger sur le format que le
 * serveur renvoie — l'une continuant d'afficher du JSON sans que personne
 * s'en aperçoive.
 */
export function messageServeur(e: unknown, defaut = ''): string {
  // UNE PANNE DE RÉSEAU N'EST PAS UNE PHRASE DU SERVEUR.
  //
  // Sans cette distinction, un client hors couverture lisait « Failed to
  // fetch » — le message de `fetch`, en anglais, qui ne lui dit ni ce qui
  // s'est passé ni quoi faire. Seule une réponse REÇUE porte une explication ;
  // tout le reste mérite la phrase d'attente de l'appelant.
  if (!(e instanceof ApiError)) return defaut;

  try {
    const { message } = JSON.parse(e.message) as { message?: string | string[] };
    const m = Array.isArray(message) ? message[0] : message;
    if (m) return m;
  } catch {
    /* pas du JSON : le message est déjà lisible */
  }
  return e.message || defaut;
}
