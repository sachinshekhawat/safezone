package models

import (
	"time"

	"github.com/google/uuid"
)

// ========================
// Incident (anonymized)
// ========================

type VictimAgeRange string

const (
	Age0to12  VictimAgeRange = "0-12"
	Age13to17 VictimAgeRange = "13-17"
	Age18to25 VictimAgeRange = "18-25"
	Age26to35 VictimAgeRange = "26-35"
	Age36to50 VictimAgeRange = "36-50"
	Age50Plus VictimAgeRange = "50+"
)

type PerpetratorType string

const (
	PerpOutsider PerpetratorType = "outsider"
	PerpLocal    PerpetratorType = "local"
	PerpKnown    PerpetratorType = "known"
	PerpUnknown  PerpetratorType = "unknown"
)

type PerpetratorRelation string

const (
	RelStranger      PerpetratorRelation = "stranger"
	RelAcquaintance  PerpetratorRelation = "acquaintance"
	RelRelative      PerpetratorRelation = "relative"
	RelAuthority     PerpetratorRelation = "authority"
	RelPartner       PerpetratorRelation = "partner"
	RelUnknown       PerpetratorRelation = "unknown"
)

type IncidentType string

const (
	IncAssault          IncidentType = "assault"
	IncHarassment       IncidentType = "harassment"
	IncStalking         IncidentType = "stalking"
	IncKidnapping       IncidentType = "kidnapping"
	IncDomesticViolence IncidentType = "domestic_violence"
	IncOther            IncidentType = "other"
)

type TimeOfDay string

const (
	TimeDawn      TimeOfDay = "dawn"
	TimeMorning   TimeOfDay = "morning"
	TimeAfternoon TimeOfDay = "afternoon"
	TimeEvening   TimeOfDay = "evening"
	TimeNight     TimeOfDay = "night"
	TimeLateNight TimeOfDay = "late_night"
)

type CaseStatus string

const (
	CaseOpen             CaseStatus = "open"
	CaseUnderInvestigation CaseStatus = "under_investigation"
	CaseChargesheeted    CaseStatus = "chargesheeted"
	CaseConvicted        CaseStatus = "convicted"
	CaseAcquitted        CaseStatus = "acquitted"
	CaseClosed           CaseStatus = "closed"
)

// Incident represents an anonymized crime incident record.
type Incident struct {
	ID                  uuid.UUID           `json:"id"`
	ZoneID              uuid.UUID           `json:"zone_id"`
	DataSourceID        *uuid.UUID          `json:"data_source_id,omitempty"`
	VictimAgeRange      VictimAgeRange      `json:"victim_age_range"`
	VictimCount         int                 `json:"victim_count"`
	PerpetratorType     PerpetratorType     `json:"perpetrator_type"`
	PerpetratorRelation PerpetratorRelation `json:"perpetrator_relation"`
	PerpetratorCount    int                 `json:"perpetrator_count"`
	IncidentType        IncidentType        `json:"incident_type"`
	TimeOfDay           *TimeOfDay          `json:"time_of_day,omitempty"`
	IncidentMonth       int                 `json:"incident_month"`
	IncidentYear        int                 `json:"incident_year"`
	IsFIRFiled          bool                `json:"is_fir_filed"`
	CaseStatus          CaseStatus          `json:"case_status"`
	IsVerified          bool                `json:"is_verified"`
	VerificationSource  *string             `json:"verification_source,omitempty"`
	ConfidenceScore     float64             `json:"confidence_score"`
	Notes               *string             `json:"notes,omitempty"`
	CreatedAt           time.Time           `json:"created_at"`
	UpdatedAt           time.Time           `json:"updated_at"`
	DeletedAt           *time.Time          `json:"deleted_at,omitempty"`
	IsDeleted           bool                `json:"-"`

	// Joined fields
	ZoneName *string `json:"zone_name,omitempty"`
	CityName *string `json:"city_name,omitempty"`
	Factors  []IncidentFactor `json:"factors,omitempty"`
}

// IncidentFactor represents a contributing factor to an incident.
type IncidentFactor struct {
	ID          uuid.UUID `json:"id"`
	IncidentID  uuid.UUID `json:"incident_id"`
	FactorType  string    `json:"factor_type"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// CreateIncidentRequest is the request body for creating an incident.
type CreateIncidentRequest struct {
	ZoneID              uuid.UUID           `json:"zone_id" validate:"required"`
	DataSourceID        *uuid.UUID          `json:"data_source_id,omitempty"`
	VictimAgeRange      VictimAgeRange      `json:"victim_age_range" validate:"required"`
	VictimCount         int                 `json:"victim_count" validate:"required,min=1"`
	PerpetratorType     PerpetratorType     `json:"perpetrator_type" validate:"required"`
	PerpetratorRelation PerpetratorRelation `json:"perpetrator_relation"`
	PerpetratorCount    int                 `json:"perpetrator_count" validate:"min=1"`
	IncidentType        IncidentType        `json:"incident_type" validate:"required"`
	TimeOfDay           *TimeOfDay          `json:"time_of_day,omitempty"`
	IncidentMonth       int                 `json:"incident_month" validate:"required,min=1,max=12"`
	IncidentYear        int                 `json:"incident_year" validate:"required,min=2000"`
	IsFIRFiled          bool                `json:"is_fir_filed"`
	CaseStatus          CaseStatus          `json:"case_status"`
	Factors             []string            `json:"factors,omitempty"`
}

// IncidentFilter is used for filtering incident queries.
type IncidentFilter struct {
	ZoneID       *uuid.UUID       `json:"zone_id,omitempty"`
	CityID       *uuid.UUID       `json:"city_id,omitempty"`
	IncidentType *IncidentType    `json:"incident_type,omitempty"`
	AgeRange     *VictimAgeRange  `json:"age_range,omitempty"`
	PerpType     *PerpetratorType `json:"perpetrator_type,omitempty"`
	YearFrom     *int             `json:"year_from,omitempty"`
	YearTo       *int             `json:"year_to,omitempty"`
	MonthFrom    *int             `json:"month_from,omitempty"`
	MonthTo      *int             `json:"month_to,omitempty"`
	IsVerified   *bool            `json:"is_verified,omitempty"`
	Page         int              `json:"page"`
	Limit        int              `json:"limit"`
}
