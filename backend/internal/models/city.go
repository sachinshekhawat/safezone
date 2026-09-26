// Package models defines all data structures matching the database schema.
// These models are used across handlers, services, and repositories.
package models

import (
	"time"

	"github.com/google/uuid"
)

// ========================
// Base model with common fields
// ========================

// Timestamps holds common timestamp fields.
type Timestamps struct {
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"` // soft delete
}

// SoftDelete holds soft/hard delete fields.
type SoftDelete struct {
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
	IsDeleted bool       `json:"is_deleted"`
}

// ========================
// City
// ========================

// CityTier represents the tier classification of a city.
type CityTier string

const (
	CityTierMetro CityTier = "metro"
	CityTier1     CityTier = "tier1"
	CityTier2     CityTier = "tier2"
	CityTier3     CityTier = "tier3"
)

// City represents a city in the system.
type City struct {
	ID                 uuid.UUID  `json:"id"`
	Name               string     `json:"name"`
	State              string     `json:"state"`
	Latitude           float64    `json:"latitude"`
	Longitude          float64    `json:"longitude"`
	Population         *int       `json:"population,omitempty"`
	LiteracyRate       *float64   `json:"literacy_rate,omitempty"`
	FemaleLiteracyRate *float64   `json:"female_literacy_rate,omitempty"`
	Tier               CityTier   `json:"tier"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	DeletedAt          *time.Time `json:"deleted_at,omitempty"`
	IsDeleted          bool       `json:"-"`
}

// CreateCityRequest is the request body for creating a city.
type CreateCityRequest struct {
	Name               string   `json:"name" validate:"required"`
	State              string   `json:"state" validate:"required"`
	Latitude           float64  `json:"latitude" validate:"required"`
	Longitude          float64  `json:"longitude" validate:"required"`
	Population         *int     `json:"population,omitempty"`
	LiteracyRate       *float64 `json:"literacy_rate,omitempty"`
	FemaleLiteracyRate *float64 `json:"female_literacy_rate,omitempty"`
	Tier               CityTier `json:"tier" validate:"required"`
}

// UpdateCityRequest is the request body for updating a city.
type UpdateCityRequest struct {
	Name               *string   `json:"name,omitempty"`
	State              *string   `json:"state,omitempty"`
	Latitude           *float64  `json:"latitude,omitempty"`
	Longitude          *float64  `json:"longitude,omitempty"`
	Population         *int      `json:"population,omitempty"`
	LiteracyRate       *float64  `json:"literacy_rate,omitempty"`
	FemaleLiteracyRate *float64  `json:"female_literacy_rate,omitempty"`
	Tier               *CityTier `json:"tier,omitempty"`
}

// CityListResponse wraps a list of cities with pagination.
type CityListResponse struct {
	Cities []City `json:"cities"`
	Total  int    `json:"total"`
	Page   int    `json:"page"`
	Limit  int    `json:"limit"`
}
