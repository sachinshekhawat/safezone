package main

import (
	"math"
	"testing"
)

func TestRiskLevelForBoundaries(t *testing.T) {
	cases := []struct {
		score float64
		want  string
	}{
		{100, "critical"},
		{80, "critical"},
		{79.99, "high"},
		{60, "high"},
		{59.99, "moderate"},
		{40, "moderate"},
		{39.99, "low"},
		{20, "low"},
		{19.99, "very_low"},
		{0, "very_low"},
	}

	for _, c := range cases {
		if got := riskLevelFor(c.score); got != c.want {
			t.Errorf("riskLevelFor(%.2f) = %q, want %q", c.score, got, c.want)
		}
	}
}

// riskLevelFor must only ever emit values present in the risk_level enum,
// otherwise the INSERT in seedRiskScores fails.
func TestRiskLevelForAlwaysReturnsValidEnum(t *testing.T) {
	valid := map[string]bool{
		"critical": true, "high": true, "moderate": true, "low": true, "very_low": true,
	}
	for score := 0.0; score <= 100.0; score += 0.5 {
		if got := riskLevelFor(score); !valid[got] {
			t.Fatalf("riskLevelFor(%.1f) returned invalid enum value %q", score, got)
		}
	}
}

func TestClamp(t *testing.T) {
	cases := []struct{ v, min, max, want float64 }{
		{50, 0, 100, 50},
		{-10, 0, 100, 0},
		{150, 0, 100, 100},
		{3, 3, 97, 3},
		{97, 3, 97, 97},
	}
	for _, c := range cases {
		if got := clamp(c.v, c.min, c.max); got != c.want {
			t.Errorf("clamp(%v, %v, %v) = %v, want %v", c.v, c.min, c.max, got, c.want)
		}
	}
}

func TestStableSeedIsDeterministic(t *testing.T) {
	// Re-running the seeder must reproduce identical data.
	for _, name := range []string{"Connaught Place", "Dwarka", "Pink City (Walled City)"} {
		a, b := stableSeed(name), stableSeed(name)
		if a != b {
			t.Errorf("stableSeed(%q) not deterministic: %d != %d", name, a, b)
		}
	}

	if stableSeed("Dwarka") == stableSeed("Rohini") {
		t.Error("expected different seeds for different zone names")
	}
}

// baseScoreFor feeds clamp(base+drift+wobble, 3, 97); keep the base itself in a
// sane band so the generated series stays inside the 0-100 CHECK constraint.
func TestBaseScoreForStaysInRange(t *testing.T) {
	zoneTypes := []string{
		"residential", "commercial", "industrial",
		"rural", "mixed", "institutional",
		"unknown_type",
	}

	for _, zt := range zoneTypes {
		for _, name := range []string{"A", "Connaught Place", "Kishangarh Bas", "zzz"} {
			got := baseScoreFor(zt, stableSeed(name))
			if got < 0 || got > 100 {
				t.Errorf("baseScoreFor(%q, seed(%q)) = %v, outside 0-100", zt, name, got)
			}
		}
	}
}

func TestRound2(t *testing.T) {
	cases := []struct{ in, want float64 }{
		{45.678, 45.68},
		{45.674, 45.67},
		{100, 100},
		{0.001, 0},
		{12.345678, 12.35},
		{-3.456, -3.46},
	}
	for _, c := range cases {
		if got := round2(c.in); math.Abs(got-c.want) > 1e-9 {
			t.Errorf("round2(%v) = %v, want %v", c.in, got, c.want)
		}
	}

	// round2 must never produce more than 2 decimal places, since
	// overall_score is NUMERIC(5,2).
	for _, v := range []float64{3.14159, 96.999, 55.555, 0.126} {
		got := round2(v)
		if math.Abs(got*100-math.Round(got*100)) > 1e-9 {
			t.Errorf("round2(%v) = %v has more than 2 decimal places", v, got)
		}
	}
}

// The generated score series must satisfy the risk_scores CHECK constraint
// (overall_score BETWEEN 0 AND 100) for every zone type and month offset.
func TestGeneratedScoresSatisfyDatabaseConstraint(t *testing.T) {
	zoneTypes := []string{"residential", "commercial", "industrial", "rural", "mixed", "institutional"}
	names := []string{"Connaught Place", "Paharganj", "Dwarka", "Najafgarh", "Kolar", "Sanganer"}

	for _, zt := range zoneTypes {
		for _, name := range names {
			seed := stableSeed(name)
			base := baseScoreFor(zt, seed)

			for i := monthsOfHistory - 1; i >= 0; i-- {
				drift := -1.2 * float64(monthsOfHistory-1-i)
				wobble := 4 * math.Sin(float64(seed%360)*math.Pi/180+float64(i))
				overall := round2(clamp(base+drift+wobble, 3, 97))

				if overall < 0 || overall > 100 {
					t.Fatalf("overall_score %v for zone %q type %q month-offset %d violates CHECK 0-100",
						overall, name, zt, i)
				}
				if !map[string]bool{"critical": true, "high": true, "moderate": true, "low": true, "very_low": true}[riskLevelFor(overall)] {
					t.Fatalf("invalid risk_level for score %v", overall)
				}
			}
		}
	}
}
