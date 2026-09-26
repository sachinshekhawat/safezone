import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';
import type { AuthResponse, User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  /** Re-attach a persisted token to the API client after a page reload. */
  hydrateApiClient: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      expiresAt: null,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const res: AuthResponse = await api.login(email, password);
          api.setToken(res.token);
          set({
            user: res.user,
            token: res.token,
            refreshToken: res.refresh_token,
            expiresAt: res.expires_at,
            isLoading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Login failed',
            isLoading: false,
          });
          throw err;
        }
      },

      register: async (email, password, name) => {
        set({ isLoading: true, error: null });
        try {
          const res: AuthResponse = await api.register(email, password, name);
          api.setToken(res.token);
          set({
            user: res.user,
            token: res.token,
            refreshToken: res.refresh_token,
            expiresAt: res.expires_at,
            isLoading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Registration failed',
            isLoading: false,
          });
          throw err;
        }
      },

      logout: () => {
        api.clearToken();
        set({ user: null, token: null, refreshToken: null, expiresAt: null, error: null });
      },

      hydrateApiClient: () => {
        const { token, expiresAt } = get();
        if (!token) return;
        // Drop an expired session rather than sending a dead token.
        if (expiresAt && expiresAt * 1000 < Date.now()) {
          get().logout();
          return;
        }
        api.setToken(token);
      },

      isAuthenticated: () => {
        const { token, expiresAt } = get();
        if (!token) return false;
        if (expiresAt && expiresAt * 1000 < Date.now()) return false;
        return true;
      },
    }),
    {
      name: 'safezone-auth',
      // Only persist the fields needed to restore a session.
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        expiresAt: state.expiresAt,
      }),
    },
  ),
);
