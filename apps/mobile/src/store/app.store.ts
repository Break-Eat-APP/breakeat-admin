import { create } from 'zustand';

interface AppState {
  isReady: boolean;
  setReady: (ready: boolean) => void;
}

/**
 * Global app-level state.
 * Tracks whether the app has finished its initial setup
 * (fonts loaded, splash hidden, session checked).
 */
export const useAppStore = create<AppState>((set) => ({
  isReady: false,
  setReady: (ready) => set({ isReady: ready }),
}));
