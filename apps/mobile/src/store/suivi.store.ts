import { create } from 'zustand';
import type { Order, SuiviFlaix } from '@lib/api/mobile-api';

/**
 * Les commandes du client, telles que la PASTILLE centrale les connaît.
 *
 * Partagé plutôt que rechargé par chacun : l'écran « Mes commandes » interroge
 * déjà le serveur toutes les dix secondes pendant une commande en cours. Il
 * publie ici ce qu'il reçoit, et la barre du bas s'en sert sans refaire
 * l'appel. `chargeA` dit de quand datent ces données, pour que personne ne
 * relance une requête qui vient d'être faite.
 *
 * État et setters seulement (règle de `store/index.ts`) : le chargement vit
 * dans `lib/use-etat-pastille.ts`.
 */
interface SuiviState {
  commandes: Order[];
  /** Les commandes FLAIX suivies, en direct (25/11/2026), lues dans notre base. */
  commandesFlaix: SuiviFlaix[];
  /** Horodatage (ms) du dernier chargement. 0 tant que rien n'est chargé. */
  chargeA: number;
  publier: (commandes: Order[]) => void;
  publierFlaix: (commandes: SuiviFlaix[]) => void;
  /** À la déconnexion : la pastille d'un autre compte n'a rien à montrer. */
  vider: () => void;
}

export const useSuiviStore = create<SuiviState>((set) => ({
  commandes: [],
  commandesFlaix: [],
  chargeA: 0,
  publier: (commandes) => set({ commandes, chargeA: Date.now() }),
  publierFlaix: (commandesFlaix) => set({ commandesFlaix }),
  vider: () => set({ commandes: [], commandesFlaix: [], chargeA: 0 }),
}));
