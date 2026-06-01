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
  owner: 'breakeat',
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
    permissions: [],
  },
  plugins: [
    [
      '@sentry/react-native/expo',
      {
        organization: 'breakeat',
        project: 'break-eat-mobile',
      },
    ],
  ],
  extra: {
    eas: {
      // Set via `eas init` — fill in after running `eas init` in apps/mobile
      projectId: 'FILL_IN_EAS_PROJECT_ID',
    },
  },
  updates: {
    url: 'https://u.expo.dev/FILL_IN_EAS_PROJECT_ID',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
};
