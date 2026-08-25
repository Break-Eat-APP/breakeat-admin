/**
 * Polyfill de `navigator.geolocation` pour les plateformes natives.
 *
 * `useUserLocation` lit `globalThis.navigator.geolocation` — présent nativement
 * dans un navigateur, ABSENT sur iOS et Android : React Native a sorti la
 * géolocalisation de son cœur depuis la 0.60. Sans ce pont, le hook se dégrade
 * proprement (c'est sa conception) mais la découverte par proximité reste
 * définitivement muette sur téléphone : l'app affiche une liste vide tant
 * qu'aucun mot-clé n'est tapé, sans la moindre erreur pour l'expliquer.
 *
 * À importer AU PLUS TÔT dans l'entrée de l'app, avant tout écran.
 *
 * ⚠️ Le pont ne suffit pas seul : il faut aussi la justification iOS
 * (`NSLocationWhenInUseUsageDescription`) et les permissions Android
 * (`ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`), toutes deux posées dans
 * `app.config.js`. Sans elles, le système ne présente jamais la demande
 * d'autorisation et refuse la position en silence.
 */
import { Platform } from 'react-native';

export function installGeolocationPolyfill(): void {
  // Sur le web, `navigator.geolocation` est fourni par le navigateur : y
  // toucher remplacerait une implémentation correcte par un module natif.
  if (Platform.OS === 'web') return;

  const nav = (globalThis as { navigator?: Record<string, unknown> }).navigator;
  if (!nav || nav['geolocation']) return;

  try {
    // Require paresseux : le module ne doit être évalué que sur natif.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const geolocation = require('@react-native-community/geolocation');
    nav['geolocation'] = geolocation.default ?? geolocation;
  } catch {
    // Échec silencieux volontaire : `useUserLocation` sait vivre sans position
    // (l'utilisateur retombe sur la recherche par mot-clé). Faire planter le
    // démarrage de l'app pour une fonctionnalité facultative serait pire.
  }
}
