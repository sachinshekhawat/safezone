package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// HealthHandler handles health check endpoints.
type HealthHandler struct {
	db *pgxpool.Pool
	// redis is nil when Redis is unavailable — it is an optional dependency,
	// so its absence degrades caching but not core functionality.
	redis *redis.Client
}

// NewHealthHandler creates a new HealthHandler. redisClient may be nil.
func NewHealthHandler(db *pgxpool.Pool, redisClient *redis.Client) *HealthHandler {
	return &HealthHandler{db: db, redis: redisClient}
}

// Check returns the health status of the service.
func (h *HealthHandler) Check(w http.ResponseWriter, r *http.Request) {
	// Check database connectivity
	dbStatus := "healthy"
	if err := h.db.Ping(r.Context()); err != nil {
		dbStatus = "unhealthy: " + err.Error()
	}

	// Redis is optional; distinguish "absent" from "present but broken".
	redisStatus := "not_configured"
	if h.redis != nil {
		if err := h.redis.Ping(r.Context()).Err(); err != nil {
			redisStatus = "unhealthy: " + err.Error()
		} else {
			redisStatus = "healthy"
		}
	}

	response := map[string]interface{}{
		"status":   "ok",
		"service":  "safezone-india-api",
		"version":  "0.1.0",
		"database": dbStatus,
		"redis":    redisStatus,
	}

	writeJSON(w, http.StatusOK, response)
}

// writeJSON writes a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeError writes a JSON error response.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{
		"code":    status,
		"message": message,
	})
}
