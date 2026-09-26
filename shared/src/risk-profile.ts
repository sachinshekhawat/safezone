/**
 * Risk by audience — the single source of truth.
 *
 * ## The honest position on gender
 *
 * SafeZone's stored risk scores describe **risk to women**. That is not a design
 * choice made here, it is what the data is: the incident types on record are
 * assault, harassment, stalking, kidnapping and domestic violence, drawn from
 * NCRB's women-focused reporting, and `demographic_data` carries female
 * population and female literacy with no male equivalent.
 *
 * Until migration 000012's `incidents.victim_gender` is actually populated, the
 * platform has **no observed basis** for a men's risk score. So:
 *
 * - The `women` profile is the base score, because that is what the base score
 *   already measures. It is data-backed to the same degree the base score is.
 * - The `general` profile is a **stated model assumption**, not a finding: it
 *   removes the component of the score that is specifically gendered and keeps
 *   the part that reflects the area's general condition. Every surface that shows
 *   it must label it as modelled.
 *
 * Presenting a men's number as though it were measured would be the same mistake
 * as inventing a time-of-day distribution, and this file refuses to make it. What
 * it does instead is give the mechanism a correct shape, so that the moment
 * victim_gender has rows behind it the weights come from data
 * (`fit_profile_weights` in the Python mirror) and nothing else has to change.
 *
 * Mirrored by `ai-service/app/models/risk_profile.py`; both are pinned by
 * `shared/testdata/risk-profile-vectors.json`.
 */

import type { RiskLevel, ZoneType } from './types';
import { riskLevelFromScore } from './risk';

/** Who the score is being reported for. */
export type RiskProfile = 'general' | 'women';

export interface RiskProfileDef {
  profile: RiskProfile;
  label: string;
  /** One line the UI can show to explain what the number covers. */
  description: string;
}

export const RISK_PROFILES: readonly RiskProfileDef[] = [
  {
    profile: 'general',
    label: 'General',
    description:
      'Risk to anyone in the area, from the general condition of the zone. Modelled, not separately measured.',
  },
  {
    profile: 'women',
    label: 'For women',
    description:
      'Risk to women, which is what the recorded incident data measures directly.',
  },
] as const;

/**
 * Share of the base score attributable to specifically gendered risk.
 *
 * The `general` profile discounts this portion. 0.28 is a deliberate, documented
 * assumption — it is not derived from anything, because there is nothing to derive
 * it from yet. It is held small enough that the two profiles never tell opposite
 * stories about the same place, which would be worse than not splitting them.
 */
const GENDERED_SHARE = 0.28;

/**
 * How much a nearby women's help desk reduces the women-profile score.
 *
 * Applied to the women profile only. A help desk changes whether a woman is taken
 * seriously when she reports, which is precisely the gendered part of the
 * experience; it does not change the general condition of the street.
 */
const WOMEN_DESK_RELIEF = 4;

/** Zone types where the gendered component of risk is most pronounced. */
const GENDERED_ZONE_WEIGHT: Record<ZoneType, number> = {
  // Crowded transport and market areas are where harassment concentrates.
  commercial: 1.15,
  institutional: 1.1,
  mixed: 1.0,
  residential: 0.95,
  industrial: 1.05,
  rural: 1.1,
};

export interface RiskProfileInput {
  riskScore?: number | null;
  /** Lighting / policing / CCTV composite, 0-100, higher is better. */
  infrastructureScore?: number | null;
  zoneType?: ZoneType;
  /** Whether the nearest police station has a women's help desk. */
  nearestStationHasWomenDesk?: boolean | null;
  /** Female literacy in the zone's city, 0-100. A proxy for reporting rates. */
  femaleLiteracyRate?: number | null;
  /**
   * Per-profile scores supplied by the backend ML pipeline, when available.
   * Present means measured (or at least learned) and takes precedence over
   * everything below.
   */
  profileScores?: Partial<Record<RiskProfile, number>> | null;
}

export interface ProfiledRisk {
  profile: RiskProfile;
  baseScore: number | null;
  score: number | null;
  level: RiskLevel | 'unscored';
  /** Difference from the base score, rounded. */
  delta: number;
  /**
   * False when the number came from the documented assumption rather than from
   * the backend's learned per-profile scores. The UI must caveat when false.
   */
  dataBacked: boolean;
  /** Plain-language reasons, for the UI to show instead of a bare number. */
  notes: string[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Round half away from zero, matching the Python mirror's _js_round. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Score an area for a given audience.
 *
 * Prefers backend-supplied per-profile scores; falls back to the documented
 * model, flagging `dataBacked: false` so the caller cannot present an assumption
 * as a measurement by accident.
 */
export function profiledRisk(input: RiskProfileInput, profile: RiskProfile): ProfiledRisk {
  const base = input.riskScore ?? null;

  if (base == null) {
    return {
      profile,
      baseScore: null,
      score: null,
      level: 'unscored',
      delta: 0,
      dataBacked: false,
      notes: [],
    };
  }

  // Backend learned this profile directly — use it and say so.
  const supplied = input.profileScores?.[profile];
  if (supplied != null) {
    const s = round1(clamp(supplied, 0, 100));
    return {
      profile,
      baseScore: base,
      score: s,
      level: riskLevelFromScore(s),
      delta: Math.round(s - base),
      dataBacked: true,
      notes: ['Scored directly from recorded incident data for this group.'],
    };
  }

  const notes: string[] = [];
  const zoneType = input.zoneType ?? 'mixed';
  const genderWeight = GENDERED_ZONE_WEIGHT[zoneType] ?? 1.0;

  if (profile === 'women') {
    let score = base;

    // The gendered component is emphasised by zone type.
    const emphasis = base * GENDERED_SHARE * (genderWeight - 1);
    if (Math.abs(emphasis) >= 0.5) {
      score += emphasis;
      notes.push(
        emphasis > 0
          ? `${zoneType.charAt(0).toUpperCase() + zoneType.slice(1)} areas carry more harassment risk.`
          : `${zoneType.charAt(0).toUpperCase() + zoneType.slice(1)} areas carry relatively less of it.`,
      );
    }

    if (input.nearestStationHasWomenDesk) {
      score -= WOMEN_DESK_RELIEF;
      notes.push('The nearest police station has a women’s help desk.');
    }

    // Low female literacy correlates with lower reporting, so a score built from
    // reports understates the real position. Nudging upward is the conservative
    // direction; the alternative is quietly reporting a number we believe is low.
    const lit = input.femaleLiteracyRate;
    if (lit != null && lit < 70) {
      const underreport = ((70 - clamp(lit, 0, 70)) / 70) * 6;
      if (underreport >= 0.5) {
        score += underreport;
        notes.push('Reporting rates are likely lower here, so the recorded figure understates risk.');
      }
    }

    const s = round1(clamp(score, 0, 100));
    return {
      profile,
      baseScore: base,
      score: s,
      level: riskLevelFromScore(s),
      delta: Math.round(s - base),
      // The base score already measures risk to women, so this profile is as
      // data-backed as the base score itself.
      dataBacked: true,
      notes,
    };
  }

  // general: discount the specifically gendered portion.
  const removed = base * GENDERED_SHARE * genderWeight;
  const s = round1(clamp(base - removed, 0, 100));

  notes.push('Estimated by discounting the gender-specific part of the recorded score.');
  notes.push('No male-victim data is recorded yet, so this is a model estimate.');

  return {
    profile,
    baseScore: base,
    score: s,
    level: riskLevelFromScore(s),
    delta: Math.round(s - base),
    dataBacked: false,
    notes,
  };
}

/** Which profile suits a user's stated gender. */
export function profileForGender(gender?: string | null): RiskProfile {
  return gender === 'female' ? 'women' : 'general';
}

/**
 * Caveat for the general profile.
 *
 * Deliberately blunt. A men's figure that looks as solid as the women's figure
 * would misrepresent how much evidence sits behind it.
 */
export const GENERAL_PROFILE_DISCLAIMER =
  'The general figure is modelled. Recorded incidents here describe crimes against women, so risk to men is inferred from the area’s condition rather than measured.';

export const WOMEN_PROFILE_DISCLAIMER =
  'Based on recorded incidents involving women, adjusted for local reporting rates and whether a women’s help desk is nearby.';
