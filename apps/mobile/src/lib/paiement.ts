/**
 * Le règlement — version NAVIGATEUR.
 *
 * Ce fichier sert l'app web. Sur téléphone, Metro lui préfère
 * `paiement.native.ts`, qui ouvre la feuille de paiement de Stripe DANS
 * l'application. Les deux exposent exactement la même fonction : l'écran de
 * paiement n'a pas à savoir sur quoi il tourne.
 *
 * Dans un navigateur il n'y a pas de feuille native à ouvrir : on remplace la
 * page en cours par celle de Stripe, et c'est Stripe qui ramène ensuite sur le
 * site. Rien ne s'exécute après.
 */

export interface DemandePaiement {
  /** `natif` : feuille dans l'app. `web` : page hébergée par Stripe. */
  mode: 'natif' | 'web';
  clientSecret?: string;
  publishableKey?: string;
  checkoutUrl?: string;
  /** Ce que le client lit en haut de la feuille : le nom de la buvette. */
  libelle: string;
}

export interface Reglement {
  /**
   * `paye` : la feuille native a confirmé le paiement.
   * `annule` : le client a renoncé — son panier reste intact.
   * `dehors` : le règlement se joue hors de notre vue (page hébergée). Seule
   *   l'arrivée de la commande, créée par le webhook, dira ce qu'il en est.
   */
  issue: 'paye' | 'annule' | 'dehors';
  /**
   * Se résout quand la page extérieure se referme. Immédiate quand il n'y en a
   * pas : l'appelant peut l'attendre sans se demander où il tourne.
   */
  pageFermee: Promise<void>;
}

export async function payer(demande: DemandePaiement): Promise<Reglement> {
  const g = globalThis as { location?: { assign?: (u: string) => void } };
  if (demande.checkoutUrl) g.location?.assign?.(demande.checkoutUrl);
  // La page va être remplacée : plus rien ne s'exécutera après.
  await new Promise<void>((r) => setTimeout(r, 3_000));
  return { issue: 'dehors', pageFermee: Promise.resolve() };
}
