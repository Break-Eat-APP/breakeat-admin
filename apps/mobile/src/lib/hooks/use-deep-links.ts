import { useEffect } from 'react';
import { DeviceEventEmitter, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { navigateTo } from '@navigation/nav-ref';
import { apiMarkArrived } from '@lib/api/mobile-api';
import { useAuthStore } from '@store/auth.store';
import { showAlert } from '@lib/alert';

/**
 * Liens `breakeat://` — la Live Activity parle à l'app.
 *
 * Trois destinations aujourd'hui :
 *   breakeat://order/<id>           → suivi de la commande (appui sur la carte)
 *   breakeat://order/<id>/arrived   → « Je suis arrivé » (bouton de la carte)
 *   breakeat://paiement?…           → retour de la page de paiement Stripe
 *
 * Le bouton de l'écran verrouillé passe par ici plutôt que d'agir seul : c'est
 * l'app qui détient la session du client. Le trajet est donc : appui → l'app
 * s'ouvre → elle signale l'arrivée → le serveur repousse l'état → la Live
 * Activity affiche la confirmation.
 */

/** `breakeat://order/<id>` avec un suffixe d'action optionnel. */
const LIEN_COMMANDE = /^breakeat:\/\/order\/([^/?#]+)(?:\/([a-z]+))?/i;

/**
 * Émis après un signalement d'arrivée réussi.
 *
 * L'écran « Mes commandes » recharge dessus : sans cela, la confirmation
 * n'apparaîtrait qu'au sondage suivant, soit jusqu'à dix secondes après un
 * geste que le client vient tout juste de faire.
 */
export const EVT_COMMANDES_A_RECHARGER = 'breakeat:orders:refresh';

async function suivre(url: string): Promise<void> {
  // Retour de paiement : refermer la feuille Safari, et rien d'autre.
  //
  // C'est l'écran de commande qui reprend la main — il attend justement que ce
  // navigateur se ferme pour aller chercher la commande. Naviguer ici, en
  // parallèle, le doublerait et ferait clignoter deux écrans.
  if (url.startsWith('breakeat://paiement')) {
    try {
      await WebBrowser.dismissBrowser();
    } catch {
      // Feuille déjà fermée : c'est le cas nominal quand iOS la ferme seul.
    }
    return;
  }

  const parts = LIEN_COMMANDE.exec(url);
  if (!parts) return;

  const orderId = parts[1];
  const action = parts[2]?.toLowerCase();

  if (action !== 'arrived') {
    navigateTo('OrderTracking', { orderId });
    return;
  }

  // Signaler une arrivée exige la session : sans elle, l'appel repartirait en
  // 401 et viderait l'authentification. On envoie plutôt le client se connecter.
  if (!useAuthStore.getState().token) {
    navigateTo('Login');
    return;
  }

  // On ouvre l'écran AVANT l'appel : le client vient d'appuyer, il doit voir
  // l'app réagir tout de suite, même si le réseau du stade traîne.
  navigateTo('Commandes');
  try {
    await apiMarkArrived(orderId);
    DeviceEventEmitter.emit(EVT_COMMANDES_A_RECHARGER);
  } catch (e: unknown) {
    console.warn('Signalement d’arrivée depuis la Live Activity échoué:', e);
    showAlert(
      'Signalement impossible',
      "Ta présence n'a pas pu être envoyée. Réessaie depuis « Mes commandes ».",
    );
  }
}

/**
 * Branche l'écoute des liens entrants.
 *
 * `pret` doit passer à vrai quand le conteneur de navigation est prêt : un lien
 * traité trop tôt naviguerait dans le vide (l'app s'ouvrirait sur l'accueil,
 * sans message d'erreur — le pire des symptômes).
 */
export function useDeepLinks(pret: boolean): void {
  useEffect(() => {
    if (!pret) return;

    const traiter = (url: string | null | undefined) => {
      if (url) void suivre(url);
    };

    // Ouverture à froid (app fermée) puis liens reçus app déjà lancée.
    void Linking.getInitialURL().then(traiter);
    const abonnement = Linking.addEventListener('url', ({ url }) => traiter(url));
    return () => abonnement.remove();
  }, [pret]);
}
