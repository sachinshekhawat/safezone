package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/safezone-india/backend/internal/models"
	ws "github.com/safezone-india/backend/internal/websocket"
)

// SOSHandler handles SOS-related HTTP and WebSocket requests.
type SOSHandler struct {
	db  *pgxpool.Pool
	hub *ws.Hub
}

// NewSOSHandler creates a new SOSHandler.
func NewSOSHandler(db *pgxpool.Pool, hub *ws.Hub) *SOSHandler {
	return &SOSHandler{db: db, hub: hub}
}

// Routes returns the chi router for SOS endpoints.
func (h *SOSHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/trigger", h.TriggerSOS)
	r.Get("/active", h.ListActive)
	r.Post("/{id}/acknowledge", h.Acknowledge)
	r.Post("/{id}/resolve", h.Resolve)
	r.Get("/{id}/locations", h.GetLocations)
	return r
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
}

// WebSocketHandler upgrades HTTP to WebSocket for SOS live location.
func (h *SOSHandler) WebSocketHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	sosIDStr := r.URL.Query().Get("sos_id")
	role := r.URL.Query().Get("role") // "victim" or "responder"

	sosID, err := uuid.Parse(sosIDStr)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"Invalid SOS ID"}`))
		conn.Close()
		return
	}

	client := ws.NewClient(h.hub, conn, sosID, role)
	h.hub.Register <- client

	go client.WritePump()
	go client.ReadPump(func(msg []byte) {
		// Handle incoming location updates from victim
		if role == "victim" {
			var loc models.LocationUpdate
			if err := json.Unmarshal(msg, &loc); err != nil {
				return
			}

			// Store in database
			_, err := h.db.Exec(r.Context(),
				`INSERT INTO live_locations (sos_request_id, latitude, longitude, accuracy_meters, speed_mps, heading, battery_percent, captured_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				sosID, loc.Latitude, loc.Longitude, loc.AccuracyMeters,
				loc.SpeedMPS, loc.Heading, loc.BatteryPercent, time.Unix(loc.Timestamp/1000, 0),
			)
			if err != nil {
				log.Printf("Failed to store location: %v", err)
			}

			// Broadcast to all responders watching this SOS
			h.hub.BroadcastToSOS(sosID, msg)
		}
	})
}

// TriggerSOS creates a new SOS emergency request.
func (h *SOSHandler) TriggerSOS(w http.ResponseWriter, r *http.Request) {
	var req models.TriggerSOSRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.TriggerMethod == "" {
		req.TriggerMethod = models.TriggerButton
	}

	// Find nearest police station using PostGIS
	var stationID uuid.UUID
	var stationName string
	var distanceKm float64
	err := h.db.QueryRow(r.Context(),
		`SELECT id, name, 
		        ST_Distance(
		            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
		            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
		        ) / 1000.0 AS distance_km
		 FROM police_stations 
		 WHERE is_active = TRUE
		 ORDER BY ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
		 LIMIT 1`,
		req.Longitude, req.Latitude,
	).Scan(&stationID, &stationName, &distanceKm)

	var nearestStationID *uuid.UUID
	var stationDistKm *float64
	if err == nil {
		nearestStationID = &stationID
		stationDistKm = &distanceKm
	}

	// Find zone for this location
	var zoneID *uuid.UUID
	var foundZoneID uuid.UUID
	err = h.db.QueryRow(r.Context(),
		`SELECT id FROM zones
		 WHERE deleted_at IS NULL
		 ORDER BY ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
		 LIMIT 1`,
		req.Longitude, req.Latitude,
	).Scan(&foundZoneID)
	if err == nil {
		zoneID = &foundZoneID
	}

	// Calculate auto-purge time (72 hours from now)
	purgeAt := time.Now().Add(72 * time.Hour)

	// Create SOS request
	var sos models.SOSRequest
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO sos_requests (user_id, device_id, zone_id, trigger_lat, trigger_lng, 
		                           trigger_method, nearest_station_id, station_distance_km, auto_purge_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, status, trigger_lat, trigger_lng, trigger_method, created_at`,
		nil, req.DeviceID, zoneID, req.Latitude, req.Longitude,
		req.TriggerMethod, nearestStationID, stationDistKm, purgeAt,
	).Scan(&sos.ID, &sos.Status, &sos.TriggerLat, &sos.TriggerLng, &sos.TriggerMethod, &sos.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create SOS request: "+err.Error())
		return
	}

	sos.NearestStationID = nearestStationID
	sos.StationDistanceKm = stationDistKm
	if nearestStationID != nil {
		sos.NearestStationName = &stationName
	}

	// Start auto-escalation timer (60 seconds)
	go h.startEscalationTimer(sos.ID)

	log.Printf("🆘 SOS TRIGGERED: %s | Location: %.4f, %.4f | Nearest station: %s (%.1f km)",
		sos.ID, req.Latitude, req.Longitude,
		stationName, distanceKm)

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"sos":                 sos,
		"nearest_station":     stationName,
		"station_distance_km": fmt.Sprintf("%.1f", distanceKm),
		"ws_url":              fmt.Sprintf("/ws/sos?sos_id=%s&role=victim", sos.ID),
		"message":             "🚨 SOS activated. Police station notified. Stay safe.",
	})
}

// escalationDelay is how long an SOS may sit unacknowledged before it escalates.
const escalationDelay = 60 * time.Second

// startEscalationTimer escalates an SOS if it is not acknowledged within
// escalationDelay.
//
// This runs in its own goroutine, which has two consequences:
//   - It outlives the HTTP request, so it cannot use r.Context(); it needs its
//     own context. Passing nil here panics inside pgx.
//   - A panic here is not covered by the Recoverer middleware (that only wraps
//     the request goroutine) and would take down the whole process, so the
//     recover below is deliberate — this is the emergency path.
func (h *SOSHandler) startEscalationTimer(sosID uuid.UUID) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("⚠️  Recovered panic in SOS escalation timer for %s: %v", sosID, rec)
		}
	}()

	time.Sleep(escalationDelay)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var status models.SOSStatus
	if err := h.db.QueryRow(ctx,
		"SELECT status FROM sos_requests WHERE id = $1", sosID,
	).Scan(&status); err != nil {
		log.Printf("⚠️  SOS %s escalation check failed: %v", sosID, err)
		return
	}

	if status != models.SOSActive {
		return
	}

	log.Printf("⚠️  SOS %s not acknowledged after %s — ESCALATING", sosID, escalationDelay)
	if _, err := h.db.Exec(ctx,
		`UPDATE sos_requests SET status = 'escalated', escalation_level = 1, escalated_at = NOW()
		 WHERE id = $1`, sosID); err != nil {
		log.Printf("⚠️  SOS %s escalation update failed: %v", sosID, err)
	}
}

// Acknowledge marks an SOS as acknowledged by a responder.
func (h *SOSHandler) Acknowledge(w http.ResponseWriter, r *http.Request) {
	sosIDStr := chi.URLParam(r, "id")
	sosID, err := uuid.Parse(sosIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid SOS ID")
		return
	}

	result, err := h.db.Exec(r.Context(),
		`UPDATE sos_requests 
		 SET status = 'acknowledged', acknowledged_at = NOW(),
		     response_time_seconds = EXTRACT(EPOCH FROM (NOW() - created_at))::int
		 WHERE id = $1 AND status IN ('active', 'escalated')`, sosID)
	if err != nil || result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "SOS not found or already acknowledged")
		return
	}

	log.Printf("✅ SOS %s acknowledged", sosID)
	writeJSON(w, http.StatusOK, map[string]string{"message": "SOS acknowledged"})
}

// Resolve marks an SOS as resolved.
func (h *SOSHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	sosIDStr := chi.URLParam(r, "id")
	sosID, err := uuid.Parse(sosIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid SOS ID")
		return
	}

	var req models.SOSResolveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	status := models.SOSResolved
	if req.FalseAlarm {
		status = models.SOSFalseAlarm
	}

	result, err := h.db.Exec(r.Context(),
		`UPDATE sos_requests 
		 SET status = $2, resolved_at = NOW(), resolution_notes = $3
		 WHERE id = $1 AND status IN ('active', 'acknowledged', 'escalated')`,
		sosID, status, req.Notes)
	if err != nil || result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "SOS not found or already resolved")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "SOS resolved"})
}

// ListActive returns all active SOS requests.
func (h *SOSHandler) ListActive(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(),
		`SELECT s.id, s.trigger_lat, s.trigger_lng, s.status, s.trigger_method,
		        s.station_distance_km, s.escalation_level, s.created_at,
		        ps.name AS station_name, z.name AS zone_name
		 FROM sos_requests s
		 LEFT JOIN police_stations ps ON s.nearest_station_id = ps.id
		 LEFT JOIN zones z ON s.zone_id = z.id
		 WHERE s.status IN ('active', 'escalated')
		 ORDER BY s.created_at DESC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch SOS requests")
		return
	}
	defer rows.Close()

	var requests []models.SOSRequest
	for rows.Next() {
		var s models.SOSRequest
		err := rows.Scan(
			&s.ID, &s.TriggerLat, &s.TriggerLng, &s.Status, &s.TriggerMethod,
			&s.StationDistanceKm, &s.EscalationLevel, &s.CreatedAt,
			&s.NearestStationName, &s.ZoneName,
		)
		if err != nil {
			continue
		}
		requests = append(requests, s)
	}

	if requests == nil {
		requests = []models.SOSRequest{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"active_sos": requests,
		"count":      len(requests),
	})
}

// GetLocations returns the location trail for an SOS request.
func (h *SOSHandler) GetLocations(w http.ResponseWriter, r *http.Request) {
	sosIDStr := chi.URLParam(r, "id")
	sosID, err := uuid.Parse(sosIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid SOS ID")
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit, _ := strconv.Atoi(limitStr)
	if limit < 1 || limit > 500 {
		limit = 100
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, latitude, longitude, accuracy_meters, speed_mps, heading, battery_percent, captured_at
		 FROM live_locations
		 WHERE sos_request_id = $1
		 ORDER BY captured_at DESC
		 LIMIT $2`, sosID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch locations")
		return
	}
	defer rows.Close()

	var locations []models.LiveLocation
	for rows.Next() {
		var loc models.LiveLocation
		err := rows.Scan(
			&loc.ID, &loc.Latitude, &loc.Longitude, &loc.AccuracyMeters,
			&loc.SpeedMPS, &loc.Heading, &loc.BatteryPercent, &loc.CapturedAt,
		)
		if err != nil {
			continue
		}
		locations = append(locations, loc)
	}

	if locations == nil {
		locations = []models.LiveLocation{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"locations": locations,
		"count":     len(locations),
	})
}
