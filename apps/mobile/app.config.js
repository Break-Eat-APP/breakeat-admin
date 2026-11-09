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

/**
 * LE FICHIER FIREBASE D'ANDROID (`google-services.json`).
 *
 * Sans lui, Android n'a pas de jeton de notification : `expo-notifications`
 * ne reçoit rien, et les campagnes partent vers zéro téléphone Android.
 *
 * Il est exclu de git (`.gitignore`), donc EAS ne l'envoie pas avec le
 * projet. Il arrive par une variable d'environnement EAS de type FICHIER,
 * `GOOGLE_SERVICES_JSON`, qui donne son chemin sur la machine de build. En
 * local, on accepte aussi le fichier posé à côté de ce fichier.
 *
 * ABSENT, on ne déclare RIEN plutôt qu'un chemin vers un fichier qui n'existe
 * pas : la génération du projet natif échouerait, et une build Android sans
 * notifications vaut mieux qu'aucune build.
 */
const GOOGLE_SERVICES_FILE = (() => {
  const fs = require('fs');
  const path = require('path');
  const depuisEas = process.env.GOOGLE_SERVICES_JSON;
  if (depuisEas && fs.existsSync(depuisEas)) return depuisEas;
  const local = path.join(__dirname, 'google-services.json');
  return fs.existsSync(local) ? './google-services.json' : undefined;
})();

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'BreakEat',
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
    // « Continuer avec Apple ». Pose l'entitlement dans le projet Xcode : sans
    // lui, le bouton s'affiche et la demande echoue sur l'appareil, jamais a la
    // compilation.
    //
    // A savoir : la regle 4.8 de l'App Store rend ce bouton OBLIGATOIRE des
    // qu'une autre connexion tierce (Google, Facebook) est proposee sur iOS.
    usesAppleSignIn: true,
    // PHASE 21 — requis par @bacons/apple-targets pour créer la cible du widget
    // (l'extension doit être signée avec la même équipe que l'app hôte).
    // Même valeur que `submit.production.ios.appleTeamId` dans eas.json.
    appleTeamId: '2A5L298Q4C',
    infoPlist: {
      // Repond une fois pour toutes a la question de conformite a
      // l'exportation, sinon posee a chaque envoi vers App Store Connect.
      // Break Eat n'utilise que HTTPS : c'est un usage exempte.
      ITSAppUsesNonExemptEncryption: false,
      // ITMS-90683 — Apple detecte une reference aux API de localisation dans
      // le binaire (apportee par une bibliotheque, pas par notre code) et
      // EXIGE une justification, meme si l'app ne s'en sert pas encore.
      //
      // Sans cette cle, iOS n'affiche AUCUNE demande d'autorisation et refuse
      // la position en silence : la decouverte des lieux par proximite serait
      // definitivement muette, sans la moindre erreur visible.
      NSLocationWhenInUseUsageDescription:
        'BreakEat utilise votre position pour vous montrer les lieux et buvettes autour de vous.',
      // Apple reclame AUSSI la variante « Always » : la bibliotheque de
      // geolocalisation reference les API d'arriere-plan, et l'analyse
      // statique les voit dans le binaire — meme si l'app ne les appelle
      // jamais (elle est bridee sur `whenInUse`, voir
      // src/lib/geolocation-polyfill.ts).
      //
      // Le texte le dit franchement : Break Eat n'a aucun usage en arriere-plan.
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'BreakEat utilise votre position uniquement pendant que vous utilisez l’app, pour vous montrer les lieux autour de vous. Aucun suivi en arriere-plan.',
      // Cle historique (iOS 10 et anterieur), sans effet a partir de notre
      // cible 16.4 : presente uniquement pour satisfaire le controle d'Apple,
      // qui ne revele ses exigences qu'une par envoi.
      NSLocationAlwaysUsageDescription:
        'BreakEat utilise votre position uniquement pendant que vous utilisez l’app.',
    },
  },
  android: {
    package: BUNDLE_ID,
    ...(GOOGLE_SERVICES_FILE ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
    adaptiveIcon: {
      foregroundImage: './assets/logo-mark-orange.png',
      backgroundColor: '#ffffff',
    },
    permissions: [
      'android.permission.CAMERA',
      // Pendant du purpose string iOS : sans elle, la demande de position
      // n'est jamais presentee et la decouverte par proximite reste muette.
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
  },
  plugins: [
    'expo-apple-authentication',
    // « Continuer avec Google ». Le greffon pose dans la build le SCHEMA D'URL
    // INVERSE de l'identifiant client iOS — « com.googleusercontent.apps.123… ».
    // Sans lui, la feuille de Google s'ouvre et ne sait pas revenir dans l'app.
    //
    // Pose SEULEMENT s'il est fourni, comme l'identifiant marchand Apple plus
    // bas : un schema d'URL invente ne correspondrait a aucun client OAuth, et
    // la connexion echouerait sur l'appareil — jamais a la compilation.
    //
    // ⚠️ C'est une variable de BUILD : elle doit exister au moment ou EAS
    // construit, donc dans `eas.json` ou dans les secrets EAS. La poser apres
    // coup ne change rien a une build deja faite.
    ...(process.env.GOOGLE_IOS_URL_SCHEME
      ? [
          [
            '@react-native-google-signin/google-signin',
            { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME },
          ],
        ]
      : []),
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
    // Le navigateur INTEGRE (SFSafariViewController) qui affiche la page de
    // paiement Stripe. Sans lui, `Linking.openURL` sortait de l'app vers
    // Safari : le client payait ailleurs, et rien ne le ramenait.
    'expo-web-browser',
    // Les notifications push du client. Sans cette declaration, le SDK 57 ne
    // configure pas la cible native et aucun jeton n'est delivre.
    'expo-notifications',
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
          'BreakEat a besoin de la caméra pour scanner les QR codes des événements.',
        enableCodeScanner: true,
      },
    ],
    [
      // Le paiement DANS l'application : une feuille native, pas une page web.
      //
      // La page hebergee par Stripe obligeait a sortir de l'app le temps du
      // reglement, puis a y revenir par un rebond que le systeme n'honore pas
      // toujours. Ici il n'y a rien a ouvrir et rien a quitter.
      //
      // `merchantIdentifier` est ce qui allume Apple Pay. Il n'est pose que
      // s'il est fourni : l'identifiant marchand se cree dans le portail Apple
      // et ne peut pas etre invente ici — en declarer un qui n'existe pas
      // ferait echouer la signature de la build.
      '@stripe/stripe-react-native',
      {
        ...(process.env.APPLE_MERCHANT_ID
          ? { merchantIdentifier: process.env.APPLE_MERCHANT_ID }
          : {}),
        enableGooglePay: true,
      },
    ],
  ],
  extra: {
    eas: {
      projectId: 'a6f65999-68f3-4f33-a8de-449d568ab0b5',
    },
    /**
     * L'identifiant marchand Apple, quand il existe.
     *
     * Posé ici en PLUS du plugin : le plugin l'inscrit dans les droits de la
     * build (c'est ce qui autorise Apple Pay), `extra` le rend lisible à
     * l'exécution — la feuille de paiement doit savoir si elle peut proposer
     * Apple Pay ou non. Une seule variable pour les deux, sinon l'un
     * s'allumerait sans l'autre.
     *
     * La clé est ABSENTE quand il n'y a pas d'identifiant, et surtout pas
     * posée à `null` : Expo sérialise `null` en `{}`, qui est VRAI en
     * JavaScript. L'app croirait alors avoir un identifiant marchand, ouvrirait
     * Apple Pay avec un objet vide, et la feuille de paiement refuserait de
     * s'ouvrir — donc plus de paiement du tout.
     */
    ...(process.env.APPLE_MERCHANT_ID
      ? { applePayMerchantId: process.env.APPLE_MERCHANT_ID }
      : {}),
    /**
     * LES IDENTIFIANTS CLIENTS GOOGLE, quand ils existent.
     *
     * Trois valeurs, trois roles distincts, et c'est la que la confusion
     * s'installe :
     *
     *  · GOOGLE_WEB_CLIENT_ID  — le client « Web » de la console Google. C'est
     *    LUI qui fait rendre un jeton d'IDENTITE par le SDK, meme sur iPhone.
     *    Sans lui on obtient un jeton d'ACCES, que le serveur ne sait pas — et
     *    ne doit pas — verifier. Son nom trompe : il ne sert pas au web.
     *  · GOOGLE_IOS_CLIENT_ID  — le client « iOS ». Necessaire ici parce qu'on
     *    n'utilise PAS Firebase : avec un GoogleService-Info.plist, le SDK l'y
     *    lirait seul.
     *  · GOOGLE_IOS_URL_SCHEME — le MEME identifiant iOS, ecrit a l'envers
     *    (« com.googleusercontent.apps.123… »). Il va dans le greffon ci-dessus,
     *    pas ici : l'un se pose dans la build, l'autre se lit a l'execution.
     *
     * Absentes plutot que `null` : Expo serialise `null` en `{}`, qui est VRAI
     * en JavaScript. L'app croirait avoir un identifiant, afficherait le bouton,
     * et la feuille echouerait. Meme piege que l'identifiant marchand, meme
     * parade — et une seconde garde de forme dans `connexion-google.native.ts`.
     *
     * Le SERVEUR, lui, a sa propre liste (`GOOGLE_CLIENT_IDS` sur Railway) :
     * c'est elle qui decide quels destinataires sont acceptes. Les deux
     * doivent concorder, sinon le bouton s'affiche et chaque connexion est
     * refusee — le journal du serveur ecrit alors le `aud` recu a cote de ceux
     * qu'il attendait.
     */
    ...(process.env.GOOGLE_WEB_CLIENT_ID
      ? { googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID }
      : {}),
    ...(process.env.GOOGLE_IOS_CLIENT_ID
      ? { googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID }
      : {}),
  },
  /**
   * LES MISES À JOUR À DISTANCE (EAS Update) — décidées par Rémi le 09/11.
   *
   * Un changement d'écran, de design ou de texte part avec `eas update` et
   * arrive chez le client sans passer par les stores : l'app le télécharge en
   * arrière-plan au lancement, et l'applique au lancement suivant.
   *
   * CE QUI NE PASSE PAS PAR LÀ : tout ce qui est natif — icône, écran
   * d'ouverture, permissions, nouveau module natif, Live Activity (Swift).
   * Ceux-là demandent toujours une build et une vérification.
   *
   * `runtimeVersion` = LA VERSION DE L'APP (`appVersion`), et non l'empreinte
   * calculée (`fingerprint`) : les mises à jour sont publiées depuis un poste
   * Windows sous OneDrive et les builds faites sur les machines d'EAS ; une
   * empreinte calculée des deux côtés peut différer pour un retour à la ligne,
   * et la mise à jour ne serait jamais reçue. La contrepartie est une RÈGLE :
   *
   *   ⚠️ TOUT CHANGEMENT NATIF → MONTER `version` (1.1.0 → 1.1.1) AVANT LA
   *   BUILD. Sinon une mise à jour écrite pour la nouvelle build serait
   *   envoyée aussi aux anciennes, qui n'ont pas le code natif attendu.
   *
   * `fallbackToCacheTimeout: 0` : on n'attend JAMAIS le réseau au lancement.
   * Dans un stade saturé, l'app s'ouvre sur ce qu'elle a déjà.
   */
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url: 'https://u.expo.dev/a6f65999-68f3-4f33-a8de-449d568ab0b5',
    fallbackToCacheTimeout: 0,
  },
};
