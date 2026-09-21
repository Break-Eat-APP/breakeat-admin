/**
 * Le lien vers le rapport Flaix d'un événement.
 *
 * Ce lien s'affiche dans le dashboard d'un DIRECTEUR, sous un bouton « Voir le
 * rapport Flaix », et mène à une page où il saisit ses identifiants Flaix.
 * C'est exactement la situation qu'exploite un faux écran de connexion : si
 * n'importe quelle adresse était acceptée, un lien vers un site imitant Flaix
 * récolterait le mot de passe du directeur. On n'accepte donc que Flaix, et en
 * https.
 */

/** Le domaine de Flaix, et ses sous-domaines (`ops.flaixlabs.com`). */
const DOMAINE_FLAIX = 'flaixlabs.com';

/** Une adresse de rapport raisonnable n'a pas besoin d'être plus longue. */
export const LONGUEUR_MAX_LIEN_FLAIX = 500;

export type VerdictLienFlaix =
  | { valide: true; url: string }
  | { valide: false; raison: string };

export function verifierLienFlaix(saisie: string): VerdictLienFlaix {
  const brut = saisie.trim();
  if (!brut) return { valide: false, raison: 'Le lien est vide.' };
  if (brut.length > LONGUEUR_MAX_LIEN_FLAIX) {
    return { valide: false, raison: `Le lien dépasse ${LONGUEUR_MAX_LIEN_FLAIX} caractères.` };
  }

  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    return { valide: false, raison: 'Ce n’est pas une adresse web valide.' };
  }

  if (url.protocol !== 'https:') {
    return { valide: false, raison: 'Le lien doit commencer par https://.' };
  }

  // Le nom d'hôte EXACT, ou un sous-domaine — et non un simple « contient » :
  // `flaixlabs.com.pirate.fr` et `faux-flaixlabs.com` contiennent le mot, et
  // ne sont pas Flaix.
  const hote = url.hostname.toLowerCase();
  if (hote !== DOMAINE_FLAIX && !hote.endsWith(`.${DOMAINE_FLAIX}`)) {
    return { valide: false, raison: 'Seuls les liens Flaix (flaixlabs.com) sont acceptés.' };
  }

  // `https://moi:secret@ops.flaixlabs.com/…` : des identifiants dans l'adresse.
  // Ils s'afficheraient en clair dans le dashboard de tout le club.
  if (url.username || url.password) {
    return { valide: false, raison: 'Le lien ne doit pas contenir d’identifiant ni de mot de passe.' };
  }

  return { valide: true, url: url.toString() };
}
