import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'break_eat_token';
const REFRESH_KEY = 'break_eat_refresh';
const USER_KEY = 'break_eat_user';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

interface AuthState {
  token: string | null;
  /**
   * Jeton de renouvellement (7 jours). Le jeton d'accès, lui, ne vit que 15
   * minutes : sans celui-ci, un client qui prend le temps de payer sur la page
   * Stripe revient dans une app qui l'a déconnecté.
   */
  refreshToken: string | null;
  user: AuthUser | null;
  isLoading: boolean;

  /** Called at app startup to rehydrate from AsyncStorage */
  rehydrate: () => Promise<void>;

  /** Called after a successful login API call */
  setAuth: (token: string, user: AuthUser, refreshToken?: string | null) => Promise<void>;
  /** Remplace le seul jeton d'accès, après un renouvellement réussi. */
  setToken: (token: string, refreshToken?: string | null) => Promise<void>;

  /** Called on logout */
  clearAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  user: null,
  isLoading: true,

  rehydrate: async () => {
    try {
      const [token, refreshToken, userJson] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(REFRESH_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);
      set({
        token,
        refreshToken,
        user: userJson ? (JSON.parse(userJson) as AuthUser) : null,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setAuth: async (token, user, refreshToken) => {
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, token),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
      refreshToken
        ? AsyncStorage.setItem(REFRESH_KEY, refreshToken)
        : AsyncStorage.removeItem(REFRESH_KEY),
    ]);
    set({ token, user, refreshToken: refreshToken ?? null });
  },

  setToken: async (token, refreshToken) => {
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, token),
      refreshToken ? AsyncStorage.setItem(REFRESH_KEY, refreshToken) : Promise.resolve(),
    ]);
    set((etat) => ({ token, refreshToken: refreshToken ?? etat.refreshToken }));
  },

  clearAuth: async () => {
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_KEY),
      AsyncStorage.removeItem(USER_KEY),
    ]);
    set({ token: null, refreshToken: null, user: null });
  },
}));
