import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Banner,
  Button,
  Card,
  SegmentedButtons,
  Text,
  useTheme,
} from 'react-native-paper';
import MaterialIcon from '@expo/vector-icons/MaterialCommunityIcons';

/**
 * Icon names from @safezone/shared are plain strings — the shared package is
 * consumed by the web client too and must not depend on a native icon set. Narrow
 * them here rather than weakening the icon prop's type everywhere.
 */
type MaterialIconName = React.ComponentProps<typeof MaterialIcon>['name'];
import {
  RISK_DISCLAIMER,
  TIME_BANDS,
  TIME_MODEL_DISCLAIMER,
  bandForDate,
  riskColor,
  riskLabel,
  riskLevelFromScore,
  timeAdjustedRisk,
  timeBandDef,
  type RiskLevel,
  type TimeBand,
  type ZoneWithRisk,
} from '@safezone/shared';
import CitySwitcher from '../../src/components/city-switcher';
import ZoneMap, { type MapZone } from '../../src/components/zone-map';
import useLocationStore from '../../src/store/location-store';
import { SPACING } from '../../src/theme';

/**
 * Bands offered in the filter, in clock order.
 *
 * All six, not a curated four. An earlier version listed only morning, evening,
 * night and late_night, which meant that between 4–6am and 12–4pm the band the
 * app had actually selected had no chip at all — nothing looked selected and the
 * numbers on screen appeared to come from nowhere.
 */
const FILTER_BANDS: TimeBand[] = [
  'dawn',
  'morning',
  'afternoon',
  'evening',
  'night',
  'late_night',
];

/**
 * The band it is right now, kept current.
 *
 * Recomputed when the app returns to the foreground and once a minute while it
 * is open, because a phone left on a table through 7:59pm would otherwise still
 * be showing evening figures well into the night.
 */
function useCurrentBand(): TimeBand {
  const [now, setNow] = useState<TimeBand>(() => bandForDate());

  useEffect(() => {
    const tick = () => setNow(bandForDate());

    const timer = setInterval(tick, 60_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  return now;
}

function baseLevel(zone: ZoneWithRisk): RiskLevel | 'unscored' {
  return (zone.risk_level as RiskLevel) ?? riskLevelFromScore(zone.risk_score);
}

/**
 * One zone, as a horizontal risk meter.
 *
 * A bare number plus a progress bar made every row look alike while scrolling.
 * This puts the score inside a coloured leading block, so the band is readable
 * from the colour, the number and its position on the scale — three redundant
 * cues rather than one. The scale strip underneath marks where this zone sits
 * across 0-100, which a per-row progress bar could not convey.
 */
function ZoneRow({
  zone,
  band,
  onPress,
}: {
  zone: MapZone;
  band: TimeBand;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = riskColor(zone.shownLevel);
  const score = zone.shownScore;
  const pct = score != null ? Math.min(100, Math.max(0, score)) : 0;

  return (
    <Card mode="elevated" style={styles.row} onPress={onPress}>
      <View style={styles.rowInner}>
        {/* Leading score block — the band colour and the number in one object. */}
        <View style={[styles.scoreBlock, { backgroundColor: color }]}>
          <Text style={styles.scoreBlockValue}>{score != null ? Math.round(score) : '–'}</Text>
          <Text style={styles.scoreBlockUnit}>/100</Text>
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTitleLine}>
            <Text variant="titleSmall" style={styles.rowName} numberOfLines={1}>
              {zone.name}
            </Text>
            {zone.delta > 0 && (
              <View style={[styles.deltaTag, { backgroundColor: theme.colors.errorContainer }]}>
                <MaterialIcon name="arrow-up-thin" size={12} color={theme.colors.onErrorContainer} />
                <Text style={[styles.deltaTagText, { color: theme.colors.onErrorContainer }]}>
                  {zone.delta}
                </Text>
              </View>
            )}
          </View>

          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
            {riskLabel(zone.shownLevel)} · {zone.zone_type}
            {zone.pin_code ? ` · ${zone.pin_code}` : ''}
          </Text>

          {/* Position on the 0-100 scale. The marker shows where this zone sits;
              the faded segment behind it shows the distance it moved for the
              selected hour, so the adjustment is legible rather than implied. */}
          <View style={[styles.scale, { backgroundColor: theme.colors.surfaceVariant }]}>
            {zone.delta > 0 && zone.risk_score != null && (
              <View
                style={[
                  styles.scaleShift,
                  {
                    left: `${Math.min(100, zone.risk_score)}%`,
                    width: `${Math.min(100 - zone.risk_score, zone.delta)}%`,
                    backgroundColor: color,
                  },
                ]}
              />
            )}
            <View style={[styles.scaleFill, { width: `${pct}%`, backgroundColor: color }]} />
            <View style={[styles.scaleMarker, { left: `${pct}%`, borderColor: color }]} />
          </View>
        </View>
      </View>
    </Card>
  );
}

/** Expanded detail for the tapped row — the factors behind the adjustment. */
function ZoneDetail({ zone, band }: { zone: MapZone; band: TimeBand }) {
  const theme = useTheme();
  const adjusted = timeAdjustedRisk(
    {
      riskScore: zone.risk_score,
      infrastructureScore: zone.infrastructure_score,
      zoneType: zone.zone_type,
    },
    band,
  );

  return (
    <View style={[styles.detailPanel, { backgroundColor: theme.colors.surfaceVariant }]}>
      {zone.risk_score != null && zone.delta > 0 ? (
        <>
          <Text variant="bodySmall" style={styles.detailLead}>
            All hours {zone.risk_score}/100 → {adjusted.adjustedScore}/100 at{' '}
            {timeBandDef(band).label.toLowerCase()}
          </Text>
          {adjusted.factors.map((f) => (
            <View key={f.type} style={styles.detailFactor}>
              <Text style={[styles.detailFactorPoints, { color: theme.colors.primary }]}>
                +{f.points}
              </Text>
              <View style={styles.detailFactorText}>
                <Text variant="bodySmall" style={styles.detailFactorLabel}>
                  {f.label}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {f.detail}
                </Text>
              </View>
            </View>
          ))}
          <Text variant="bodySmall" style={styles.detailCaveat}>
            {TIME_MODEL_DISCLAIMER}
          </Text>
        </>
      ) : (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {zone.risk_score == null
            ? 'This zone has not been scored yet.'
            : `No time-of-day change at ${timeBandDef(band).label.toLowerCase()}.`}
        </Text>
      )}
    </View>
  );
}

export default function ZonesScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [view, setView] = useState<'map' | 'list'>('map');

  const nowBand = useCurrentBand();
  // Null means "follow the clock". Set only when the user picks a band, so the
  // default view is always the current hour but an explicit choice is never
  // yanked away underneath them a minute later.
  const [pickedBand, setPickedBand] = useState<TimeBand | null>(null);
  const band = pickedBand ?? nowBand;

  const [activeBand, setActiveBand] = useState<RiskLevel | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const timeScrollRef = useRef<ScrollView>(null);

  const {
    selectedCity,
    zones,
    zonesLoading,
    permission,
    detecting,
    error,
    autoDetected,
    requestPermissionAndDetect,
    loadZones,
  } = useLocationStore();

  // Apply the time model once, here, so the map and the list can never show
  // different numbers for the same zone and hour.
  const adjusted = useMemo<MapZone[]>(
    () =>
      zones.map((z) => {
        const a = timeAdjustedRisk(
          {
            riskScore: z.risk_score,
            infrastructureScore: z.infrastructure_score,
            zoneType: z.zone_type,
          },
          band,
        );
        return {
          ...z,
          shownScore: a.adjustedScore,
          shownLevel: a.adjustedScore == null ? baseLevel(z) : a.level,
          delta: a.delta,
        };
      }),
    [zones, band],
  );

  const listed = useMemo(() => {
    const filtered = activeBand
      ? adjusted.filter((z) => z.shownLevel === activeBand)
      : adjusted;
    return [...filtered].sort((a, b) => (b.shownScore ?? -1) - (a.shownScore ?? -1));
  }, [adjusted, activeBand]);

  const raisedCount = useMemo(() => adjusted.filter((z) => z.delta > 0).length, [adjusted]);

  const askForLocation = permission === 'undetermined' || permission === 'disabled';
  const bandDef = timeBandDef(band);

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top, backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.topBar, { borderBottomColor: theme.colors.outlineVariant }]}>
        <View style={styles.brand}>
          <MaterialIcon name="shield-check" size={24} color={theme.colors.primary} />
          <Text variant="titleMedium" style={styles.brandText}>
            SafeZone
          </Text>
        </View>
        <CitySwitcher />
      </View>

      {askForLocation && (
        <Banner
          visible
          icon={({ size }) => (
            <MaterialIcon name="crosshairs-gps" size={size} color={theme.colors.primary} />
          )}
          actions={[
            {
              label: detecting ? 'Detecting…' : 'Allow location',
              onPress: requestPermissionAndDetect,
              disabled: detecting,
            },
          ]}
        >
          Allow location so SafeZone can show risk data for the area you are
          actually in. Your coordinates are used to pick a city and are not stored.
        </Banner>
      )}

      {error && (
        <Banner
          visible
          icon={({ size }) => (
            <MaterialIcon name="alert-circle-outline" size={size} color={theme.colors.error} />
          )}
        >
          {error}
        </Banner>
      )}

      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.cityName}>
          {selectedCity?.name ?? 'Loading…'}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {selectedCity?.state}
          {zones.length > 0 ? ` · ${zones.length} zones` : ''}
          {autoDetected ? ' · near you' : ''}
        </Text>
      </View>

      {/* Time filter.
          `flexGrow: 0` on the ScrollView and `alignItems: 'center'` on its
          content container are both load-bearing: inside a flex column a
          horizontal ScrollView otherwise expands to fill the remaining height
          and stretches every chip into a full-height pill. */}
      <ScrollView
        ref={timeScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.timeScroll}
        contentContainerStyle={styles.timeRow}
      >
        {FILTER_BANDS.map((b, i) => {
          const def = timeBandDef(b);
          const active = band === b;
          const isNow = nowBand === b;
          return (
            <Pressable
              key={b}
              onPress={() => setPickedBand(b)}
              onLayout={(e) => {
                // Scroll the current hour into view on first paint, so the
                // selected chip is never off-screen to the right.
                if (isNow && pickedBand === null && i > 2) {
                  const x = e.nativeEvent.layout.x;
                  timeScrollRef.current?.scrollTo({ x: Math.max(0, x - 80), animated: false });
                }
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Show risk for ${def.label}, ${def.range}${isNow ? ', current time' : ''}`}
              style={[
                styles.timeChip,
                {
                  backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                  borderColor: active ? theme.colors.primary : theme.colors.outlineVariant,
                },
              ]}
            >
              <MaterialIcon
                name={def.icon as MaterialIconName}
                size={15}
                color={active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant}
              />
              <Text
                variant="labelMedium"
                style={{
                  color: active ? theme.colors.onPrimary : theme.colors.onSurface,
                  fontWeight: '700',
                }}
              >
                {def.label}
              </Text>
              {/* Marks which chip is the live clock, so a manual pick is
                  distinguishable from "now" at a glance. */}
              {isNow && (
                <View
                  style={[
                    styles.nowDot,
                    {
                      backgroundColor: active ? theme.colors.onPrimary : theme.colors.primary,
                    },
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Which hour is on screen, and a way back to the live one. Without this,
          a user who tapped "Late night" earlier has no cue that the figures are
          no longer about right now. */}
      {pickedBand && pickedBand !== nowBand ? (
        <Pressable
          onPress={() => setPickedBand(null)}
          accessibilityRole="button"
          accessibilityLabel={`Showing ${bandDef.label}. Tap to go back to the current time.`}
          style={[styles.nowPill, { backgroundColor: theme.colors.primaryContainer }]}
        >
          <MaterialIcon name="clock-outline" size={13} color={theme.colors.onPrimaryContainer} />
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onPrimaryContainer, fontWeight: '700' }}
          >
            {bandDef.label} · back to now
          </Text>
        </Pressable>
      ) : (
        <View style={[styles.nowPill, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={[styles.liveDot, { backgroundColor: theme.colors.primary }]} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>
            Now · {bandDef.label} · {bandDef.range}
          </Text>
        </View>
      )}

      {/* What the selected hour changed, stated once rather than per row. */}
      {bandDef.exposure > 0 && raisedCount > 0 && (
        <View style={styles.hourNote}>
          <MaterialIcon name="information-outline" size={13} color={theme.colors.primary} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
            {raisedCount} of {adjusted.length} zones score higher at{' '}
            {bandDef.label.toLowerCase()}.
          </Text>
        </View>
      )}

      <View style={styles.switchWrap}>
        <SegmentedButtons
          value={view}
          onValueChange={(v) => setView(v as 'map' | 'list')}
          density="small"
          buttons={[
            { value: 'map', label: 'Map', icon: 'map-marker-radius' },
            { value: 'list', label: 'List', icon: 'format-list-bulleted' },
          ]}
        />
      </View>

      {zonesLoading && zones.length === 0 ? (
        <ActivityIndicator style={styles.loading} />
      ) : view === 'map' ? (
        <View style={styles.mapWrap}>
          <ZoneMap
            city={selectedCity}
            zones={adjusted}
            band={band}
            activeBand={activeBand}
            onToggleBand={setActiveBand}
          />
        </View>
      ) : (
        <FlatList
          data={listed}
          keyExtractor={(z) => z.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View>
              <ZoneRow
                zone={item}
                band={band}
                onPress={() => setExpanded(expanded === item.id ? null : item.id)}
              />
              {expanded === item.id && <ZoneDetail zone={item} band={band} />}
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={zonesLoading}
              onRefresh={() => selectedCity && loadZones(selectedCity.id)}
            />
          }
          ListHeaderComponent={
            activeBand ? (
              <Pressable onPress={() => setActiveBand(null)} style={styles.filterPill}>
                <View style={[styles.filterDot, { backgroundColor: riskColor(activeBand) }]} />
                <Text variant="bodySmall" style={{ flex: 1, fontWeight: '700' }}>
                  Showing {riskLabel(activeBand)} only
                </Text>
                <MaterialIcon name="close-circle" size={16} color={theme.colors.primary} />
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="bodyMedium">
                {activeBand
                  ? `No ${riskLabel(activeBand).toLowerCase()} zones at this hour.`
                  : 'No zone data for this city yet.'}
              </Text>
              <Button
                mode="text"
                onPress={() =>
                  activeBand ? setActiveBand(null) : selectedCity && loadZones(selectedCity.id)
                }
              >
                {activeBand ? 'Show all zones' : 'Retry'}
              </Button>
            </View>
          }
          ListFooterComponent={
            listed.length > 0 ? (
              <Text variant="bodySmall" style={styles.disclaimer}>
                {RISK_DISCLAIMER}
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontWeight: '800' },

  header: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm + 2, paddingBottom: SPACING.sm },
  cityName: { fontWeight: '800' },

  // flexGrow 0 stops the horizontal scroller from claiming leftover column
  // height, which is what stretched the chips into full-height pills.
  timeScroll: { flexGrow: 0, flexShrink: 0 },
  timeRow: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
    alignItems: 'center',
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    // Fixed height rather than vertical padding, so every chip is identical
    // regardless of icon metrics, and the row cannot grow.
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
  },
  nowDot: { width: 6, height: 6, borderRadius: 3, marginLeft: 1 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },

  hourNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  nowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  switchWrap: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },

  mapWrap: {
    flex: 1,
    marginHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
    borderRadius: 16,
    overflow: 'hidden',
  },

  loading: { marginTop: SPACING.xl },
  list: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },

  row: { marginBottom: SPACING.sm, overflow: 'hidden' },
  rowInner: { flexDirection: 'row', alignItems: 'stretch' },
  scoreBlock: {
    width: 62,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm + 2,
  },
  scoreBlockValue: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', lineHeight: 24 },
  scoreBlockUnit: { color: '#FFFFFF', fontSize: 9, fontWeight: '700', opacity: 0.85 },
  rowBody: { flex: 1, paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.sm, gap: 3 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { flex: 1, fontWeight: '700' },
  deltaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  deltaTagText: { fontSize: 10, fontWeight: '800' },

  scale: { height: 6, borderRadius: 3, marginTop: 5, overflow: 'visible', position: 'relative' },
  scaleFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, opacity: 0.85 },
  scaleShift: { position: 'absolute', top: 0, bottom: 0, opacity: 0.3, borderRadius: 3 },
  scaleMarker: {
    position: 'absolute',
    top: -3,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    borderWidth: 3,
    backgroundColor: '#FFFFFF',
  },

  detailPanel: {
    marginTop: -SPACING.sm,
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.xs,
    padding: SPACING.sm + 2,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    gap: 6,
  },
  detailLead: { fontWeight: '700' },
  detailFactor: { flexDirection: 'row', gap: SPACING.sm },
  detailFactorPoints: { fontSize: 13, fontWeight: '800', minWidth: 26 },
  detailFactorText: { flex: 1 },
  detailFactorLabel: { fontWeight: '700' },
  detailCaveat: { opacity: 0.6, lineHeight: 15, marginTop: 2 },

  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  filterDot: { width: 10, height: 10, borderRadius: 5 },

  empty: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  disclaimer: { opacity: 0.6, marginTop: SPACING.sm, lineHeight: 16 },
});
