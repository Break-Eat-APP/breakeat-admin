/**
 * LE CADRE D'UNE AFFICHE EN GRAND — fonction PURE (27/11/2026).
 *
 * L'image garde sa vraie forme (`ratio` = largeur / hauteur du fichier) :
 *  · elle prend toute la largeur disponible ;
 *  · sa hauteur est bornée à HAUTEUR_MAX : une affiche portrait pleine
 *    largeur ferait plus d'un écran, et pousserait « Commander » hors de vue.
 *    Elle se rétrécit alors, centrée, sans être rognée ;
 *  · tant que la forme n'est pas connue (fichier en cours de lecture, ou
 *    illisible), le format que FLAIX recommande pour l'image de couverture
 *    d'un événement : 1200 × 630, en paysage (Rémi, 27/11). C'est cette image
 *    que l'import du flux pose en affiche ; la forme attendue est donc la plus
 *    probable, et l'image ne « saute » pas une fois lue.
 */
export const HAUTEUR_MAX = 340;
export const RATIO_PAR_DEFAUT = 1200 / 630;

export function cadreAffiche(
  largeurDispo: number,
  ratio: number | null,
  hauteurMax: number = HAUTEUR_MAX,
): { largeur: number; hauteur: number } {
  const r = ratio && Number.isFinite(ratio) && ratio > 0 ? ratio : RATIO_PAR_DEFAUT;
  let largeur = Math.max(0, largeurDispo);
  let hauteur = largeur / r;
  if (hauteur > hauteurMax) {
    hauteur = hauteurMax;
    largeur = hauteur * r;
  }
  return { largeur: Math.round(largeur), hauteur: Math.round(hauteur) };
}
