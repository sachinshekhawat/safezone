import * as SecureStore from 'expo-secure-store';

/**
 * Token storage backed by the OS keystore.
 *
 * iOS Keychain / Android Keystore rather than AsyncStorage: AsyncStorage is
 * plain app-sandbox storage and is trivially dumped from a rooted or jailbroken
 * device. A bearer token here can raise an SOS in someone's name, so it gets
 * hardware-backed storage where available.
 *
 * See token-store.web.ts for the browser counterpart and why it differs.
 */
export async function getToken(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export async function setToken(key: string, value: string): Promise<void> {
  return SecureStore.setItemAsync(key, value);
}

export async function deleteToken(key: string): Promise<void> {
  return SecureStore.deleteItemAsync(key);
}
