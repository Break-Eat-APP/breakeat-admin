// Entrée alternative (React Native CLI). Le build EAS bundle index.expo.js
// (package.json "main") — ce fichier reste aligné avec la même protection.
import { registerRootComponent } from 'expo';
import React from 'react';
import { CrashGuard, StartupErrorScreen } from './src/components/crash-guard';

let Root;
try {
  const App = require('./App').default;
  Root = function RootWithGuard() {
    return React.createElement(CrashGuard, null, React.createElement(App));
  };
} catch (error) {
  Root = function StartupError() {
    return React.createElement(StartupErrorScreen, { error });
  };
}

registerRootComponent(Root);
