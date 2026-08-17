/**
 * Déclaration de la cible d'extension WidgetKit (lue par @bacons/apple-targets).
 *
 * Cette cible est un BINAIRE SÉPARÉ de l'application : elle ne partage ni le
 * bundle JavaScript, ni les assets, ni le thème de l'app. C'est pourquoi le
 * widget redéclare ses couleurs et n'affiche que du texte préparé par le
 * serveur.
 *
 * Le fichier `BreakEatOrderAttributes.swift` de ce dossier est compilé DANS LES
 * DEUX cibles (ici et dans le module Expo, via son podspec) : un contrat unique
 * évite que l'app et le widget divergent sur le format des mises à jour.
 */
module.exports = {
  type: 'widget',
  name: 'BreakEatLiveActivity',
  // Doit rester cohérent avec `ios.bundleIdentifier` de app.config.js :
  // le topic APNs utilisé par le backend en dépend
  // (<bundleId>.push-type.liveactivity).
  bundleIdentifier: 'com.shapper.breakeat.LiveActivity',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
};
