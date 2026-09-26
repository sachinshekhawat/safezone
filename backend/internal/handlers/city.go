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

// CityHandler handles city-related HTTP requests.
type CityHandler struct {
	db *pgxpool.Pool
}

// NewCityHandler creates a new CityHandler.
func NewCityHandler(db *pgxpool.Pool) *CityHandler {
	return &CityHandler{db: db}
}

// Routes returns the chi router for city endpoints.
func (h *CityHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.List)
	r.Get("/{id}", h.GetByID)
	r.Post("/", h.Create)
	r.Put("/{id}", h.Update)
	r.Delete("/{id}", h.SoftDelete)
	return r
}

// List returns all cities with pagination.
func (h *CityHandler) List(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	// Count total
	var total int
	err := h.db.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM cities WHERE deleted_at IS NULL AND is_deleted = FALSE",
	).Scan(&total)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to count cities")
		return
	}

	// Fetch cities
	rows, err := h.db.Query(r.Context(),
		`SELECT id, name, state, latitude, longitude, population, literacy_rate, 
		        female_literacy_rate, tier, created_at, updated_at
		 FROM cities 
		 WHERE deleted_at IS NULL AND is_deleted = FALSE
		 ORDER BY name ASC
		 LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch cities")
		return
	}
	defer rows.Close()

	var cities []models.City
	for rows.Next() {
		var c models.City
		err := rows.Scan(
			&c.ID, &c.Name, &c.State, &c.Latitude, &c.Longitude,
			&c.Population, &c.LiteracyRate, &c.FemaleLiteracyRate,
			&c.Tier, &c.CreatedAt, &c.UpdatedAt,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to scan city")
			return
		}
		cities = append(cities, c)
	}

	if cities == nil {
		cities = []models.City{}
	}

	writeJSON(w, http.StatusOK, models.CityListResponse{
		Cities: cities,
		Total:  total,
		Page:   page,
		Limit:  limit,
	})
}

// GetByID returns a single city by ID.
func (h *CityHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid city ID")
		return
	}

	var c models.City
	err = h.db.QueryRow(r.Context(),
		`SELECT id, name, state, latitude, longitude, population, literacy_rate,
		        female_literacy_rate, tier, created_at, updated_at
		 FROM cities 
		 WHERE id = $1 AND deleted_at IS NULL AND is_deleted = FALSE`, id,
	).Scan(
		&c.ID, &c.Name, &c.State, &c.Latitude, &c.Longitude,
		&c.Population, &c.LiteracyRate, &c.FemaleLiteracyRate,
		&c.Tier, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		writeError(w, http.StatusNotFound, "City not found")
		return
	}

	writeJSON(w, http.StatusOK, c)
}

// Create adds a new city.
func (h *CityHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateCityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Name == "" || req.State == "" {
		writeError(w, http.StatusBadRequest, "Name and state are required")
		return
	}

	var c models.City
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO cities (name, state, latitude, longitude, population, literacy_rate, female_literacy_rate, tier)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, name, state, latitude, longitude, population, literacy_rate, female_literacy_rate, tier, created_at, updated_at`,
		req.Name, req.State, req.Latitude, req.Longitude,
		req.Population, req.LiteracyRate, req.FemaleLiteracyRate, req.Tier,
	).Scan(
		&c.ID, &c.Name, &c.State, &c.Latitude, &c.Longitude,
		&c.Population, &c.LiteracyRate, &c.FemaleLiteracyRate,
		&c.Tier, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create city: "+err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, c)
}

// Update modifies an existing city.
func (h *CityHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid city ID")
		return
	}

	var req models.UpdateCityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var c models.City
	err = h.db.QueryRow(r.Context(),
		`UPDATE cities SET
			name = COALESCE($2, name),
			state = COALESCE($3, state),
			latitude = COALESCE($4, latitude),
			longitude = COALESCE($5, longitude),
			population = COALESCE($6, population),
			literacy_rate = COALESCE($7, literacy_rate),
			female_literacy_rate = COALESCE($8, female_literacy_rate),
			tier = COALESCE($9, tier)
		 WHERE id = $1 AND deleted_at IS NULL AND is_deleted = FALSE
		 RETURNING id, name, state, latitude, longitude, population, literacy_rate, female_literacy_rate, tier, created_at, updated_at`,
		id, req.Name, req.State, req.Latitude, req.Longitude,
		req.Population, req.LiteracyRate, req.FemaleLiteracyRate, req.Tier,
	).Scan(
		&c.ID, &c.Name, &c.State, &c.Latitude, &c.Longitude,
		&c.Population, &c.LiteracyRate, &c.FemaleLiteracyRate,
		&c.Tier, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		writeError(w, http.StatusNotFound, "City not found or update failed")
		return
	}

	writeJSON(w, http.StatusOK, c)
}

// SoftDelete marks a city as deleted.
func (h *CityHandler) SoftDelete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid city ID")
		return
	}

	result, err := h.db.Exec(r.Context(),
		"UPDATE cities SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL", id)
	if err != nil || result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "City not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "City deleted successfully"})
}
