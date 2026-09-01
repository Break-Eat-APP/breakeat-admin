/**
 * Les trois taux de TVA de la restauration, côté interface.
 *
 * Le taux dépend du produit, pas du commerçant. Le gérant qui saisit sa carte
 * doit donc pouvoir le choisir ligne par ligne — et le voir sans cliquer, car
 * un taux faux ne se remarque qu'au moment de la déclaration, trop tard.
 *
 * Reflète `backend/src/common/helpers/tva.ts` : toute modification ici doit y
 * être reportée, et inversement.
 */

export const TAUX_TVA = [
  {
    bps: 550,
    label: '5,5 %',
    usage: 'À emporter, produit emballé — bouteille capsulée, sandwich sous film',
  },
  {
    bps: 1000,
    label: '10 %',
    usage: 'Consommation immédiate — sandwich chaud, frites, boisson au gobelet',
  },
  {
    bps: 2000,
    label: '20 %',
    usage: 'Alcools (toujours), et tout ce qui n’est pas alimentaire',
  },
] as const;

export const TAUX_TVA_DEFAUT = 1000;

/** « 10 % » — tolérant à un taux inconnu plutôt que d'afficher un vide. */
export function libelleTva(bps: number): string {
  return (
    TAUX_TVA.find((t) => t.bps === bps)?.label ??
    `${(bps / 100).toString().replace('.', ',')} %`
  );
}

/** Couleur de la pastille : l'œil doit repérer un 20 % au milieu d'une carte. */
export function couleurTva(bps: number): { bg: string; fg: string } {
  if (bps === 2000) return { bg: '#ede9fe', fg: '#5b21b6' };
  if (bps === 550) return { bg: '#d1fae5', fg: '#065f46' };
  return { bg: '#e0f2fe', fg: '#075985' };
}
