/**
 * CE QU'ON MONTRE D'UN LIEU — la photo, le logo, ou la lettre.
 *
 * Un lieu a deux visuels possibles, et ils ne se cadrent PAS pareil :
 *
 *  - sa PHOTO (`photoUrl`) remplit le cadre (`cover`). On accepte de rogner
 *    les bords : c'est ce qui donne l'image pleine largeur en haut de la
 *    carte, celle qui fait reconnaître le stade avant même de lire son nom ;
 *  - le LOGO du club (`imageUrl`) se centre sans rognage (`contain`). Un
 *    écusson recadré en `cover` perd son contour — et c'est le contour qui le
 *    rend reconnaissable. Il lui faut aussi un fond, puisqu'il ne remplit pas ;
 *  - sans ni l'un ni l'autre, l'initiale du nom. Elle ne charge rien, ne
 *    casse jamais, et reste lisible sur un réseau de stade saturé.
 *
 * La règle vivait dans le JSX de la carte, où le repli se réduisait à
 * `imageUrl ? <Image/> : <Text/>` — donc le logo du club étiré en photo de
 * couverture. Ici elle est pure et testée : les deux endroits qui affichent un
 * lieu (la carte et la tuile de favori) ne peuvent plus la dire autrement.
 */

export type LieuVisuel = {
  name: string;
  /** La photo du lieu (null tant que le club ne l'a pas renseignée). */
  photoUrl?: string | null;
  /** Le logo du club. */
  imageUrl?: string | null;
};

export type VisuelLieu =
  | { type: 'image'; uri: string; cadrage: 'cover' | 'contain' }
  | { type: 'lettre'; lettre: string };

/**
 * Une URL VIDE n'est pas une URL.
 *
 * `''` passe un simple test de présence et produit une image cassée — un
 * carré gris à la place du stade. C'est la même famille d'écart que
 * l'identifiant Flaix vide : présent, mais inutilisable.
 */
function renseignee(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.trim().length > 0;
}

/**
 * Le visuel à afficher, et son cadrage.
 *
 * @param prefere Quoi tenter d'abord. `'photo'` pour un grand cadre (la carte
 *   d'un lieu proche) ; `'logo'` pour une petite tuile, où un écusson se
 *   reconnaît mieux qu'un bout de pelouse recadré (les favoris).
 */
export function visuelDeLieu(lieu: LieuVisuel, prefere: 'photo' | 'logo' = 'photo'): VisuelLieu {
  const photo: VisuelLieu | null = renseignee(lieu.photoUrl)
    ? { type: 'image', uri: lieu.photoUrl.trim(), cadrage: 'cover' }
    : null;
  const logo: VisuelLieu | null = renseignee(lieu.imageUrl)
    ? { type: 'image', uri: lieu.imageUrl.trim(), cadrage: 'contain' }
    : null;

  const ordre = prefere === 'photo' ? [photo, logo] : [logo, photo];
  for (const choix of ordre) if (choix) return choix;

  return { type: 'lettre', lettre: initiale(lieu.name) };
}

/**
 * L'initiale, ou `?`.
 *
 * Un nom vide donnerait une pastille vide, qu'on prendrait pour un
 * chargement qui n'aboutit pas. Le point d'interrogation, lui, se comprend.
 */
function initiale(name: string): string {
  const net = name?.trim() ?? '';
  return net.length > 0 ? net.charAt(0).toUpperCase() : '?';
}
