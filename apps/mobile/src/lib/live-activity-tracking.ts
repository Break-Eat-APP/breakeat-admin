import {
  isLiveActivitySupported,
  listLiveActivities,
  onPushToken,
  startLiveActivity,
  type LiveActivityState,
} from '../../modules/live-activity';
import { apiRegisterLiveActivity, apiUnregisterLiveActivity } from '@lib/api/mobile-api';

/**
 * Orchestration du suivi de commande sur écran verrouillé.
 *
 * Répartition des rôles :
 *  - l'APP démarre l'activité et transmet son token au backend ;
 *  - le BACKEND pousse ensuite toutes les mises à jour via APNs.
 * L'app ne met jamais à jour le contenu elle-même : c'est ce qui permet à
 * l'activité de rester à jour application fermée, et ce qui évite d'exposer le
 * moindre identifiant Apple côté client.
 *
 * Rien ici ne doit interrompre un parcours de commande : toutes les erreurs
 * sont absorbées, la Live Activity restant un confort d'affichage.
 */

/** Abonnement global aux tokens — un seul suffit pour toutes les activités. */
let tokenSubscription: (() => void) | null = null;

/**
 * Installe l'écoute des tokens push. À appeler une fois au démarrage de l'app
 * (après authentification) : iOS attribue le token de façon asynchrone après
 * `startActivity`, et peut le faire tourner ensuite.
 */
export function initLiveActivityTokenSync(): void {
  if (tokenSubscription) return;
  tokenSubscription = onPushToken(({ activityId, orderId, pushToken }) => {
    void apiRegisterLiveActivity({ orderId, activityId, pushToken }).catch((e: unknown) => {
      // Sans token côté serveur, l'activité restera figée sur son état initial.
      console.warn('Enregistrement du token de Live Activity échoué:', e);
    });
  });
}

/** Coupe l'écoute (déconnexion). */
export function stopLiveActivityTokenSync(): void {
  tokenSubscription?.();
  tokenSubscription = null;
}

/**
 * Démarre le suivi d'une commande fraîchement passée.
 *
 * L'état initial est volontairement minimal : dès que le backend connaîtra le
 * token, il poussera l'état complet (créneau, estimation, buvette). On évite
 * ainsi de dupliquer côté app la logique d'affichage qui vit sur le serveur.
 */
export async function startOrderTracking(params: {
  orderId: string;
  orderNumber: string;
  pickupPoint?: string | null;
  slotStartAt?: string | null;
  slotEndAt?: string | null;
}): Promise<string | null> {
  if (!(await isLiveActivitySupported())) return null;

  const state: LiveActivityState = {
    status: 'CREATED',
    statusLabel: 'Commande reçue',
    orderNumber: params.orderNumber,
    pickupPoint: params.pickupPoint ?? null,
    estimatedReadyAt: null,
    slotStartAt: params.slotStartAt ?? null,
    slotEndAt: params.slotEndAt ?? null,
    updatedAt: new Date().toISOString(),
  };

  return startLiveActivity(params.orderId, state);
}

/**
 * Réconciliation au démarrage : ré-enregistre les activités encore vivantes.
 *
 * Filet de sécurité (secondaire, comme demandé) : si un token n'est jamais
 * arrivé jusqu'au serveur — app tuée juste après le démarrage de l'activité,
 * réseau coupé — l'activité resterait figée. Ce passage force une nouvelle
 * émission de token pour chacune d'elles.
 */
export async function reconcileLiveActivities(): Promise<number> {
  const activities = await listLiveActivities();
  // L'abonnement aux tokens ré-émet pour chaque activité vivante : il suffit
  // qu'il soit installé pour que le serveur se resynchronise.
  if (activities.length > 0) initLiveActivityTokenSync();
  return activities.length;
}

/** Termine le suivi côté serveur (l'utilisateur a balayé l'activité). */
export async function stopOrderTracking(activityId: string): Promise<void> {
  try {
    await apiUnregisterLiveActivity(activityId);
  } catch (e: unknown) {
    console.warn('Fin de Live Activity non signalée au serveur:', e);
  }
}
