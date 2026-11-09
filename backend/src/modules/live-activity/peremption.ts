/**
 * QUAND LA LIVE ACTIVITY DEVIENT « PÉRIMÉE ».
 *
 * La Live Activity affiche un DÉCOMPTE jusqu'à l'heure de retrait (ou jusqu'à
 * l'heure estimée, quand Flaix en donne une). iOS fait tourner ce chrono seul,
 * sans qu'on lui envoie quoi que ce soit chaque seconde — mais il ne sait pas
 * quoi faire une fois à zéro : il afficherait « 0:00 » jusqu'à la prochaine
 * mise à jour, alors que la commande est peut-être encore en préparation.
 *
 * D'où la date de péremption (`stale-date` d'APNs). Quand elle passe, iOS
 * redessine l'activité en la marquant périmée, et le widget remplace le
 * décompte par l'heure de retrait. On la place donc PILE à la fin du
 * décompte.
 *
 * Sans cible dans le futur, on garde le plafond d'une heure d'avant : une
 * activité qui n'a reçu aucune nouvelle depuis une heure ne doit plus passer
 * pour à jour.
 *
 * Le widget calcule la même cible de son côté (`countdownTarget`, dans
 * `BreakEatOrderAttributes.swift`) : même ordre de priorité, mêmes statuts.
 * Les deux doivent rester alignés.
 */

/** Plafond : au-delà d'une heure sans nouvelle, l'activité est périmée. */
export const PEREMPTION_MAX_MS = 60 * 60 * 1000;

/** Statuts pendant lesquels un décompte a un sens : la commande est attendue. */
const STATUTS_EN_ATTENTE = new Set(['CREATED', 'PREPARING', 'DELAYED']);

export interface EtatPourPeremption {
  status: string;
  estimatedReadyAt: string | null;
  slotStartAt: string | null;
  missingItems?: string[];
}

/**
 * L'heure que vise le décompte, ou null s'il n'y en a pas.
 *
 * L'ESTIMATION prime sur le créneau : quand elle existe, elle a été recalculée
 * après la commande, le créneau non. Pas de décompte une fois la commande
 * prête, terminée, ou bloquée par un produit manquant : le client n'attend
 * plus une heure, il a quelque chose à faire.
 */
export function cibleDuDecompte(etat: EtatPourPeremption): Date | null {
  if (!STATUTS_EN_ATTENTE.has(etat.status)) return null;
  if ((etat.missingItems ?? []).length > 0) return null;
  for (const iso of [etat.estimatedReadyAt, etat.slotStartAt]) {
    if (!iso) continue;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** La date de péremption à envoyer avec une mise à jour non finale. */
export function dateDePeremption(etat: EtatPourPeremption, maintenant: number): Date {
  const plafond = maintenant + PEREMPTION_MAX_MS;
  const cible = cibleDuDecompte(etat);
  if (cible && cible.getTime() > maintenant && cible.getTime() < plafond) return cible;
  return new Date(plafond);
}
