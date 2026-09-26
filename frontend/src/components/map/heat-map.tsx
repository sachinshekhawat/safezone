'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import api from '@/lib/api';
import useLocationStore from '@/store/location-store';
import { formatDistance, riskColor, riskLabel, riskLevelFromScore } from '@/lib/utils';
import type { City, ZoneWithRisk } from '@/types';
import RiskLegend from './risk-legend';
import 'leaflet/dist/leaflet.css';

// Fallback data shown when the API is unreachable (e.g. backend not running).
const SAMPLE_ZONES: ZoneWithRisk[] = [
  { id: '1', city_id: '1', name: 'Connaught Place', zone_type: 'commercial', latitude: 28.6315, longitude: 77.2167, radius_km: 1.5, city_name: 'Delhi', risk_score: 45, risk_level: 'moderate', created_at: '', updated_at: '' },
  { id: '2', city_id: '1', name: 'Paharganj', zone_type: 'commercial', latitude: 28.6436, longitude: 77.2137, radius_km: 1.0, city_name: 'Delhi', risk_score: 62, risk_level: 'high', created_at: '', updated_at: '' },
  { id: '3', city_id: '1', name: 'Chandni Chowk', zone_type: 'commercial', latitude: 28.6506, longitude: 77.2334, radius_km: 1.2, city_name: 'Delhi', risk_score: 55, risk_level: 'moderate', created_at: '', updated_at: '' },
  { id: '4', city_id: '1', name: 'Saket', zone_type: 'residential', latitude: 28.5244, longitude: 77.2066, radius_km: 2.5, city_name: 'Delhi', risk_score: 25, risk_level: 'low', created_at: '', updated_at: '' },
  { id: '5', city_id: '1', name: 'Dwarka', zone_type: 'residential', latitude: 28.5921, longitude: 77.0460, radius_km: 5.0, city_name: 'Delhi', risk_score: 18, risk_level: 'very_low', created_at: '', updated_at: '' },
  { id: '6', city_id: '1', name: 'Rohini', zone_type: 'residential', latitude: 28.7495, longitude: 77.0565, radius_km: 4.0, city_name: 'Delhi', risk_score: 35, risk_level: 'low', created_at: '', updated_at: '' },
  { id: '7', city_id: '1', name: 'Shahdara', zone_type: 'mixed', latitude: 28.6719, longitude: 77.2914, radius_km: 3.0, city_name: 'Delhi', risk_score: 72, risk_level: 'high', created_at: '', updated_at: '' },
  { id: '8', city_id: '1', name: 'Najafgarh', zone_type: 'rural', latitude: 28.6093, longitude: 76.9799, radius_km: 4.0, city_name: 'Delhi', risk_score: 58, risk_level: 'moderate', created_at: '', updated_at: '' },
];

const DELHI_CENTER: [number, number] = [28.6139, 77.2090];
// Which city to show when no cityId prop is supplied; kept in sync with DELHI_CENTER.
const DEFAULT_CITY_NAME = 'delhi';

/**
 * Smallest circle radius in metres.
 *
 * Zone radius_km in the database ranges from 1.0 to 5.0 km. A 1 km circle is
 * only ~15 px across at zoom 11, which is hard to see and harder to tap, so we
 * floor it. Because these are metre radii (Leaflet `Circle`, not the pixel-based
 * `CircleMarker`), they scale correctly as you zoom.
 */
const MIN_RADIUS_M = 1400;
const DEFAULT_RADIUS_KM = 2;

/** Higher risk gets a more opaque, more heavily stroked circle. */
function riskStyle(level: string) {
  const color = riskColor(level);
  const weights: Record<string, { fillOpacity: number; weight: number }> = {
    critical: { fillOpacity: 0.5, weight: 3 },
    high: { fillOpacity: 0.42, weight: 2.5 },
    moderate: { fillOpacity: 0.34, weight: 2 },
    low: { fillOpacity: 0.26, weight: 1.75 },
    very_low: { fillOpacity: 0.2, weight: 1.5 },
  };
  const { fillOpacity, weight } = weights[level] ?? { fillOpacity: 0.25, weight: 1.5 };
  return { color, fillColor: color, fillOpacity, weight };
}

function zoneRadiusMetres(zone: ZoneWithRisk): number {
  const km = zone.radius_km && zone.radius_km > 0 ? zone.radius_km : DEFAULT_RADIUS_KM;
  return Math.max(MIN_RADIUS_M, km * 1000);
}

function levelOf(zone: ZoneWithRisk): string {
  return zone.risk_level || riskLevelFromScore(zone.risk_score);
}

/** Refits the viewport whenever the rendered zone set changes. */
function FitToZones({ zones }: { zones: ZoneWithRisk[] }) {
  const map = useMap();

  useEffect(() => {
    if (zones.length === 0) return;
    const bounds = zones.map((z) => [z.latitude, z.longitude] as [number, number]);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
  }, [zones, map]);

  return null;
}

/** Tracks zoom so we can show centre dots only when circles are large enough. */
function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();

  useEffect(() => {
    const handler = () => onZoom(map.getZoom());
    handler();
    map.on('zoomend', handler);
    return () => {
      map.off('zoomend', handler);
    };
  }, [map, onZoom]);

  return null;
}

export interface HeatMapProps {
  /**
   * Render zones for a specific city. When omitted the map follows the city
   * chosen in the location store (GPS-detected or manually picked).
   */
  cityId?: string;
  /** Show the interactive legend. */
  showLegend?: boolean;
}

export default function HeatMap({ cityId, showLegend = true }: HeatMapProps) {
  const [zones, setZones] = useState<ZoneWithRisk[]>(SAMPLE_ZONES);
  const [isLive, setIsLive] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(11);

  const storeCity = useLocationStore((s) => s.selectedCity);
  // An explicit prop wins, so the dashboard can pin a map to one city.
  const targetCityId = cityId ?? storeCity?.id;

  useEffect(() => {
    let cancelled = false;

    async function loadZones() {
      try {
        let resolved = targetCityId;

        if (!resolved) {
          // Nothing selected yet: fall back to the city the map is centred on.
          const cityRes = await api.getCities(1, 100);
          const cities: City[] = cityRes?.cities ?? [];
          if (cities.length === 0) return;
          const preferred =
            cities.find((c) => c.name.toLowerCase() === DEFAULT_CITY_NAME) ?? cities[0];
          resolved = preferred.id;
        }

        const zoneRes = await api.getZonesByCity(resolved);
        const loaded: ZoneWithRisk[] = zoneRes?.zones ?? [];
        if (cancelled || loaded.length === 0) return;

        setZones(loaded);
        setIsLive(true);
      } catch {
        // Keep the sample data — the map stays useful when the backend is down.
      }
    }

    loadZones();
    return () => {
      cancelled = true;
    };
  }, [targetCityId]);

  const counts = useMemo(() => {
    return zones.reduce<Record<string, number>>((acc, z) => {
      const level = levelOf(z);
      acc[level] = (acc[level] ?? 0) + 1;
      return acc;
    }, {});
  }, [zones]);

  const visibleZones = useMemo(
    () => zones.filter((z) => !hidden.has(levelOf(z))),
    [zones, hidden],
  );

  const toggleLevel = useCallback((level: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  // Larger circles swallow their own centre, so only mark centres once zoomed in.
  const showCentres = zoom >= 12;

  return (
    <div className="relative w-full h-full">
      {!isLive && (
        <div className="absolute top-3 right-3 z-[400] px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-medium text-amber-800 shadow-sm">
          Sample data — live API unavailable
        </div>
      )}

      <MapContainer
        center={DELHI_CENTER}
        zoom={11}
        className="w-full h-full"
        scrollWheelZoom={false}
        // Pinch-zoom and drag stay on for phones; scroll-wheel is off so the
        // page still scrolls when the map is under the finger/cursor.
        touchZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitToZones zones={visibleZones} />
        <ZoomWatcher onZoom={setZoom} />

        {visibleZones.map((zone) => {
          const level = levelOf(zone);
          const style = riskStyle(level);
          const radius = zoneRadiusMetres(zone);

          return (
            <Circle
              key={zone.id}
              center={[zone.latitude, zone.longitude]}
              radius={radius}
              pathOptions={style}
            >
              <Tooltip direction="top" opacity={1} sticky>
                <span className="font-semibold">{zone.name}</span>
                {zone.risk_score != null && (
                  <>
                    {' — '}
                    {zone.risk_score}/100 {riskLabel(level)}
                  </>
                )}
              </Tooltip>

              <Popup minWidth={220}>
                <div className="py-0.5">
                  <h3 className="font-bold text-sm text-gray-900">{zone.name}</h3>
                  <p className="text-xs text-gray-500 capitalize">
                    {zone.city_name ? `${zone.city_name} • ` : ''}
                    {zone.zone_type}
                    {zone.pin_code ? ` • ${zone.pin_code}` : ''}
                  </p>

                  {zone.risk_score != null ? (
                    <div className="mt-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-lg font-bold tabular-nums text-gray-900">
                          {zone.risk_score}
                          <span className="text-xs font-normal text-gray-400">/100</span>
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                          style={{ backgroundColor: style.color }}
                        >
                          {riskLabel(level)}
                        </span>
                      </div>
                      {/* Score bar */}
                      <div
                        className="mt-1.5 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden"
                        role="img"
                        aria-label={`Risk score ${zone.risk_score} out of 100`}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(0, zone.risk_score))}%`,
                            backgroundColor: style.color,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">Not yet scored</p>
                  )}

                  <dl className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-600 space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-400">Zone radius</dt>
                      <dd className="tabular-nums">
                        {formatDistance(zone.radius_km ?? DEFAULT_RADIUS_KM)}
                      </dd>
                    </div>
                    {zone.incident_count != null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-gray-400">Reported incidents</dt>
                        <dd className="tabular-nums">{zone.incident_count}</dd>
                      </div>
                    )}
                  </dl>

                  <p className="mt-2 text-[10px] leading-snug text-gray-400">
                    Statistical estimate from reported data. Under-reporting is
                    common — a low score is not a guarantee of safety.
                  </p>
                </div>
              </Popup>
            </Circle>
          );
        })}

        {/* Precise centre markers, only once circles are big enough to need them */}
        {showCentres &&
          visibleZones.map((zone) => (
            <CircleMarker
              key={`c-${zone.id}`}
              center={[zone.latitude, zone.longitude]}
              radius={3}
              pathOptions={{
                color: '#ffffff',
                fillColor: riskColor(levelOf(zone)),
                fillOpacity: 1,
                weight: 1.5,
              }}
              interactive={false}
            />
          ))}
      </MapContainer>

      {showLegend && (
        <RiskLegend counts={counts} hidden={hidden} onToggle={toggleLevel} />
      )}
    </div>
  );
}
