/**
 * Signaler une visite — pour que les clubs sachent combien de monde regarde.
 *
 * Jusqu'ici, un club ne savait que ce que les COMMANDES racontaient. Il ne
 * pouvait pas répondre à sa première question : « combien de personnes ont
 * ouvert notre carte pendant le match, et combien ont fini par commander ? »
 * Les commandes ne connaissent que la seconde moitié.
 *
 * Trois règles tenues ici :
 *
 *  1. **Rien d'identifiant.** On envoie une clé tirée au sort à la première
 *     ouverture et gardée sur l'appareil. Elle ne dit rien de la personne : elle
 *     sert à ne pas compter deux fois le même téléphone. Un visiteur non
 *     connecté compte donc quand même — c'est justement celui qu'on cherche.
 *  2. **Jamais bloquant.** Aucun appel n'est attendu, aucune erreur ne remonte.
 *     Une mesure d'audience qui empêcherait une commande serait une absurdité.
 *  3. **Le club n'est pas choisi ici.** On envoie le lieu ou l'événement ; c'est
 *     le serveur qui en déduit le club. L'application ne peut donc pas attribuer
 *     des visites à qui elle veut.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiSignalerVisite } from '@lib/api/mobile-api';

const CLE_STOCKAGE = 'breakeat:visitor-key';

export type TypeVisite = 'APP_OPEN' | 'LOGIN' | 'VENUE_VIEW' | 'EVENT_VIEW' | 'MENU_VIEW';

/** Gardée en mémoire après la première lecture : le stockage est asynchrone. */
let cleEnMemoire: string | null = null;

/**
 * Un identifiant d'installation, stable, anonyme.
 *
 * `Math.random` suffit : ce n'est pas un secret, et une collision ne ferait que
 * confondre deux visiteurs dans une statistique. Employer un générateur
 * cryptographique laisserait croire que cette valeur protège quelque chose.
 */
function tirerUneCle(): string {
  const hasard = () => Math.random().toString(36).slice(2, 12);
  return `v-${Date.now().toString(36)}-${hasard()}${hasard()}`;
}

async function cleVisiteur(): Promise<string> {
  if (cleEnMemoire) return cleEnMemoire;
  try {
    const gardee = await AsyncStorage.getItem(CLE_STOCKAGE);
    if (gardee) {
      cleEnMemoire = gardee;
      return gardee;
    }
    const neuve = tirerUneCle();
    await AsyncStorage.setItem(CLE_STOCKAGE, neuve);
    cleEnMemoire = neuve;
    return neuve;
  } catch {
    // Stockage indisponible : on mesure quand même, quitte à compter cette
    // session comme un visiteur neuf. Mieux vaut une mesure imparfaite que pas
    // de mesure — et surtout pas une erreur à l'écran.
    cleEnMemoire = cleEnMemoire ?? tirerUneCle();
    return cleEnMemoire;
  }
}

/**
 * Signale une visite. Ne rend jamais d'erreur, et ne fait jamais attendre.
 *
 * L'appel n'est volontairement pas `await`é par les écrans : il part, et
 * l'écran continue sa vie.
 */
export function signalerVisite(
  kind: TypeVisite,
  perimetre: { venueId?: string | null; eventId?: string | null } = {},
): void {
  void (async () => {
    try {
      await apiSignalerVisite({
        visitorKey: await cleVisiteur(),
        kind,
        ...(perimetre.venueId ? { venueId: perimetre.venueId } : {}),
        ...(perimetre.eventId ? { eventId: perimetre.eventId } : {}),
      });
    } catch {
      // Silence volontaire : l'audience d'un club ne vaut pas un message
      // d'erreur devant un client qui essaie de commander.
    }
  })();
}
