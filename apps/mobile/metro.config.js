// Config Metro pour Expo (preview web + Expo Go). Étend la config par défaut
// d'Expo. L'entrée native de production (react-native CLI) reste fonctionnelle.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
