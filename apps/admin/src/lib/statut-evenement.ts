/**
 * LE STATUT D'UN ÉVÉNEMENT, DIT EN FRANÇAIS — ET CE QUE VIT VRAIMENT UN MATCH FLAIX.
 *
 * Le 27/11/2026, Rémi voit « DRAFT » sur un match Flaix ouvert à la commande
 * dans l'app et chez Flaix. Ce n'était pas une panne : pour un lieu Flaix, le
 * serveur ouvre la commande à l'heure, avec le lien Flaix, QUEL QUE SOIT le
 * statut (ADR-0009, `backend/src/common/helpers/fenetre-commande.ts`,
 * `ouvrable`). Seuls « suspendu », « annulé » et « terminé » la ferment. Un
 * match importé de Flaix naît en brouillon et n'en sort jamais : c'est
 * normal, et l'écran le faisait passer pour fermé.
 *
 * Ici, on dit donc ce que le client vit : « Ouvert à la commande », « La
 * commande ouvre le… », « Terminé ». Mêmes règles que le serveur ; s'il
 * change, ce fichier change avec lui.
 */

export const LIBELLE_STATUT: Record<string, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  PAUSED: 'Suspendu',
  ENDED: 'Terminé',
  CANCELLED: 'Annulé',
};

export const libelleStatut = (status: string): string => LIBELLE_STATUT[status] ?? status;

export type TonEtat = 'ouvert' | 'bientot' | 'ferme' | 'arrete';

export interface EtatCommandeFlaix {
  libelle: string;
  detail: string;
  ton: TonEtat;
}

export interface EvenementFlaixAffiche {
  status: string;
  startAt: string;
  endAt: string;
  ordersOpenAt?: string | null;
  flaixOrderUrl?: string | null;
}

const quand = (d: Date) =>
  d.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * L'heure d'ouverture, comme le serveur (`heureDOuverture`) :
 *  · l'heure donnée par Flaix pour CE match l'emporte, telle quelle ;
 *  · sinon l'heure du lieu (« HH:MM ») le jour du match, jamais après le début.
 *
 * L'heure du lieu est lue à l'heure locale du navigateur : les clubs sont en
 * France, comme leurs lieux. Le serveur, lui, calcule dans le fuseau du lieu.
 */
export function ouvertureDeLaCommande(ev: EvenementFlaixAffiche, heureDuLieu?: string | null): Date {
  const debut = new Date(ev.startAt);
  if (ev.ordersOpenAt) {
    const flaix = new Date(ev.ordersOpenAt);
    if (!Number.isNaN(flaix.getTime())) return flaix;
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec((heureDuLieu ?? '').trim());
  if (!m) return debut;
  const ouverture = new Date(debut);
  ouverture.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return ouverture.getTime() < debut.getTime() ? ouverture : debut;
}

/** Ce que vit un match d'un lieu Flaix, à cet instant. */
export function etatCommandeFlaix(
  ev: EvenementFlaixAffiche,
  heureDuLieu: string | null | undefined,
  maintenant: Date = new Date(),
): EtatCommandeFlaix {
  if (ev.status === 'CANCELLED') {
    return { libelle: 'Annulé', detail: 'Le match est annulé : la commande est fermée.', ton: 'arrete' };
  }
  if (ev.status === 'PAUSED') {
    return {
      libelle: 'Suspendu',
      detail: 'Tu as suspendu la commande : personne ne peut commander tant que tu ne la rouvres pas.',
      ton: 'arrete',
    };
  }
  const fin = new Date(ev.endAt);
  if (ev.status === 'ENDED' || maintenant.getTime() > fin.getTime()) {
    return { libelle: 'Terminé', detail: 'Le match est fini : la commande est fermée.', ton: 'ferme' };
  }
  if (!ev.flaixOrderUrl) {
    return {
      libelle: 'Lien Flaix manquant',
      detail: 'Sans lien de commande Flaix, le bouton « Commander » ne peut pas ouvrir.',
      ton: 'arrete',
    };
  }
  const ouverture = ouvertureDeLaCommande(ev, heureDuLieu);
  if (maintenant.getTime() >= ouverture.getTime()) {
    return { libelle: 'Ouvert à la commande', detail: `Jusqu'au ${quand(fin)}.`, ton: 'ouvert' };
  }
  return { libelle: 'Bientôt ouvert', detail: `La commande ouvre le ${quand(ouverture)}.`, ton: 'bientot' };
}

/** Les couleurs d'une pastille, par ton. */
export const COULEURS_TON: Record<TonEtat, { bg: string; color: string }> = {
  ouvert: { bg: '#d1fae5', color: '#065f46' },
  bientot: { bg: '#fef3c7', color: '#92400e' },
  ferme: { bg: '#e7e5e4', color: '#57534e' },
  arrete: { bg: '#fee2e2', color: '#991b1b' },
};
