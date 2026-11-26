/**
 * L'ÉTAT D'UNE COMMANDE FLAIX, DANS LE VOCABULAIRE D'UNE COMMANDE BREAKEAT.
 *
 * Le ticket de « Mes commandes » et l'écran de suivi (27/11/2026) doivent dire
 * la MÊME étape. Cette table vivait dans le ticket seul ; l'écran de suivi en
 * a besoin aussi, et deux copies finiraient par diverger le jour où Flaix
 * ajoute un mot (comme `assigned`, découvert le 25/11).
 *
 * Rend `null` pour un état inconnu : l'appelant garde alors le libellé de Flaix.
 */
export type StatutCommande = 'PAID' | 'PREPARING' | 'READY' | 'PICKED_UP' | 'CANCELLED';

const RECUPEREE = ['collected', 'picked_up', 'delivered', 'done', 'completed', 'served'];
const ANNULEE = ['cancelled', 'canceled', 'refunded', 'failed', 'expired'];
// `assigned` : le mot de Flaix pour « en préparation » (constaté le 25/11/2026).
const EN_PREPARATION = ['preparing', 'in_preparation', 'in_progress', 'cooking', 'assigned', 'processing', 'started'];
const RECUE = ['queued', 'pending', 'waiting', 'received', 'accepted', 'paid'];

export function statutCommandeFlaix(c: {
  etat: string | null;
  prete: boolean;
  enCours: boolean;
}): StatutCommande | null {
  const etat = c.etat ?? '';
  if (c.prete) return 'READY';
  if (RECUPEREE.includes(etat)) return 'PICKED_UP';
  if (ANNULEE.includes(etat)) return 'CANCELLED';
  if (EN_PREPARATION.includes(etat)) return 'PREPARING';
  if (RECUE.includes(etat) || c.enCours) return 'PAID';
  return null;
}

/**
 * La commande Flaix, avec l'état en direct que NOTRE serveur tient à jour
 * (`/flaix/mes-suivis`, relu toutes les 10 s). La liste lue chez Flaix n'est
 * rafraîchie qu'à l'ouverture de « Mes commandes » (le contrat Flaix interdit
 * de l'interroger en boucle) : sans ceci, « en préparation » n'apparaîtrait
 * qu'en rouvrant l'écran.
 */
export function avecEtatEnDirect<
  C extends { etat: string | null; prete: boolean; enCours: boolean; etatDetail: string | null },
>(c: C, direct: { etat: string; status: string } | undefined): C {
  if (!direct || direct.etat === c.etat) return c;
  return {
    ...c,
    etat: direct.etat,
    prete: direct.etat === 'ready',
    enCours: !['PICKED_UP', 'CANCELLED'].includes(direct.status),
    // La phrase lue chez Flaix décrivait l'état d'avant : on ne la garde pas.
    etatDetail: null,
  };
}
