/**
 * LA FICHE DE BREAKEAT SUR LES STORES — les adresses (27/11/2026).
 *
 * Pour le bouton « Noter BreakEat » du profil : le client CHOISIT d'aller
 * noter l'application, et on l'emmène directement à l'endroit où l'on écrit un
 * avis. Contrairement à la fenêtre système (`note-app-store.ts`), qu'Apple et
 * Google montrent quand ils veulent, ce lien marche à chaque fois.
 *
 * Deux adresses par plateforme : celle de l'APPLICATION du store (ouvre
 * l'App Store ou le Play Store), puis celle du WEB en secours.
 *
 * Fonction PURE (testée) : aucun import natif ici.
 */

/** L'identifiant App Store de BreakEat (`ascAppId` dans `eas.json`). */
export const APP_STORE_ID = '6496204412';
/** L'identifiant Android (`BUNDLE_ID` par défaut dans `app.config.js`). */
export const PACKAGE_ANDROID = 'com.shapper.breakeat';

export function liensFicheStore(os: string): { app: string; web: string } | null {
  if (os === 'ios') {
    return {
      app: `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`,
      web: `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`,
    };
  }
  if (os === 'android') {
    return {
      app: `market://details?id=${PACKAGE_ANDROID}`,
      web: `https://play.google.com/store/apps/details?id=${PACKAGE_ANDROID}`,
    };
  }
  return null;
}

/** Le libellé du bouton : le store que le client connaît. */
export const libelleFicheStore = (os: string): string =>
  os === 'android' ? 'Noter BreakEat sur Google Play' : 'Noter BreakEat sur l’App Store';
