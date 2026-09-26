import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Risk logic comes from @safezone/shared, never from a copy kept here.
 *
 * This file used to declare its own RISK_BANDS plus its own riskColor,
 * riskLabel and riskLevelFromScore. They had already drifted: riskColor held a
 * second hard-coded colour map rather than reading the bands, so changing a band
 * colour in one place would have left the map and the legend disagreeing — and
 * the mobile app, which reads the shared package, disagreeing with both.
 *
 * Re-exported rather than removed so the existing `@/lib/utils` imports across
 * the app keep working; the definitions now have exactly one home.
 */
export {
  RISK_BANDS,
  RISK_DISCLAIMER,
  HELPLINES,
  PRIMARY_HELPLINE,
  GENERAL_HELPLINES,
  TIME_BANDS,
  TIME_MODEL_DISCLAIMER,
  RISK_PROFILES,
  GENERAL_PROFILE_DISCLAIMER,
  WOMEN_PROFILE_DISCLAIMER,
  bandForDate,
  profileForGender,
  profiledRisk,
  riskBand,
  riskColor,
  riskLabel,
  riskLevelFromScore,
  timeAdjustedRisk,
  timeBandDef,
} from '@safezone/shared';

export type { RiskBand, TimeBand, RiskProfile } from '@safezone/shared';

/** Merge Tailwind classes with clsx. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Tailwind background class per risk level.
 *
 * Stays local: these are utility-class names, not colours, so they belong to the
 * web client rather than the shared package. The hex values they correspond to
 * are still defined once, in RISK_BANDS.
 */
export function riskBgClass(level: string): string {
  const classes: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    moderate: 'bg-amber-500',
    low: 'bg-emerald-500',
    very_low: 'bg-cyan-500',
  };
  return classes[level] || 'bg-gray-500';
}

/** Format a date string. */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format distance in km. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)} km`;
}
