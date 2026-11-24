/**
 * LA LIVE ACTIVITY D'UNE COMMANDE FLAIX (24/11/2026).
 *
 * La commande se paie sur la page Flaix, dans l'app (`relais-flaix.native.tsx`).
 * Après le paiement, Flaix affiche une adresse en `…/orders/<jeton>` : c'est
 * là que l'app apprend quelle commande vient d'être passée (réponse du
 * développeur Flaix, 24/11). Elle demande alors au serveur de la suivre, et
 * démarre la Live Activity avec l'état qu'il rend ; le serveur la fait avancer
 * ensuite par APNs (`flaix/surveillance-commandes-flaix.service.ts`).
 *
 * L'activité porte `flaix-<jeton>` en guise d'identifiant de commande : le
 * widget est celui des commandes BreakEat, sans changement natif. Les liens
 * qu'il ouvre (`breakeat://order/flaix-…`) mènent à « Mes commandes »
 * (`hooks/use-deep-links.ts`).
 */
import { estChezFlaix } from '@lib/navigation-flaix';

/** Le préfixe des Live Activities de commandes Flaix. */
export const PREFIXE_FLAIX = 'flaix-';

const JETON_DANS_ADRESSE = /\/orders\/([A-Za-z0-9_-]{8,128})(?:[/?#]|$)/;

/** Le jeton d'une adresse de suivi Flaix, ou null. Seulement chez Flaix. */
export function jetonDeLAdresse(url: string | null | undefined): string | null {
  if (!url || !estChezFlaix(url)) return null;
  const m = JETON_DANS_ADRESSE.exec(url);
  return m ? m[1] : null;
}

export const idActiviteFlaix = (jeton: string) => `${PREFIXE_FLAIX}${jeton}`;

export function jetonDeLActivite(orderId: string): string | null {
  return orderId.startsWith(PREFIXE_FLAIX) ? orderId.slice(PREFIXE_FLAIX.length) || null : null;
}

export interface DepsSuivi {
  suivre: (jeton: string) => Promise<{
    status: string;
    statusLabel: string;
    orderNumber: string;
    pickupPoint: string | null;
    updatedAt: string;
  }>;
  activitesEnCours: () => Promise<Array<{ orderId: string }>>;
  demarrer: (orderId: string, etat: {
    status: string;
    statusLabel: string;
    orderNumber: string;
    pickupPoint: string | null;
    estimatedReadyAt: null;
    slotStartAt: null;
    slotEndAt: null;
    updatedAt: string;
  }) => Promise<string | null>;
  liveActivityPossible: () => Promise<boolean>;
  attendre?: (ms: number) => Promise<void>;
}

/** Flaix peut mettre quelques secondes à lister la commande après le paiement. */
export const ATTENTES_MS = [0, 2_000, 5_000, 10_000];

/**
 * Suit la commande `jeton` : le serveur la surveille (notification « prête »),
 * et, sur un iPhone qui le permet, la Live Activity démarre. Rend l'identifiant
 * de l'activité, ou null. Ne lève jamais : rien ne doit gêner la commande.
 */
export async function suivreCommandeFlaix(jeton: string, deps: DepsSuivi): Promise<string | null> {
  const attendre = deps.attendre ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let etat: Awaited<ReturnType<DepsSuivi['suivre']>> | null = null;
  for (const ms of ATTENTES_MS) {
    if (ms > 0) await attendre(ms);
    try {
      etat = await deps.suivre(jeton);
      break;
    } catch {
      // Pas encore listée chez Flaix, ou réseau : on réessaie.
    }
  }
  if (!etat) return null;

  try {
    if (!(await deps.liveActivityPossible())) return null;
    const id = idActiviteFlaix(jeton);
    const deja = await deps.activitesEnCours();
    if (deja.some((a) => a.orderId === id)) return null;
    return await deps.demarrer(id, {
      status: etat.status,
      statusLabel: etat.statusLabel,
      orderNumber: etat.orderNumber,
      pickupPoint: etat.pickupPoint,
      estimatedReadyAt: null,
      slotStartAt: null,
      slotEndAt: null,
      updatedAt: etat.updatedAt,
    });
  } catch {
    return null;
  }
}
