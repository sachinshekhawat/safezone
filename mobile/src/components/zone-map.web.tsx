import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import MaterialIcon from '@expo/vector-icons/MaterialCommunityIcons';
import type { City, ZoneWithRisk } from '@safezone/shared';
import { SPACING } from '../theme';

/**
 * Web stand-in for the native zone map.
 *
 * `react-native-maps` wraps MapKit and the Google Maps SDK and has no web
 * implementation — importing it in a browser bundle throws. Metro resolves this
 * `.web.tsx` file ahead of `zone-map.tsx` when the platform is web, which keeps
 * `npm run web` working without scattering `Platform.OS` checks through the
 * screen. The web client at ../../frontend already has a Leaflet heat map, so
 * this points there rather than reimplementing it.
 */
export default function ZoneMap(_props: { city: City | null; zones: ZoneWithRisk[] }) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.surfaceVariant }]}>
      <MaterialIcon name="map-outline" size={40} color={theme.colors.onSurfaceVariant} />
      <Text variant="titleMedium" style={styles.title}>
        Map is available on iOS and Android
      </Text>
      <Text variant="bodySmall" style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
        The map uses native Apple and Google Maps views, which do not run in a
        browser. Switch to the List view here, or open the web dashboard for the
        interactive heat map.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  title: { fontWeight: '700', textAlign: 'center' },
  body: { textAlign: 'center', maxWidth: 320, lineHeight: 18 },
});
