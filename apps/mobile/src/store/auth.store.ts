import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'break_eat_token';
const USER_KEY = 'break_eat_user';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;

  /** Called at app startup to rehydrate from AsyncStorage */
  rehydrate: () => Promise<void>;

  /** Called after a successful login API call */
  setAuth: (token: string, user: AuthUser) => Promise<void>;

  /** Called on logout */
  clearAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: true,

  rehydrate: async () => {
    try {
      const [token, userJson] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);
      set({
        token,
        user: userJson ? (JSON.parse(userJson) as AuthUser) : null,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setAuth: async (token, user) => {
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, token),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
    ]);
    set({ token, user });
  },

  clearAuth: async () => {
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
    ]);
    set({ token: null, user: null });
  },
}));
