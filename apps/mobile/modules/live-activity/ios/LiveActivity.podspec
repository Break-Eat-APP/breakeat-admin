require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = package['version']
  s.summary        = 'Pont ActivityKit pour la Live Activity Break Eat'
  s.description    = 'Expose le cycle de vie des Live Activities iOS a React Native.'
  s.author         = 'Break Eat'
  s.homepage       = 'https://breakeatapp.com'
  s.platforms      = { :ios => '16.2' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # Le contrat de donnees (BreakEatOrderAttributes) est compile DANS L'APP ici,
  # et dans l'extension via sa propre configuration de cible. Un fichier unique,
  # deux cibles : c'est ce qui garantit que l'app et le widget parlent
  # exactement le meme format (une divergence rendrait les mises a jour APNs
  # silencieusement inoperantes).
  s.source_files = '**/*.{h,m,swift}', '../../../targets/live-activity/BreakEatOrderAttributes.swift'
end
