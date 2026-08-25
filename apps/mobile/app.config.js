/**
 * Expo app.config.js — used by EAS Build for the bare React Native workflow.
 *
 * This coexists with app.json (which React Native CLI reads for name/displayName).
 * When EAS Build runs, it reads this file instead.
 *
 * Note: FILL_IN_* values must be set before the first production build.
 */

/**
 * Identifiant de l'application, pilote par le profil de build.
 *
 * `BUNDLE_ID` est pose dans eas.json, profil par profil. Non defini, on retombe
 * sur l'identifiant de l'app PUBLIEE : c'est la valeur qui compte pour une mise
 * a jour des stores, et la seule qu'on veut par defaut.
 *
 * Le profil `preview` en utilise un DISTINCT (`.preview`) : la build de test
 * s'installe alors A COTE de l'app publiee au lieu de la remplacer sur le
 * telephone. Rien ne peut atteindre le store sans une soumission explicite,
 * mais cela evite d'avoir a reinstaller l'app du store apres chaque essai.
 *
 * ⚠️ Le topic APNs de la Live Activity derive de cet identifiant. Tester les
 * Live Activity sur une build `preview` exige donc `APNS_BUNDLE_ID` accorde
 * cote serveur, sinon Apple refuse l'envoi.
 */
const BUNDLE_ID = process.env.BUNDLE_ID ?? 'com.shapper.breakeat';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'BREAK EAT',
  slug: 'break-eat',
  owner: 'break-eat-app-spe',
  // Doit DEPASSER la version publiee sur les stores — 1.0.10 au 20/05/2026,
  // relevee via l'API publique d'Apple. Apple refuse toute soumission dont la
  // version n'est pas superieure a la derniere en ligne.
  //
  // 1.1.0 plutot que 1.0.11 : nouvelle architecture et nouveau parcours de
  // commande, ce n'est pas un correctif.
  version: '1.1.0',
  orientation: 'portrait',
  scheme: 'breakeat',
  icon: './assets/logo-mark-orange.png',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    // PHASE 21 — requis par @bacons/apple-targets pour créer la cible du widget
    // (l'extension doit être signée avec la même équipe que l'app hôte).
    // Même valeur que `submit.production.ios.appleTeamId` dans eas.json.
    appleTeamId: '2A5L298Q4C',
  },
  android: {
    package: BUNDLE_ID,
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
    // Le SDK 57 exige que tout module a reglages natifs soit declare ici :
    // il ne les deduit plus de la seule presence dans package.json.
    'expo-font',
    [
      // Le SDK 57 a retire `splash` de la racine du schema : la clé y est
      // simplement IGNOREE, sans erreur, et l'app demarre sur l'ecran blanc
      // par defaut. La configuration ne vit plus que dans ce plugin.
      'expo-splash-screen',
      {
        image: './assets/logo-mark-orange.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
    ],
    [
      'expo-build-properties',
      {
        // Plancher impose par le SDK 57 : il REFUSE toute valeur sous 16.4.
        // Cela couvre largement ActivityKit (16.2), et reste sous le minimum
        // 16.6 de l'app deja publiee : aucun utilisateur n'est exclu.
        //
        // Applique AUSSI aux Pods, que la retouche du .pbxproj faite par
        // ./plugins/withLiveActivity n'atteint pas.
        ios: { deploymentTarget: '16.4' },
      },
    ],
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
            '@sentry/react-native',
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
