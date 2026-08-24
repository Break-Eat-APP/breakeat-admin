/**
 * Expo app.config.js — used by EAS Build for the bare React Native workflow.
 *
 * This coexists with app.json (which React Native CLI reads for name/displayName).
 * When EAS Build runs, it reads this file instead.
 *
 * Note: FILL_IN_* values must be set before the first production build.
 */

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'BREAK EAT',
  slug: 'break-eat',
  owner: 'break-eat-app-spe',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'breakeat',
  icon: './assets/logo-mark-orange.png',
  splash: {
    image: './assets/logo-mark-orange.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    bundleIdentifier: 'com.shapper.breakeat',
    supportsTablet: false,
    // PHASE 21 — requis par @bacons/apple-targets pour créer la cible du widget
    // (l'extension doit être signée avec la même équipe que l'app hôte).
    // Même valeur que `submit.production.ios.appleTeamId` dans eas.json.
    appleTeamId: '2A5L298Q4C',
  },
  android: {
    package: 'com.shapper.breakeat',
    adaptiveIcon: {
      foregroundImage: './assets/logo-mark-orange.png',
      backgroundColor: '#ffffff',
    },
    permissions: ['android.permission.CAMERA'],
  },
  plugins: [
    // PHASE 21 — prérequis Live Activity : NSSupportsLiveActivities + cible iOS
    // 16.2. Le dossier ios/ étant régénéré à chaque build, ces réglages ne
    // peuvent pas vivre ailleurs que dans un plugin.
    './plugins/withLiveActivity',
    // Crée la CIBLE Xcode de l'extension WidgetKit à partir de
    // `targets/live-activity/expo-target.config.js`. Ajouter une cible au
    // .pbxproj à la main serait fragile et disparaîtrait au prochain prebuild.
    '@bacons/apple-targets',
    // Sentry est conditionne au JETON, pas a l'environnement.
    //
    // Son plugin televerse les source maps pendant la compilation Gradle. Sans
    // SENTRY_AUTH_TOKEN il echoue, et fait echouer TOUTE la build — y compris
    // une build de test qui n'avait aucun besoin de remontee d'erreurs.
    //
    // Se fier a APP_ENV etait donc un piege : toute build marquee « production »
    // exigeait implicitement un jeton que rien ne rappelait de poser. Definir
    // le jeton (secret EAS ou variable locale) suffit desormais a l'activer.
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          [
            '@sentry/react-native/expo',
            { organization: 'breakeat', project: 'break-eat-mobile' },
          ],
        ]
      : []),
    [
      'react-native-vision-camera',
      {
        cameraPermissionText:
          'BREAK EAT a besoin de la caméra pour scanner les QR codes des événements.',
        enableCodeScanner: true,
      },
    ],
  ],
  extra: {
    eas: {
      projectId: 'a6f65999-68f3-4f33-a8de-449d568ab0b5',
    },
  },
  // PAS de bloc `updates` ni `runtimeVersion` : ils declarent des mises a
  // jour a distance (OTA) que `expo-updates` fournirait — or le paquet n'est
  // pas installe. Declarer une capacite absente faisait echouer la
  // compilation Android sur une reference manquante.
  //
  // Installer `expo-updates` est une DECISION PRODUIT (livrer un correctif
  // sans passer par les stores), pas un correctif de build : `npx expo
  // install expo-updates` puis `eas update:configure` retabliront ce bloc.
};
