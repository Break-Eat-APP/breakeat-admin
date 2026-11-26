import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { enregistrerPush } from '@lib/push-notifications';
import { estUnVraiTelephone } from './vrai-telephone';

/**
 * L'ÉTAT DES NOTIFICATIONS, lu là où il se trouve vraiment.
 *
 * Le menu du profil annonçait « Notifications indisponibles » sur TOUS les
 * iPhone. La raison : il lisait `globalThis.Notification`, l'API du
 * NAVIGATEUR. Elle n'existe pas dans React Native — l'objet était donc
 * toujours absent, et l'écran en concluait que l'appareil ne savait pas
 * notifier. Pendant ce temps, les push fonctionnaient : elles passent par
 * `expo-notifications`, que ce menu ne consultait jamais.
 *
 * Deux mondes, deux sources, et c'est irréductible : l'app est livrée en
 * natif ET servie sur le web. On demande donc à chacun ce qu'il sait.
 */
export type EtatNotifs =
  /** Jamais demandé : le bouton doit proposer de les activer. */
  | 'a-demander'
  /** Accordée — et, en natif, le jeton est enregistré. */
  | 'accordee'
  /** Refusée. Sur iPhone, seul le réglage du système peut revenir dessus. */
  | 'refusee'
  /** Cet appareil ne sait pas notifier (simulateur, navigateur). */
  | 'indisponible'
  /**
   * Permission accordée, mais le téléphone n'a PAS pu être inscrit côté
   * serveur (réseau, Expo) : aucune notification ne l'atteindrait. Dit, et
   * « Réessayer » proposé (audit Codex du 26/11/2026, BUG-2026-056).
   */
  | 'non-relie';


function depuisStatutExpo(statut: Notifications.PermissionStatus): EtatNotifs {
  if (statut === 'granted') return 'accordee';
  if (statut === 'denied') return 'refusee';
  return 'a-demander';
}

export async function lireEtatNotifs(): Promise<EtatNotifs> {
  // LE WEB NE REÇOIT AUCUNE PUSH BREAKEAT (audit Codex du 26/11/2026) : le
  // serveur n'envoie qu'aux téléphones (jetons Expo). Afficher « activées »
  // dans un navigateur promettait ce qui n'arrivera jamais.
  if (Platform.OS === 'web') return 'indisponible';

  // Un simulateur ne reçoit AUCUNE push : Apple ne délivre pas de jeton à une
  // machine. Dire « indisponible » y est la vérité ; le dire sur un vrai
  // téléphone était le bug.
  if (!estUnVraiTelephone()) return 'indisponible';

  try {
    const { status } = await Notifications.getPermissionsAsync();
    const etat = depuisStatutExpo(status);
    // Accordée : on vérifie l'INSCRIPTION, pas seulement la permission.
    if (etat === 'accordee') return (await enregistrerPush()) ? 'accordee' : 'non-relie';
    return etat;
  } catch {
    return 'indisponible';
  }
}

/**
 * Demande la permission, et — en natif — enregistre le jeton dans la foulée.
 *
 * Les deux gestes ne se séparent pas : une permission accordée sans jeton
 * enregistré donne un client qui croit être abonné et ne reçoit rien. C'est
 * exactement ce qui arrivait quand ce menu vivait sa vie de son côté.
 */
export async function demanderNotifs(): Promise<EtatNotifs> {
  if (Platform.OS === 'web') return 'indisponible';

  if (!estUnVraiTelephone()) return 'indisponible';

  try {
    const { status: avant } = await Notifications.getPermissionsAsync();
    let statut = avant;
    if (statut !== 'granted') {
      ({ status: statut } = await Notifications.requestPermissionsAsync());
    }
    // `enregistrerPush` ne lève jamais et redemande la permission au besoin :
    // l'appeler ici garantit qu'un « oui » se traduit par un jeton côté
    // serveur, pas seulement par un interrupteur vert à l'écran.
    if (statut === 'granted') return (await enregistrerPush()) ? 'accordee' : 'non-relie';
    return depuisStatutExpo(statut);
  } catch {
    return 'indisponible';
  }
}

/**
 * Ouvre le réglage qui permet de revenir sur un refus.
 *
 * iOS ne represente JAMAIS sa demande une fois refusée : sans ce raccourci, le
 * client devrait trouver seul Réglages › Break Eat › Notifications, et le
 * message qui l'y envoyait parlait du cadenas d'un navigateur — une
 * instruction qui n'a aucun sens sur un téléphone.
 */
export async function ouvrirReglagesNotifs(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}
