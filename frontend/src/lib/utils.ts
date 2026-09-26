import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes with clsx. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Risk bands, ordered most severe first. Shared by the map legend, popups and
 * any chart that needs consistent colours and thresholds.
 */
export const RISK_BANDS = [
  { level: 'critical', label: 'Critical', min: 80, max: 100, color: '#EF4444' },
  { level: 'high', label: 'High', min: 60, max: 79, color: '#F97316' },
  { level: 'moderate', label: 'Moderate', min: 40, max: 59, color: '#F59E0B' },
  { level: 'low', label: 'Low', min: 20, max: 39, color: '#10B981' },
  { level: 'very_low', label: 'Very low', min: 0, max: 19, color: '#06B6D4' },
] as const;

export type RiskBand = (typeof RISK_BANDS)[number];

/** Human-readable label for a risk level (e.g. very_low -> "Very low"). */
export function riskLabel(level?: string): string {
  return RISK_BANDS.find((b) => b.level === level)?.label ?? 'Unscored';
}

/** Derive a risk level from a numeric score, mirroring the backend thresholds. */
export function riskLevelFromScore(score?: number | null): string {
  if (score == null) return 'unscored';
  return RISK_BANDS.find((b) => score >= b.min)?.level ?? 'very_low';
}

/** Format a risk score to a color. */
export function riskColor(level: string): string {
  const colors: Record<string, string> = {
    critical: '#EF4444',
    high: '#F97316',
    moderate: '#F59E0B',
    low: '#10B981',
    very_low: '#06B6D4',
  };
  return colors[level] || '#6B7280';
}

/** Format a risk score to a background class. */
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
