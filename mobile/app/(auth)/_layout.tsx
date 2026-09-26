import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';

/**
 * Onboarding stack: sign-in -> verify -> profile.
 *
 * A stack rather than a set of modals, because the three steps are sequential
 * and the back gesture should walk the user to the previous step.
 */
export default function AuthLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
