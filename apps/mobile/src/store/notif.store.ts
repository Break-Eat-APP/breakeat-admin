import { create } from 'zustand';

/**
 * État des notifications (point vert sur la cloche).
 *
 * `hasUnread` pilote la pastille verte. `markRead()` l'efface (au clic sur la cloche).
 * `pushReceived()` la rallume — sera appelé par le système de push une fois branché
 * (expo-notifications côté natif, cf. REPRISE). Pour l'instant aucune source réelle.
 */
interface NotifState {
  hasUnread: boolean;
  markRead: () => void;
  pushReceived: () => void;
}

export const useNotifStore = create<NotifState>((set) => ({
  hasUnread: false,
  markRead: () => set({ hasUnread: false }),
  pushReceived: () => set({ hasUnread: true }),
}));
