/**
 * CE QUE LA PAGE DE COMMANDE FLAIX A LE DROIT D'OUVRIR, DANS L'APP.
 *
 * La règle d'origine refusait net tout ce qui sortait de Flaix. Elle protégeait
 * d'un vrai risque — une page de paiement détournée, sans barre d'adresse pour
 * le voir — mais elle en créait un pire, relevé à l'audit du 09/11 :
 *
 *  · un paiement qui REDIRIGE vers son prestataire (une page Stripe, une page
 *    3-D Secure de la banque) était refusé SANS UN MOT : le client touche
 *    « Payer », rien ne se passe, au coup d'envoi ;
 *  · sur iPhone, la règle s'appliquait aussi aux CADRES intégrés : un champ de
 *    carte hébergé chez le prestataire (`js.stripe.com`) ne se chargeait pas.
 *
 * Le site de commande de Flaix est hors de notre dépôt, et l'on ne peut pas
 * savoir d'ici quel prestataire il emploie. La règle ne présume donc rien :
 *
 *  · Flaix : toujours ;
 *  · un CADRE intégré, en HTTPS : oui — il s'affiche DANS la page Flaix, il ne
 *    peut pas la remplacer ;
 *  · une page principale HORS de Flaix : seulement en HTTPS, et l'écran en
 *    AFFICHE L'ADRESSE (`hoteHorsFlaix`) — ce qui manquait à la règle
 *    d'origine pour être sûre ;
 *  · tout le reste (http, schémas d'apps, adresses illisibles) : non.
 *
 * ⚠️ MÊME LISTE DE DOMAINES QUE `backend/src/modules/events/lien-flaix.ts`.
 */
export const DOMAINES_FLAIX = ['flaixlabs.com', 'synertic.net'] as const;

function lire(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function estChezFlaix(url: string): boolean {
  const u = lire(url);
  if (!u) return false;
  const hote = u.hostname.toLowerCase();
  return DOMAINES_FLAIX.some((d) => hote === d || hote.endsWith(`.${d}`));
}

/**
 * La page Flaix peut-elle ouvrir cette adresse ?
 *
 * La même règle vaut pour un CADRE intégré et pour la PAGE principale : un
 * cadre reste dans la page Flaix, une page principale hors de Flaix est
 * annoncée par son adresse (`hoteHorsFlaix`). Ce qui compte, c'est HTTPS :
 * jamais un paiement en clair, jamais un schéma d'app inconnu.
 */
export function navigationAutorisee(url: string | undefined): boolean {
  if (!url || url === 'about:blank') return true;
  if (estChezFlaix(url)) return true;
  const u = lire(url);
  return u !== null && u.protocol === 'https:';
}

/**
 * L'adresse à montrer au client quand la page principale a quitté Flaix, ou
 * null tant qu'il y est. C'est la barre d'adresse qui manquait.
 */
export function hoteHorsFlaix(url: string | undefined): string | null {
  if (!url || url === 'about:blank' || estChezFlaix(url)) return null;
  const u = lire(url);
  return u ? u.hostname : null;
}
