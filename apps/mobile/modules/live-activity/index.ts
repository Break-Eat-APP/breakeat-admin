import { Platform } from 'react-native';
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

/** État initial envoyé à iOS — même forme que le ContentState du backend. */
export interface LiveActivityState {
  status: string;
  statusLabel: string;
  orderNumber: string;
  pickupPoint?: string | null;
  estimatedReadyAt?: string | null;
  slotStartAt?: string | null;
  slotEndAt?: string | null;
  updatedAt: string;
}

/** Émis au démarrage puis à chaque rotation décidée par iOS. */
export interface PushTokenEvent {
  activityId: string;
  orderId: string;
  pushToken: string;
}

interface LiveActivityNativeModule {
  isSupported(): Promise<boolean>;
  startActivity(orderId: string, state: LiveActivityState): Promise<string>;
  endActivity(activityId: string): Promise<void>;
  listActivities(): Promise<Array<{ activityId: string; orderId: string }>>;
  addListener(
    event: 'onPushTokenChange',
    listener: (payload: PushTokenEvent) => void,
  ): EventSubscription;
}

/**
 * `requireOptionalNativeModule` renvoie null au lieu de lever quand le module
 * n'est pas dans le binaire : c'est le cas sur Android, sur le web, et dans
 * tout build antérieur à l'ajout de l'extension. L'app doit continuer à
 * fonctionner sans Live Activity — ce n'est qu'un confort d'affichage.
 */
const native = requireOptionalNativeModule<LiveActivityNativeModule>('BreakEatLiveActivity');

/** Le suivi sur écran verrouillé est-il utilisable sur cet appareil ? */
export async function isLiveActivitySupported(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !native) return false;
  try {
    return await native.isSupported();
  } catch {
    return false;
  }
}

/**
 * Démarre une Live Activity et renvoie son identifiant, ou null si l'appareil
 * ne la prend pas en charge. Ne lève jamais : un échec ici ne doit pas
 * interrompre le parcours de commande.
 */
export async function startLiveActivity(
  orderId: string,
  state: LiveActivityState,
): Promise<string | null> {
  if (!(await isLiveActivitySupported()) || !native) return null;
  try {
    return await native.startActivity(orderId, state);
  } catch (e) {
    console.warn('startLiveActivity a échoué:', e);
    return null;
  }
}

/** Termine une activité depuis l'app (cas nominal : c'est le backend via APNs). */
export async function endLiveActivity(activityId: string): Promise<void> {
  if (!native) return;
  try {
    await native.endActivity(activityId);
  } catch (e) {
    console.warn('endLiveActivity a échoué:', e);
  }
}

/** Activités encore vivantes — sert à la réconciliation au démarrage. */
export async function listLiveActivities(): Promise<
  Array<{ activityId: string; orderId: string }>
> {
  if (!native) return [];
  try {
    return await native.listActivities();
  } catch {
    return [];
  }
}

/**
 * S'abonne aux tokens push d'activité. Le premier arrive peu après le
 * démarrage (iOS l'attribue de façon asynchrone), les suivants correspondent
 * aux rotations. Renvoie une fonction de désabonnement, ou null si indisponible.
 */
export function onPushToken(listener: (event: PushTokenEvent) => void): (() => void) | null {
  if (!native) return null;
  const subscription = native.addListener('onPushTokenChange', listener);
  return () => subscription.remove();
}
