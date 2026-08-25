require 'json'
require 'fileutils'

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

  # Le contrat de donnees (BreakEatOrderAttributes) doit exister dans DEUX
  # cibles : ce module (cote app) et l'extension widget. Un fichier unique,
  # deux cibles : c'est ce qui garantit que l'app et le widget parlent
  # exactement le meme format — une divergence rendrait les mises a jour APNs
  # silencieusement inoperantes.
  #
  # La source de verite vit dans targets/live-activity/, ou @bacons/apple-targets
  # la ramasse automatiquement pour le widget (ce plugin ne lit QUE son propre
  # dossier : il n'existe aucune option pour lui ajouter une source externe).
  #
  # Cote pod, la referencer par un chemin qui SORT de la racine du pod
  # ('../../../targets/...') a fonctionne jusqu'au SDK 53 puis a cesse : le
  # fichier etait ignore et la compilation echouait sur « cannot find type
  # 'BreakEatOrderAttributes' in scope ». CocoaPods ne garantit pas les sources
  # hors racine. On materialise donc une copie ICI, a l'evaluation du podspec
  # (avant `pod install`), et le glob local suffit — plus aucun chemin fragile.
  # La copie est generee, donc ignoree par git.
  contrat_source = File.join(__dir__, '..', '..', '..', 'targets', 'live-activity', 'BreakEatOrderAttributes.swift')
  contrat_local  = File.join(__dir__, 'BreakEatOrderAttributes.swift')
  if File.exist?(contrat_source)
    FileUtils.cp(contrat_source, contrat_local)
  elsif !File.exist?(contrat_local)
    raise "LiveActivity : contrat introuvable (#{contrat_source})"
  end

  s.source_files = '**/*.{h,m,swift}'
end
