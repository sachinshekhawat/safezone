import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';
import type { City } from '@/types';

export type LocationPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unavailable';

interface LocationState {
  /** All monitored cities, for the switcher. */
  cities: City[];
  citiesLoading: boolean;

  /** The city whose data is currently shown. */
  selectedCity: City | null;
  /** True when selectedCity came from GPS rather than a manual pick. */
  autoDetected: boolean;
  /** Distance from the user to selectedCity, when known. */
  distanceKm: number | null;
  /** False when the user is outside the monitored radius of any city. */
  withinCoverage: boolean | null;

  permission: LocationPermission;
  detecting: boolean;
  error: string | null;

  loadCities: () => Promise<void>;
  /** Ask for geolocation and switch to the nearest monitored city. */
  detectLocation: () => Promise<void>;
  /** Manually choose a city; this wins over GPS until re-detected. */
  selectCity: (city: City) => void;
  /** Read the permission state without triggering a prompt, where supported. */
  refreshPermission: () => Promise<void>;
}

/** Wrap the callback-based geolocation API in a promise. */
function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      // City resolution only needs rough accuracy, so prefer a fast, cheap fix
      // and allow a recent cached one.
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 5 * 60 * 1000,
    });
  });
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      cities: [],
      citiesLoading: false,
      selectedCity: null,
      autoDetected: false,
      distanceKm: null,
      withinCoverage: null,
      permission: 'unknown',
      detecting: false,
      error: null,

      loadCities: async () => {
        if (get().citiesLoading) return;
        set({ citiesLoading: true });
        try {
          // limit=100 covers the full monitored set in one call.
          const res = await api.getCities(1, 100);
          const cities: City[] = res?.cities ?? [];
          set({ cities, citiesLoading: false });

          // Make sure something is selected even before/without GPS.
          if (!get().selectedCity && cities.length > 0) {
            const fallback = cities.find((c) => c.name.toLowerCase() === 'delhi') ?? cities[0];
            set({ selectedCity: fallback, autoDetected: false });
          }
        } catch {
          set({ citiesLoading: false });
        }
      },

      refreshPermission: async () => {
        if (typeof navigator === 'undefined') return;
        if (!navigator.geolocation) {
          set({ permission: 'unavailable' });
          return;
        }
        // Permissions API is not available everywhere (notably older Safari),
        // so treat absence as "we have to ask".
        if (!navigator.permissions?.query) {
          set({ permission: 'prompt' });
          return;
        }
        try {
          const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          set({ permission: status.state as LocationPermission });
        } catch {
          set({ permission: 'prompt' });
        }
      },

      detectLocation: async () => {
        set({ detecting: true, error: null });
        try {
          const pos = await currentPosition();
          const { latitude, longitude } = pos.coords;

          const res = await api.getNearestCity(latitude, longitude);
          const city: City | undefined = res?.city;
          if (!city) throw new Error('No city returned');

          set({
            selectedCity: city,
            autoDetected: true,
            distanceKm: typeof res.distance_km === 'number' ? res.distance_km : null,
            withinCoverage: res.within_coverage ?? null,
            permission: 'granted',
            detecting: false,
            error: null,
          });
        } catch (err: any) {
          // GeolocationPositionError codes: 1 denied, 2 unavailable, 3 timeout.
          let permission: LocationPermission = get().permission;
          let message = 'Could not detect your location.';

          if (err?.message === 'unavailable') {
            permission = 'unavailable';
            message = 'This browser does not support location.';
          } else if (err?.code === 1) {
            permission = 'denied';
            message = 'Location permission denied. Pick a city manually instead.';
          } else if (err?.code === 2) {
            message = 'Location unavailable. Pick a city manually instead.';
          } else if (err?.code === 3) {
            message = 'Location request timed out. Pick a city manually instead.';
          }

          set({ detecting: false, permission, error: message });
        }
      },

      selectCity: (city) =>
        set({
          selectedCity: city,
          autoDetected: false,
          distanceKm: null,
          withinCoverage: null,
          error: null,
        }),
    }),
    {
      name: 'safezone-location',
      // Persist only the choice, never the coordinates — we do not need the
      // user's position after resolving it, so we do not keep it.
      partialize: (state) => ({
        selectedCity: state.selectedCity,
        autoDetected: state.autoDetected,
        permission: state.permission,
      }),
    },
  ),
);

export default useLocationStore;
