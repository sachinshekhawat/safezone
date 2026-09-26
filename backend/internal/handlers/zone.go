package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/safezone-india/backend/internal/models"
)

// ZoneHandler handles zone-related HTTP requests.
type ZoneHandler struct {
	db *pgxpool.Pool
}

// NewZoneHandler creates a new ZoneHandler.
func NewZoneHandler(db *pgxpool.Pool) *ZoneHandler {
	return &ZoneHandler{db: db}
}

// Routes returns the chi router for zone endpoints.
func (h *ZoneHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.List)
	r.Get("/{id}", h.GetByID)
	r.Get("/city/{cityId}", h.ListByCity)
	r.Post("/", h.Create)
	r.Post("/nearby", h.FindNearby)
	r.Get("/{id}/risk", h.GetRiskScore)
	return r
}

// List returns all zones with pagination.
func (h *ZoneHandler) List(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var total int
	h.db.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM zones WHERE deleted_at IS NULL AND is_deleted = FALSE",
	).Scan(&total)

	rows, err := h.db.Query(r.Context(),
		`SELECT z.id, z.city_id, z.name, z.zone_type, z.latitude, z.longitude,
		        z.radius_km, z.pin_code, z.created_at, z.updated_at, c.name AS city_name
		 FROM zones z
		 JOIN cities c ON z.city_id = c.id
		 WHERE z.deleted_at IS NULL AND z.is_deleted = FALSE
		 ORDER BY c.name, z.name
		 LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch zones")
		return
	}
	defer rows.Close()

	var zones []models.Zone
	for rows.Next() {
		var z models.Zone
		rows.Scan(&z.ID, &z.CityID, &z.Name, &z.ZoneType, &z.Latitude, &z.Longitude,
			&z.RadiusKm, &z.PinCode, &z.CreatedAt, &z.UpdatedAt, &z.CityName)
		zones = append(zones, z)
	}
	if zones == nil {
		zones = []models.Zone{}
	}

	writeJSON(w, http.StatusOK, models.ZoneListResponse{Zones: zones, Total: total, Page: page, Limit: limit})
}

// GetByID returns a single zone.
func (h *ZoneHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid zone ID")
		return
	}

	var z models.Zone
	err = h.db.QueryRow(r.Context(),
		`SELECT z.id, z.city_id, z.name, z.zone_type, z.latitude, z.longitude,
		        z.radius_km, z.pin_code, z.created_at, z.updated_at, c.name
		 FROM zones z JOIN cities c ON z.city_id = c.id
		 WHERE z.id = $1 AND z.deleted_at IS NULL`, id,
	).Scan(&z.ID, &z.CityID, &z.Name, &z.ZoneType, &z.Latitude, &z.Longitude,
		&z.RadiusKm, &z.PinCode, &z.CreatedAt, &z.UpdatedAt, &z.CityName)
	if err != nil {
		writeError(w, http.StatusNotFound, "Zone not found")
		return
	}
	writeJSON(w, http.StatusOK, z)
}

// ListByCity returns all zones for a specific city.
func (h *ZoneHandler) ListByCity(w http.ResponseWriter, r *http.Request) {
	cityID, err := uuid.Parse(chi.URLParam(r, "cityId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid city ID")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT z.id, z.city_id, z.name, z.zone_type, z.latitude, z.longitude,
		        z.radius_km, z.pin_code, z.created_at, z.updated_at,
		        rs.overall_score, rs.risk_level, rs.infrastructure_score, rs.trend_direction
		 FROM zones z
		 LEFT JOIN LATERAL (
		     SELECT overall_score, risk_level, infrastructure_score, trend_direction
		     FROM risk_scores
		     WHERE zone_id = z.id 
		     ORDER BY calculated_for_year DESC, calculated_for_month DESC LIMIT 1
		 ) rs ON TRUE
		 WHERE z.city_id = $1 AND z.deleted_at IS NULL AND z.is_deleted = FALSE
		 ORDER BY z.name`, cityID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch zones")
		return
	}
	defer rows.Close()

	var zones []models.ZoneWithRisk
	for rows.Next() {
		var z models.ZoneWithRisk
		// The scan error was previously discarded, which appended a zero-valued
		// zone on any column mismatch — a silent wrong answer. Fail loudly instead.
		if err := rows.Scan(&z.ID, &z.CityID, &z.Name, &z.ZoneType, &z.Latitude, &z.Longitude,
			&z.RadiusKm, &z.PinCode, &z.CreatedAt, &z.UpdatedAt,
			&z.RiskScore, &z.RiskLevel, &z.InfrastructureScore, &z.TrendDirection); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to read zone row")
			return
		}
		zones = append(zones, z)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch zones")
		return
	}
	if zones == nil {
		zones = []models.ZoneWithRisk{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"zones": zones, "count": len(zones)})
}

// FindNearby finds zones near a given location.
func (h *ZoneHandler) FindNearby(w http.ResponseWriter, r *http.Request) {
	var req models.NearbyZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT z.id, z.city_id, z.name, z.zone_type, z.latitude, z.longitude,
		        z.radius_km, z.pin_code, c.name AS city_name,
		        ST_Distance(
		            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
		            ST_SetSRID(ST_MakePoint(z.longitude, z.latitude), 4326)::geography
		        ) / 1000.0 AS distance_km,
		        rs.overall_score, rs.risk_level, rs.infrastructure_score, rs.trend_direction
		 FROM zones z
		 JOIN cities c ON z.city_id = c.id
		 LEFT JOIN LATERAL (
		     SELECT overall_score, risk_level, infrastructure_score, trend_direction
		     FROM risk_scores
		     WHERE zone_id = z.id 
		     ORDER BY calculated_for_year DESC, calculated_for_month DESC LIMIT 1
		 ) rs ON TRUE
		 WHERE z.deleted_at IS NULL
		   AND ST_DWithin(
		       ST_SetSRID(ST_MakePoint(z.longitude, z.latitude), 4326)::geography,
		       ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
		       $3 * 1000
		   )
		 ORDER BY distance_km ASC
		 LIMIT 20`,
		req.Longitude, req.Latitude, req.RadiusKm)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to find nearby zones: "+err.Error())
		return
	}
	defer rows.Close()

	type NearbyZone struct {
		models.ZoneWithRisk
		DistanceKm float64 `json:"distance_km"`
	}

	var zones []NearbyZone
	for rows.Next() {
		var z NearbyZone
		if err := rows.Scan(&z.ID, &z.CityID, &z.Name, &z.ZoneType, &z.Latitude, &z.Longitude,
			&z.RadiusKm, &z.PinCode, &z.CityName, &z.DistanceKm, &z.RiskScore, &z.RiskLevel,
			&z.InfrastructureScore, &z.TrendDirection); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to read zone row")
			return
		}
		zones = append(zones, z)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to find nearby zones")
		return
	}
	if zones == nil {
		zones = []NearbyZone{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"zones": zones, "count": len(zones)})
}

// GetRiskScore returns the latest risk score for a zone.
func (h *ZoneHandler) GetRiskScore(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid zone ID")
		return
	}

	var rs models.RiskScore
	err = h.db.QueryRow(r.Context(),
		`SELECT id, zone_id, overall_score, risk_level, incident_frequency_score,
		        recency_score, demographic_risk_score, infrastructure_score, trend_score,
		        trend_direction, calculated_for_month, calculated_for_year, 
		        score_breakdown, calculated_at, created_at
		 FROM risk_scores
		 WHERE zone_id = $1
		 ORDER BY calculated_for_year DESC, calculated_for_month DESC
		 LIMIT 1`, id,
	).Scan(&rs.ID, &rs.ZoneID, &rs.OverallScore, &rs.RiskLevel,
		&rs.IncidentFrequencyScore, &rs.RecencyScore, &rs.DemographicRiskScore,
		&rs.InfrastructureScore, &rs.TrendScore, &rs.TrendDirection,
		&rs.CalculatedForMonth, &rs.CalculatedForYear,
		&rs.ScoreBreakdown, &rs.CalculatedAt, &rs.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "No risk score found for this zone")
		return
	}

	writeJSON(w, http.StatusOK, rs)
}

// Create adds a new zone.
func (h *ZoneHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var z models.Zone
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, city_id, name, zone_type, latitude, longitude, radius_km, pin_code, created_at, updated_at`,
		req.CityID, req.Name, req.ZoneType, req.Latitude, req.Longitude, req.RadiusKm, req.PinCode,
	).Scan(&z.ID, &z.CityID, &z.Name, &z.ZoneType, &z.Latitude, &z.Longitude,
		&z.RadiusKm, &z.PinCode, &z.CreatedAt, &z.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create zone: "+err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, z)
}
