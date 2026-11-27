/**
 * TOUS LES AVIS, FILTRÉS — et ce qui est NOUVEAU depuis la dernière visite
 * (27/11/2026). Rémi : « que tous les avis s'affichent, que je puisse les
 * filtrer, et ne pas regarder un par un s'il y a eu de nouveaux avis ».
 *
 * Fonctions PURES (testées dans `avis.spec.ts`). Le souvenir de la dernière
 * visite vit dans le navigateur (`localStorage`) : c'est un confort de
 * lecture, pas une donnée — un autre navigateur repart de zéro, sans rien
 * casser.
 */

export interface AvisFiltrable {
  stars: number;
  comment: string | null;
  createdAt: string;
  club: { id: string; nom: string } | null;
}

export type FiltreEtoiles = 'toutes' | 'a-traiter' | 1 | 2 | 3 | 4 | 5;

export interface Filtres {
  clubId: string;
  etoiles: FiltreEtoiles;
  avecCommentaire: boolean;
}

export function filtrerAvis<T extends AvisFiltrable>(notes: T[], f: Filtres): T[] {
  return notes.filter((n) => {
    if (f.clubId && n.club?.id !== f.clubId) return false;
    // « À traiter » : 1 et 2 étoiles, ce qu'un club doit lire en premier.
    if (f.etoiles === 'a-traiter' && n.stars > 2) return false;
    if (typeof f.etoiles === 'number' && n.stars !== f.etoiles) return false;
    if (f.avecCommentaire && !n.comment?.trim()) return false;
    return true;
  });
}

/** Arrivé après la dernière visite. Aucune visite connue : rien n'est « nouveau ». */
export const estNouveau = (n: { createdAt: string }, vuJusquAu: string | null): boolean =>
  !!vuJusquAu && n.createdAt > vuJusquAu;

export const compterNouveaux = (notes: { createdAt: string }[], vuJusquAu: string | null): number =>
  notes.filter((n) => estNouveau(n, vuJusquAu)).length;

/** Le plus récent des avis : ce que la page retient comme « vu ». */
export const plusRecent = (notes: { createdAt: string }[]): string | null =>
  notes.reduce<string | null>((max, n) => (max === null || n.createdAt > max ? n.createdAt : max), null);

const CLE = 'breakeat_backoffice_avis_vus_jusqu_au';

export function lireVuJusquAu(): string | null {
  try {
    return window.localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

export function retenirVuJusquAu(date: string | null): void {
  if (!date) return;
  try {
    window.localStorage.setItem(CLE, date);
  } catch {
    // Navigation privée ou stockage refusé : la page marche sans.
  }
}
