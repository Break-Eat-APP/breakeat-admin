import {
  endLiveActivity,
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

/** Statuts de commande après lesquels il n'y a plus rien à suivre. */
const STATUTS_TERMINES = new Set(['PICKED_UP', 'COMPLETED', 'CANCELLED', 'RECOVERED']);

/**
 * Ferme les activités dont la commande est terminée.
 *
 * Le cas nominal reste la fin poussée par le serveur (`end` + date de retrait
 * via APNs). Mais si cette poussée n'arrive jamais — clé APNs mal réglée,
 * token perdu, appareil hors ligne au mauvais moment — la carte reste sur
 * l'écran verrouillé pendant des heures, sans rien à suivre. C'est le symptôme
 * qu'on a observé : « la notif reste affichée sans disparaître ».
 *
 * L'app est le seul acteur capable de conclure SANS réseau. On balaie donc à
 * chaque lecture de « Mes commandes ».
 *
 * Prudence volontaire : on ne ferme QUE les activités dont la commande figure
 * dans la liste reçue ET s'y trouve terminée. Une commande absente de la liste
 * (pagination, filtre, chargement partiel) n'est pas une commande finie.
 */
export async function endTrackingForFinishedOrders(
  orders: Array<{ id: string; status: string }>,
): Promise<number> {
  const activities = await listLiveActivities();
  if (activities.length === 0) return 0;

  const terminees = new Set(
    orders.filter((o) => STATUTS_TERMINES.has(o.status)).map((o) => o.id),
  );

  let fermees = 0;
  for (const activity of activities) {
    if (!terminees.has(activity.orderId)) continue;
    await endLiveActivity(activity.activityId);
    await stopOrderTracking(activity.activityId);
    fermees++;
  }
  return fermees;
}
