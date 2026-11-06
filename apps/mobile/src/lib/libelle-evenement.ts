/**
 * CE QU'ON ÉCRIT SOUS UN ÉVÉNEMENT, dans la section « À ne pas manquer ».
 *
 * Deux fonctions pures, sorties de l'écran pour pouvoir être testées : la
 * première porte une règle de comparaison qui peut se tromper en silence, et
 * un titre faux ne lève aucune erreur — il affiche simplement « Marseille vs
 * Monaco – Monaco » à des milliers de clients.
 */

/**
 * LE TITRE D'UN ÉVÉNEMENT — le nom saisi, ET l'adversaire quand il ajoute
 * quelque chose.
 *
 * Les deux existent en base et disent rarement la même chose :
 *
 *   name « Marseille vs Monaco », opponentName « Monaco »
 *       → « Marseille vs Monaco ». Recoller l'adversaire donnerait
 *         « Marseille vs Monaco – Monaco ».
 *
 *   name « Match de gala », opponentName « Racing 92 »
 *       → « Match de gala – Racing 92 ». Le nom seul ne dit pas contre qui.
 *
 * D'où la comparaison plutôt qu'un choix figé : on ajoute l'adversaire
 * SEULEMENT s'il n'est pas déjà dans le nom. Insensible aux accents et à la
 * casse, parce qu'un club écrit « Besiktas » dans un champ et « Beşiktaş »
 * dans l'autre.
 */
export function titreEvenement(e: { name: string; opponentName?: string | null }): string {
  const nom = e.name.trim();
  const adversaire = e.opponentName?.trim();
  if (!adversaire) return nom;
  return sansAccent(nom).includes(sansAccent(adversaire)) ? nom : `${nom} – ${adversaire}`;
}

/** Minuscules et sans accent — pour COMPARER, jamais pour afficher. */
const sansAccent = (v: string) =>
  v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * « sam. 14 nov. · 21:00 » — la date courte, puis l'heure.
 *
 * L'heure en `HH:MM` et non « 21 h » : on hésite une demi-seconde entre
 * 8 h du matin et 8 h du soir, et le zéro de tête lève le doute sans y
 * penser. C'est la forme déjà retenue pour l'ouverture de la commande.
 *
 * L'ANNÉE N'Y EST PAS. Cette section ne montre que les prochains événements ;
 * « 2026 » sur chaque ligne occuperait de la place pour une information que
 * personne ne cherche.
 */
export function dateEtHeure(iso: string): string {
  const d = new Date(iso);
  const jour = d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} · ${heure}`;
}
