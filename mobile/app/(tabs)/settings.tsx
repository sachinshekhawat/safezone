import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Divider, Text, useTheme } from 'react-native-paper';
import MaterialIcon from '@expo/vector-icons/MaterialCommunityIcons';
import {
  GENERAL_PROFILE_DISCLAIMER,
  RISK_PROFILES,
  WOMEN_PROFILE_DISCLAIMER,
  type RiskProfile,
} from '@safezone/shared';
import useAppearanceStore, { type ModePreference } from '../../src/store/appearance-store';
import useAuthStore from '../../src/store/auth-store';
import { SPACING } from '../../src/theme';

type MaterialIconName = React.ComponentProps<typeof MaterialIcon>['name'];

interface ModeOption {
  value: ModePreference;
  label: string;
  detail: string;
  icon: MaterialIconName;
  /** Only shown when the account is entitled to it. */
  femaleOnly?: boolean;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'system',
    label: 'Match my phone',
    detail: 'Follows your device light or dark setting.',
    icon: 'theme-light-dark',
  },
  { value: 'light', label: 'Light', detail: 'Clean and neutral.', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'Dark', detail: 'Easier at night and on battery.', icon: 'weather-night' },
  {
    value: 'pink',
    label: 'Pink mode',
    detail: 'Rose palette, with safety figures reported for women.',
    icon: 'flower-tulip',
    femaleOnly: true,
  },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const { preference, profile, pinkAllowed, setPreference, setProfile } = useAppearanceStore();
  const { user, signOut } = useAuthStore();

  const options = MODE_OPTIONS.filter((o) => !o.femaleOnly || pinkAllowed);

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.xl },
      ]}
    >
      <Text variant="headlineSmall" style={styles.title}>
        Settings
      </Text>
      {user && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {user.name}
          {user.phone ? ` · ${user.phone}` : ''}
        </Text>
      )}

      <Text variant="labelLarge" style={styles.section}>
        Appearance
      </Text>

      {options.map((o) => {
        const active = preference === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => setPreference(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[
              styles.card,
              {
                backgroundColor: active ? theme.colors.primaryContainer : theme.colors.surface,
                borderColor: active ? theme.colors.primary : theme.colors.outlineVariant,
              },
            ]}
          >
            <MaterialIcon
              name={o.icon}
              size={22}
              color={active ? theme.colors.primary : theme.colors.onSurfaceVariant}
            />
            <View style={styles.cardText}>
              <Text variant="titleSmall" style={styles.cardLabel}>
                {o.label}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {o.detail}
              </Text>
            </View>
            {active && <MaterialIcon name="check-circle" size={20} color={theme.colors.primary} />}
          </Pressable>
        );
      })}

      {!pinkAllowed && (
        <Text variant="bodySmall" style={[styles.note, { color: theme.colors.onSurfaceVariant }]}>
          Pink mode is available on accounts registered as female.
        </Text>
      )}

      {pinkAllowed && (
        <>
          <Divider style={styles.divider} />
          <Text variant="labelLarge" style={styles.section}>
            Risk figures for
          </Text>

          {RISK_PROFILES.map((p) => {
            const active = profile === p.profile;
            return (
              <Pressable
                key={p.profile}
                onPress={() => setProfile(p.profile as RiskProfile)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[
                  styles.card,
                  {
                    backgroundColor: active ? theme.colors.primaryContainer : theme.colors.surface,
                    borderColor: active ? theme.colors.primary : theme.colors.outlineVariant,
                  },
                ]}
              >
                <MaterialIcon
                  name={p.profile === 'women' ? 'human-female' : 'account-group'}
                  size={22}
                  color={active ? theme.colors.primary : theme.colors.onSurfaceVariant}
                />
                <View style={styles.cardText}>
                  <Text variant="titleSmall" style={styles.cardLabel}>
                    {p.label}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {p.description}
                  </Text>
                </View>
                {active && (
                  <MaterialIcon name="check-circle" size={20} color={theme.colors.primary} />
                )}
              </Pressable>
            );
          })}

          {/* Which figure is measured and which is inferred. Showing a men's
              number as solid as the women's would misrepresent the evidence. */}
          <Text variant="bodySmall" style={[styles.note, { color: theme.colors.onSurfaceVariant }]}>
            {profile === 'women' ? WOMEN_PROFILE_DISCLAIMER : GENERAL_PROFILE_DISCLAIMER}
          </Text>
        </>
      )}

      <Divider style={styles.divider} />

      <Button
        mode="outlined"
        icon="logout"
        onPress={signOut}
        textColor={theme.colors.error}
        style={[styles.signOut, { borderColor: theme.colors.error }]}
      >
        Sign out
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: SPACING.md },
  title: { fontWeight: '800' },
  section: { marginTop: SPACING.lg, marginBottom: SPACING.sm, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: SPACING.sm,
  },
  cardText: { flex: 1, gap: 2 },
  cardLabel: { fontWeight: '700' },
  note: { lineHeight: 17, marginTop: SPACING.xs },
  divider: { marginTop: SPACING.lg },
  signOut: { marginTop: SPACING.lg, borderRadius: 12 },
});
