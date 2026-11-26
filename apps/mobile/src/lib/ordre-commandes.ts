/**
 * L'ORDRE DE « MES COMMANDES » (26/11/2026, signalé par Rémi).
 *
 * La liste mêle deux sources : les commandes BreakEat (déjà de la plus
 * récente à la plus ancienne) et les commandes Flaix (idem). Mises bout à
 * bout, les Flaix du 26/11 tombaient SOUS des BreakEat de septembre. On trie
 * donc l'ensemble par date, la plus récente en tête.
 *
 * Une date illisible passe en dernier plutôt que de casser le tri ; à date
 * égale, l'ordre d'arrivée est gardé (tri stable).
 */
export function plusRecentesDabord<T>(entrees: T[], dateDe: (e: T) => string | null | undefined): T[] {
  const temps = (e: T) => {
    const t = new Date(dateDe(e) ?? '').getTime();
    return Number.isNaN(t) ? -Infinity : t;
  };
  return entrees
    .map((e, i) => ({ e, i, t: temps(e) }))
    .sort((a, b) => (b.t === a.t ? a.i - b.i : b.t > a.t ? 1 : -1))
    .map((x) => x.e);
}
