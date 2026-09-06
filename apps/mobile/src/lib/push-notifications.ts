import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { apiRegisterPushToken, apiUnregisterPushToken } from '@lib/api/mobile-api';

/**
 * Les notifications push du client.
 *
 * Rien n'obtenait ni n'enregistrait de jeton : `expo-notifications` n'était même
 * pas installé, et `apiRegisterPushToken` n'avait aucun appelant. Les campagnes
 * partaient donc vers ZÉRO appareil — visible dans les journaux du serveur :
 * `ScheduledPush … envoyé à 0 appareil(s)`. Le mécanisme d'envoi fonctionnait ;
 * il n'avait simplement aucun destinataire.
 *
 * Le jeton s'obtient APRÈS connexion : il est rattaché à un compte, et le
 * demander à un visiteur anonyme reviendrait à réclamer une permission avant
 * d'avoir rien à annoncer — la façon la plus sûre de se la faire refuser
 * définitivement.
 */

/** Une notification reçue app ouverte doit se voir : sinon rien ne l'annonce. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Le jeton en cours, retenu pour pouvoir le retirer à la déconnexion. */
let jetonActuel: string | null = null;

/**
 * Demande la permission, obtient le jeton Expo et l'enregistre.
 *
 * Ne lève jamais : une notification est un confort. Un refus de permission, un
 * simulateur, un réseau coupé — rien de tout cela ne doit empêcher de commander.
 */
export async function enregistrerPush(): Promise<void> {
  try {
    // Le web n'a pas de jeton Expo, et le simulateur non plus : demander une
    // permission qui ne mènera nulle part n'apporte qu'une boîte de dialogue.
    if (Platform.OS === 'web' || !Constants.isDevice) return;

    const { status: existant } = await Notifications.getPermissionsAsync();
    let status = existant;
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return;

    // `projectId` est OBLIGATOIRE depuis le SDK 49 : sans lui, Expo ne sait pas
    // à quel projet rattacher le jeton et la demande échoue à l'exécution — pas
    // à la compilation, donc uniquement sur un vrai téléphone.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) {
      console.warn('Push : projectId EAS introuvable — jeton non demandé.');
      return;
    }

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!data || data === jetonActuel) return;

    await apiRegisterPushToken(data, Platform.OS);
    jetonActuel = data;
  } catch (e: unknown) {
    console.warn('Enregistrement du jeton push échoué:', e);
  }
}

/**
 * Retire le jeton à la déconnexion.
 *
 * Sans cela, l'appareil continuerait de recevoir les campagnes du club auquel
 * l'ancien compte appartenait — y compris entre les mains de quelqu'un d'autre.
 */
export async function oublierPush(): Promise<void> {
  if (!jetonActuel) return;
  try {
    await apiUnregisterPushToken(jetonActuel);
  } catch (e: unknown) {
    console.warn('Retrait du jeton push échoué:', e);
  } finally {
    jetonActuel = null;
  }
}
