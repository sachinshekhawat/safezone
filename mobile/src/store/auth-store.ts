import { create } from 'zustand';
import { ApiError, type AuthResponse, type Gender, type User } from '@safezone/shared';
import api from '../lib/api';
import { deleteToken, getToken, setToken } from '../lib/token-store';

/**
 * Storage keys. The backing store is platform-specific — see src/lib/token-store.
 */
const TOKEN_KEY = 'safezone.token';
const REFRESH_KEY = 'safezone.refresh_token';

export interface PendingPhone {
  /** E.164 as normalised by the server. */
  phone: string;
  /** Present only in development, when the server has no SMS provider. */
  devCode?: string;
  retryAfterSecs: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  /** True until the keystore has been read, so the router can hold its redirect. */
  hydrating: boolean;
  busy: boolean;
  error: string | null;

  /** Carried between the phone screen and the verify screen. */
  pending: PendingPhone | null;

  /** Whether the server can honour Google sign-in at all. */
  googleEnabled: boolean;

  hydrate: () => Promise<void>;
  requestOTP: (phone: string) => Promise<boolean>;
  /** Resolves to 'signed-in' | 'needs-profile' | 'failed'. */
  verifyOTP: (code: string) => Promise<'signed-in' | 'needs-profile' | 'failed'>;
  completeRegistration: (input: {
    name: string;
    gender: Gender;
    cityId: string;
    code: string;
    consentData: boolean;
    consentLocation: boolean;
  }) => Promise<boolean>;
  signInWithGoogle: (idToken: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

/** Persist a token pair and point the API client at it. */
async function persist(res: AuthResponse) {
  await setToken(TOKEN_KEY, res.token);
  await setToken(REFRESH_KEY, res.refresh_token);
  api.setToken(res.token);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  hydrating: true,
  busy: false,
  error: null,
  pending: null,
  googleEnabled: false,

  /**
   * Restore a session on launch.
   *
   * The stored token is validated against /auth/me rather than trusted: it may
   * have expired, or the account may have been deactivated since. A stale token
   * that "works" locally but fails on every real request is worse than no token.
   */
  hydrate: async () => {
    // Ask the server whether Google is even available, so the button can be
    // hidden rather than shown and then failing.
    api
      .googleEnabled()
      .then(({ enabled }) => set({ googleEnabled: enabled }))
      .catch(() => set({ googleEnabled: false }));

    let stored: string | null = null;
    try {
      stored = await getToken(TOKEN_KEY);
      if (!stored) {
        set({ hydrating: false });
        return;
      }

      api.setToken(stored);
      const user = await api.getMe();
      set({ user, token: stored, hydrating: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await deleteToken(TOKEN_KEY);
        await deleteToken(REFRESH_KEY);
        api.setToken(null);
        set({ user: null, token: null, hydrating: false });
        return;
      }
      // Network failure: keep the token. Being offline is not being signed out.
      set({ token: stored, hydrating: false });
    }
  },

  requestOTP: async (phone) => {
    set({ busy: true, error: null });
    try {
      const res = await api.requestOTP(phone);
      if (!res.sent) {
        set({
          busy: false,
          error: `Wait ${res.retry_after_secs}s before asking for another code.`,
        });
        return false;
      }
      set({
        busy: false,
        pending: {
          phone,
          devCode: res.dev_code,
          retryAfterSecs: res.retry_after_secs,
        },
      });
      return true;
    } catch (err) {
      set({ busy: false, error: messageFor(err, 'Could not send the code. Check your connection.') });
      return false;
    }
  },

  verifyOTP: async (code) => {
    const pending = get().pending;
    if (!pending) {
      set({ error: 'Start again — we lost track of that number.' });
      return 'failed';
    }

    set({ busy: true, error: null });
    try {
      const res = await api.verifyOTP(pending.phone, code);

      if (res.registered === false) {
        // Known number, no account: carry on to the profile form. The server
        // left the code unconsumed so registration can reuse it.
        set({ busy: false, pending: { ...pending, phone: res.phone } });
        return 'needs-profile';
      }

      await persist(res);
      set({ busy: false, user: res.user, token: res.token, pending: null });
      return 'signed-in';
    } catch (err) {
      set({ busy: false, error: messageFor(err, 'Could not check that code.') });
      return 'failed';
    }
  },

  completeRegistration: async ({ name, gender, cityId, code, consentData, consentLocation }) => {
    const pending = get().pending;
    if (!pending) {
      set({ error: 'Start again — we lost track of that number.' });
      return false;
    }

    set({ busy: true, error: null });
    try {
      const res = await api.registerWithPhone({
        phone: pending.phone,
        code,
        name,
        gender,
        city_id: cityId,
        consent_data: consentData,
        consent_location: consentLocation,
      });
      await persist(res);
      set({ busy: false, user: res.user, token: res.token, pending: null });
      return true;
    } catch (err) {
      set({ busy: false, error: messageFor(err, 'Could not create your account.') });
      return false;
    }
  },

  signInWithGoogle: async (idToken) => {
    set({ busy: true, error: null });
    try {
      const res = await api.signInWithGoogle(idToken);
      await persist(res);
      set({ busy: false, user: res.user, token: res.token });
      return true;
    } catch (err) {
      set({ busy: false, error: messageFor(err, 'Google sign-in failed.') });
      return false;
    }
  },

  signOut: async () => {
    await deleteToken(TOKEN_KEY);
    await deleteToken(REFRESH_KEY);
    api.setToken(null);
    set({ user: null, token: null, pending: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
