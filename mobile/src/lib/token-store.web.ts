/**
 * Browser token storage — development only.
 *
 * `expo-secure-store` has no web implementation, and the browser has no
 * equivalent of the Keychain. `npm run web` exists so the screens can be worked
 * on quickly in a browser; the shipped product is the iOS and Android build.
 *
 * sessionStorage, not localStorage: it is cleared when the tab closes, so a
 * token cannot outlive a development session on a shared machine. If this app
 * ever ships a real web target, the token belongs in an HttpOnly cookie set by
 * the gateway instead — anything readable from JavaScript is readable by any XSS
 * on the page.
 */

let warned = false;

function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    '[safezone] Tokens are in sessionStorage because this is the web dev target. ' +
      'Do not treat this as secure storage.',
  );
}

function available(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    // Storage access throws when cookies are blocked.
    return null;
  }
}

export async function getToken(key: string): Promise<string | null> {
  warnOnce();
  return available()?.getItem(key) ?? null;
}

export async function setToken(key: string, value: string): Promise<void> {
  warnOnce();
  available()?.setItem(key, value);
}

export async function deleteToken(key: string): Promise<void> {
  available()?.removeItem(key);
}
