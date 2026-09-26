package models

import (
	"time"

	"github.com/google/uuid"
)

// ========================
// SOS Request
// ========================

type SOSStatus string

const (
	SOSActive       SOSStatus = "active"
	SOSAcknowledged SOSStatus = "acknowledged"
	SOSResolved     SOSStatus = "resolved"
	SOSFalseAlarm   SOSStatus = "false_alarm"
	SOSEscalated    SOSStatus = "escalated"
	SOSExpired      SOSStatus = "expired"
)

type SOSTriggerMethod string

const (
	TriggerButton SOSTriggerMethod = "button"
	TriggerSilent SOSTriggerMethod = "silent"
	TriggerVoice  SOSTriggerMethod = "voice"
	TriggerShake  SOSTriggerMethod = "shake"
	TriggerWidget SOSTriggerMethod = "widget"
)

// SOSRequest represents an emergency SOS request.
type SOSRequest struct {
	ID                  uuid.UUID        `json:"id"`
	UserID              *uuid.UUID       `json:"user_id,omitempty"`
	DeviceID            *string          `json:"device_id,omitempty"`
	ZoneID              *uuid.UUID       `json:"zone_id,omitempty"`
	TriggerLat          float64          `json:"trigger_lat"`
	TriggerLng          float64          `json:"trigger_lng"`
	Status              SOSStatus        `json:"status"`
	TriggerMethod       SOSTriggerMethod `json:"trigger_method"`
	NearestStationID    *uuid.UUID       `json:"nearest_station_id,omitempty"`
	StationDistanceKm   *float64         `json:"station_distance_km,omitempty"`
	AcknowledgedAt      *time.Time       `json:"acknowledged_at,omitempty"`
	AcknowledgedBy      *uuid.UUID       `json:"acknowledged_by,omitempty"`
	ResponseTimeSeconds *int             `json:"response_time_seconds,omitempty"`
	ResolutionNotes     *string          `json:"resolution_notes,omitempty"`
	AudioRecorded       bool             `json:"audio_recorded"`
	AudioFilePath       *string          `json:"-"` // never expose
	CreatedAt           time.Time        `json:"created_at"`
	ResolvedAt          *time.Time       `json:"resolved_at,omitempty"`
	AutoPurgeAt         *time.Time       `json:"-"` // internal
	EscalationLevel     int              `json:"escalation_level"`
	EscalatedAt         *time.Time       `json:"escalated_at,omitempty"`

	// Joined fields
	NearestStationName *string `json:"nearest_station_name,omitempty"`
	ZoneName           *string `json:"zone_name,omitempty"`
}

// TriggerSOSRequest is the request body for triggering an SOS.
type TriggerSOSRequest struct {
	Latitude      float64          `json:"latitude" validate:"required"`
	Longitude     float64          `json:"longitude" validate:"required"`
	DeviceID      *string          `json:"device_id,omitempty"`
	TriggerMethod SOSTriggerMethod `json:"trigger_method"`
}

// SOSAcknowledgeRequest is the request body for acknowledging an SOS.
type SOSAcknowledgeRequest struct {
	SOSID uuid.UUID `json:"sos_id" validate:"required"`
	Notes *string   `json:"notes,omitempty"`
}

// SOSResolveRequest is the request body for resolving an SOS.
type SOSResolveRequest struct {
	SOSID      uuid.UUID `json:"sos_id" validate:"required"`
	Notes      string    `json:"notes" validate:"required"`
	FalseAlarm bool      `json:"false_alarm"`
}

// ========================
// Live Location
// ========================

// LiveLocation represents a GPS data point during an active SOS.
type LiveLocation struct {
	ID             uuid.UUID `json:"id"`
	SOSRequestID   uuid.UUID `json:"sos_request_id"`
	Latitude       float64   `json:"latitude"`
	Longitude      float64   `json:"longitude"`
	AccuracyMeters *float64  `json:"accuracy_meters,omitempty"`
	SpeedMPS       *float64  `json:"speed_mps,omitempty"`
	Heading        *float64  `json:"heading,omitempty"`
	AltitudeMeters *float64  `json:"altitude_meters,omitempty"`
	BatteryPercent *int      `json:"battery_percent,omitempty"`
	CapturedAt     time.Time `json:"captured_at"`
}

// LocationUpdate is the WebSocket message for live location updates.
type LocationUpdate struct {
	Latitude       float64  `json:"lat"`
	Longitude      float64  `json:"lng"`
	AccuracyMeters *float64 `json:"accuracy,omitempty"`
	SpeedMPS       *float64 `json:"speed,omitempty"`
	Heading        *float64 `json:"heading,omitempty"`
	BatteryPercent *int     `json:"battery,omitempty"`
	Timestamp      int64    `json:"ts"`
}

// ========================
// Police Station
// ========================

type StationType string

const (
	StationThana       StationType = "thana"
	StationChowki      StationType = "chowki"
	StationBooth       StationType = "booth"
	StationControlRoom StationType = "control_room"
)

// PoliceStation represents a police station.
type PoliceStation struct {
	ID            uuid.UUID   `json:"id"`
	ZoneID        uuid.UUID   `json:"zone_id"`
	Name          string      `json:"name"`
	Address       *string     `json:"address,omitempty"`
	Latitude      float64     `json:"latitude"`
	Longitude     float64     `json:"longitude"`
	PhoneNumber   *string     `json:"phone_number,omitempty"`
	StationType   StationType `json:"station_type"`
	HasWomenDesk  bool        `json:"has_women_desk"`
	OfficersCount *int        `json:"officers_count,omitempty"`
	IsActive      bool        `json:"is_active"`
	CreatedAt     time.Time   `json:"created_at"`
	UpdatedAt     time.Time   `json:"updated_at"`
	DistanceKm    *float64    `json:"distance_km,omitempty"` // computed field
}

// ========================
// Emergency Contact
// ========================

// EmergencyContact represents a user's emergency contact.
type EmergencyContact struct {
	ID             uuid.UUID  `json:"id"`
	UserID         uuid.UUID  `json:"user_id"`
	Name           string     `json:"name"`
	PhoneNumber    string     `json:"phone_number"` // encrypted in storage
	Relation       string     `json:"relation"`
	IsPrimary      bool       `json:"is_primary"`
	NotifyOnSOS    bool       `json:"notify_on_sos"`
	LastNotifiedAt *time.Time `json:"last_notified_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty"`
}
