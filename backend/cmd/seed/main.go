// Command seed populates derived development data on top of the SQL migrations.
//
// Migration 000009 already inserts cities, zones, data sources and the admin row.
// This tool fills the gaps that make the app demo-able:
//
//   - police_stations — required by the SOS nearest-station lookup
//   - risk_scores     — 6 months of history per zone so the map and trend charts render
//   - admin password  — sets a known bcrypt hash from ADMIN_PASSWORD
//
// All generated risk figures are SYNTHETIC and deterministic (seeded from the zone
// name). They are tagged as such in score_breakdown so they can never be mistaken
// for real NCRB-derived statistics.
//
// Usage:
//
//	go run cmd/seed/main.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"math"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/safezone-india/backend/internal/config"
	"github.com/safezone-india/backend/internal/database"
)

const (
	monthsOfHistory  = 6
	defaultAdminMail = "admin@safezone.in"
)

type zoneRow struct {
	ID       uuid.UUID
	Name     string
	ZoneType string
	Lat      float64
	Lng      float64
	CityName string
}

func main() {
	log.SetFlags(0)
	log.Println("🌱 SafeZone India — seeding development data")

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("❌ Failed to load config: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, err := database.NewPostgresPool(ctx, cfg.DatabaseURL())
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}
	defer database.Close(pool)

	zones, err := loadZones(ctx, pool)
	if err != nil {
		log.Fatalf("❌ %v", err)
	}
	if len(zones) == 0 {
		log.Fatal("❌ No zones found. Run `make migrate-up` first — migration 000009 seeds cities and zones.")
	}
	log.Printf("📍 Found %d zones", len(zones))

	stations, err := seedPoliceStations(ctx, pool, zones)
	if err != nil {
		log.Fatalf("❌ Seeding police stations failed: %v", err)
	}
	log.Printf("🚔 Police stations: %d inserted (existing rows left untouched)", stations)

	scores, err := seedRiskScores(ctx, pool, zones)
	if err != nil {
		log.Fatalf("❌ Seeding risk scores failed: %v", err)
	}
	log.Printf("📊 Risk scores: %d rows upserted (%d months × %d zones)", scores, monthsOfHistory, len(zones))

	if err := seedAdminPassword(ctx, pool); err != nil {
		log.Fatalf("❌ Setting admin password failed: %v", err)
	}

	log.Println("✅ Seed complete")
}

func loadZones(ctx context.Context, pool *pgxpool.Pool) ([]zoneRow, error) {
	rows, err := pool.Query(ctx,
		`SELECT z.id, z.name, z.zone_type::text, z.latitude, z.longitude, c.name
		 FROM zones z
		 JOIN cities c ON c.id = z.city_id
		 WHERE z.deleted_at IS NULL AND z.is_deleted = FALSE
		 ORDER BY c.name, z.name`)
	if err != nil {
		return nil, fmt.Errorf("querying zones: %w", err)
	}
	defer rows.Close()

	var zones []zoneRow
	for rows.Next() {
		var z zoneRow
		if err := rows.Scan(&z.ID, &z.Name, &z.ZoneType, &z.Lat, &z.Lng, &z.CityName); err != nil {
			return nil, fmt.Errorf("scanning zone: %w", err)
		}
		zones = append(zones, z)
	}
	return zones, rows.Err()
}

// seedPoliceStations gives every zone at least one station so the SOS
// nearest-station query always returns a result.
func seedPoliceStations(ctx context.Context, pool *pgxpool.Pool, zones []zoneRow) (int, error) {
	inserted := 0
	for _, z := range zones {
		seed := stableSeed(z.Name)

		// Offset the station slightly from the zone centroid (~0.3-0.8 km).
		latOff := (float64(seed%7)-3) * 0.0015
		lngOff := (float64((seed/7)%7)-3) * 0.0015

		stationType := "thana"
		if z.ZoneType == "rural" {
			stationType = "chowki"
		}
		hasWomenDesk := seed%3 != 0
		officers := 25 + int(seed%60)

		tag, err := pool.Exec(ctx,
			`INSERT INTO police_stations
			     (zone_id, name, address, latitude, longitude, phone_number,
			      station_type, has_women_desk, officers_count, is_active)
			 SELECT $1, $2, $3, $4, $5, $6, $7::station_type, $8, $9, TRUE
			 WHERE NOT EXISTS (SELECT 1 FROM police_stations WHERE zone_id = $1)`,
			z.ID,
			fmt.Sprintf("%s Police Station", z.Name),
			fmt.Sprintf("%s, %s", z.Name, z.CityName),
			z.Lat+latOff,
			z.Lng+lngOff,
			"112",
			stationType,
			hasWomenDesk,
			officers,
		)
		if err != nil {
			return inserted, fmt.Errorf("zone %s: %w", z.Name, err)
		}
		inserted += int(tag.RowsAffected())
	}
	return inserted, nil
}

// seedRiskScores writes deterministic synthetic scores for the trailing
// months so the heat map, trend charts and Prophet forecaster have input.
func seedRiskScores(ctx context.Context, pool *pgxpool.Pool, zones []zoneRow) (int, error) {
	now := time.Now()
	upserted := 0

	for _, z := range zones {
		seed := stableSeed(z.Name)
		base := baseScoreFor(z.ZoneType, seed)

		for i := monthsOfHistory - 1; i >= 0; i-- {
			period := now.AddDate(0, -i, 0)
			month := int(period.Month())
			year := period.Year()

			// Gentle downward drift over time plus a deterministic monthly wobble.
			drift := -1.2 * float64(monthsOfHistory-1-i)
			wobble := 4 * math.Sin(float64(seed%360)*math.Pi/180+float64(i))
			overall := clamp(base+drift+wobble, 3, 97)

			incidentFreq := clamp(overall*1.05, 0, 100)
			recency := clamp(overall*0.9+float64(seed%8), 0, 100)
			demographic := clamp(overall*0.7+float64(seed%15), 0, 100)
			infrastructure := clamp(100-overall*0.8, 0, 100)
			trend := clamp(50+drift*2, 0, 100)

			direction := "stable"
			switch {
			case drift < -2:
				direction = "decreasing"
			case drift > 2:
				direction = "increasing"
			}

			breakdown, err := json.Marshal(map[string]any{
				"source":  "synthetic_seed",
				"warning": "Development data only — not derived from NCRB or police records.",
				"zone":    z.Name,
				"city":    z.CityName,
			})
			if err != nil {
				return upserted, fmt.Errorf("marshaling breakdown: %w", err)
			}

			tag, err := pool.Exec(ctx,
				`INSERT INTO risk_scores
				     (zone_id, overall_score, risk_level,
				      incident_frequency_score, recency_score, demographic_risk_score,
				      infrastructure_score, trend_score, trend_direction,
				      calculated_for_month, calculated_for_year, score_breakdown)
				 VALUES ($1, $2, $3::risk_level, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
				 ON CONFLICT (zone_id, calculated_for_year, calculated_for_month)
				 DO UPDATE SET
				     overall_score            = EXCLUDED.overall_score,
				     risk_level               = EXCLUDED.risk_level,
				     incident_frequency_score = EXCLUDED.incident_frequency_score,
				     recency_score            = EXCLUDED.recency_score,
				     demographic_risk_score   = EXCLUDED.demographic_risk_score,
				     infrastructure_score     = EXCLUDED.infrastructure_score,
				     trend_score              = EXCLUDED.trend_score,
				     trend_direction          = EXCLUDED.trend_direction,
				     score_breakdown          = EXCLUDED.score_breakdown,
				     calculated_at            = NOW()`,
				z.ID,
				round2(overall), riskLevelFor(overall),
				round2(incidentFreq), round2(recency), round2(demographic),
				round2(infrastructure), round2(trend), direction,
				month, year, string(breakdown),
			)
			if err != nil {
				return upserted, fmt.Errorf("zone %s %d-%02d: %w", z.Name, year, month, err)
			}
			upserted += int(tag.RowsAffected())
		}
	}
	return upserted, nil
}

// seedAdminPassword replaces the placeholder hash from migration 000009 with a
// hash of a password the operator actually knows.
func seedAdminPassword(ctx context.Context, pool *pgxpool.Pool) error {
	password := os.Getenv("ADMIN_PASSWORD")
	usingDefault := password == ""
	if usingDefault {
		password = "admin123"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return fmt.Errorf("hashing admin password: %w", err)
	}

	tag, err := pool.Exec(ctx,
		`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2`,
		string(hash), defaultAdminMail)
	if err != nil {
		return fmt.Errorf("updating admin user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		log.Printf("⚠️  No user with email %s — skipped password reset", defaultAdminMail)
		return nil
	}

	log.Printf("🔑 Admin password set for %s", defaultAdminMail)
	if usingDefault {
		log.Println("⚠️  Used the default password 'admin123'. Set ADMIN_PASSWORD before seeding anything but local dev.")
	}
	return nil
}

// stableSeed derives a deterministic value from a zone name so repeated seeds
// produce identical data.
func stableSeed(s string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return h.Sum32()
}

func baseScoreFor(zoneType string, seed uint32) float64 {
	// Rough priors by land use; jittered deterministically per zone.
	priors := map[string]float64{
		"commercial":    55,
		"mixed":         48,
		"industrial":    42,
		"rural":         38,
		"residential":   30,
		"institutional": 25,
	}
	base, ok := priors[zoneType]
	if !ok {
		base = 40
	}
	return base + float64(seed%25) - 12
}

func riskLevelFor(score float64) string {
	switch {
	case score >= 80:
		return "critical"
	case score >= 60:
		return "high"
	case score >= 40:
		return "moderate"
	case score >= 20:
		return "low"
	default:
		return "very_low"
	}
}

func clamp(v, min, max float64) float64 {
	return math.Min(math.Max(v, min), max)
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
