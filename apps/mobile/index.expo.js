// Entrée principale (champ package.json "main") : Expo Go, web ET build natif
// EAS — les logs de build confirment que `expo export:embed` bundle CE fichier.
// Garde-fou : si l'app plante au chargement, au rendu ou sur une erreur JS
// fatale, on affiche l'erreur à l'écran au lieu de fermer l'app après le splash.
// NOTE : crash-guard doit s'importer AVANT tout require applicatif — il installe
// le handler d'erreurs fatales dès son évaluation.
import React from 'react';
import { AppRegistry } from 'react-native';
import { CrashGuard, StartupErrorScreen } from './src/components/crash-guard';
import { installGeolocationPolyfill } from './src/lib/geolocation-polyfill';

// `navigator.geolocation` n'existe pas sur natif : sans ce pont, la decouverte
// des lieux par proximite reste muette sur telephone. Pose ici, avant tout
// ecran, car le hook la lit des son premier montage.
installGeolocationPolyfill();

let Root;
try {
  const App = require('./App.expo').default;
  Root = function RootWithGuard() {
    return React.createElement(CrashGuard, null, React.createElement(App));
  };
} catch (error) {
  Root = function StartupError() {
    return React.createElement(StartupErrorScreen, { error });
  };
}

try {
  // `expo` évalue Expo.fx (polyfills + globals natifs) : protégé lui aussi.
  require('expo').registerRootComponent(Root);
} catch (error) {
  const Fallback = function ExpoInitError() {
    return React.createElement(StartupErrorScreen, { error });
  };
  AppRegistry.registerComponent('main', () => Fallback);
}
