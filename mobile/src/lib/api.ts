import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { SafeZoneApi } from '@safezone/shared';

/**
 * Resolve a dev server host that works from a device or emulator.
 *
 * `localhost` inside an emulator or on a physical phone refers to the device
 * itself, not the Mac running the backend. In development we therefore reuse the
 * host Expo is already serving the bundle from, which is reachable by definition.
 * Android emulators are the exception: 10.0.2.2 is their alias for the host.
 */
function resolveHost(configured: string): string {
  if (!__DEV__) return configured;

  try {
    const url = new URL(configured);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return configured;

    // e.g. "192.168.1.5:8081" — the machine serving the Metro bundle.
    const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
    const lanHost = hostUri?.split(':')[0];

    if (lanHost && lanHost !== 'localhost' && lanHost !== '127.0.0.1') {
      url.hostname = lanHost;
      return url.toString().replace(/\/$/, '');
    }

    if (Platform.OS === 'android') {
      url.hostname = '10.0.2.2';
      return url.toString().replace(/\/$/, '');
    }
  } catch {
    // Fall through to the configured value.
  }
  return configured;
}

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; aiUrl?: string };

// Hardcoded for testing on physical device over LAN
export const API_URL = 'http://192.168.1.5:8080';
export const AI_URL = 'http://192.168.1.5:8090';

export const api = new SafeZoneApi({
  baseUrl: API_URL,
  aiUrl: AI_URL,
  // Indian mobile networks stall rather than fail outright, so keep this tight.
  timeoutMs: 15_000,
});

export default api;
