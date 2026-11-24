/**
 * PRÉVENIR LE SERVEUR QU'UNE COMMANDE FLAIX VIENT D'ÊTRE PASSÉE (24/11/2026).
 *
 * Le serveur n'envoie « Ta commande est prête » que pour les commandes Flaix
 * qu'il SURVEILLE, et il ne les apprend qu'en lisant « Mes commandes » du
 * client (`GET /flaix/mes-commandes`, ADR-0015). Un client qui payait puis
 * rangeait son téléphone sans ouvrir « Mes commandes » ne recevait RIEN.
 *
 * Désormais, la page de commande Flaix (le relais, dans l'app) fait cette
 * lecture elle-même :
 *  - quand une page Flaix a fini de se charger, après un court temps de pose
 *    (`planifier`) — la page de confirmation du paiement en fait partie ;
 *  - quand le client ferme l'écran ou quitte l'app (`maintenant`) : le filet,
 *    si la commande n'était pas encore dans la liste de Flaix au premier essai.
 *
 * La réponse ne sert à rien ici : c'est la LECTURE qui met la commande sous
 * surveillance côté serveur. Une erreur est avalée — ce signal ne doit jamais
 * gêner la commande elle-même.
 *
 * À REMPLACER par le webhook Flaix (`ORDER_CREATED` / `ORDER_READY`) quand il
 * existera : alors le serveur saura tout, sans que l'app ait à le prévenir.
 */
export interface DepsSignal {
  /** La lecture qui met les commandes sous surveillance. */
  lire: () => Promise<unknown>;
  /** Sans session, la lecture est refusée : inutile de l'envoyer. */
  estConnecte: () => boolean;
  /** Le temps de pose après une page chargée (défaut : 3 s). */
  attenteMs?: number;
}

export interface SignalCommandeFlaix {
  /** Une page Flaix s'est chargée : lire quand la navigation s'est posée. */
  planifier: () => void;
  /** L'écran se ferme ou l'app part en arrière-plan : lire tout de suite. */
  maintenant: () => Promise<void>;
}

export const ATTENTE_PAR_DEFAUT_MS = 3_000;

export function creerSignalCommandeFlaix(deps: DepsSignal): SignalCommandeFlaix {
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  let enVol = false;
  // Un signal arrivé pendant une lecture : on relit une fois derrière, car la
  // lecture en cours a pu partir AVANT que la commande existe chez Flaix.
  let encore = false;

  const maintenant = async (): Promise<void> => {
    if (minuteur) {
      clearTimeout(minuteur);
      minuteur = null;
    }
    if (!deps.estConnecte()) return;
    if (enVol) {
      encore = true;
      return;
    }
    enVol = true;
    try {
      do {
        encore = false;
        try {
          await deps.lire();
        } catch {
          // Réseau absent, serveur injoignable : le filet suivant rattrapera.
        }
      } while (encore);
    } finally {
      enVol = false;
    }
  };

  const planifier = (): void => {
    if (minuteur) clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      minuteur = null;
      void maintenant();
    }, deps.attenteMs ?? ATTENTE_PAR_DEFAUT_MS);
  };

  return { planifier, maintenant };
}
