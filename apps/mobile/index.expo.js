// Entrée principale (champ package.json "main") : Expo Go, web ET build natif
// EAS — les logs de build confirment que `expo export:embed` bundle CE fichier.
// Garde-fou : si l'app plante au chargement, au rendu ou sur une erreur JS
// fatale, on affiche l'erreur à l'écran au lieu de fermer l'app après le splash.
import { registerRootComponent } from 'expo';
import React from 'react';
import { CrashGuard, StartupErrorScreen } from './src/components/crash-guard';

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

registerRootComponent(Root);
