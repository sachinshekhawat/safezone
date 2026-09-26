import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { themeFor } from '../src/theme';
import useAppearanceStore from '../src/store/appearance-store';
import useAuthStore from '../src/store/auth-store';
import useLocationStore from '../src/store/location-store';

// Hold the splash screen until we know whether there is a session, so the user
// never sees the sign-in screen flash before being sent to the app.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Sends the user to the right half of the app.
 *
 * Kept as a hook inside the provider tree rather than a wrapper component so it
 * can use the router; expo-router needs the navigator mounted before any
 * redirect, which is why this runs in an effect rather than during render.
 */
function useAuthRedirect() {
  const router = useRouter();
  const segments = useSegments();
  const { user, hydrating } = useAuthStore();

  useEffect(() => {
    if (hydrating) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, hydrating, segments, router]);
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrating = useAuthStore((s) => s.hydrating);
  const user = useAuthStore((s) => s.user);
  const bootstrap = useLocationStore((s) => s.bootstrap);

  const mode = useAppearanceStore((s) => s.mode);
  const hydrateAppearance = useAppearanceStore((s) => s.hydrate);
  const applyUser = useAppearanceStore((s) => s.applyUser);

  useEffect(() => {
    hydrate();
    hydrateAppearance();
  }, [hydrate, hydrateAppearance]);

  // Pink mode and the women risk profile both depend on the signed-in account,
  // so they are resolved whenever the session changes — including sign-out, which
  // must not leave the next user looking at the previous one's palette.
  useEffect(() => {
    applyUser(user?.gender ?? null);
  }, [user?.gender, applyUser]);

  const theme = themeFor(mode);

  // Zone and city data is public, so load it in parallel with the session check
  // instead of waiting for sign-in.
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!hydrating) SplashScreen.hideAsync().catch(() => {});
  }, [hydrating]);

  useAuthRedirect();

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
        </Stack>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
