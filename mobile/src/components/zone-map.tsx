import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { Card, IconButton, Text, useTheme } from 'react-native-paper';
import MaterialIcon from '@expo/vector-icons/MaterialCommunityIcons';

/**
 * Icon names from @safezone/shared are plain strings — the shared package is
 * consumed by the web client too and must not depend on a native icon set. Narrow
 * them here rather than weakening the icon prop's type everywhere.
 */
type MaterialIconName = React.ComponentProps<typeof MaterialIcon>['name'];
import {
  RISK_BANDS,
  RISK_DISCLAIMER,
  TIME_MODEL_DISCLAIMER,
  riskColor,
  riskLabel,
  timeAdjustedRisk,
  timeBandDef,
  type City,
  type RiskLevel,
  type TimeBand,
  type ZoneWithRisk,
} from '@safezone/shared';
import { SPACING } from '../theme';

/**
 * Minimum bubble radius in metres.
 *
 * Several seeded zones carry a radius under 1 km, which at city zoom renders as
 * a dot too small to read or tap. Flooring the drawn radius keeps every zone
 * legible; the real extent is still shown in the detail card so the floor never
 * misleads about how large an area actually is.
 */
const MIN_BUBBLE_M = 900;
const DEFAULT_BUBBLE_KM = 1.5;

/** Padding applied when fitting the camera to a city's zones. */
const FIT_PADDING = 1.45;
const MIN_DELTA = 0.045;

/**
 * Convert a hex colour and alpha into rgba().
 *
 * react-native-maps needs a concrete colour string for fills; it will not apply
 * a separate opacity prop to Circle on both platforms.
 */
function rgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Fill opacity from the risk score — this is the "density" channel.
 *
 * Risk is deliberately encoded as colour intensity rather than bubble size.
 * Scaling radius by score would imply the *area* is larger, which is a claim
 * about geography the data does not make; a denser fill says "more risk here"
 * without distorting the map.
 */
function fillAlpha(score?: number | null): number {
  if (score == null) return 0.1;
  return 0.16 + Math.min(1, Math.max(0, score / 100)) * 0.42;
}

/** Badge diameter grows with score so high-risk zones catch the eye first. */
function badgeSize(score?: number | null): number {
  if (score == null) return 30;
  return 30 + Math.round(Math.min(1, score / 100) * 14);
}

export interface MapZone extends ZoneWithRisk {
  /** Score after the time-of-day adjustment, computed by the parent screen. */
  shownScore: number | null;
  shownLevel: RiskLevel | 'unscored';
  delta: number;
}

interface ZoneMapProps {
  city: City | null;
  zones: MapZone[];
  band: TimeBand;
  /**
   * When set, only zones in this band are drawn. Controlled by the parent so the
   * list view can share the same filter.
   */
  activeBand: RiskLevel | null;
  onToggleBand: (level: RiskLevel | null) => void;
}

export default function ZoneMap({
  city,
  zones,
  band,
  activeBand,
  onToggleBand,
}: ZoneMapProps) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);
  const [selected, setSelected] = useState<MapZone | null>(null);
  // Expanded by default now that it doubles as the filter control — collapsed, a
  // user would have no way to discover that bands are tappable.
  const [legendOpen, setLegendOpen] = useState(true);

  const bandDef = timeBandDef(band);

  // How many zones sit in each band, so the legend can show counts and grey out
  // bands that would filter down to nothing.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const z of zones) c[z.shownLevel] = (c[z.shownLevel] ?? 0) + 1;
    return c;
  }, [zones]);

  const visible = useMemo(
    () => (activeBand ? zones.filter((z) => z.shownLevel === activeBand) : zones),
    [zones, activeBand],
  );

  // Frame every zone in the city rather than guessing a zoom level. A fixed
  // delta looks right for Delhi and wrong for everywhere else.
  const region = useMemo<Region | undefined>(() => {
    const points = zones.filter((z) => z.latitude != null && z.longitude != null);

    if (points.length === 0) {
      if (!city) return undefined;
      return {
        latitude: city.latitude,
        longitude: city.longitude,
        latitudeDelta: 0.18,
        longitudeDelta: 0.18,
      };
    }

    const lats = points.map((z) => z.latitude);
    const lngs = points.map((z) => z.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * FIT_PADDING, MIN_DELTA),
      longitudeDelta: Math.max((maxLng - minLng) * FIT_PADDING, MIN_DELTA),
    };
  }, [city, zones]);

  const recenter = useCallback(() => {
    if (region) mapRef.current?.animateToRegion(region, 450);
  }, [region]);

  // Highest risk last so its bubble and badge sit on top of calmer neighbours
  // where zones overlap.
  const ordered = useMemo(
    () => [...visible].sort((a, b) => (a.shownScore ?? 0) - (b.shownScore ?? 0)),
    [visible],
  );

  if (!region) {
    return (
      <View style={[styles.placeholder, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Text variant="bodyMedium">Pick a city to see its map.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        // Apple Maps on iOS, Google Maps on Android. Neither needs an API key
        // to run in Expo Go.
        showsUserLocation
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        onPress={() => setSelected(null)}
      >
        {ordered.map((zone) => {
          const color = riskColor(zone.shownLevel);
          const radiusM = Math.max(
            (zone.radius_km ?? DEFAULT_BUBBLE_KM) * 1000,
            MIN_BUBBLE_M,
          );

          return (
            <Circle
              key={`c-${zone.id}`}
              center={{ latitude: zone.latitude, longitude: zone.longitude }}
              radius={radiusM}
              fillColor={rgba(color, fillAlpha(zone.shownScore))}
              strokeColor={color}
              strokeWidth={2}
              zIndex={Math.round(zone.shownScore ?? 0)}
            />
          );
        })}

        {ordered.map((zone) => {
          const color = riskColor(zone.shownLevel);
          const size = badgeSize(zone.shownScore);

          return (
            <Marker
              key={`m-${zone.id}`}
              coordinate={{ latitude: zone.latitude, longitude: zone.longitude }}
              onPress={() => setSelected(zone)}
              // Keep the marker centred on the coordinate instead of hanging
              // its pin tip there, so the badge sits inside its own bubble.
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.badge,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: color,
                  },
                ]}
              >
                <Text style={styles.badgeText}>
                  {zone.shownScore != null ? Math.round(zone.shownScore) : '–'}
                </Text>
              </View>
              {/* An up-arrow marks a zone the time model pushed higher, so the
                  change is visible on the map and not only in the list. */}
              {zone.delta > 0 && (
                <View style={[styles.deltaPip, { borderColor: color }]}>
                  <MaterialIcon name="arrow-up-thin" size={11} color={color} />
                </View>
              )}
            </Marker>
          );
        })}
      </MapView>

      {/* Legend doubles as the band filter. */}
      <View style={styles.legendWrap} pointerEvents="box-none">
        <View style={[styles.legend, { backgroundColor: theme.colors.surface }]}>
          <Pressable
            onPress={() => setLegendOpen((v) => !v)}
            style={styles.legendHeader}
            accessibilityRole="button"
            accessibilityLabel={legendOpen ? 'Hide risk filter' : 'Show risk filter'}
          >
            <Text variant="labelLarge" style={styles.legendTitle}>
              {activeBand ? riskLabel(activeBand) : 'All zones'}
            </Text>
            <MaterialIcon
              name={legendOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.colors.onSurfaceVariant}
            />
          </Pressable>

          {legendOpen && (
            <>
              {RISK_BANDS.map((b) => {
                const n = counts[b.level] ?? 0;
                const active = activeBand === b.level;
                const empty = n === 0;
                return (
                  <Pressable
                    key={b.level}
                    disabled={empty}
                    onPress={() => onToggleBand(active ? null : b.level)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: empty }}
                    accessibilityLabel={`${b.label}, ${n} zones${active ? ', showing only these' : ''}`}
                    style={[
                      styles.legendRow,
                      active && { backgroundColor: theme.colors.primaryContainer },
                      empty && styles.legendRowEmpty,
                    ]}
                  >
                    <View style={[styles.legendSwatch, { backgroundColor: b.color }]} />
                    <Text variant="bodySmall" style={styles.legendLabel}>
                      {b.label}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant, fontVariant: ['tabular-nums'] }}
                    >
                      {n}
                    </Text>
                  </Pressable>
                );
              })}

              {activeBand && (
                <Pressable
                  onPress={() => onToggleBand(null)}
                  accessibilityRole="button"
                  style={styles.clearRow}
                >
                  <MaterialIcon name="close-circle-outline" size={14} color={theme.colors.primary} />
                  <Text variant="bodySmall" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                    Show all
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </View>

      <IconButton
        icon="crosshairs-gps"
        mode="contained"
        containerColor={theme.colors.surface}
        iconColor={theme.colors.primary}
        size={22}
        onPress={recenter}
        style={styles.recenter}
        accessibilityLabel="Recentre the map on this city"
      />

      {/* Which hour the map is showing. Without this the numbers look wrong to
          anyone who does not remember which filter they left selected. */}
      <View style={[styles.hourPill, { backgroundColor: theme.colors.surface }]}>
        <MaterialIcon name={bandDef.icon as MaterialIconName} size={14} color={theme.colors.primary} />
        <Text variant="bodySmall" style={styles.hourPillText}>
          {bandDef.label} · {bandDef.range}
        </Text>
      </View>

      {/* Detail card for the tapped zone. */}
      {selected && (
        <Card mode="elevated" style={styles.detail}>
          <Card.Content>
            <View style={styles.detailHeader}>
              <View style={styles.detailTitle}>
                <Text variant="titleMedium">{selected.name}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {selected.zone_type}
                  {selected.pin_code ? ` · ${selected.pin_code}` : ''}
                  {selected.radius_km ? ` · ${selected.radius_km} km across` : ''}
                </Text>
              </View>
              <IconButton
                icon="close"
                size={18}
                onPress={() => setSelected(null)}
                accessibilityLabel="Close zone details"
              />
            </View>

            <View style={styles.detailScoreRow}>
              <View
                style={[styles.detailChip, { backgroundColor: riskColor(selected.shownLevel) }]}
              >
                <Text style={styles.detailChipText}>{riskLabel(selected.shownLevel)}</Text>
              </View>
              <Text variant="headlineSmall" style={styles.detailScore}>
                {selected.shownScore != null ? selected.shownScore : '—'}
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  /100
                </Text>
              </Text>
              {selected.delta > 0 && (
                <Text variant="bodySmall" style={{ color: theme.colors.error, fontWeight: '700' }}>
                  +{selected.delta} at this hour
                </Text>
              )}
            </View>

            {selected.delta > 0 && <ZoneFactors zone={selected} band={band} />}

            <Text variant="bodySmall" style={styles.detailDisclaimer}>
              {selected.delta > 0 ? TIME_MODEL_DISCLAIMER : RISK_DISCLAIMER}
            </Text>
          </Card.Content>
        </Card>
      )}
    </View>
  );
}

/** The named reasons the score moved, so a changed number is never unexplained. */
function ZoneFactors({ zone, band }: { zone: MapZone; band: TimeBand }) {
  const theme = useTheme();
  const adjusted = timeAdjustedRisk(
    {
      riskScore: zone.risk_score,
      infrastructureScore: zone.infrastructure_score,
      zoneType: zone.zone_type,
    },
    band,
  );

  if (adjusted.factors.length === 0) return null;

  return (
    <View style={styles.factors}>
      {adjusted.factors.map((f) => (
        <View key={f.type} style={styles.factorRow}>
          <View style={[styles.factorPoints, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={[styles.factorPointsText, { color: theme.colors.onPrimaryContainer }]}>
              +{f.points}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.factorLabel}>
            {f.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    // A shadow is what separates the badge from a same-coloured bubble beneath it.
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  deltaPip: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  legendWrap: { position: 'absolute', top: SPACING.sm, left: SPACING.sm },
  legend: {
    borderRadius: 12,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: SPACING.xs + 2,
    minWidth: 158,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  legendTitle: { fontWeight: '800' },
  legendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // 32pt rows: tappable without making the legend dominate the map.
    minHeight: 32,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  legendRowEmpty: { opacity: 0.35 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendLabel: { flex: 1, fontWeight: '600' },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 2,
  },

  recenter: { position: 'absolute', right: SPACING.sm, top: SPACING.sm, elevation: 3 },

  hourPill: {
    position: 'absolute',
    right: SPACING.sm,
    top: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  hourPillText: { fontWeight: '700', fontSize: 11 },

  detail: { position: 'absolute', left: SPACING.sm, right: SPACING.sm, bottom: SPACING.sm },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  detailTitle: { flex: 1 },
  detailScoreRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 2 },
  detailChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  detailChipText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  detailScore: { fontWeight: '700' },
  detailDisclaimer: { opacity: 0.65, marginTop: SPACING.sm, lineHeight: 15 },

  factors: { marginTop: SPACING.sm, gap: 5 },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  factorPoints: { minWidth: 32, paddingVertical: 2, borderRadius: 6, alignItems: 'center' },
  factorPointsText: { fontSize: 11, fontWeight: '800' },
  factorLabel: { flex: 1 },
});
