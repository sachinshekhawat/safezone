import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Banner,
  Button,
  Card,
  Text,
  useTheme,
} from 'react-native-paper';
import MaterialIcon from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import {
  HELPLINES,
  PRIMARY_HELPLINE,
  type LocationUpdate,
  type SOSTriggerResponse,
} from '@safezone/shared';
import api from '../../src/lib/api';
import { SPACING } from '../../src/theme';

/** How often to sample and flush while an SOS is active. */
const SAMPLE_INTERVAL_MS = 5_000;

export default function SOSScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [sos, setSOS] = useState<SOSTriggerResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [synced, setSynced] = useState(0);

  // Buffer of points not yet accepted by the server. Kept in a ref so the
  // interval callback always sees the latest without re-subscribing.
  const buffer = useRef<LocationUpdate[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStreaming = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stopStreaming, [stopStreaming]);

  /**
   * Sample the current position and flush the buffer.
   *
   * Points that fail to upload stay buffered and are retried on the next tick,
   * so a dropped connection delays delivery rather than losing the trail.
   */
  const tick = useCallback(async (sosId: string) => {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      buffer.current.push({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        speed: pos.coords.speed ?? undefined,
        heading: pos.coords.heading ?? undefined,
        ts: Date.now(),
      });
    } catch {
      // A failed fix should not stop the loop; try again next tick.
    }

    if (buffer.current.length === 0) return;

    const batch = buffer.current.slice(0, 200);
    try {
      const res = await api.syncSOSLocations(sosId, batch);
      buffer.current = buffer.current.slice(batch.length);
      setSynced((n) => n + res.accepted);
    } catch {
      // Keep the batch buffered for the next attempt.
    }
  }, []);

  const trigger = async () => {
    setBusy(true);
    setError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        setError('Location is required to send an SOS. Call 112 directly instead.');
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const result = await api.triggerSOS(pos.coords.latitude, pos.coords.longitude);
      setSOS(result);

      // Begin streaming over the batched endpoint rather than a socket: a
      // WebSocket is torn down as soon as this app is backgrounded.
      const sosId = result.sos.id;
      timer.current = setInterval(() => void tick(sosId), SAMPLE_INTERVAL_MS);
      void tick(sosId);
    } catch (err: any) {
      setError(
        err?.message
          ? `SOS was NOT sent: ${err.message}. Call 112 now.`
          : 'SOS was NOT sent. Call 112 now.',
      );
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    stopStreaming();
    buffer.current = [];
    setSOS(null);
    setSynced(0);
  };

  const call = (number: string) => Linking.openURL(`tel:${number}`);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.md }]}
    >
      {!sos ? (
        <>
          <Text variant="headlineSmall" style={styles.title}>
            Emergency SOS
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Alerts the nearest police station with your live location. No account needed.
          </Text>

          {error && (
            <Banner
              visible
              icon={({ size }) => (
                <MaterialIcon name="alert-circle" size={size} color={theme.colors.error} />
              )}
              style={styles.banner}
            >
              {error}
            </Banner>
          )}

          <Button
            mode="contained"
            buttonColor={theme.colors.error}
            textColor={theme.colors.onError}
            onPress={trigger}
            disabled={busy}
            style={styles.sosButton}
            contentStyle={styles.sosButtonContent}
            labelStyle={styles.sosButtonLabel}
          >
            {busy ? 'Sending…' : 'PRESS FOR HELP'}
          </Button>
          {busy && <ActivityIndicator style={styles.spinner} />}
        </>
      ) : (
        <>
          <Card mode="contained" style={[styles.activeCard, { backgroundColor: theme.colors.errorContainer }]}>
            <Card.Content>
              <Text variant="titleLarge" style={{ color: theme.colors.onErrorContainer }}>
                SOS active
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onErrorContainer }}>
                Police have been notified with your location.
              </Text>
            </Card.Content>
          </Card>

          <Card mode="elevated" style={styles.card}>
            <Card.Content>
              <Text variant="labelLarge">Nearest police station</Text>
              <Text variant="titleMedium">{sos.nearest_station}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {sos.station_distance_km} km away
              </Text>
              <Text variant="bodySmall" style={styles.syncLine}>
                {synced} location update{synced === 1 ? '' : 's'} delivered
                {buffer.current.length > 0 ? ` · ${buffer.current.length} queued` : ''}
              </Text>
            </Card.Content>
          </Card>
        </>
      )}

      {/* Always reachable: a voice call works when mobile data does not. The
          primary number is separated out and rendered larger, because choosing
          between eight buttons is the last thing anyone needs mid-emergency.
          The rest are shown to every user regardless of gender — someone may be
          calling on behalf of another person, and filtering by who holds the
          phone would be the wrong default here. */}
      <Text variant="labelLarge" style={styles.helplineHeading}>
        Call directly
      </Text>

      <Button
        mode="contained"
        buttonColor={theme.colors.error}
        textColor={theme.colors.onError}
        icon={() => <MaterialIcon name="phone" size={20} color={theme.colors.onError} />}
        onPress={() => call(PRIMARY_HELPLINE.number)}
        style={styles.primaryHelpline}
        contentStyle={styles.primaryHelplineContent}
        labelStyle={styles.primaryHelplineLabel}
      >
        {PRIMARY_HELPLINE.number} · {PRIMARY_HELPLINE.label}
      </Button>
      <Text variant="bodySmall" style={styles.primaryHelplineDetail}>
        {PRIMARY_HELPLINE.detail}
      </Text>

      {HELPLINES.filter((h) => !h.primary).map((h) => (
        <Pressable
          key={h.number}
          onPress={() => call(h.number)}
          accessibilityRole="button"
          accessibilityLabel={`Call ${h.label} on ${h.number}. ${h.detail}`}
          style={[styles.helplineRow, { borderColor: theme.colors.outlineVariant }]}
        >
          <View style={[styles.helplineNumber, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Text style={[styles.helplineNumberText, { color: theme.colors.onSurface }]}>
              {h.number}
            </Text>
          </View>
          <View style={styles.helplineText}>
            <Text variant="titleSmall" style={styles.helplineLabel}>
              {h.label}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {h.detail}
            </Text>
          </View>
          <MaterialIcon name="phone" size={18} color={theme.colors.primary} />
        </Pressable>
      ))}

      {sos && (
        <Button mode="text" onPress={cancel} style={styles.cancel}>
          Cancel SOS — I&apos;m safe
        </Button>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', opacity: 0.7, marginTop: SPACING.xs, marginBottom: SPACING.lg },
  banner: { marginBottom: SPACING.md },
  sosButton: { borderRadius: 999, alignSelf: 'center', marginVertical: SPACING.lg },
  sosButtonContent: { height: 160, width: 220 },
  sosButtonLabel: { fontSize: 18, fontWeight: '800' },
  spinner: { marginBottom: SPACING.md },
  activeCard: { marginBottom: SPACING.md },
  card: { marginBottom: SPACING.md },
  syncLine: { marginTop: SPACING.sm, opacity: 0.7 },
  helplineHeading: { marginTop: SPACING.md, marginBottom: SPACING.sm },
  primaryHelpline: { borderRadius: 14 },
  primaryHelplineContent: { height: 56 },
  primaryHelplineLabel: { fontSize: 17, fontWeight: '800' },
  primaryHelplineDetail: { opacity: 0.7, marginTop: SPACING.xs, marginBottom: SPACING.md, textAlign: 'center' },
  helplineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 4,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  helplineNumber: { minWidth: 58, paddingVertical: 5, borderRadius: 8, alignItems: 'center' },
  helplineNumberText: { fontWeight: '800', fontSize: 13 },
  helplineText: { flex: 1, gap: 1 },
  helplineLabel: { fontWeight: '700' },
  cancel: { marginTop: SPACING.md },
});
