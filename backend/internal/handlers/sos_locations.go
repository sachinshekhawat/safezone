package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/safezone-india/backend/internal/models"
)

/*
Batched location ingest for mobile SOS.

Why this exists alongside the WebSocket:

The web client streams live location over /ws/sos, which is fine while a browser
tab is focused. On iOS and Android the socket is torn down as soon as the app is
backgrounded or the screen locks — exactly when an SOS matters most. A mobile
background-location task therefore cannot hold a socket open; it wakes up
periodically with a handful of buffered points and needs a plain HTTP endpoint to
flush them to.

So: WebSocket for the live dispatch view, this endpoint for durable ingest. Points
that arrive here are still broadcast to any connected dispatcher, so the two paths
converge.
*/

// maxLocationBatch caps a single flush. Background tasks that were offline for a
// while can accumulate a lot of points; this bounds the request size without
// rejecting a reasonable catch-up.
const maxLocationBatch = 200

// LocationBatchRequest is the body for a batched location flush.
type LocationBatchRequest struct {
	Points []models.LocationUpdate `json:"points"`
}

// IngestLocations accepts a batch of location points for an active SOS.
//
//	POST /api/v1/sos/{id}/locations
//
// Deliberately unauthenticated, matching TriggerSOS: a victim in an emergency has
// no account, and the SOS id acts as the capability. The id is a v4 UUID, so it
// is not guessable, and the endpoint only ever appends points to one SOS.
func (h *SOSHandler) IngestLocations(w http.ResponseWriter, r *http.Request) {
	sosID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid SOS ID")
		return
	}

	var req LocationBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if len(req.Points) == 0 {
		writeError(w, http.StatusBadRequest, "points must contain at least one location")
		return
	}
	if len(req.Points) > maxLocationBatch {
		writeError(w, http.StatusRequestEntityTooLarge,
			"too many points in one batch; send at most 200")
		return
	}

	// Only accept points for an SOS that is still open. Writing to a resolved or
	// purged SOS would silently retain location data we promised to delete.
	var status models.SOSStatus
	err = h.db.QueryRow(r.Context(),
		"SELECT status FROM sos_requests WHERE id = $1", sosID,
	).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "SOS request not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to look up SOS request")
		return
	}
	if status == models.SOSResolved || status == models.SOSFalseAlarm {
		writeError(w, http.StatusConflict,
			"This SOS is already closed; no further locations accepted")
		return
	}

	accepted := 0
	rejected := 0
	var latest *models.LocationUpdate

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context()) //nolint:errcheck // no-op once committed

	for i := range req.Points {
		p := req.Points[i]

		// Drop impossible coordinates rather than storing them; a stuck GPS
		// reporting 0,0 would otherwise drag a dispatcher to the Atlantic.
		if p.Latitude < -90 || p.Latitude > 90 || p.Longitude < -180 || p.Longitude > 180 ||
			(p.Latitude == 0 && p.Longitude == 0) {
			rejected++
			continue
		}

		capturedAt := time.Now()
		if p.Timestamp > 0 {
			// Client sends epoch milliseconds.
			capturedAt = time.UnixMilli(p.Timestamp)
			// Ignore clocks that are obviously wrong, but keep the point.
			if capturedAt.After(time.Now().Add(5 * time.Minute)) {
				capturedAt = time.Now()
			}
		}

		_, err = tx.Exec(r.Context(),
			`INSERT INTO live_locations
			     (sos_request_id, latitude, longitude, accuracy_meters,
			      speed_mps, heading, battery_percent, captured_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			sosID, p.Latitude, p.Longitude, p.AccuracyMeters,
			p.SpeedMPS, p.Heading, p.BatteryPercent, capturedAt,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to store location: "+err.Error())
			return
		}
		accepted++
		latest = &req.Points[i]
	}

	if accepted == 0 {
		writeError(w, http.StatusBadRequest, "No valid coordinates in batch")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to commit locations")
		return
	}

	// Push the newest point to any dispatcher watching this SOS live, so the
	// batched path and the socket path show the same thing.
	if latest != nil && h.hub != nil {
		if payload, err := json.Marshal(map[string]interface{}{
			"type":   "location",
			"sos_id": sosID,
			"lat":    latest.Latitude,
			"lng":    latest.Longitude,
			"ts":     latest.Timestamp,
			"source": "batch",
		}); err == nil {
			h.hub.BroadcastToSOS(sosID, payload)
		}
	}

	log.Printf("📍 SOS %s: ingested %d location point(s) (%d rejected)", sosID, accepted, rejected)

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"accepted": accepted,
		"rejected": rejected,
		"status":   status,
	})
}
