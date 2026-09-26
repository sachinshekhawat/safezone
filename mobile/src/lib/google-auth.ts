import { useCallback, useEffect } from 'react';
import Constants from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import useAuthStore from '../store/auth-store';

// Lets the auth popup hand control back to the app when it closes.
WebBrowser.maybeCompleteAuthSession();

interface GoogleExtra {
  googleIosClientId?: string;
  googleAndroidClientId?: string;
  googleWebClientId?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as GoogleExtra;

/** True when app.json carries at least one OAuth client ID. */
export const googleConfigured = Boolean(
  extra.googleIosClientId || extra.googleAndroidClientId || extra.googleWebClientId,
);

/**
 * True when the surrounding runtime can actually complete the redirect.
 *
 * Expo Go cannot: Google rejects the `exp://` redirect URI it would have to use,
 * and Expo's auth proxy that used to paper over this was removed. A development
 * build (or a store build) registers the app's own scheme and works. Detecting
 * this lets the UI say so plainly instead of opening a browser that dead-ends.
 */
export const googleRuntimeSupported = Constants.appOwnership !== 'expo';

/**
 * Google sign-in, wired to the backend's ID-token endpoint.
 *
 * We ask for an ID token rather than an access token: the backend verifies the
 * ID token's signature against Google's JWKS, which proves who the user is
 * without us ever holding a Google credential we would then have to protect.
 */
export function useGoogleSignIn() {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: extra.googleIosClientId,
    androidClientId: extra.googleAndroidClientId,
    clientId: extra.googleWebClientId,
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params?.id_token;
    if (idToken) void signInWithGoogle(idToken);
  }, [response, signInWithGoogle]);

  const start = useCallback(() => {
    if (!request) return;
    void promptAsync();
  }, [request, promptAsync]);

  return {
    start,
    /** False while the auth request is still being prepared. */
    ready: Boolean(request) && googleConfigured && googleRuntimeSupported,
  };
}

export default useGoogleSignIn;
