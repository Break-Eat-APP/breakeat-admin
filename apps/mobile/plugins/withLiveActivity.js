const {
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins');

/**
 * Config plugin — prérequis iOS de la Live Activity.
 *
 * Pourquoi un plugin et non une modification manuelle du projet Xcode : le
 * dossier `ios/` n'est PAS versionné ici, il est régénéré par `expo prebuild`
 * à chaque build EAS. Toute retouche faite à la main y disparaîtrait au build
 * suivant.
 *
 * Ce plugin couvre les deux réglages indispensables :
 *   1. `NSSupportsLiveActivities` — sans cette clé, `Activity.request` échoue
 *      systématiquement, sans message explicite ;
 *   2. la cible de déploiement iOS — `ActivityContent` et les tokens push
 *      d'activité n'existent qu'à partir d'iOS 16.2.
 *
 * ⚠️ La CIBLE d'extension WidgetKit elle-même n'est pas créée ici : ajouter une
 * cible au `.pbxproj` à la main est fragile. Elle est déclarée via
 * `targets/live-activity/expo-target.config.js` (@bacons/apple-targets), qui
 * gère cette partie de façon fiable.
 */

const IOS_DEPLOYMENT_TARGET = '16.2';

/** Déclare la prise en charge des Live Activities dans l'app hôte. */
const withLiveActivitiesFlag = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.NSSupportsLiveActivities = true;
    // Autorise la mise à jour fréquente (estimation recalculée par Flaix).
    // Sans cette clé, iOS peut brider la cadence des mises à jour.
    cfg.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;
    return cfg;
  });

/**
 * Relève la cible de déploiement de TOUTES les configurations de build.
 * Expo SDK 53 vise iOS 15.1 par défaut, en deçà d'ActivityKit.
 */
const withDeploymentTarget = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      // Les entrées de commentaire (`*_comment`) n'ont pas de buildSettings.
      if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;

      const settings = entry.buildSettings;
      const current = parseFloat(settings.IPHONEOS_DEPLOYMENT_TARGET);
      if (Number.isNaN(current) || current < parseFloat(IOS_DEPLOYMENT_TARGET)) {
        settings.IPHONEOS_DEPLOYMENT_TARGET = IOS_DEPLOYMENT_TARGET;
      }
    }
    return cfg;
  });

/**
 * Capacité Push Notifications.
 *
 * `Activity.request(pushType: .token)` EXIGE que l'app soit provisionnée pour
 * les notifications distantes : sans l'entitlement `aps-environment`, iOS
 * n'attribue aucun token d'activité et la Live Activity reste figée sur son
 * état initial — sans erreur explicite.
 *
 * ⚠️ La valeur doit correspondre au PROFIL DE PROVISIONNEMENT du build, sinon
 * la signature de code échoue :
 *   - profil `development` (dev client) ................ development
 *   - profil `preview` (Ad Hoc, distribution interne) ... production
 *   - profil `production` (App Store) .................. production
 *
 * On se cale sur `APP_ENV`, déjà défini par profil dans `eas.json` (development
 * / staging / production) : seul le build « dev client » est en environnement
 * de développement. `modRequest` n'expose PAS le mode de build — s'y fier
 * laisserait la valeur bloquée sur `development` et casserait les builds Ad Hoc.
 *
 * Le backend doit viser l'hôte APNs correspondant (`APNS_ENV` = sandbox pour
 * development, production sinon). Un décalage se traduit par un
 * `BadDeviceToken` renvoyé par Apple.
 */
const withPushCapability = (config) =>
  withEntitlementsPlist(config, (cfg) => {
    const isDevClient = process.env.APP_ENV === 'development';
    cfg.modResults['aps-environment'] = isDevClient ? 'development' : 'production';
    return cfg;
  });

module.exports = function withLiveActivity(config) {
  return withDeploymentTarget(withPushCapability(withLiveActivitiesFlag(config)));
};
