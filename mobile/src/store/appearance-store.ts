import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Gender, RiskProfile } from '@safezone/shared';
import { profileForGender } from '@safezone/shared';
import type { ThemeMode } from '../theme';

/**
 * Appearance and risk-profile preferences.
 *
 * Stored in AsyncStorage, not SecureStore: a theme choice is not a secret, and
 * the keystore is slower and has a small quota that belongs to tokens.
 */
const MODE_KEY = 'safezone.theme_mode';
const PROFILE_KEY = 'safezone.risk_profile';

/** 'system' follows the OS light/dark setting; the others are explicit. */
export type ModePreference = 'system' | ThemeMode;

interface AppearanceState {
  preference: ModePreference;
  /** The theme actually in force, after resolving 'system'. */
  mode: ThemeMode;
  /** Which audience the risk numbers are reported for. */
  profile: RiskProfile;
  /** Whether this account may turn pink mode on. */
  pinkAllowed: boolean;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /** Apply the signed-in user's gender: unlocks pink mode and picks a default. */
  applyUser: (gender?: Gender | null) => Promise<void>;
  setPreference: (p: ModePreference) => Promise<void>;
  setProfile: (p: RiskProfile) => Promise<void>;
  /** Reset to defaults on sign-out so the next user does not inherit a palette. */
  reset: () => Promise<void>;
}

function systemMode(): ThemeMode {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function resolve(pref: ModePreference, pinkAllowed: boolean): ThemeMode {
  if (pref === 'system') return systemMode();
  // Defence in depth: a stored 'pink' must not survive into an account that is
  // not entitled to it, even though the UI hides the option.
  if (pref === 'pink' && !pinkAllowed) return systemMode();
  return pref;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  preference: 'system',
  mode: systemMode(),
  profile: 'general',
  pinkAllowed: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const [storedMode, storedProfile] = await Promise.all([
        AsyncStorage.getItem(MODE_KEY),
        AsyncStorage.getItem(PROFILE_KEY),
      ]);
      const pref = (storedMode as ModePreference) ?? 'system';
      const profile = (storedProfile as RiskProfile) ?? 'general';
      set({
        preference: pref,
        // pinkAllowed is still false here — applyUser resolves it once the
        // session is known. Until then we never show pink.
        mode: resolve(pref, false),
        profile,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  /**
   * Pink mode is for women's accounts only, per the product decision.
   *
   * Gating on `gender === 'female'` specifically, not on "anything other than
   * male": a user who chose "prefer not to say" has not told us she is a woman,
   * and treating an absence as a yes would be guessing about exactly the field
   * the option exists to respect.
   */
  applyUser: async (gender) => {
    const pinkAllowed = gender === 'female';
    const { preference } = get();

    // A woman signing in for the first time gets the women profile by default,
    // because that is the data the platform actually measures for her.
    const defaultProfile = profileForGender(gender);
    const storedProfile = await AsyncStorage.getItem(PROFILE_KEY);
    const profile = (storedProfile as RiskProfile) ?? defaultProfile;

    set({
      pinkAllowed,
      profile: pinkAllowed ? profile : 'general',
      mode: resolve(preference, pinkAllowed),
    });
  },

  setPreference: async (p) => {
    const { pinkAllowed } = get();
    if (p === 'pink' && !pinkAllowed) return;
    set({ preference: p, mode: resolve(p, pinkAllowed) });
    try {
      await AsyncStorage.setItem(MODE_KEY, p);
    } catch {
      // A theme that fails to persist is a cosmetic problem, not a failure worth
      // surfacing mid-interaction.
    }
  },

  setProfile: async (p) => {
    if (p === 'women' && !get().pinkAllowed) return;
    set({ profile: p });
    try {
      await AsyncStorage.setItem(PROFILE_KEY, p);
    } catch {
      /* cosmetic */
    }
  },

  reset: async () => {
    set({ preference: 'system', mode: systemMode(), profile: 'general', pinkAllowed: false });
    try {
      await AsyncStorage.multiRemove([MODE_KEY, PROFILE_KEY]);
    } catch {
      /* cosmetic */
    }
  },
}));

// Follow the OS when the user has not chosen explicitly. Registered once at
// module scope rather than in a component, so it is not re-subscribed on render.
Appearance.addChangeListener(() => {
  const { preference, pinkAllowed } = useAppearanceStore.getState();
  if (preference === 'system') {
    useAppearanceStore.setState({ mode: resolve('system', pinkAllowed) });
  }
});

export default useAppearanceStore;
