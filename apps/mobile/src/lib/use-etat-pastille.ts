import { useEffect, useReducer } from 'react';
import { AppState } from 'react-native';

import { apiGetMyOrders } from '@lib/api/mobile-api';
import { useAuthStore } from '@store/auth.store';
import { useSuiviStore } from '@store/suivi.store';
import { estEnCours, etatPastille, expirationEtat, type EtatPastille } from '@lib/suivi-commande';

/** Même cadence que l'écran « Mes commandes » : il publie, on ne double pas. */
const INTERVALLE_MS = 10_000;

/** Écrans qui annoncent une commande NEUVE — on recharge en y arrivant. */
const APRES_PAIEMENT = new Set(['OrderConfirmation', 'OrderTracking']);

let chargementEnCours = false;

/**
 * Recharge les commandes, sauf si un chargement vient d'avoir lieu ou est en
 * route. Deux sources (la barre et l'écran « Mes commandes ») peuvent le
 * demander à la même seconde : une seule requête part.
 */
async function rafraichir(fraicheurMs = 1_000): Promise<void> {
  if (chargementEnCours) return;
  if (Date.now() - useSuiviStore.getState().chargeA < fraicheurMs) return;
  chargementEnCours = true;
  try {
    useSuiviStore.getState().publier(await apiGetMyOrders());
  } catch (e: unknown) {
    // On garde le dernier état connu : mieux vaut un anneau en retard de dix
    // secondes qu'une pastille qui retombe au repos à chaque coupure réseau
    // dans un stade bondé.
    console.warn('Suivi de commande : chargement impossible', e);
  } finally {
    chargementEnCours = false;
  }
}

/**
 * L'état de la pastille centrale, tenu à jour.
 *
 * Le réseau ne travaille QUE pendant une commande en cours : sans commande, pas
 * de sondage — seulement un chargement à l'ouverture de l'app, au retour au
 * premier plan, et après un paiement.
 */
export function useEtatPastille(routeCourante?: string): EtatPastille {
  const token = useAuthStore((e) => e.token);
  const commandes = useSuiviStore((e) => e.commandes);
  // Ne sert qu'à provoquer un nouveau rendu quand le ✓ doit s'effacer.
  const [, reveiller] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!token) {
      useSuiviStore.getState().vider();
      return;
    }
    void rafraichir();
  }, [token]);

  // iOS SUSPEND les minuteurs en arrière-plan : au retour, l'anneau montrerait
  // l'état d'il y a dix minutes jusqu'au prochain tic.
  useEffect(() => {
    if (!token) return;
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') void rafraichir();
    });
    return () => abonnement.remove();
  }, [token]);

  useEffect(() => {
    if (token && routeCourante && APRES_PAIEMENT.has(routeCourante)) void rafraichir();
  }, [token, routeCourante]);

  const enCours = commandes.some(estEnCours);
  useEffect(() => {
    if (!token || !enCours) return;
    // Fraîcheur exigée juste sous l'intervalle : si l'écran « Mes commandes »
    // vient de charger, on ne repart pas.
    const minuterie = setInterval(() => void rafraichir(INTERVALLE_MS - 1_000), INTERVALLE_MS);
    return () => clearInterval(minuterie);
  }, [token, enCours]);

  // `Date.now()` à chaque rendu, et non une horloge gardée en état : une
  // horloge figée au démarrage ferait durer le ✓ d'une commande récupérée une
  // heure plus tard bien au-delà de ses dix minutes.
  const maintenant = Date.now();
  const reste = expirationEtat(commandes, maintenant);
  useEffect(() => {
    if (reste === null) return;
    const minuterie = setTimeout(reveiller, reste + 500);
    return () => clearTimeout(minuterie);
  }, [reste]);

  return token ? etatPastille(commandes, maintenant) : 'repos';
}
