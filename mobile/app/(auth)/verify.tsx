import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, IconButton, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import useAuthStore from '../../src/store/auth-store';
import { SPACING } from '../../src/theme';

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { pending, verifyOTP, requestOTP, busy, error, clearError } = useAuthStore();

  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(pending?.retryAfterSecs ?? 60);
  const inputRef = useRef<any>(null);

  // Auto-fill the code in development to speed up testing
  useEffect(() => {
    if (pending?.devCode) {
      setCode(pending.devCode);
    }
  }, [pending?.devCode]);

  // Resend countdown. Showing the remaining seconds stops the user from
  // hammering a button that the server will reject anyway.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // If the store lost the number (app reloaded mid-flow), go back rather than
  // showing a form that cannot submit.
  useEffect(() => {
    if (!pending) router.replace('/(auth)/sign-in');
  }, [pending, router]);

  const submit = async () => {
    if (code.length !== CODE_LENGTH) return;
    const outcome = await verifyOTP(code);
    if (outcome === 'needs-profile') {
      router.push({ pathname: '/(auth)/profile', params: { code } });
    }
    // 'signed-in' is handled by the redirect in the root layout.
  };

  // Submit as soon as the last digit lands — nobody wants to reach for a button
  // after typing a code they just read off a notification.
  useEffect(() => {
    if (code.length === CODE_LENGTH && !busy) void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const resend = async () => {
    if (!pending || cooldown > 0) return;
    if (await requestOTP(pending.phone)) setCooldown(60);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.wrap, { paddingTop: insets.top + SPACING.sm }]}>
        <IconButton
          icon="arrow-left"
          onPress={() => router.back()}
          accessibilityLabel="Back"
          style={styles.back}
        />

        <Text variant="headlineSmall" style={styles.title}>
          Enter the code
        </Text>
        <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
          Sent to {pending?.phone ?? ''}
        </Text>

        <TextInput
          ref={inputRef}
          mode="outlined"
          label="6-digit code"
          value={code}
          onChangeText={(t) => {
            setCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH));
            clearError();
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          maxLength={CODE_LENGTH}
          style={styles.codeInput}
          accessibilityLabel="Six digit verification code"
          // Wide letter spacing makes a 6-digit code far easier to proof-read.
          contentStyle={styles.codeText}
        />

        {/* Development affordance: with no SMS provider the server returns the
            code, so there is no need to go digging in the server log. */}
        {pending?.devCode && (
          <View style={[styles.devBox, { backgroundColor: theme.colors.secondaryContainer }]}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSecondaryContainer }}>
              Dev mode — no SMS provider configured. Your code is{' '}
              <Text style={styles.devCode}>{pending.devCode}</Text>
            </Text>
          </View>
        )}

        <Button
          mode="contained"
          onPress={submit}
          loading={busy}
          disabled={busy || code.length !== CODE_LENGTH}
          style={styles.cta}
          contentStyle={styles.ctaContent}
        >
          Verify
        </Button>

        <Button mode="text" onPress={resend} disabled={cooldown > 0 || busy} style={styles.resend}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
      </View>

      <Snackbar visible={Boolean(error)} onDismiss={clearError} duration={5000}>
        {error ?? ''}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { flex: 1, paddingHorizontal: SPACING.lg },
  back: { marginLeft: -SPACING.sm, marginBottom: SPACING.sm },
  title: { fontWeight: '800' },
  subtitle: { marginTop: 4, marginBottom: SPACING.lg },
  codeInput: { fontSize: 22 },
  codeText: { letterSpacing: 8, fontWeight: '700' },
  devBox: { marginTop: SPACING.md, padding: SPACING.sm + 2, borderRadius: 10 },
  devCode: { fontWeight: '800', letterSpacing: 2 },
  cta: { marginTop: SPACING.lg, borderRadius: 12 },
  ctaContent: { paddingVertical: 6 },
  resend: { marginTop: SPACING.sm, alignSelf: 'center' },
});
