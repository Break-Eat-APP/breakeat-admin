/**
 * Le règlement — version TÉLÉPHONE, sans jamais sortir de l'application.
 *
 * La feuille de paiement de Stripe s'ouvre PAR-DESSUS l'écran, comme un
 * sélecteur de photos : pas de navigateur, pas d'adresse, pas de retour à
 * négocier. Le client voit Break Eat derrière, et l'app reprend la main à la
 * seconde où il a payé.
 *
 * Ce que cela remplace : une page hébergée, ouverte dans une feuille Safari.
 * Techniquement le client ne quittait pas l'app — mais il en avait le
 * sentiment, et le retour dépendait d'un rebond `breakeat://` qu'iOS ignore
 * quand il n'est pas déclenché par un appui. Il payait, restait devant une page
 * web, et revenait à la main.
 *
 * Aucun numéro de carte ne traverse notre code, ici pas davantage qu'avant : la
 * feuille appartient au SDK de Stripe, et ne nous rend qu'un oui ou un non.
 *
 * Le repli par page hébergée reste écrit : sans clé publiable, le serveur ne
 * peut pas ouvrir de feuille native, et un paiement impossible serait pire
 * qu'un paiement qui sort de l'app.
 */
import * as WebBrowser from 'expo-web-browser';
import { initPaymentSheet, initStripe, presentPaymentSheet } from '@stripe/stripe-react-native';
import { THEME } from '@lib/theme';
import type { DemandePaiement, Reglement } from '@lib/paiement';

/**
 * Où Stripe ramène après une authentification 3-D Secure.
 *
 * Un chemin À PART, que le reste de l'app ignore : `breakeat://paiement` est
 * déjà écouté ailleurs (il referme la feuille Safari du repli), et lui faire
 * porter les deux rôles reviendrait à interrompre une authentification bancaire
 * en cours.
 */
const RETOUR_3DS = 'breakeat://stripe-redirect';

export async function payer(demande: DemandePaiement): Promise<Reglement> {
  if (demande.mode === 'natif' && demande.clientSecret && demande.publishableKey) {
    return feuilleNative(demande.clientSecret, demande.publishableKey, demande.libelle);
  }
  return pageHebergee(demande.checkoutUrl ?? '');
}

async function feuilleNative(
  clientSecret: string,
  publishableKey: string,
  libelle: string,
): Promise<Reglement> {
  // La clé vient du SERVEUR, à chaque paiement : elle suit son mode (test ou
  // production) au lieu d'être gelée dans la build. Passer l'un à l'autre ne
  // demande donc pas de relivrer l'application.
  await initStripe({ publishableKey });

  const preparation = await initPaymentSheet({
    merchantDisplayName: libelle,
    paymentIntentClientSecret: clientSecret,
    returnURL: RETOUR_3DS,
    // Un paiement différé (virement, prélèvement) confirmerait une commande
    // avant que l'argent n'arrive : la buvette servirait à crédit sans le
    // savoir.
    allowsDelayedPaymentMethods: false,
    appearance: {
      colors: {
        primary: THEME.orange,
        background: THEME.bg,
        componentBackground: THEME.surface,
      },
      shapes: { borderRadius: 14 },
    },
  });
  if (preparation.error) throw new Error(preparation.error.message);

  const reglement = await presentPaymentSheet();
  if (reglement.error) {
    // Renoncer n'est pas une panne : le panier reste intact, et rien ne doit
    // s'afficher en rouge.
    if (reglement.error.code === 'Canceled') {
      return { issue: 'annule', pageFermee: Promise.resolve() };
    }
    throw new Error(reglement.error.message);
  }
  return { issue: 'paye', pageFermee: Promise.resolve() };
}

/** Le repli : la page de Stripe, dans une feuille Safari intégrée. */
async function pageHebergee(url: string): Promise<Reglement> {
  if (!url) throw new Error('Le paiement n’a pas pu être ouvert. Réessaie dans un instant.');

  const pageFermee = WebBrowser.openBrowserAsync(url, {
    // Aux couleurs de l'app : le client doit sentir qu'il n'a pas quitté
    // Break Eat pour un site inconnu au moment de donner sa carte.
    toolbarColor: THEME.bg,
    controlsColor: THEME.orange,
    dismissButtonStyle: 'cancel',
  }).then(() => undefined);

  return { issue: 'dehors', pageFermee };
}
