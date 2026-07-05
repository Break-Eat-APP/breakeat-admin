// Entrée alternative (React Native CLI). Le build EAS bundle index.expo.js
// (package.json "main") — ce fichier reste aligné avec la même protection.
import React from 'react';
import { AppRegistry } from 'react-native';
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

try {
  // `expo` évalue Expo.fx (polyfills + globals natifs) : protégé lui aussi.
  require('expo').registerRootComponent(Root);
} catch (error) {
  const Fallback = function ExpoInitError() {
    return React.createElement(StartupErrorScreen, { error });
  };
  AppRegistry.registerComponent('main', () => Fallback);
}
