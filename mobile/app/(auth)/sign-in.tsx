import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Button,
  Divider,
  HelperText,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import MaterialIcon from '@expo/vector-icons/MaterialCommunityIcons';
import useAuthStore from '../../src/store/auth-store';
import useGoogleSignIn, {
  googleConfigured,
  googleRuntimeSupported,
} from '../../src/lib/google-auth';
import { SPACING } from '../../src/theme';

/** Ten digits is the whole Indian mobile space; anything else is a typo. */
function localDigits(input: string): string {
  return input.replace(/\D/g, '').slice(-10);
}

export default function SignInScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { requestOTP, busy, error, clearError, googleEnabled } = useAuthStore();
  const google = useGoogleSignIn();

  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);

  const digits = localDigits(phone);
  const valid = /^[6-9]\d{9}$/.test(digits);

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    if (await requestOTP(digits)) router.push('/(auth)/verify');
  };

  // Why Google might be unavailable, worded for whoever is looking at the
  // screen — a silently missing button is a support ticket.
  const googleNote = !googleConfigured
    ? 'Add your Google OAuth client IDs to app.json to enable this.'
    : !googleRuntimeSupported
      ? 'Google sign-in needs a development build; it cannot complete inside Expo Go.'
      : !googleEnabled
        ? 'The server has no Google credentials configured yet.'
        : null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + SPACING.lg },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <MaterialIcon name="shield-check" size={38} color={theme.colors.primary} />
          <Text variant="headlineMedium" style={styles.brandText}>
            SafeZone
          </Text>
        </View>

        <Text variant="titleMedium" style={styles.tagline}>
          Know which areas need extra care, and reach help fast.
        </Text>

        <View style={styles.form}>
          <TextInput
            mode="outlined"
            label="Mobile number"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              clearError();
            }}
            onBlur={() => setTouched(true)}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={16}
            left={<TextInput.Affix text="+91" />}
            right={valid ? <TextInput.Icon icon="check-circle" /> : undefined}
            error={touched && phone.length > 0 && !valid}
            accessibilityLabel="Your 10 digit mobile number"
          />
          <HelperText type={touched && phone.length > 0 && !valid ? 'error' : 'info'} visible>
            {touched && phone.length > 0 && !valid
              ? 'Enter a 10-digit Indian mobile number.'
              : 'We send a 6-digit code to confirm it is you.'}
          </HelperText>

          <Button
            mode="contained"
            onPress={submit}
            loading={busy}
            disabled={busy || !valid}
            style={styles.cta}
            contentStyle={styles.ctaContent}
          >
            Continue
          </Button>
        </View>

        <View style={styles.dividerRow}>
          <Divider style={styles.flexDivider} />
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            or
          </Text>
          <Divider style={styles.flexDivider} />
        </View>

        {/* One Google button, not two. The server decides whether this is a
            sign-in or a sign-up, so making the user choose the right button
            only creates a wrong one to pick. */}
        <Button
          mode="outlined"
          icon="google"
          onPress={google.start}
          disabled={!google.ready || !googleEnabled || busy}
          style={styles.googleBtn}
          contentStyle={styles.ctaContent}
        >
          Continue with Google
        </Button>

        {googleNote && (
          <Text variant="bodySmall" style={[styles.googleNote, { color: theme.colors.onSurfaceVariant }]}>
            {googleNote}
          </Text>
        )}

        <Text variant="bodySmall" style={[styles.legal, { color: theme.colors.onSurfaceVariant }]}>
          We ask for your consent before storing anything. Your number is used to
          sign you in and, if you raise an SOS, so responders can call you back.
        </Text>
      </ScrollView>

      <Snackbar visible={Boolean(error)} onDismiss={clearError} duration={5000}>
        {error ?? ''}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg, flexGrow: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  brandText: { fontWeight: '800' },
  tagline: { marginTop: SPACING.sm, marginBottom: SPACING.xl, lineHeight: 24, opacity: 0.8 },
  form: { gap: 0 },
  cta: { marginTop: SPACING.sm, borderRadius: 12 },
  ctaContent: { paddingVertical: 6 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginVertical: SPACING.lg,
  },
  flexDivider: { flex: 1 },
  googleBtn: { borderRadius: 12 },
  googleNote: { marginTop: SPACING.sm, lineHeight: 17 },
  legal: { marginTop: 'auto', paddingTop: SPACING.xl, lineHeight: 17 },
});
