// Config Metro pour Expo (preview web + Expo Go + bundle natif EAS). Étend la
// config par défaut d'Expo.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Singletons React forcés (monorepo pnpm) ────────────────────────────────
// Les apps admin du monorepo utilisent react 19.2.6 alors que react-native
// 0.79 exige react 19.0.0. Des paquets comme @expo-google-fonts/* importent
// 'react' SANS le déclarer en dépendance : pnpm les résout alors via son
// dossier de hoist caché (node_modules/.pnpm/node_modules/react = 19.2.6).
// Résultat : DEUX copies de React dans le même bundle, et un crash au
// démarrage en natif ("Cannot read property 'useState' of null" dans
// useFonts). On force ici toute demande de react / react-dom / react-native
// à se résoudre depuis CETTE app, garantissant une copie unique.
const FORCED_SINGLETONS = new Set(['react', 'react-dom', 'react-native']);
const priorResolveRequest = config.resolver.resolveRequest;

function baseResolve(context, moduleName, platform) {
  return priorResolveRequest
    ? priorResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const basePackage = moduleName.startsWith('@')
    ? moduleName.split('/').slice(0, 2).join('/')
    : moduleName.split('/')[0];

  if (FORCED_SINGLETONS.has(basePackage)) {
    return baseResolve(
      { ...context, originModulePath: path.join(__dirname, 'index.expo.js') },
      moduleName,
      platform,
    );
  }
  return baseResolve(context, moduleName, platform);
};

module.exports = config;
