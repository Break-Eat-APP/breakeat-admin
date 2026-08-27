import { useEffect } from 'react';
import { DeviceEventEmitter, Linking } from 'react-native';
import { navigateTo } from '@navigation/nav-ref';
import { apiGetPublicEvent, apiJoinOrderGroup, apiMarkArrived } from '@lib/api/mobile-api';
import { useAuthStore } from '@store/auth.store';
import { useCartStore } from '@store/cart.store';
import { showAlert } from '@lib/alert';

/**
 * Liens `breakeat://` — la Live Activity parle à l'app.
 *
 * Trois destinations aujourd'hui :
 *   breakeat://order/<id>           → suivi de la commande (appui sur la carte)
 *   breakeat://order/<id>/arrived   → « Je suis arrivé » (bouton de la carte)
 *   breakeat://join/<code>          → rejoindre la commande d'un ami
 *
 * Le bouton de l'écran verrouillé passe par ici plutôt que d'agir seul : c'est
 * l'app qui détient la session du client. Le trajet est donc : appui → l'app
 * s'ouvre → elle signale l'arrivée → le serveur repousse l'état → la Live
 * Activity affiche la confirmation.
 */

/** `breakeat://order/<id>` avec un suffixe d'action optionnel. */
const LIEN_COMMANDE = /^breakeat:\/\/order\/([^/?#]+)(?:\/([a-z]+))?/i;

/** `breakeat://join/<code>` — invitation partagée par un ami. */
const LIEN_INVITATION = /^breakeat:\/\/join\/([A-Z0-9]{4,12})/i;

/**
 * Émis après un signalement d'arrivée réussi.
 *
 * L'écran « Mes commandes » recharge dessus : sans cela, la confirmation
 * n'apparaîtrait qu'au sondage suivant, soit jusqu'à dix secondes après un
 * geste que le client vient tout juste de faire.
 */
export const EVT_COMMANDES_A_RECHARGER = 'breakeat:orders:refresh';

/**
 * Rejoindre la commande d'un ami : on ouvre SA buvette, panier vide.
 *
 * Le code est porté par le panier jusqu'au paiement — c'est à la création du
 * panier côté serveur que le rattachement se fait. L'ami compose ce qu'il veut
 * et paie sa part ; les deux commandes arrivent liées chez la buvette.
 */
async function rejoindreInvitation(code: string): Promise<void> {
  if (!useAuthStore.getState().token) {
    // On garde le code : après connexion, le client relancera le lien. Envoyer
    // vers la connexion vaut mieux qu'un échec silencieux.
    navigateTo('Login');
    showAlert(
      'Connecte-toi pour rejoindre',
      `Puis rouvre le lien de ton ami (code ${code.toUpperCase()}).`,
    );
    return;
  }

  try {
    const groupe = await apiJoinOrderGroup(code);
    // Le plan de la buvette voyage avec le panier : on le récupère au passage,
    // pour que l'ami ait le même « Y aller » que l'hôte.
    const evenement = await apiGetPublicEvent(groupe.eventId).catch(() => null);
    const buvette = evenement?.suppliers.find((sup) => sup.id === groupe.supplierId);

    useCartStore
      .getState()
      .initCart(
        groupe.eventId,
        groupe.supplierId,
        buvette?.planUrl ?? evenement?.venue?.buvettePlanUrl ?? null,
        evenement?.venue?.id ?? null,
        groupe.code,
      );
    navigateTo('SupplierCatalog', { eventId: groupe.eventId, supplierId: groupe.supplierId });
  } catch (e: unknown) {
    console.warn('Invitation non rejointe:', e);
    showAlert(
      'Invitation indisponible',
      "Ce code n'est plus valide. Demande à ton ami de t'en renvoyer un.",
    );
  }
}

async function suivre(url: string): Promise<void> {
  const invitation = LIEN_INVITATION.exec(url);
  if (invitation) {
    await rejoindreInvitation(invitation[1]);
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
