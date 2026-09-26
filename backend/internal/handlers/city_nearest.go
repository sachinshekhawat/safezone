package handlers

import (
	"net/http"
	"strconv"

	"github.com/safezone-india/backend/internal/models"
)

// maxNearestCityDistanceKm bounds how far a user can be from a monitored city
// before we say we have no coverage for them. Beyond this the nearest city is
// not a useful proxy for where they actually are.
const maxNearestCityDistanceKm = 150.0

// NearestCity resolves a coordinate pair to the closest monitored city.
//
// Clients call this on first launch after being granted location permission, so
// they can show data for where the user actually is instead of defaulting to a
// fixed city. It is a public endpoint: the coordinate is used for the lookup and
// never stored.
//
//	GET /api/v1/public/cities/nearest?lat=19.07&lng=72.87
func (h *CityHandler) NearestCity(w http.ResponseWriter, r *http.Request) {
	latStr := r.URL.Query().Get("lat")
	lngStr := r.URL.Query().Get("lng")
	if latStr == "" || lngStr == "" {
		writeError(w, http.StatusBadRequest, "lat and lng query parameters are required")
		return
	}

	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil || lat < -90 || lat > 90 {
		writeError(w, http.StatusBadRequest, "lat must be a number between -90 and 90")
		return
	}
	lng, err := strconv.ParseFloat(lngStr, 64)
	if err != nil || lng < -180 || lng > 180 {
		writeError(w, http.StatusBadRequest, "lng must be a number between -180 and 180")
		return
	}

	var (
		city       models.City
		distanceKm float64
		zoneCount  int
	)

	// <-> is PostGIS's KNN distance operator, so this uses the spatial index
	// rather than scanning and sorting every city.
	err = h.db.QueryRow(r.Context(),
		`SELECT c.id, c.name, c.state, c.latitude, c.longitude, c.population,
		        c.literacy_rate, c.female_literacy_rate, c.tier,
		        c.created_at, c.updated_at,
		        ST_Distance(
		            ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326)::geography,
		            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
		        ) / 1000.0 AS distance_km,
		        (SELECT COUNT(*) FROM zones z
		         WHERE z.city_id = c.id AND z.deleted_at IS NULL AND z.is_deleted = FALSE
		        ) AS zone_count
		 FROM cities c
		 WHERE c.deleted_at IS NULL AND c.is_deleted = FALSE
		 ORDER BY ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326)::geography
		          <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
		 LIMIT 1`,
		lng, lat,
	).Scan(
		&city.ID, &city.Name, &city.State, &city.Latitude, &city.Longitude,
		&city.Population, &city.LiteracyRate, &city.FemaleLiteracyRate, &city.Tier,
		&city.CreatedAt, &city.UpdatedAt, &distanceKm, &zoneCount,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to resolve nearest city")
		return
	}

	// Tell the client whether this city is close enough to be meaningful, rather
	// than silently showing someone in Kerala the data for a city 900 km away.
	withinCoverage := distanceKm <= maxNearestCityDistanceKm

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"city":               city,
		"distance_km":        round2(distanceKm),
		"zone_count":         zoneCount,
		"within_coverage":    withinCoverage,
		"coverage_radius_km": maxNearestCityDistanceKm,
	})
}

func round2(v float64) float64 {
	return float64(int64(v*100+0.5)) / 100
}
