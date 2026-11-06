/**
 * « À NE PAS MANQUER » — les prochains événements des lieux favoris.
 *
 * La section existait sur l'accueil et restait VIDE, volontairement : elle a
 * longtemps montré trois événements écrits en dur, avec des photos tirées d'un
 * service d'images aléatoires. Ils ressemblaient à de vrais matchs, n'existaient
 * dans aucune base, et aucun club ne pouvait les corriger. Mieux valait une
 * section vide qui dit la vérité.
 *
 * Elle se remplit ici, avec les événements que les clubs saisissent vraiment.
 *
 * ── LA RÈGLE DE RÉPARTITION, ET CE QU'ELLE PROTÈGE ───────────────────
 *
 * Un favori donne trois événements ; deux favoris en donnent deux chacun ;
 * trois et au-delà, un chacun.
 *
 *     par lieu = max(1, 4 − nombre de lieux)
 *
 * Ce n'est pas une formule décorative : elle garantit qu'AUCUN favori ne
 * disparaît de la liste. Prendre « les six prochains événements, tous lieux
 * confondus » aurait donné une section entièrement occupée par le club qui
 * programme le plus — et un supporter qui suit deux clubs n'aurait plus vu le
 * second.
 *
 * ── CE QUI COMPTE COMME « UN LIEU » ──────────────────────────────────
 *
 * Seuls les lieux qui ONT quelque chose à montrer. Un favori sans événement à
 * venir ne doit pas réduire la part des autres : à trois favoris dont un seul
 * programmé, on montre bien ses trois matchs, pas un seul.
 *
 * ── CE QU'ON NE FAIT PAS, ET POURQUOI ────────────────────────────────
 *
 * PAS DE REMPLISSAGE. Deux lieux, l'un avec cinq matchs et l'autre avec un :
 * on en montre trois (2 + 1), pas quatre. Compléter avec le lieu le plus
 * fourni rendrait la section plus pleine, et reviendrait exactement à ce que
 * la répartition cherche à éviter — le gros club qui mange la place.
 */

/** Un événement tel que l'accueil le montre. */
export interface EvenementANePasManquer {
  id: string;
  /** Ce que le club a saisi : « Marseille vs Monaco », « Concert ... ». */
  name: string;
  /** ISO — l'app formate selon la langue du téléphone. */
  startAt: string;
  opponentName: string | null;
  opponentLogoUrl: string | null;
  /** L'affiche d'un concert. Remplie, l'app montre un portrait, pas un rond. */
  posterUrl: string | null;
  /** Le lieu, pour la ligne du dessous — et pour y naviguer. */
  venueId: string;
  venueName: string;
}

/** Ce qu'un lieu apporte : ses événements à venir, du plus proche au plus loin. */
export interface LieuEtSesEvenements {
  venueId: string;
  venueName: string;
  /** DÉJÀ filtrés (à venir, accessibles) et triés par date croissante. */
  evenements: readonly Omit<EvenementANePasManquer, 'venueId' | 'venueName'>[];
}

/**
 * Le plafond de la section.
 *
 * Six lignes tiennent sur un écran sans repousser le reste de l'accueil hors
 * de vue. Au-delà, la section devient un fil d'actualité — or ce n'est pas ce
 * qu'on vient chercher ici, et « Voir tout » existe pour la suite.
 */
export const MAX_A_NE_PAS_MANQUER = 6;

/**
 * @param lieux Les lieux favoris et leurs événements à venir.
 * @param max   Le plafond, pour le rendre testable sans dépendre de la constante.
 */
export function aNePasManquer(
  lieux: readonly LieuEtSesEvenements[],
  max: number = MAX_A_NE_PAS_MANQUER,
): EvenementANePasManquer[] {
  const fournis = lieux.filter((l) => l.evenements.length > 0);
  if (fournis.length === 0) return [];

  const parLieu = Math.max(1, 4 - fournis.length);

  const retenus = fournis.flatMap((l) =>
    l.evenements.slice(0, parLieu).map((e) => ({
      ...e,
      venueId: l.venueId,
      venueName: l.venueName,
    })),
  );

  // TRIÉS PAR DATE, TOUS LIEUX MÉLANGÉS — et non groupés par lieu.
  //
  // Grouper ferait passer un match dans trois semaines avant celui de samedi
  // soir, simplement parce que son club est arrivé premier dans les favoris.
  // « À ne pas manquer » parle de ce qui vient, pas de qui l'organise.
  retenus.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  return retenus.slice(0, max);
}
