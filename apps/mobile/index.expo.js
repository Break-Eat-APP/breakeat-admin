// Entrée Expo Go (prévisualisation). `npx expo start` charge ce fichier (champ
// package.json "main"). L'entrée native de production reste index.js (inchangée).
import { registerRootComponent } from 'expo';
import App from './App.expo';

registerRootComponent(App);
