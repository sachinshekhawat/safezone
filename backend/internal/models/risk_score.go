package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ========================
// Risk Score
// ========================

// RiskLevel represents the overall risk classification.
type RiskLevel string

const (
	RiskCritical RiskLevel = "critical"
	RiskHigh     RiskLevel = "high"
	RiskModerate RiskLevel = "moderate"
	RiskLow      RiskLevel = "low"
	RiskVeryLow  RiskLevel = "very_low"
)

// RiskScore represents a calculated risk score for a zone.
type RiskScore struct {
	ID                     uuid.UUID       `json:"id"`
	ZoneID                 uuid.UUID       `json:"zone_id"`
	OverallScore           float64         `json:"overall_score"`
	RiskLevel              RiskLevel       `json:"risk_level"`
	IncidentFrequencyScore float64         `json:"incident_frequency_score"`
	RecencyScore           float64         `json:"recency_score"`
	DemographicRiskScore   float64         `json:"demographic_risk_score"`
	InfrastructureScore    float64         `json:"infrastructure_score"`
	TrendScore             float64         `json:"trend_score"`
	TrendDirection         *string         `json:"trend_direction,omitempty"`
	CalculatedForMonth     int             `json:"calculated_for_month"`
	CalculatedForYear      int             `json:"calculated_for_year"`
	ScoreBreakdown         json.RawMessage `json:"score_breakdown,omitempty"`
	CalculatedAt           time.Time       `json:"calculated_at"`
	CreatedAt              time.Time       `json:"created_at"`

	// Joined fields
	ZoneName *string `json:"zone_name,omitempty"`
	CityName *string `json:"city_name,omitempty"`
}

// RiskScoreResponse is used for API responses with enriched data.
type RiskScoreResponse struct {
	RiskScore
	IncidentCount      int     `json:"incident_count"`
	TrendVsLastMonth   *float64 `json:"trend_vs_last_month,omitempty"`
	SafetyTips         []string `json:"safety_tips,omitempty"`
	NearestPoliceStation *string `json:"nearest_police_station,omitempty"`
}

// ========================
// Demographic Data
// ========================

// DemographicData represents socio-economic data for a city or zone.
type DemographicData struct {
	ID                       uuid.UUID  `json:"id"`
	CityID                   *uuid.UUID `json:"city_id,omitempty"`
	ZoneID                   *uuid.UUID `json:"zone_id,omitempty"`
	TotalPopulation          *int       `json:"total_population,omitempty"`
	FemalePopulation         *int       `json:"female_population,omitempty"`
	PopulationDensity        *float64   `json:"population_density_per_sqkm,omitempty"`
	LiteracyRatePercent      *float64   `json:"literacy_rate_percent,omitempty"`
	FemaleLiteracyRatePercent *float64  `json:"female_literacy_rate_percent,omitempty"`
	UnemploymentRate         *float64   `json:"unemployment_rate,omitempty"`
	AvgHouseholdIncome       *float64   `json:"avg_household_income,omitempty"`
	BelowPovertyLinePercent  *float64   `json:"below_poverty_line_percent,omitempty"`
	PoliceStationsCount      int        `json:"police_stations_count"`
	PolicePer1000            *float64   `json:"police_per_1000,omitempty"`
	StreetlightsPerKm        *float64   `json:"streetlights_per_km,omitempty"`
	CCTVCount                int        `json:"cctv_count"`
	PublicTransportRoutes    int        `json:"public_transport_routes"`
	Year                     int        `json:"year"`
	DataSource               *string    `json:"data_source,omitempty"`
	CreatedAt                time.Time  `json:"created_at"`
	UpdatedAt                time.Time  `json:"updated_at"`
	DeletedAt                *time.Time `json:"deleted_at,omitempty"`
	IsDeleted                bool       `json:"-"`
}

// ========================
// Monthly Report
// ========================

// MonthlyReport represents pre-aggregated monthly analytics.
type MonthlyReport struct {
	ID                      uuid.UUID       `json:"id"`
	CityID                  *uuid.UUID      `json:"city_id,omitempty"`
	ZoneID                  *uuid.UUID      `json:"zone_id,omitempty"`
	Month                   int             `json:"month"`
	Year                    int             `json:"year"`
	TotalIncidents          int             `json:"total_incidents"`
	IncidentsWithFIR        int             `json:"incidents_with_fir"`
	ConvictionRate          *float64        `json:"conviction_rate,omitempty"`
	AvgVictimAgeRange       *string         `json:"avg_victim_age_range,omitempty"`
	RiskScoreAvg            *float64        `json:"risk_score_avg,omitempty"`
	TrendVsLastMonth        *float64        `json:"trend_vs_last_month,omitempty"`
	TrendVsLastYear         *float64        `json:"trend_vs_last_year,omitempty"`
	AgeDistribution         json.RawMessage `json:"age_distribution,omitempty"`
	PerpetratorDistribution json.RawMessage `json:"perpetrator_distribution,omitempty"`
	TimeDistribution        json.RawMessage `json:"time_distribution,omitempty"`
	TypeDistribution        json.RawMessage `json:"type_distribution,omitempty"`
	NarrativeSummary        *string         `json:"narrative_summary,omitempty"`
	GeneratedAt             time.Time       `json:"generated_at"`
	CreatedAt               time.Time       `json:"created_at"`
}
