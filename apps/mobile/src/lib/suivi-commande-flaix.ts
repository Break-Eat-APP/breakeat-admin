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

const FORME_JETON = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * LE MESSAGE DE LA PAGE FLAIX (25/11/2026). Flaix reste sur l'adresse du match
 * après le paiement (constaté par Rémi : `…/o/lemans-fc-vs-lyon`) : l'adresse
 * ne dit pas QUELLE commande vient d'être passée. Le développeur Flaix peut
 * l'envoyer à l'app :
 *   window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'flaix_commande', jeton }))
 * Rend le jeton, ou null pour tout autre message.
 */
export function jetonDuMessage(data: string | null | undefined): string | null {
  if (!data) return null;
  try {
    const m = JSON.parse(data) as { type?: unknown; jeton?: unknown };
    if (m.type !== 'flaix_commande' || typeof m.jeton !== 'string') return null;
    return FORME_JETON.test(m.jeton) ? m.jeton : null;
  } catch {
    return null;
  }
}

/**
 * « FERMER » DANS LA PAGE FLAIX → « MES COMMANDES » (demande de Rémi, 25/11/2026).
 *
 * Le bouton est dans la page Flaix ; on ne sait pas ce qu'il fait. Deux voies :
 * la page appelle `window.close()`, que l'app remplace (`INTERCEPTION_FERMETURE`)
 * par ce message ; ou le développeur Flaix l'envoie lui-même.
 */
export function estMessageFermer(data: string | null | undefined): boolean {
  if (!data) return false;
  try {
    return (JSON.parse(data) as { type?: unknown }).type === 'flaix_fermer';
  } catch {
    return false;
  }
}

/** Injecté avant la page : `window.close()` prévient l'app au lieu de ne rien faire. */
export const INTERCEPTION_FERMETURE = `(function () {
  var envoyer = function () {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'flaix_fermer' }));
  };
  try { window.close = envoyer; } catch (e) {}
})();
true;`;

/** La marge sur l'heure de commande : Flaix la donne à la minute près. */
export const MARGE_HEURE_MS = 2 * 60_000;

/**
 * LES COMMANDES PASSÉES PENDANT QUE LA PAGE ÉTAIT OUVERTE (25/11/2026).
 *
 * Sans jeton dans l'adresse ni message de Flaix, l'app reconnaît la nouvelle
 * commande en relisant la liste du client : en cours, absente de la liste lue
 * à l'ouverture de la page, et passée depuis (à 2 min près, Flaix arrondit à
 * la minute).
 */
export function nouvellesCommandes(
  commandes: Array<{ id: string; enCours: boolean; passeeLe: string }>,
  connues: ReadonlySet<string>,
  ouverteLe: number,
): string[] {
  return commandes
    .filter((c) => c.enCours && !connues.has(c.id))
    .filter((c) => {
      const t = new Date(c.passeeLe).getTime();
      return !Number.isNaN(t) && t >= ouverteLe - MARGE_HEURE_MS;
    })
    .map((c) => c.id);
}

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
