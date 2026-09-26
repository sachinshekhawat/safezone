/**
 * Risk banding — the single source of truth for thresholds and colours.
 *
 * These must stay aligned with riskLevelFor() in backend/cmd/seed/main.go and
 * _score_to_level() in ai-service/app/models/risk_predictor.py. If they drift,
 * a zone shows one band on the map and a different one in the chatbot.
 */

import type { RiskLevel } from './types';

export interface RiskBand {
  level: RiskLevel;
  label: string;
  min: number;
  max: number;
  color: string;
}

/** Ordered most severe first, so a descending threshold scan works. */
export const RISK_BANDS: readonly RiskBand[] = [
  { level: 'critical', label: 'Critical', min: 80, max: 100, color: '#EF4444' },
  { level: 'high', label: 'High', min: 60, max: 79, color: '#F97316' },
  { level: 'moderate', label: 'Moderate', min: 40, max: 59, color: '#F59E0B' },
  { level: 'low', label: 'Low', min: 20, max: 39, color: '#10B981' },
  { level: 'very_low', label: 'Very low', min: 0, max: 19, color: '#06B6D4' },
] as const;

const UNSCORED_COLOR = '#9CA3AF';

/** Derive a risk level from a numeric score. */
export function riskLevelFromScore(score?: number | null): RiskLevel | 'unscored' {
  if (score == null || Number.isNaN(score)) return 'unscored';
  const band = RISK_BANDS.find((b) => score >= b.min);
  return band ? band.level : 'very_low';
}

/** Colour for a risk level; grey when unscored or unknown. */
export function riskColor(level?: string): string {
  return RISK_BANDS.find((b) => b.level === level)?.color ?? UNSCORED_COLOR;
}

/** Human-readable label, e.g. very_low -> "Very low". */
export function riskLabel(level?: string): string {
  return RISK_BANDS.find((b) => b.level === level)?.label ?? 'Unscored';
}

/** Look up the full band for a level. */
export function riskBand(level?: string): RiskBand | undefined {
  return RISK_BANDS.find((b) => b.level === level);
}

/**
 * Standard caveat shown wherever a score is displayed.
 *
 * Crimes against women are widely under-reported, so a low score can reflect
 * low reporting rather than low risk. Every surface that shows a number should
 * carry this.
 */
export const RISK_DISCLAIMER =
  'Statistical estimate from reported data. Under-reporting is common — a low score is not a guarantee of safety.';

/**
 * Emergency numbers, valid India-wide and reachable without balance or a SIM
 * credit. `primary` is the one number everybody should call first.
 *
 * The list is deliberately not gendered at the top level. An earlier version held
 * only police plus three women's and children's lines, which left a male user with
 * exactly one usable number on the SOS screen. Audience is a tag for ordering and
 * labelling, not a filter — someone may be calling on behalf of another person,
 * and hiding a number because of who is holding the phone is the wrong default in
 * an emergency.
 */
export type HelplineAudience = 'all' | 'women' | 'child' | 'senior';

export interface Helpline {
  number: string;
  label: string;
  /** Shown under the number so the choice is obvious under stress. */
  detail: string;
  audience: HelplineAudience;
  /** Exactly one entry is primary: the number to call when unsure. */
  primary?: boolean;
}

export const HELPLINES: readonly Helpline[] = [
  {
    number: '112',
    label: 'Emergency — Police',
    detail: 'One number for police, fire and ambulance. Works on any phone.',
    audience: 'all',
    primary: true,
  },
  {
    number: '108',
    label: 'Ambulance',
    detail: 'Medical emergency and accident response.',
    audience: 'all',
  },
  {
    number: '101',
    label: 'Fire',
    detail: 'Fire and rescue services.',
    audience: 'all',
  },
  {
    number: '1930',
    label: 'Cyber crime',
    detail: 'Online fraud, blackmail and financial scams.',
    audience: 'all',
  },
  {
    number: '181',
    label: 'Women helpline',
    detail: 'Support, counselling and shelter for women.',
    audience: 'women',
  },
  {
    number: '1091',
    label: 'Women in distress',
    detail: 'Police women\u2019s helpline for immediate danger.',
    audience: 'women',
  },
  {
    number: '1098',
    label: 'Child helpline',
    detail: 'For anyone under 18 who needs help.',
    audience: 'child',
  },
  {
    number: '14567',
    label: 'Senior citizens',
    detail: 'Elder abuse, neglect and assistance.',
    audience: 'senior',
  },
] as const;

/** The number to call when there is no time to choose. */
export const PRIMARY_HELPLINE: Helpline =
  HELPLINES.find((h) => h.primary) ?? HELPLINES[0];

/** Helplines that apply to everyone, in the order they should be offered. */
export const GENERAL_HELPLINES: readonly Helpline[] = HELPLINES.filter(
  (h) => h.audience === 'all',
);
