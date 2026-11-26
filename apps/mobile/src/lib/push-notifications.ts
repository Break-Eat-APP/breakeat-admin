import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { estUnVraiTelephone } from './vrai-telephone';
import {
  apiRegisterPushToken,
  apiRetirerJetonPush,
  apiUnregisterPushToken,
} from '@lib/api/mobile-api';

/**
 * Le jeton dont le retrait a échoué à la déconnexion (réseau coupé), gardé
 * pour être rejoué plus tard (BUG-2026-045, audit Codex du 21/11/2026).
 */
const CLE_RETRAIT_EN_ATTENTE = 'push:retrait-en-attente';

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
 * Le retrait rejoué en cours, s'il y en a un. L'enregistrement l'ATTEND avant
 * d'enregistrer (vérification Codex du 22/11/2026) : sans cela, un retrait
 * parti avant la connexion d'un nouveau compte, mais arrivé APRÈS son
 * enregistrement, retirait au nouveau compte le jeton qu'il venait de prendre.
 */
let retraitEnCours: Promise<void> | null = null;

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
    if (!estUnVraiTelephone()) return;

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

    // Un retrait rejoué encore en route passe AVANT : sinon il arriverait
    // après l'enregistrement et reprendrait le jeton au compte connecté.
    if (retraitEnCours) await retraitEnCours;

    await apiRegisterPushToken(data, Platform.OS);
    jetonActuel = data;
    // Le jeton appartient désormais au compte connecté : un retrait resté en
    // attente pour l'ancien compte ne doit SURTOUT pas le lui reprendre.
    if ((await lireRetraitEnAttente()) === data) await effacerRetraitEnAttente();
  } catch (e: unknown) {
    console.warn('Enregistrement du jeton push échoué:', e);
  }
}

/**
 * Suit le renouvellement du jeton par le système (BUG-2026-048, audit Codex du
 * 21/11/2026). Sans cela, un jeton renouvelé pendant que l'app reste ouverte
 * n'atteignait le serveur qu'à la connexion suivante : l'ancien recevait les
 * envois jusqu'à son rejet. Relancer l'enregistrement suffit : il redemande le
 * jeton Expo et ne l'envoie que s'il a changé.
 */
export function ecouterRenouvellementJeton(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const abonnement = Notifications.addPushTokenListener(() => {
    void enregistrerPush();
  });
  return () => abonnement.remove();
}

async function lireRetraitEnAttente(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CLE_RETRAIT_EN_ATTENTE);
  } catch {
    return null;
  }
}

async function effacerRetraitEnAttente(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CLE_RETRAIT_EN_ATTENTE);
  } catch {
    // Au pire, le retrait sera tenté une fois de trop : le serveur l'accepte.
  }
}

/**
 * Rejoue un retrait de jeton resté en attente. Appelé quand aucun compte
 * n'est connecté : le téléphone ne doit plus recevoir les notifications de
 * l'ancien compte. Ne lève jamais.
 */
export async function rejouerRetraitEnAttente(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (retraitEnCours) return retraitEnCours;
  retraitEnCours = (async () => {
    const jeton = await lireRetraitEnAttente();
    if (!jeton) return;
    try {
      await apiRetirerJetonPush(jeton);
      await effacerRetraitEnAttente();
    } catch (e: unknown) {
      console.warn('Retrait du jeton push encore impossible, nouvel essai plus tard:', e);
    }
  })();
  try {
    await retraitEnCours;
  } finally {
    retraitEnCours = null;
  }
}

/**
 * Écoute les push reçus application ouverte.
 *
 * Sans cela, la pastille de la cloche n'apparaîtrait qu'au prochain retour sur
 * l'accueil : le client verrait passer la bannière, puis une cloche muette.
 *
 * Rend de quoi cesser d'écouter. Deux abonnements survivants compteraient deux
 * fois la même annonce.
 */
export function ecouterPush(onRecu: () => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const abonnement = Notifications.addNotificationReceivedListener(() => onRecu());
  return () => abonnement.remove();
}

/**
 * Les réponses (« touchers ») déjà traitées pendant cette session.
 *
 * AUDIT CODEX DU 11/11 : au démarrage à froid, la MÊME réponse arrivait deux
 * fois — par la lecture initiale et par l'écouteur — et, faute d'être effacée,
 * elle était RELUE à chaque lancement suivant : l'app ramenait le client sur
 * « Mes commandes » sans qu'il ait rien touché. Au niveau du module, et non de
 * l'abonnement : l'écoute est refaite à chaque connexion, la mémoire demeure.
 */
const reponsesTraitees = new Set<string>();

/** Ce qui distingue un toucher d'un autre : la notification ET le geste. */
function cleDeReponse(r: Notifications.NotificationResponse): string {
  return `${r.notification.request.identifier}:${r.actionIdentifier}`;
}

/**
 * Traite un toucher UNE seule fois, puis l'efface : il ne sera plus rendu par
 * `getLastNotificationResponse` au prochain lancement. Exportée pour les tests.
 */
export function traiterReponse(
  r: Notifications.NotificationResponse | null | undefined,
  onOuvrir: (data: Record<string, unknown>) => void,
): void {
  if (!r) return;
  const cle = cleDeReponse(r);
  if (reponsesTraitees.has(cle)) return;
  reponsesTraitees.add(cle);
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Effacer n'est qu'une précaution : la mémoire de session suffit déjà
    // à ne pas rejouer ce toucher tant que l'app vit.
  }
  onOuvrir((r.notification.request.content.data ?? {}) as Record<string, unknown>);
}

/**
 * Écoute les notifications TOUCHÉES par le client, y compris celle qui a
 * rouvert l'app alors qu'elle était fermée.
 *
 * Sans cela, toucher « Produit manquant » ou « Ta commande est prête » ouvrait
 * l'app sur l'accueil : le client devait deviner où lire la suite.
 */
export function ecouterOuvertures(onOuvrir: (data: Record<string, unknown>) => void): () => void {
  if (Platform.OS === 'web') return () => undefined;

  // L'app était fermée : la notification qui l'a lancée n'arrive pas par
  // l'écouteur, elle attend d'être lue. Si l'écouteur la reçoit AUSSI, la
  // mémoire des réponses traitées évite le double traitement.
  try {
    traiterReponse(Notifications.getLastNotificationResponse(), onOuvrir);
  } catch {
    // Lecture impossible : l'écouteur ci-dessous prend le relais.
  }

  const abonnement = Notifications.addNotificationResponseReceivedListener((r) =>
    traiterReponse(r, onOuvrir),
  );
  return () => abonnement.remove();
}

/** Pour les tests : oublie les réponses traitées. */
export function oublierReponsesTraitees(): void {
  reponsesTraitees.clear();
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
    // Réseau coupé : le jeton resterait rattaché à l'ancien compte. On le
    // garde pour rejouer le retrait (`rejouerRetraitEnAttente`).
    console.warn('Retrait du jeton push échoué, il sera rejoué:', e);
    try {
      await AsyncStorage.setItem(CLE_RETRAIT_EN_ATTENTE, jetonActuel);
    } catch {
      // Mémoire indisponible : le prochain compte connecté reprendra le jeton.
    }
  } finally {
    jetonActuel = null;
  }
}
