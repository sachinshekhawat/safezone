package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/safezone-india/backend/internal/googleauth"
	"github.com/safezone-india/backend/internal/models"
)

// GoogleAuthHandler handles Google sign-in and sign-up.
//
// Sign-in and sign-up are one endpoint on purpose. The client cannot know
// whether a Google account already exists here, and making the user pick the
// wrong one of two buttons only to be told "already registered" is a dead end.
// The response reports is_new_user so the UI can still word itself correctly.
type GoogleAuthHandler struct {
	*AuthHandler
	verifier *googleauth.Verifier
}

// NewGoogleAuthHandler creates a GoogleAuthHandler.
func NewGoogleAuthHandler(auth *AuthHandler, verifier *googleauth.Verifier) *GoogleAuthHandler {
	return &GoogleAuthHandler{AuthHandler: auth, verifier: verifier}
}

// SignIn exchanges a Google ID token for SafeZone tokens.
func (h *GoogleAuthHandler) SignIn(w http.ResponseWriter, r *http.Request) {
	var req models.GoogleAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.IDToken == "" {
		writeError(w, http.StatusBadRequest, "Missing Google ID token")
		return
	}

	claims, err := h.verifier.Verify(r.Context(), req.IDToken)
	if err != nil {
		if errors.Is(err, googleauth.ErrNotConfigured) {
			// 501 rather than 500: the request was fine, the server simply has
			// no Google credentials. This lets the app show "not available"
			// instead of a generic failure.
			writeError(w, http.StatusNotImplemented,
				"Google sign-in is not configured on this server")
			return
		}
		log.Printf("google id token rejected: %v", err)
		writeError(w, http.StatusUnauthorized, "Could not verify your Google account")
		return
	}

	if claims.Email != "" && !claims.EmailVerified {
		writeError(w, http.StatusUnauthorized, "Your Google email is not verified")
		return
	}

	if req.Gender != nil && !models.ValidGender(*req.Gender) {
		writeError(w, http.StatusBadRequest, "Invalid gender")
		return
	}
	if req.CityID != nil {
		if err := h.assertCityExists(r.Context(), req.CityID.String()); err != nil {
			writeError(w, http.StatusBadRequest, "Select a city from the list")
			return
		}
	}

	now := time.Now()
	var consentData, consentLocation *time.Time
	if req.ConsentData {
		consentData = &now
	}
	if req.ConsentLocation {
		consentLocation = &now
	}

	// Look up by google_sub first, then by email. The email fallback matters:
	// a citizen who signed up with phone and later taps "Continue with Google"
	// using the same address should land in her existing account, not a
	// duplicate one — but only when Google says the address is verified,
	// otherwise this becomes an account-takeover path.
	var emailForLink *string
	if claims.Email != "" && claims.EmailVerified {
		emailForLink = &claims.Email
	}

	user, err := scanUser(h.db.QueryRow(r.Context(),
		`SELECT `+userColumns+`
		 FROM users
		 WHERE deleted_at IS NULL AND is_deleted = FALSE
		   AND (google_sub = $1 OR ($2::text IS NOT NULL AND email = $2))
		 ORDER BY (google_sub = $1) DESC
		 LIMIT 1`, claims.Subject, emailForLink))

	if err != nil {
		// No account yet — create one. Google gives a name and avatar but no
		// city and no consent, so the client still has onboarding to finish
		// unless it supplied those fields in this request.
		created, cerr := scanUser(h.db.QueryRow(r.Context(),
			`INSERT INTO users
			   (name, email, google_sub, avatar_url, gender, city_id, role, auth_provider,
			    consent_data_at, consent_location_at, consent_version)
			 VALUES ($1, $2, $3, $4, $5, $6, 'public', 'google', $7, $8, $9)
			 RETURNING `+userColumns,
			claims.Name, emailForLink, claims.Subject, nullIfEmpty(claims.Picture),
			req.Gender, req.CityID, consentData, consentLocation,
			consentVersionIf(consentData != nil || consentLocation != nil)))
		if cerr != nil {
			log.Printf("google sign-up failed for sub %s: %v", claims.Subject, cerr)
			writeError(w, http.StatusInternalServerError, "Could not create your account")
			return
		}

		resp, terr := h.issueTokens(r.Context(), created, true)
		if terr != nil {
			writeError(w, http.StatusInternalServerError, "Failed to generate token")
			return
		}
		writeJSON(w, http.StatusCreated, resp)
		return
	}

	if !user.IsActive {
		writeError(w, http.StatusForbidden, "Account is deactivated")
		return
	}

	// Existing account: attach the Google identity if it arrived by email, and
	// apply any profile fields the client sent. COALESCE throughout so a
	// sign-in never blanks data the user already has.
	user, err = scanUser(h.db.QueryRow(r.Context(),
		`UPDATE users SET
			google_sub = COALESCE(google_sub, $2),
			avatar_url = COALESCE($3, avatar_url),
			gender = COALESCE($4, gender),
			city_id = COALESCE($5, city_id),
			consent_data_at = COALESCE(consent_data_at, $6),
			consent_location_at = COALESCE(consent_location_at, $7),
			consent_version = CASE
				WHEN consent_version IS NULL AND ($6::timestamptz IS NOT NULL OR $7::timestamptz IS NOT NULL)
				THEN $8 ELSE consent_version END,
			updated_at = NOW()
		 WHERE id = $1
		 RETURNING `+userColumns,
		user.ID, claims.Subject, nullIfEmpty(claims.Picture),
		req.Gender, req.CityID, consentData, consentLocation, models.ConsentVersion))
	if err != nil {
		log.Printf("google sign-in link failed for sub %s: %v", claims.Subject, err)
		writeError(w, http.StatusInternalServerError, "Could not sign you in")
		return
	}

	resp, err := h.issueTokens(r.Context(), user, false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// Status lets the client hide the Google buttons when the server cannot honour
// them, rather than showing a button that always fails.
func (h *GoogleAuthHandler) Status(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"enabled": h.verifier.Configured()})
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func consentVersionIf(any bool) *string {
	if !any {
		return nil
	}
	v := models.ConsentVersion
	return &v
}
