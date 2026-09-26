import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  Checkbox,
  Divider,
  IconButton,
  Menu,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import MaterialIcon from '@expo/vector-icons/MaterialCommunityIcons';
import type { Gender } from '@safezone/shared';
import useAuthStore from '../../src/store/auth-store';
import useLocationStore from '../../src/store/location-store';
import { SPACING } from '../../src/theme';

/**
 * Gender options.
 *
 * "Prefer not to say" is a first-class choice, not a hidden fallback: the app
 * tailors guidance by gender but must never make disclosing it the price of
 * using a safety tool.
 */
const GENDERS: ReadonlyArray<{ value: Gender; label: string }> = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export default function ProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();

  const { pending, completeRegistration, busy, error, clearError } = useAuthStore();
  const { cities, selectedCity } = useLocationStore();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  // Pre-fill from the detected city — it is right most of the time, and still
  // changeable.
  const [cityId, setCityId] = useState<string | null>(selectedCity?.id ?? null);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);

  // Both start false. A pre-ticked consent box is not consent.
  const [consentData, setConsentData] = useState(false);
  const [consentLocation, setConsentLocation] = useState(false);

  const cityName = useMemo(
    () => cities.find((c) => c.id === cityId)?.name ?? 'Select your city',
    [cities, cityId],
  );

  const canSubmit =
    name.trim().length >= 2 && gender !== null && cityId !== null && consentData && !busy;

  const submit = async () => {
    if (!canSubmit || !code) return;
    await completeRegistration({
      name: name.trim(),
      gender: gender!,
      cityId: cityId!,
      code,
      consentData,
      consentLocation,
    });
    // Success is handled by the redirect in the root layout.
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + SPACING.sm, paddingBottom: insets.bottom + SPACING.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <IconButton
          icon="arrow-left"
          onPress={() => router.back()}
          accessibilityLabel="Back"
          style={styles.back}
        />

        <Text variant="headlineSmall" style={styles.title}>
          Finish your profile
        </Text>
        <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
          {pending?.phone ? `${pending.phone} verified.` : ''} Just a few details so
          we can show data for where you are.
        </Text>

        <TextInput
          mode="outlined"
          label="Your name"
          value={name}
          onChangeText={(t) => {
            setName(t);
            clearError();
          }}
          autoCapitalize="words"
          textContentType="name"
          autoComplete="name"
          maxLength={80}
          style={styles.field}
          accessibilityLabel="Your full name"
        />

        <Text variant="labelLarge" style={styles.groupLabel}>
          Gender
        </Text>
        {/* Chips rather than a dropdown: four options fit on screen, and every
            option being visible avoids implying a default. */}
        <View style={styles.genderRow}>
          {GENDERS.map((opt) => {
            const active = gender === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setGender(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[
                  styles.genderChip,
                  {
                    backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                    borderColor: active ? theme.colors.primary : theme.colors.outline,
                  },
                ]}
              >
                <Text
                  variant="labelLarge"
                  style={{ color: active ? theme.colors.onPrimary : theme.colors.onSurface }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text variant="labelLarge" style={styles.groupLabel}>
          City
        </Text>
        <Menu
          visible={cityMenuOpen}
          onDismiss={() => setCityMenuOpen(false)}
          anchor={
            <Pressable
              onPress={() => setCityMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`City: ${cityName}`}
              style={[
                styles.cityPicker,
                { borderColor: theme.colors.outline, backgroundColor: theme.colors.surface },
              ]}
            >
              <MaterialIcon name="map-marker" size={18} color={theme.colors.primary} />
              <Text variant="bodyLarge" style={styles.cityText}>
                {cityName}
              </Text>
              <MaterialIcon
                name="chevron-down"
                size={20}
                color={theme.colors.onSurfaceVariant}
              />
            </Pressable>
          }
          contentStyle={styles.cityMenu}
        >
          <ScrollView style={styles.cityMenuScroll}>
            {cities.map((c) => (
              <Menu.Item
                key={c.id}
                onPress={() => {
                  setCityId(c.id);
                  setCityMenuOpen(false);
                }}
                title={`${c.name} · ${c.state}`}
                leadingIcon={c.id === cityId ? 'check' : undefined}
              />
            ))}
          </ScrollView>
        </Menu>

        <Divider style={styles.divider} />

        <Text variant="labelLarge" style={styles.groupLabel}>
          Your consent
        </Text>

        <Pressable
          onPress={() => setConsentData((v) => !v)}
          style={styles.consentRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consentData }}
          accessibilityLabel="Agree to SafeZone storing your account details. Required."
        >
          {/* Checkbox.Android, not the adaptive Checkbox, on purpose. The iOS
              variant draws only a tick when checked and nothing at all when
              unchecked — so an unticked consent box is invisible, leaving the
              user staring at a disabled button with no control to enable. A
              consent gate has to show the thing you are consenting with. */}
          <Checkbox.Android
            status={consentData ? 'checked' : 'unchecked'}
            color={theme.colors.primary}
          />
          <Text variant="bodySmall" style={styles.consentText}>
            I agree that SafeZone can store my name, gender, city and mobile
            number to run my account. Required.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setConsentLocation((v) => !v)}
          style={styles.consentRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consentLocation }}
          accessibilityLabel="Agree to SafeZone using your location. Optional."
        >
          <Checkbox.Android
            status={consentLocation ? 'checked' : 'unchecked'}
            color={theme.colors.primary}
          />
          <Text variant="bodySmall" style={styles.consentText}>
            I agree that SafeZone can use my location to show nearby risk data
            and to share my position with responders during an SOS. Optional —
            you can still use the app and pick a city by hand.
          </Text>
        </Pressable>

        <Button
          mode="contained"
          onPress={submit}
          loading={busy}
          disabled={!canSubmit}
          style={styles.cta}
          contentStyle={styles.ctaContent}
        >
          Create my account
        </Button>

        <Text variant="bodySmall" style={[styles.legal, { color: theme.colors.onSurfaceVariant }]}>
          You can withdraw either consent later from your profile. We never store
          victim identities or FIR details — only anonymised, area-level statistics.
        </Text>
      </ScrollView>

      <Snackbar visible={Boolean(error)} onDismiss={clearError} duration={6000}>
        {error ?? ''}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  back: { marginLeft: -SPACING.sm },
  title: { fontWeight: '800' },
  subtitle: { marginTop: 4, marginBottom: SPACING.lg, lineHeight: 21 },
  field: { marginBottom: SPACING.sm },
  groupLabel: { marginTop: SPACING.md, marginBottom: SPACING.sm, fontWeight: '700' },
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  genderChip: {
    paddingHorizontal: SPACING.md,
    // 44pt tall so it clears the minimum touch target.
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  cityPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
  },
  cityText: { flex: 1 },
  cityMenu: { maxHeight: 360 },
  cityMenuScroll: { maxHeight: 340 },
  divider: { marginTop: SPACING.lg },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
    paddingRight: SPACING.sm,
  },
  consentText: { flex: 1, lineHeight: 18, paddingTop: 9 },
  cta: { marginTop: SPACING.md, borderRadius: 12 },
  ctaContent: { paddingVertical: 6 },
  legal: { marginTop: SPACING.md, lineHeight: 17 },
});
