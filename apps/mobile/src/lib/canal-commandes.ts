import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * LA CATÉGORIE ANDROID « COMMANDES » (26/11/2026, audit Codex).
 *
 * Sans elle, les notifications passaient par la catégorie par défaut d'Android,
 * dont l'importance ne garantit ni le son ni la bannière en haut de l'écran :
 * « Ta commande est prête » pouvait arriver sans bruit. Celle-ci est en
 * importance HAUTE : son, vibration, bannière, visible écran verrouillé.
 *
 * Le serveur ne la vise que pour les appareils qui l'ont déclarée à
 * l'enregistrement du jeton (`canalCommandes`) : un `channelId` inconnu du
 * téléphone ferait disparaître la notification.
 *
 * Rend `true` si la catégorie existe sur l'appareil. Jamais d'exception.
 */
export const CANAL_COMMANDES = 'commandes';

let creation: Promise<boolean> | null = null;

export function creerCanalCommandes(): Promise<boolean> {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  if (!creation) {
    creation = Notifications.setNotificationChannelAsync(CANAL_COMMANDES, {
      name: 'Commandes',
      description: 'Ta commande est prête, note ta commande.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 250, 200, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    })
      .then((canal) => canal !== null)
      .catch(() => {
        creation = null;
        return false;
      });
  }
  return creation;
}
