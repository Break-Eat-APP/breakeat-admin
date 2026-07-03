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
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    bundleIdentifier: 'app.breakeat.mobile',
    supportsTablet: false,
    buildNumber: '1',
  },
  android: {
    package: 'app.breakeat.mobile',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    permissions: ['android.permission.CAMERA'],
  },
  plugins: [
    [
      '@sentry/react-native/expo',
      {
        organization: 'breakeat',
        project: 'break-eat-mobile',
      },
    ],
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
  updates: {
    url: 'https://u.expo.dev/a6f65999-68f3-4f33-a8de-449d568ab0b5',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
};
