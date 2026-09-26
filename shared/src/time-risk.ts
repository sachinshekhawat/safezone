/**
 * Time-of-day risk adjustment — the single source of truth.
 *
 * ## What this is, and what it is not
 *
 * This is a **transparent, rule-based model**, not a learned one. That is a
 * deliberate choice forced by the data: the `incidents` table is empty, so there
 * is no observed hour-of-day distribution to fit against. Training a model on
 * nothing and presenting the output as "what the data shows" would manufacture
 * findings, which is exactly what this project avoids elsewhere (every seeded
 * score already carries a `synthetic_seed` provenance warning).
 *
 * So the adjustment is driven only by fields we genuinely hold:
 *
 * - `infrastructure_score` — the existing lighting / policing / CCTV composite.
 *   A poorly lit, poorly patrolled zone is disproportionately worse after dark;
 *   a well-lit one with a station nearby changes far less. This is the main lever.
 * - `zone_type` — a commercial district is busy at noon and deserted at midnight,
 *   so it swings hard. A residential colony keeps some footfall and swings less.
 *   Rural and industrial zones start isolated and stay isolated.
 *
 * Every number this produces is a **modelled estimate**, and callers must label
 * it as such. `ai-service/app/models/time_risk.py` mirrors this file, and
 * `shared/testdata/time-risk-vectors.json` is asserted by both test suites so the
 * two cannot drift apart silently.
 *
 * When real incidents with `time_of_day` arrive, `fit_from_incidents` in the
 * Python module derives the band weights from observation and these defaults are
 * replaced. The shape of the model does not change — only where the weights come
 * from.
 */

import type { RiskLevel, ZoneType } from './types';
import { riskLevelFromScore } from './risk';

/** Matches the `time_of_day` enum in backend/migrations/000003. */
export type TimeBand = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';

export interface TimeBandDef {
  band: TimeBand;
  label: string;
  /** Inclusive start hour, local time, 0-23. */
  startHour: number;
  /** Exclusive end hour. Bands wrap past midnight where endHour <= startHour. */
  endHour: number;
  /** Short range for display, e.g. "12am–4am". */
  range: string;
  /**
   * How strongly darkness and thin footfall amplify this zone's weaknesses,
   * 0 = daylight baseline, 1 = worst case.
   */
  exposure: number;
  icon: string;
}

/**
 * Ordered by clock, starting at dawn.
 *
 * Daylight bands sit at exposure 0 rather than a small positive number: the base
 * score already reflects all-hours reported incidents, so treating midday as an
 * uplift would double-count.
 */
export const TIME_BANDS: readonly TimeBandDef[] = [
  { band: 'dawn',       label: 'Early morning', startHour: 4,  endHour: 6,  range: '4am–6am',   exposure: 0.55, icon: 'weather-sunset-up' },
  { band: 'morning',    label: 'Morning',       startHour: 6,  endHour: 12, range: '6am–12pm',  exposure: 0.0,  icon: 'weather-sunny' },
  { band: 'afternoon',  label: 'Afternoon',     startHour: 12, endHour: 16, range: '12pm–4pm',  exposure: 0.0,  icon: 'white-balance-sunny' },
  { band: 'evening',    label: 'Evening',       startHour: 16, endHour: 20, range: '4pm–8pm',   exposure: 0.35, icon: 'weather-sunset-down' },
  { band: 'night',      label: 'Night',         startHour: 20, endHour: 0,  range: '8pm–12am',  exposure: 0.75, icon: 'weather-night' },
  { band: 'late_night', label: 'Late night',    startHour: 0,  endHour: 4,  range: '12am–4am',  exposure: 1.0,  icon: 'moon-waning-crescent' },
] as const;

/** Largest number of points the infrastructure deficit can add, at full exposure. */
const MAX_INFRA_UPLIFT = 18;

/**
 * Extra points contributed by how deserted a zone type becomes after dark.
 *
 * Commercial and institutional areas empty out completely; rural and industrial
 * ones are isolated at every hour, so their *additional* night penalty is lower
 * even though their base score already reflects that isolation.
 */
const ZONE_TYPE_UPLIFT: Record<ZoneType, number> = {
  commercial: 6,
  institutional: 6,
  industrial: 5,
  rural: 4,
  mixed: 3,
  residential: 2,
};

/** Assumed infrastructure when a zone has no score yet — mid-range, not zero. */
const ASSUMED_INFRA = 50;

export interface TimeRiskFactor {
  /** Vocabulary matches the `incident_factor_type` enum so real data lines up. */
  type: 'poor_lighting' | 'isolation' | 'public_transport';
  label: string;
  /** Points this factor contributed to the adjustment. */
  points: number;
  detail: string;
}

export interface TimeAdjustedRisk {
  band: TimeBand;
  bandLabel: string;
  /** The stored, all-hours score. */
  baseScore: number | null;
  /** Base score plus the modelled time adjustment, clamped to 0-100. */
  adjustedScore: number | null;
  /** adjustedScore - baseScore, rounded. Zero during daylight bands. */
  delta: number;
  level: RiskLevel | 'unscored';
  /** Named contributors, largest first. Empty during daylight bands. */
  factors: TimeRiskFactor[];
}

export interface TimeRiskInput {
  riskScore?: number | null;
  /** Lighting / policing / CCTV composite, 0-100. Higher is better. */
  infrastructureScore?: number | null;
  zoneType?: ZoneType;
}

/** Look up a band definition. */
export function timeBandDef(band: TimeBand): TimeBandDef {
  return TIME_BANDS.find((b) => b.band === band) ?? TIME_BANDS[1];
}

/**
 * Which band a given local time falls in.
 *
 * Handles the band that wraps midnight (`night` ends at hour 0) rather than
 * leaving 20:00–23:59 unmatched.
 */
export function bandForDate(date: Date = new Date()): TimeBand {
  const hour = date.getHours();
  for (const b of TIME_BANDS) {
    const wraps = b.endHour <= b.startHour;
    if (wraps ? hour >= b.startHour || hour < b.endHour : hour >= b.startHour && hour < b.endHour) {
      return b.band;
    }
  }
  return 'morning';
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Apply the time-of-day adjustment to a zone.
 *
 * Returns the adjusted score together with the named factors behind it, so the
 * UI can explain *why* a number moved instead of just showing a different one.
 * An unexplained score that changes with a filter reads as arbitrary.
 */
export function timeAdjustedRisk(input: TimeRiskInput, band: TimeBand): TimeAdjustedRisk {
  const def = timeBandDef(band);
  const base = input.riskScore ?? null;

  if (base == null) {
    return {
      band,
      bandLabel: def.label,
      baseScore: null,
      adjustedScore: null,
      delta: 0,
      level: 'unscored',
      factors: [],
    };
  }

  const infra = input.infrastructureScore ?? ASSUMED_INFRA;
  const zoneType = input.zoneType ?? 'mixed';

  // 0 when infrastructure is perfect, 1 when it is absent.
  const infraDeficit = clamp((100 - infra) / 100, 0, 1);

  const lightingPoints = def.exposure * infraDeficit * MAX_INFRA_UPLIFT;
  const isolationPoints = def.exposure * (ZONE_TYPE_UPLIFT[zoneType] ?? ZONE_TYPE_UPLIFT.mixed);

  // Public transport thins out sharply in the two darkest bands. Below that it
  // is not a distinct factor from general isolation.
  const transportPoints = band === 'night' || band === 'late_night' ? def.exposure * 4 : 0;

  const factors: TimeRiskFactor[] = [];
  if (lightingPoints >= 0.5) {
    factors.push({
      type: 'poor_lighting',
      label: 'Lighting and patrol cover',
      points: Math.round(lightingPoints),
      detail: `Infrastructure scores ${Math.round(infra)}/100 here, which matters more after dark.`,
    });
  }
  if (isolationPoints >= 0.5) {
    factors.push({
      type: 'isolation',
      label: 'Fewer people around',
      points: Math.round(isolationPoints),
      detail: `${zoneType.charAt(0).toUpperCase() + zoneType.slice(1)} areas empty out at this hour.`,
    });
  }
  if (transportPoints >= 0.5) {
    factors.push({
      type: 'public_transport',
      label: 'Thin transport options',
      points: Math.round(transportPoints),
      detail: 'Buses and metro run less often, so waits are longer.',
    });
  }
  factors.sort((a, b) => b.points - a.points);

  const adjusted = clamp(base + lightingPoints + isolationPoints + transportPoints, 0, 100);
  const rounded = Math.round(adjusted * 10) / 10;

  return {
    band,
    bandLabel: def.label,
    baseScore: base,
    adjustedScore: rounded,
    delta: Math.round(rounded - base),
    level: riskLevelFromScore(rounded),
    factors,
  };
}

/**
 * Caveat to show wherever a time-adjusted number appears.
 *
 * Separate from RISK_DISCLAIMER because it makes a different admission: the base
 * score comes from reported data, whereas the time adjustment is a model
 * assumption about darkness and footfall. Users deserve to know which is which.
 */
export const TIME_MODEL_DISCLAIMER =
  'Time-of-day figures are modelled from lighting, patrol cover and how busy an area stays — not from recorded incident times.';
