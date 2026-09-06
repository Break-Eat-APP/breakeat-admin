import { create } from 'zustand';
import { apiMarquerNotificationsLues, apiNotifications } from '@lib/api/mobile-api';

/**
 * La cloche et son compteur.
 *
 * Le nombre vient du SERVEUR, jamais d'un compte tenu localement : celui-ci ne
 * survivrait pas à une réinstallation, ignorerait le second téléphone du même
 * client, et ne saurait rien de ce qui est arrivé appareil éteint.
 *
 * `rafraichir()` se rappelle à chaque retour au premier plan et à la réception
 * d'un push. `markRead()` remet à zéro TOUT DE SUITE à l'écran, puis prévient
 * le serveur : le client vient d'appuyer, la pastille doit disparaître sous son
 * doigt, pas au retour du réseau — et si l'appel échoue, le prochain
 * rafraîchissement rétablit la vérité.
 */
interface NotifState {
  nonLues: number;
  hasUnread: boolean;
  rafraichir: () => Promise<void>;
  markRead: () => void;
  /** Un push vient d'arriver, application ouverte. */
  pushReceived: () => void;
}

export const useNotifStore = create<NotifState>((set, get) => ({
  nonLues: 0,
  hasUnread: false,

  rafraichir: async () => {
    try {
      const { nonLues } = await apiNotifications();
      set({ nonLues, hasUnread: nonLues > 0 });
    } catch {
      // Pas de réseau : on garde le dernier compte connu plutôt que d'effacer
      // une pastille qui a peut-être lieu d'être.
    }
  },

  markRead: () => {
    if (get().nonLues === 0) return;
    set({ nonLues: 0, hasUnread: false });
    void apiMarquerNotificationsLues().catch(() => {
      // Le serveur n'a pas suivi : le prochain rafraîchissement rétablira le
      // compte réel. Mieux vaut une pastille qui revient qu'un appui sans effet.
    });
  },

  pushReceived: () => set((e) => ({ nonLues: e.nonLues + 1, hasUnread: true })),
}));
