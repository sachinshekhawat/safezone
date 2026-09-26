import * as Location from 'expo-location';
import { create } from 'zustand';
import type { City, ZoneWithRisk } from '@safezone/shared';
import api from '../lib/api';

export type PermissionState = 'undetermined' | 'granted' | 'denied' | 'disabled';

interface LocationState {
  cities: City[];
  selectedCity: City | null;
  /** True when selectedCity came from GPS rather than a manual pick. */
  autoDetected: boolean;
  distanceKm: number | null;
  withinCoverage: boolean | null;

  zones: ZoneWithRisk[];
  zonesLoading: boolean;

  permission: PermissionState;
  detecting: boolean;
  error: string | null;

  bootstrap: () => Promise<void>;
  requestPermissionAndDetect: () => Promise<void>;
  selectCity: (city: City) => Promise<void>;
  loadZones: (cityId: string) => Promise<void>;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  cities: [],
  selectedCity: null,
  autoDetected: false,
  distanceKm: null,
  withinCoverage: null,
  zones: [],
  zonesLoading: false,
  permission: 'undetermined',
  detecting: false,
  error: null,

  /**
   * Called once on launch: load the city list, then either use an
   * already-granted location or leave the onboarding prompt to ask.
   */
  bootstrap: async () => {
    try {
      const res = await api.getCities(1, 100);
      set({ cities: res.cities ?? [] });
    } catch (err) {
      set({ error: 'Could not reach SafeZone. Check your connection.' });
      return;
    }

    const services = await Location.hasServicesEnabledAsync();
    if (!services) {
      set({ permission: 'disabled' });
    } else {
      const { status } = await Location.getForegroundPermissionsAsync();
      set({
        permission:
          status === Location.PermissionStatus.GRANTED
            ? 'granted'
            : status === Location.PermissionStatus.DENIED
              ? 'denied'
              : 'undetermined',
      });
    }

    if (get().permission === 'granted') {
      await get().requestPermissionAndDetect();
      return;
    }

    // Show something useful while we wait for a permission decision.
    const { cities, selectedCity } = get();
    if (!selectedCity && cities.length > 0) {
      const fallback = cities.find((c) => c.name.toLowerCase() === 'delhi') ?? cities[0];
      set({ selectedCity: fallback, autoDetected: false });
      await get().loadZones(fallback.id);
    }
  },

  requestPermissionAndDetect: async () => {
    set({ detecting: true, error: null });

    try {
      if (!(await Location.hasServicesEnabledAsync())) {
        set({ detecting: false, permission: 'disabled', error: 'Turn on location services to use this.' });
        return;
      }

      // Foreground permission only. Background ("Always") is requested later,
      // at the point an SOS actually starts — asking up front for a permission
      // the user cannot yet see the reason for gets denied, and both stores
      // scrutinise blanket background-location requests during review.
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        set({
          detecting: false,
          permission: 'denied',
          error: 'Location denied. Pick a city manually from the top bar.',
        });
        return;
      }

      set({ permission: 'granted' });

      const position = await Location.getCurrentPositionAsync({
        // City resolution needs rough accuracy only; Balanced is much faster
        // and far cheaper on battery than BestForNavigation.
        accuracy: Location.Accuracy.Balanced,
      });

      const res = await api.getNearestCity(position.coords.latitude, position.coords.longitude);

      set({
        selectedCity: res.city,
        autoDetected: true,
        distanceKm: res.distance_km,
        withinCoverage: res.within_coverage,
        detecting: false,
        error: res.within_coverage
          ? null
          : `Nearest monitored city is ${Math.round(res.distance_km)} km away, so this data may not reflect your area.`,
      });

      await get().loadZones(res.city.id);
    } catch (err) {
      set({
        detecting: false,
        error: 'Could not determine your location. Pick a city manually instead.',
      });
    }
  },

  selectCity: async (city) => {
    set({
      selectedCity: city,
      autoDetected: false,
      distanceKm: null,
      withinCoverage: null,
      error: null,
    });
    await get().loadZones(city.id);
  },

  loadZones: async (cityId) => {
    set({ zonesLoading: true });
    try {
      const res = await api.getZonesByCity(cityId);
      set({ zones: res.zones ?? [], zonesLoading: false });
    } catch {
      set({ zones: [], zonesLoading: false, error: 'Could not load zones for this city.' });
    }
  },
}));

export default useLocationStore;
