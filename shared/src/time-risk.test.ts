import { describe, expect, it } from 'vitest';
import {
  TIME_BANDS,
  bandForDate,
  timeAdjustedRisk,
  timeBandDef,
  type TimeBand,
} from './time-risk';
import vectors from '../testdata/time-risk-vectors.json';

/**
 * These tests read the same JSON that ai-service/tests/test_time_risk.py reads.
 * The two implementations are separate copies because they run in different
 * runtimes; the shared vectors are what stop them diverging unnoticed.
 */

describe('bandForDate', () => {
  it('matches the golden hour -> band map', () => {
    for (const [hour, expected] of Object.entries(vectors.bandForHour)) {
      const d = new Date(2026, 0, 15, Number(hour), 30, 0);
      expect(bandForDate(d), `hour ${hour}`).toBe(expected);
    }
  });

  it('covers all 24 hours with no gaps', () => {
    // The `night` band wraps midnight (20 -> 0). An off-by-one there would leave
    // 20:00-23:59 unclassified, which is the exact window this feature is for.
    const seen = new Set<TimeBand>();
    for (let h = 0; h < 24; h++) {
      const band = bandForDate(new Date(2026, 0, 15, h, 0, 0));
      expect(band, `hour ${h} must resolve to a band`).toBeTruthy();
      seen.add(band);
    }
    expect(seen.size).toBe(TIME_BANDS.length);
  });
});

describe('TIME_BANDS', () => {
  it('has exactly the six values of the database time_of_day enum', () => {
    expect(TIME_BANDS.map((b) => b.band)).toEqual([
      'dawn',
      'morning',
      'afternoon',
      'evening',
      'night',
      'late_night',
    ]);
  });

  it('exposure rises monotonically from afternoon through late night', () => {
    const order: TimeBand[] = ['afternoon', 'evening', 'dawn', 'night', 'late_night'];
    const exposures = order.map((b) => timeBandDef(b).exposure);
    for (let i = 1; i < exposures.length; i++) {
      expect(exposures[i], `${order[i]} vs ${order[i - 1]}`).toBeGreaterThan(exposures[i - 1]);
    }
  });

  it('keeps daylight bands at zero so the base score is not double-counted', () => {
    expect(timeBandDef('morning').exposure).toBe(0);
    expect(timeBandDef('afternoon').exposure).toBe(0);
  });
});

describe('timeAdjustedRisk golden vectors', () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const got = timeAdjustedRisk(c.input as never, c.band as TimeBand);
      expect(got.adjustedScore).toBe(c.expect.adjustedScore);
      expect(got.delta).toBe(c.expect.delta);
      expect(got.level).toBe(c.expect.level);
      expect(got.factors.map((f) => f.type)).toEqual(c.expect.factorTypes);
    });
  }
});

describe('timeAdjustedRisk invariants', () => {
  it('never returns a score outside 0-100', () => {
    for (const band of TIME_BANDS.map((b) => b.band)) {
      for (const score of [0, 1, 50, 99, 100]) {
        for (const infra of [0, 50, 100]) {
          const got = timeAdjustedRisk(
            { riskScore: score, infrastructureScore: infra, zoneType: 'commercial' },
            band,
          );
          expect(got.adjustedScore!).toBeGreaterThanOrEqual(0);
          expect(got.adjustedScore!).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('never lowers a score — darkness does not make an area safer', () => {
    for (const band of TIME_BANDS.map((b) => b.band)) {
      const got = timeAdjustedRisk(
        { riskScore: 45, infrastructureScore: 60, zoneType: 'mixed' },
        band,
      );
      expect(got.adjustedScore!, band).toBeGreaterThanOrEqual(45);
    }
  });

  it('penalises worse infrastructure more, at the same hour', () => {
    const bad = timeAdjustedRisk(
      { riskScore: 40, infrastructureScore: 10, zoneType: 'mixed' },
      'late_night',
    );
    const good = timeAdjustedRisk(
      { riskScore: 40, infrastructureScore: 90, zoneType: 'mixed' },
      'late_night',
    );
    expect(bad.adjustedScore!).toBeGreaterThan(good.adjustedScore!);
  });

  it('swings commercial areas harder than residential ones', () => {
    const commercial = timeAdjustedRisk(
      { riskScore: 40, infrastructureScore: 50, zoneType: 'commercial' },
      'late_night',
    );
    const residential = timeAdjustedRisk(
      { riskScore: 40, infrastructureScore: 50, zoneType: 'residential' },
      'late_night',
    );
    expect(commercial.adjustedScore!).toBeGreaterThan(residential.adjustedScore!);
  });

  it('reports factors largest-first so the UI can lead with the main cause', () => {
    const got = timeAdjustedRisk(
      { riskScore: 40, infrastructureScore: 5, zoneType: 'commercial' },
      'late_night',
    );
    const points = got.factors.map((f) => f.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(got.factors.length).toBeGreaterThan(1);
  });

  it('explains every non-zero adjustment with at least one factor', () => {
    // A score that moves with no stated reason reads as arbitrary, which is
    // worse than not adjusting it at all.
    for (const band of TIME_BANDS.map((b) => b.band)) {
      const got = timeAdjustedRisk(
        { riskScore: 40, infrastructureScore: 40, zoneType: 'commercial' },
        band,
      );
      if (got.delta !== 0) {
        expect(got.factors.length, `${band} moved the score with no factors`).toBeGreaterThan(0);
      }
    }
  });

  it('does not invent a score for an unscored zone', () => {
    const got = timeAdjustedRisk(
      { riskScore: null, infrastructureScore: 10, zoneType: 'rural' },
      'late_night',
    );
    expect(got.adjustedScore).toBeNull();
    expect(got.level).toBe('unscored');
    expect(got.factors).toEqual([]);
  });
});
