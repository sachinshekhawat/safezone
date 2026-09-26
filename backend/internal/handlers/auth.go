package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/safezone-india/backend/internal/middleware"
	"github.com/safezone-india/backend/internal/models"
	"golang.org/x/crypto/bcrypt"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	db            *pgxpool.Pool
	jwtSecret     string
	jwtExpiry     int
	refreshExpiry int
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(db *pgxpool.Pool, jwtSecret string, jwtExpiry, refreshExpiry int) *AuthHandler {
	return &AuthHandler{
		db:            db,
		jwtSecret:     jwtSecret,
		jwtExpiry:     jwtExpiry,
		refreshExpiry: refreshExpiry,
	}
}

// userColumns is the single definition of which user columns we read.
//
// Kept in one place because every auth path (password, OTP, Google, /me) has to
// scan the same shape — duplicating the list is how a column silently goes
// missing from one flow.
const userColumns = `
	id, email, password_hash, name, role,
	phone, phone_verified_at, gender, city_id, auth_provider, google_sub, avatar_url,
	consent_data_at, consent_location_at, consent_version,
	department, badge_number, assigned_city_id,
	is_active, last_login_at, created_at, updated_at`

// scanUser reads a row produced by a SELECT of userColumns.
func scanUser(row pgx.Row) (models.User, error) {
	var u models.User
	err := row.Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role,
		&u.Phone, &u.PhoneVerifiedAt, &u.Gender, &u.CityID, &u.AuthProvider, &u.GoogleSub, &u.AvatarURL,
		&u.ConsentDataAt, &u.ConsentLocationAt, &u.ConsentVersion,
		&u.Department, &u.BadgeNumber, &u.AssignedCityID,
		&u.IsActive, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt,
	)
	return u, err
}

// issueTokens mints an access + refresh token pair and records the login.
func (h *AuthHandler) issueTokens(ctx context.Context, user models.User, isNew bool) (models.AuthResponse, error) {
	token, err := middleware.GenerateToken(&user, h.jwtSecret, h.jwtExpiry)
	if err != nil {
		return models.AuthResponse{}, err
	}

	refreshToken, err := middleware.GenerateRefreshToken(&user, h.jwtSecret, h.refreshExpiry)
	if err != nil {
		return models.AuthResponse{}, err
	}

	// Best-effort: a failed bookkeeping update must not deny a valid login.
	_, _ = h.db.Exec(ctx, "UPDATE users SET last_login_at = $1 WHERE id = $2", time.Now(), user.ID)

	return models.AuthResponse{
		Token:           token,
		RefreshToken:    refreshToken,
		User:            user,
		ExpiresAt:       time.Now().Add(time.Duration(h.jwtExpiry) * time.Hour).Unix(),
		ProfileComplete: user.ProfileComplete(),
		IsNewUser:       isNew,
	}, nil
}

// Login authenticates a staff user with email + password.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "Email and password are required")
		return
	}

	user, err := scanUser(h.db.QueryRow(r.Context(),
		`SELECT `+userColumns+`
		 FROM users
		 WHERE email = $1 AND deleted_at IS NULL AND is_deleted = FALSE`, req.Email))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	if !user.IsActive {
		writeError(w, http.StatusForbidden, "Account is deactivated")
		return
	}

	// An account created through phone or Google has no password. Rejecting
	// here (rather than letting bcrypt compare against an empty hash) keeps the
	// two cases from being confusable.
	if user.PasswordHash == nil {
		writeError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	resp, err := h.issueTokens(r.Context(), user, false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// Register creates a new email + password account.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" || req.Name == "" {
		writeError(w, http.StatusBadRequest, "Email, password, and name are required")
		return
	}

	// Default role to public
	if req.Role == "" {
		req.Role = models.RolePublic
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	user, err := scanUser(h.db.QueryRow(r.Context(),
		`INSERT INTO users (email, password_hash, name, role, department, auth_provider)
		 VALUES ($1, $2, $3, $4, $5, 'password')
		 RETURNING `+userColumns,
		req.Email, string(hashedPassword), req.Name, req.Role, req.Department))
	if err != nil {
		writeError(w, http.StatusConflict, "Email already registered")
		return
	}

	resp, err := h.issueTokens(r.Context(), user, true)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	writeJSON(w, http.StatusCreated, resp)
}

// Me returns the current authenticated user's profile.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	user, err := scanUser(h.db.QueryRow(r.Context(),
		`SELECT `+userColumns+` FROM users WHERE id = $1 AND deleted_at IS NULL`, claims.UserID))
	if err != nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}

	writeJSON(w, http.StatusOK, user)
}

// UpdateProfile fills in onboarding fields for the authenticated user.
//
// This is the path a Google sign-up takes: Google gives us a name and nothing
// else, so city, gender and consent still have to be collected.
func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.ProfileUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Gender != nil && !models.ValidGender(*req.Gender) {
		writeError(w, http.StatusBadRequest, "Invalid gender")
		return
	}

	if req.CityID != nil {
		if err := h.assertCityExists(r.Context(), req.CityID.String()); err != nil {
			writeError(w, http.StatusBadRequest, "Unknown city")
			return
		}
	}

	// Consent is only ever *granted* here by an explicit true. Withdrawal is a
	// separate, auditable action — silently clearing a timestamp because a
	// client omitted the field would destroy the record that consent was given.
	now := time.Now()
	var consentData, consentLocation *time.Time
	if req.ConsentData != nil && *req.ConsentData {
		consentData = &now
	}
	if req.ConsentLocation != nil && *req.ConsentLocation {
		consentLocation = &now
	}

	user, err := scanUser(h.db.QueryRow(r.Context(),
		`UPDATE users SET
			name = COALESCE(NULLIF($2, ''), name),
			gender = COALESCE($3, gender),
			city_id = COALESCE($4, city_id),
			consent_data_at = COALESCE($5, consent_data_at),
			consent_location_at = COALESCE($6, consent_location_at),
			consent_version = CASE WHEN $5::timestamptz IS NOT NULL OR $6::timestamptz IS NOT NULL
			                       THEN $7 ELSE consent_version END,
			updated_at = NOW()
		 WHERE id = $1 AND deleted_at IS NULL
		 RETURNING `+userColumns,
		claims.UserID, derefStr(req.Name), req.Gender, req.CityID,
		consentData, consentLocation, models.ConsentVersion))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update profile")
		return
	}

	writeJSON(w, http.StatusOK, user)
}

// assertCityExists returns an error unless the city is present and not deleted.
func (h *AuthHandler) assertCityExists(ctx context.Context, cityID string) error {
	var exists bool
	err := h.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM cities
		 WHERE id = $1 AND deleted_at IS NULL AND is_deleted = FALSE)`, cityID).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return errUnknownCity
	}
	return nil
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
