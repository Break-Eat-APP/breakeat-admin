import { Platform } from 'react-native';

/**
 * LA DEMANDE D'AVIS SUR L'APP STORE.
 *
 * À ne pas confondre avec la note d'une commande : celle-ci reste chez nous
 * et sert au club, celle-là remplit la fiche publique de l'application.
 *
 * Ce qu'Apple impose, et qui explique la forme de ce fichier :
 *
 *  · on DEMANDE, on n'ouvre pas. Le système décide s'il affiche quoi que ce
 *    soit, et il ne dit jamais ce que la personne a répondu ;
 *  · trois fois par an au maximum, par appareil. Les appels au-delà ne font
 *    rien du tout — silencieusement ;
 *  · interdit de la déclencher en réponse à un bouton « Notez-nous ». C'est
 *    pourquoi elle part après un retour positif, jamais sur un appui direct.
 *
 * Ne lève jamais : une fiche App Store est un confort, pas une étape du
 * parcours. Un simulateur, un appareil sans App Store, un module natif
 * absent — rien de tout cela ne doit remonter à l'écran.
 */
export async function demanderNoteAppStore(): Promise<void> {
  // Le web n'a pas de fiche App Store, et le chargement du module natif y
  // échouerait sans rien apporter.
  if (Platform.OS === 'web') return;

  try {
    const StoreReview = (await import('expo-store-review')) as typeof import('expo-store-review');
    // `isAvailableAsync` couvre le simulateur et les appareils sans App
    // Store ; `hasAction` couvre les configurations où la demande existe
    // mais ne mènerait à rien.
    if (!(await StoreReview.isAvailableAsync())) return;
    if (!(await StoreReview.hasAction())) return;
    await StoreReview.requestReview();
  } catch (e: unknown) {
    console.warn('Demande d’avis App Store ignorée :', e);
  }
}
