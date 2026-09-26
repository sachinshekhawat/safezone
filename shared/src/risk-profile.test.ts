import { describe, expect, it } from 'vitest';
import {
  GENERAL_PROFILE_DISCLAIMER,
  RISK_PROFILES,
  profileForGender,
  profiledRisk,
  type RiskProfile,
} from './risk-profile';
import vectors from '../testdata/risk-profile-vectors.json';

describe('profileForGender', () => {
  it('matches the golden map', () => {
    for (const [gender, expected] of Object.entries(vectors.profileForGender)) {
      expect(profileForGender(gender), gender).toBe(expected);
    }
  });

  it('defaults to general for absent gender', () => {
    // A user who declined to state it must not be silently treated as female;
    // pink mode and the women profile are both opt-in on a stated gender.
    expect(profileForGender(null)).toBe('general');
    expect(profileForGender(undefined)).toBe('general');
  });
});

describe('golden vectors', () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const got = profiledRisk(c.input as never, c.profile as RiskProfile);
      expect(got.score).toBe(c.expect.score);
      expect(got.delta).toBe(c.expect.delta);
      expect(got.level).toBe(c.expect.level);
      expect(got.dataBacked).toBe(c.expect.dataBacked);
    });
  }
});

describe('invariants', () => {
  it('has exactly two profiles', () => {
    expect(RISK_PROFILES.map((p) => p.profile)).toEqual(['general', 'women']);
  });

  it('never leaves the 0-100 scale', () => {
    for (const profile of ['general', 'women'] as RiskProfile[]) {
      for (const score of [0, 5, 50, 95, 100]) {
        for (const lit of [0, 50, 100]) {
          for (const desk of [true, false]) {
            const got = profiledRisk(
              {
                riskScore: score,
                zoneType: 'commercial',
                femaleLiteracyRate: lit,
                nearestStationHasWomenDesk: desk,
              },
              profile,
            );
            expect(got.score!).toBeGreaterThanOrEqual(0);
            expect(got.score!).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it('always rates women at or above the general profile for the same zone', () => {
    // The two profiles must never tell opposite stories about one place. Given
    // the recorded data is women-specific, the women figure being lower would
    // mean the model had inverted its own premise.
    for (const zoneType of ['commercial', 'residential', 'mixed', 'rural', 'industrial', 'institutional'] as const) {
      for (const score of [10, 40, 70, 95]) {
        const women = profiledRisk({ riskScore: score, zoneType }, 'women');
        const general = profiledRisk({ riskScore: score, zoneType }, 'general');
        expect(women.score!, `${zoneType} @ ${score}`).toBeGreaterThanOrEqual(general.score!);
      }
    }
  });

  it('marks the general profile as not data-backed when modelled', () => {
    const got = profiledRisk({ riskScore: 50, zoneType: 'mixed' }, 'general');
    expect(got.dataBacked).toBe(false);
    expect(got.notes.join(' ')).toMatch(/model estimate/i);
  });

  it('marks a backend-supplied score as data-backed for either profile', () => {
    for (const profile of ['general', 'women'] as RiskProfile[]) {
      const got = profiledRisk(
        { riskScore: 50, zoneType: 'mixed', profileScores: { [profile]: 44 } },
        profile,
      );
      expect(got.dataBacked).toBe(true);
      expect(got.score).toBe(44);
    }
  });

  it('prefers a supplied score over the model even when they disagree sharply', () => {
    const got = profiledRisk(
      { riskScore: 50, zoneType: 'commercial', profileScores: { general: 90 } },
      'general',
    );
    expect(got.score).toBe(90);
    expect(got.dataBacked).toBe(true);
  });

  it('ignores a supplied score for the other profile', () => {
    // Supplying only `women` must not make the general profile claim to be
    // data-backed off someone else's number.
    const got = profiledRisk(
      { riskScore: 50, zoneType: 'mixed', profileScores: { women: 80 } },
      'general',
    );
    expect(got.dataBacked).toBe(false);
    expect(got.score).not.toBe(80);
  });

  it('explains every women-profile adjustment', () => {
    const got = profiledRisk(
      {
        riskScore: 60,
        zoneType: 'commercial',
        nearestStationHasWomenDesk: true,
        femaleLiteracyRate: 50,
      },
      'women',
    );
    expect(got.notes.length).toBeGreaterThanOrEqual(3);
    expect(got.notes.join(' ')).toMatch(/help desk/i);
    expect(got.notes.join(' ')).toMatch(/reporting/i);
  });

  it('lowers the women score when a help desk is present, all else equal', () => {
    const withDesk = profiledRisk(
      { riskScore: 50, zoneType: 'mixed', nearestStationHasWomenDesk: true },
      'women',
    );
    const without = profiledRisk(
      { riskScore: 50, zoneType: 'mixed', nearestStationHasWomenDesk: false },
      'women',
    );
    expect(withDesk.score!).toBeLessThan(without.score!);
  });

  it('raises the women score where female literacy is low', () => {
    const low = profiledRisk({ riskScore: 50, zoneType: 'mixed', femaleLiteracyRate: 40 }, 'women');
    const high = profiledRisk({ riskScore: 50, zoneType: 'mixed', femaleLiteracyRate: 95 }, 'women');
    expect(low.score!).toBeGreaterThan(high.score!);
  });

  it('invents nothing for an unscored zone', () => {
    for (const profile of ['general', 'women'] as RiskProfile[]) {
      const got = profiledRisk({ riskScore: null, zoneType: 'rural' }, profile);
      expect(got.score).toBeNull();
      expect(got.level).toBe('unscored');
      expect(got.notes).toEqual([]);
    }
  });

  it('states plainly that male risk is not measured', () => {
    expect(GENERAL_PROFILE_DISCLAIMER).toMatch(/modelled/i);
    expect(GENERAL_PROFILE_DISCLAIMER).toMatch(/women/i);
  });
});
