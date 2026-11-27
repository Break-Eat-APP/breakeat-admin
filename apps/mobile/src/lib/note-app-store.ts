import { Linking, Platform } from 'react-native';
import { liensFicheStore } from './fiche-store';

/**
 * Le délai avant la demande : le temps que la feuille de note soit FERMÉE.
 *
 * La demande partait pendant que la feuille « Comment ça s'est passé ? »
 * se refermait (27/11/2026). Sur iPhone, le système ignore sans rien dire une
 * demande faite pendant qu'une autre fenêtre s'ouvre ou se ferme : Rémi notait
 * 5 étoiles et ne voyait jamais la fenêtre d'avis. La feuille glisse en
 * 0,3 s environ ; une seconde laisse de la marge.
 */
export const DELAI_APRES_FEUILLE_MS = 1000;

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
/** La demande, une fois la feuille de note fermée (voir `DELAI_APRES_FEUILLE_MS`). */
export function demanderNoteAppStoreApresFeuille(): void {
  setTimeout(() => void demanderNoteAppStore(), DELAI_APRES_FEUILLE_MS);
}

/**
 * « NOTER BREAKEAT » (profil, 27/11/2026) : le client choisit d'aller noter
 * l'application ; on ouvre la fiche du store, sur « écrire un avis ».
 * Autorisé par Apple et Google parce que c'est la personne qui y va — à la
 * différence de la fenêtre système, qu'on ne déclenche jamais sur un bouton.
 *
 * Rend `false` si rien n'a pu s'ouvrir (l'appelant le dit au client).
 */
export async function ouvrirFicheStore(): Promise<boolean> {
  const liens = liensFicheStore(Platform.OS);
  if (!liens) return false;
  for (const url of [liens.app, liens.web]) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // Pas d'application store (rare) : on essaie l'adresse web.
    }
  }
  return false;
}

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
