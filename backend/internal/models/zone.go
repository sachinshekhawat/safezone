package models

import (
	"time"

	"github.com/google/uuid"
)

// ========================
// Zone
// ========================

// ZoneType represents the type of a zone.
type ZoneType string

const (
	ZoneResidential   ZoneType = "residential"
	ZoneCommercial    ZoneType = "commercial"
	ZoneIndustrial    ZoneType = "industrial"
	ZoneRural         ZoneType = "rural"
	ZoneMixed         ZoneType = "mixed"
	ZoneInstitutional ZoneType = "institutional"
)

// Zone represents an area/zone within a city.
type Zone struct {
	ID        uuid.UUID  `json:"id"`
	CityID    uuid.UUID  `json:"city_id"`
	Name      string     `json:"name"`
	ZoneType  ZoneType   `json:"zone_type"`
	Latitude  float64    `json:"latitude"`
	Longitude float64    `json:"longitude"`
	RadiusKm  *float64   `json:"radius_km,omitempty"`
	PinCode   *string    `json:"pin_code,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
	IsDeleted bool       `json:"-"`

	// Joined fields
	CityName *string `json:"city_name,omitempty"`
}

// CreateZoneRequest is the request body for creating a zone.
type CreateZoneRequest struct {
	CityID    uuid.UUID `json:"city_id" validate:"required"`
	Name      string    `json:"name" validate:"required"`
	ZoneType  ZoneType  `json:"zone_type" validate:"required"`
	Latitude  float64   `json:"latitude" validate:"required"`
	Longitude float64   `json:"longitude" validate:"required"`
	RadiusKm  *float64  `json:"radius_km,omitempty"`
	PinCode   *string   `json:"pin_code,omitempty"`
}

// NearbyZoneRequest is the request for finding zones near a location.
type NearbyZoneRequest struct {
	Latitude  float64 `json:"latitude" validate:"required"`
	Longitude float64 `json:"longitude" validate:"required"`
	RadiusKm  float64 `json:"radius_km" validate:"required"`
}

// ZoneWithRisk extends Zone with its current risk score.
type ZoneWithRisk struct {
	Zone
	RiskScore     *float64   `json:"risk_score,omitempty"`
	RiskLevel     *RiskLevel `json:"risk_level,omitempty"`
	IncidentCount *int       `json:"incident_count,omitempty"`

	// InfrastructureScore is the lighting / policing / CCTV composite, 0-100,
	// higher being better. Returned to clients because the time-of-day risk model
	// in shared/src/time-risk.ts is driven by it — without this field every zone
	// falls back to the same assumed mid-range value and the night-time
	// adjustment becomes identical everywhere, which looks like it works while
	// saying nothing.
	InfrastructureScore *float64 `json:"infrastructure_score,omitempty"`
	TrendDirection      *string  `json:"trend_direction,omitempty"`
}

// ZoneListResponse wraps a list of zones with pagination.
type ZoneListResponse struct {
	Zones []Zone `json:"zones"`
	Total int    `json:"total"`
	Page  int    `json:"page"`
	Limit int    `json:"limit"`
}
