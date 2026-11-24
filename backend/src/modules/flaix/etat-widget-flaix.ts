/**
 * L'ÉTAT D'UNE COMMANDE FLAIX, TRADUIT POUR LE WIDGET DE LA LIVE ACTIVITY
 * (24/11/2026).
 *
 * Le widget iOS (`apps/mobile/targets/live-activity`) connaît les états d'une
 * commande BreakEat : CREATED, PREPARING, READY, COLLECTED, CANCELLED. Une
 * commande Flaix s'y affiche à l'identique — seuls les mots d'entrée changent.
 *
 * Les états Flaix viennent du suivi (`/status` : `queued`, `preparing`,
 * `ready`, `delivered`…) ou de la liste, déjà normalisée par
 * `commandes-client-flaix.service.ts` (`en_preparation` → `preparing`…).
 * Contrat Flaix, § 6 : une valeur inattendue est traitée comme inconnue, sans
 * erreur — ici, « Commande reçue ».
 */
export type StatutWidget = 'CREATED' | 'PREPARING' | 'READY' | 'COLLECTED' | 'CANCELLED';

const LIBELLES: Record<StatutWidget, string> = {
  CREATED: 'Commande reçue',
  PREPARING: 'En préparation',
  READY: 'Commande prête',
  COLLECTED: 'Commande récupérée',
  CANCELLED: 'Commande annulée',
};

const PREPARATION = new Set(['preparing', 'in_progress', 'in_preparation', 'cooking', 'en_preparation']);
const PRETE = new Set(['ready', 'prete']);
const REMISE = new Set(['delivered', 'collected', 'picked_up', 'done', 'completed', 'served', 'remise', 'recuperee']);
const ANNULEE = new Set(['cancelled', 'canceled', 'refunded', 'failed', 'expired', 'annulee', 'remboursee']);

export function statutWidget(etat: string | null | undefined): StatutWidget {
  const e = (etat ?? '').toLowerCase();
  if (PRETE.has(e)) return 'READY';
  if (PREPARATION.has(e)) return 'PREPARING';
  if (REMISE.has(e)) return 'COLLECTED';
  if (ANNULEE.has(e)) return 'CANCELLED';
  return 'CREATED';
}

export const libelleWidget = (s: StatutWidget): string => LIBELLES[s];

/** Ce que le widget reçoit — la même forme qu'une commande BreakEat. */
export interface EtatLiveActivityFlaix {
  status: StatutWidget;
  statusLabel: string;
  orderNumber: string;
  pickupPoint: string | null;
  estimatedReadyAt: null;
  slotStartAt: null;
  slotEndAt: null;
  updatedAt: string;
  customerArrived: false;
  missingItems: string[];
}

export function etatLiveActivity(
  suivi: { numero: string; pointDeRetrait: string | null; etat: string },
  maintenant: Date = new Date(),
): EtatLiveActivityFlaix {
  const status = statutWidget(suivi.etat);
  return {
    status,
    statusLabel: libelleWidget(status),
    orderNumber: suivi.numero,
    pickupPoint: suivi.pointDeRetrait,
    // Pas de décompte : Flaix ne donne pas d'heure estimée vivante exploitable
    // (contrat, `retraitPrevu` est FIGÉ). Mieux vaut pas de minuteur qu'un faux.
    estimatedReadyAt: null,
    slotStartAt: null,
    slotEndAt: null,
    updatedAt: maintenant.toISOString(),
    customerArrived: false,
    missingItems: [],
  };
}
