import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * SOMMES-NOUS SUR UN VRAI TÉLÉPHONE ? (26/11/2026, BUG-2026-056)
 *
 * L'app répondait avec `Constants.isDevice`. Cette propriété N'EXISTE PLUS
 * dans expo-constants (SDK 57) : elle valait toujours `undefined`, et l'app
 * se croyait sur un simulateur sur TOUS les téléphones. Elle n'enregistrait
 * donc jamais l'appareil pour les notifications, et la page Notifications
 * disait « impossible sur un simulateur » — sur une app installée depuis le
 * store (constaté par Rémi le 26/11).
 *
 * Le module qui sait vraiment (`expo-device`) n'est pas dans la build :
 * l'ajouter demanderait une nouvelle build. On ne refuse donc plus que
 * lorsqu'on SAIT être sur un simulateur (`isDevice === false`, anciennes
 * versions) ; sinon on tente. Sur un vrai simulateur, la demande de jeton
 * échoue d'elle-même, et cet échec est déjà absorbé sans bruit.
 */
export function estUnVraiTelephone(): boolean {
  if (Platform.OS === 'web') return false;
  return (Constants as { isDevice?: boolean }).isDevice !== false;
}
