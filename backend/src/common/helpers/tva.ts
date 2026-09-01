/**
 * La TVA en restauration — trois taux, un seul endroit qui le sait.
 *
 * Le taux dépend de ce qui est vendu, jamais du commerçant :
 *
 *   5,5 %  vente à emporter destinée à une consommation différée — produit
 *          conditionné, emballé, vendu fermé (bouteille d'eau capsulée,
 *          sandwich sous film, confiserie).
 *   10 %   consommation immédiate — le régime normal d'une buvette de stade :
 *          sandwich chaud, frites, boisson servie au gobelet, café.
 *   20 %   alcools, en toutes circonstances, sur place comme à emporter.
 *          Également tout ce qui n'est pas alimentaire (goodies, écharpes).
 *
 * Auparavant l'application dérivait le CA HT d'un taux unique (10 %) lu dans
 * `REPORTING_VAT_RATE`. Pour une buvette qui vend de la bière, ce chiffre est
 * simplement faux : le HT est surévalué et la TVA collectée sous-évaluée. Une
 * déclaration se remplit par taux, pas en moyenne.
 *
 * Les taux sont exprimés en POINTS DE BASE (entiers) : 550, 1000, 2000. 5,5 %
 * n'a pas d'écriture exacte en virgule flottante ; additionner des `0.055` sur
 * cinq mille commandes fait dériver le total de quelques centimes, et une
 * comptabilité qui ne tombe pas juste n'a aucune valeur.
 */

/** Les trois taux applicables, dans l'ordre croissant. */
export const TAUX_TVA = [550, 1000, 2000] as const;

export type TauxTvaBps = (typeof TAUX_TVA)[number];

/** Taux par défaut : consommation immédiate, le cas ordinaire d'une buvette. */
export const TAUX_TVA_DEFAUT: TauxTvaBps = 1000;

/** Libellés et explications, partagés par les interfaces. */
export const LIBELLES_TVA: Record<number, { court: string; usage: string }> = {
  550: { court: '5,5 %', usage: 'À emporter, produit emballé (consommation différée)' },
  1000: { court: '10 %', usage: 'Consommation immédiate — sandwichs, frites, boissons sans alcool' },
  2000: { court: '20 %', usage: 'Alcools et articles non alimentaires' },
};

export function estTauxTvaValide(bps: unknown): bps is TauxTvaBps {
  return typeof bps === 'number' && (TAUX_TVA as readonly number[]).includes(bps);
}

/** Libellé court d'un taux, y compris inconnu (on affiche plutôt que d'échouer). */
export function libelleTaux(bps: number): string {
  return LIBELLES_TVA[bps]?.court ?? `${(bps / 100).toString().replace('.', ',')} %`;
}

/** HT à partir du TTC, au centime. */
export function htDepuisTtc(ttcCents: number, bps: number): number {
  return Math.round(ttcCents / (1 + bps / 10_000));
}

/** Une ligne de vente telle qu'elle entre dans le calcul. */
export interface LigneTva {
  /** Montant TTC de la ligne, en centimes. */
  ttcCents: number;
  vatRateBps: number;
}

/** Le chiffre d'affaires d'un taux donné. */
export interface TrancheTva {
  vatRateBps: number;
  /** « 10 % », prêt à afficher. */
  label: string;
  ttcCents: number;
  htCents: number;
  tvaCents: number;
}

export interface VentilationTva {
  /** Une entrée par taux réellement vendu, du plus bas au plus haut. */
  tranches: TrancheTva[];
  ttcCents: number;
  htCents: number;
  tvaCents: number;
}

/**
 * Ventile un chiffre d'affaires par taux de TVA.
 *
 * `remiseCents` (fidélité) est répartie au PRORATA du poids de chaque taux.
 * C'est la règle usuelle d'une remise commerciale qui ne vise aucun produit en
 * particulier : elle réduit la base imposable de chaque taux proportionnellement.
 * L'imputer entièrement sur un seul taux — le plus élevé, par exemple —
 * reviendrait à minorer la TVA due.
 *
 * Le reste de la division entière va à la tranche la plus lourde, de sorte que
 * la somme des tranches redonne TOUJOURS le total exact. Un tableau dont les
 * lignes ne totalisent pas le pied est un tableau qu'on ne peut pas déposer.
 */
export function ventilerTva(lignes: LigneTva[], remiseCents = 0): VentilationTva {
  const parTaux = new Map<number, number>();
  for (const l of lignes) {
    parTaux.set(l.vatRateBps, (parTaux.get(l.vatRateBps) ?? 0) + l.ttcCents);
  }

  const brut = [...parTaux.values()].reduce((s, v) => s + v, 0);
  const remise = Math.min(Math.max(remiseCents, 0), brut);

  const taux = [...parTaux.entries()].sort((a, b) => a[0] - b[0]);
  const remises = taux.map(([, ttc]) => (brut === 0 ? 0 : Math.round((ttc * remise) / brut)));

  // Le reste d'arrondi atterrit sur la tranche la plus lourde : c'est celle où
  // un centime de plus ou de moins pèse le moins.
  const ecart = remise - remises.reduce((s, v) => s + v, 0);
  if (ecart !== 0 && taux.length > 0) {
    let plusLourde = 0;
    for (let i = 1; i < taux.length; i += 1) {
      if (taux[i][1] > taux[plusLourde][1]) plusLourde = i;
    }
    remises[plusLourde] += ecart;
  }

  const tranches: TrancheTva[] = taux.map(([bps, ttcBrut], i) => {
    const ttcCents = ttcBrut - remises[i];
    const htCents = htDepuisTtc(ttcCents, bps);
    return { vatRateBps: bps, label: libelleTaux(bps), ttcCents, htCents, tvaCents: ttcCents - htCents };
  });

  const ttcCents = tranches.reduce((s, t) => s + t.ttcCents, 0);
  const htCents = tranches.reduce((s, t) => s + t.htCents, 0);
  return { tranches, ttcCents, htCents, tvaCents: ttcCents - htCents };
}

/**
 * Ventile un chiffre d'affaires DÉJÀ CONNU sur les taux de ses lignes.
 *
 * Les lignes de commande totalisent le sous-total ; le montant réellement
 * encaissé est ce sous-total moins les remises fidélité. On ne recalcule donc
 * pas le total à partir des lignes — on part du montant encaissé, qui fait foi,
 * et on répartit l'écart au prorata. La somme des tranches redonne exactement
 * le chiffre affiché en pied de tableau, ce qui est la seule chose qu'un
 * comptable vérifie en premier.
 *
 * Si les lignes sont introuvables alors que de l'argent est entré (commande
 * ancienne, produit supprimé), tout est porté au taux par défaut plutôt que
 * disparaître du rapport : un CA sous-déclaré est pire qu'un CA mal ventilé.
 */
export function ventilerSurTotal(lignes: LigneTva[], ttcReelCents: number): VentilationTva {
  const brut = lignes.reduce((s, l) => s + l.ttcCents, 0);
  if (brut === 0) {
    if (ttcReelCents === 0) return { tranches: [], ttcCents: 0, htCents: 0, tvaCents: 0 };
    return ventilerTva([{ ttcCents: ttcReelCents, vatRateBps: TAUX_TVA_DEFAUT }]);
  }
  return ventilerTva(lignes, brut - ttcReelCents);
}

/**
 * Le taux MOYEN effectivement collecté, en points de base — utile pour
 * l'étiquette d'une vignette (« TVA 13 % ») quand la place manque pour le
 * détail. C'est un indicateur d'affichage, jamais une base de déclaration.
 */
export function tauxMoyenBps(v: VentilationTva): number {
  if (v.htCents === 0) return TAUX_TVA_DEFAUT;
  return Math.round((v.tvaCents / v.htCents) * 10_000);
}
