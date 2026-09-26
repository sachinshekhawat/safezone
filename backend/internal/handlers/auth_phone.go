package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"math/big"
	"net"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/safezone-india/backend/internal/models"
	"github.com/safezone-india/backend/internal/sms"
)

var errUnknownCity = errors.New("unknown city")

// OTP policy.
const (
	otpLength      = 6
	otpTTL         = 5 * time.Minute
	otpMaxAttempts = 5
	// Minimum gap between requests for the same number. Long enough to stop an
	// SMS-bombing attack from using us as the weapon, short enough that a user
	// who genuinely missed the message is not stuck.
	otpResendGap = 60 * time.Second
	// Ceiling per number per day, independent of the gap above.
	otpDailyCap = 10
)

// PhoneAuthHandler handles citizen sign-in via phone OTP.
type PhoneAuthHandler struct {
	*AuthHandler
	sender sms.Sender
}

// NewPhoneAuthHandler creates a PhoneAuthHandler sharing the AuthHandler's config.
func NewPhoneAuthHandler(auth *AuthHandler, sender sms.Sender) *PhoneAuthHandler {
	return &PhoneAuthHandler{AuthHandler: auth, sender: sender}
}

// generateOTP returns a cryptographically random numeric code.
//
// math/rand would be predictable enough to guess the next code from a previous
// one, which defeats the entire mechanism.
func generateOTP() (string, error) {
	digits := make([]byte, otpLength)
	for i := range digits {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		digits[i] = byte('0' + n.Int64())
	}
	return string(digits), nil
}

func hashOTP(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

// clientIP extracts the caller address for abuse investigation.
func clientIP(r *http.Request) *string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if host == "" {
		return nil
	}
	return &host
}

// RequestOTP issues a verification code for a phone number.
func (h *PhoneAuthHandler) RequestOTP(w http.ResponseWriter, r *http.Request) {
	var req models.OTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	phone, ok := models.NormalizePhone(req.Phone)
	if !ok {
		writeError(w, http.StatusBadRequest, "Enter a valid 10-digit mobile number")
		return
	}

	// Throttle: most recent request for this number, and today's total.
	var lastRequested *time.Time
	var todayCount int
	err := h.db.QueryRow(r.Context(),
		`SELECT MAX(created_at),
		        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')
		 FROM phone_otps WHERE phone = $1`, phone).Scan(&lastRequested, &todayCount)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not process request")
		return
	}

	if lastRequested != nil {
		if wait := otpResendGap - time.Since(*lastRequested); wait > 0 {
			writeJSON(w, http.StatusTooManyRequests, models.OTPRequestResponse{
				Sent:           false,
				RetryAfterSecs: int(wait.Seconds()) + 1,
			})
			return
		}
	}

	if todayCount >= otpDailyCap {
		writeError(w, http.StatusTooManyRequests,
			"Too many codes requested for this number today. Try again tomorrow.")
		return
	}

	code, err := generateOTP()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not generate code")
		return
	}

	// Supersede any outstanding code so only the newest one can be used.
	if _, err := h.db.Exec(r.Context(),
		`UPDATE phone_otps SET consumed_at = NOW()
		 WHERE phone = $1 AND consumed_at IS NULL`, phone); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not process request")
		return
	}

	if _, err := h.db.Exec(r.Context(),
		`INSERT INTO phone_otps (phone, code_hash, expires_at, requested_ip)
		 VALUES ($1, $2, $3, $4)`,
		phone, hashOTP(code), time.Now().Add(otpTTL), clientIP(r)); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not store code")
		return
	}

	if err := h.sender.SendOTP(r.Context(), phone, code); err != nil {
		log.Printf("SMS delivery failed for %s: %v", phone, err)
		writeError(w, http.StatusBadGateway, "Could not send the code. Try again.")
		return
	}

	resp := models.OTPRequestResponse{
		Sent:           true,
		ExpiresInSecs:  int(otpTTL.Seconds()),
		RetryAfterSecs: int(otpResendGap.Seconds()),
	}
	// Only ever exposed when no real provider exists — otherwise this would
	// hand the code to anyone who can call the endpoint.
	if !h.sender.Configured() {
		resp.DevCode = code
	}

	writeJSON(w, http.StatusOK, resp)
}

// checkOTP validates the newest live code for phone.
//
// consume=false is used on the sign-up path: the code must be proven valid
// before we show the profile form, but it has to survive until that form is
// submitted. Wrong attempts are counted either way, so "peeking" is not a way
// to brute-force for free.
//
// Returns (0, "") on success, or an HTTP status and user-facing message.
func (h *PhoneAuthHandler) checkOTP(ctx context.Context, phone, code string, consume bool) (int, string) {
	var (
		id       string
		hash     string
		attempts int
		expires  time.Time
	)
	err := h.db.QueryRow(ctx,
		`SELECT id, code_hash, attempts, expires_at
		 FROM phone_otps
		 WHERE phone = $1 AND consumed_at IS NULL
		 ORDER BY created_at DESC LIMIT 1`, phone).Scan(&id, &hash, &attempts, &expires)
	if err != nil {
		return http.StatusBadRequest, "Request a new code"
	}

	if time.Now().After(expires) {
		return http.StatusBadRequest, "That code has expired. Request a new one."
	}

	if attempts >= otpMaxAttempts {
		// Burn the code rather than letting the attacker keep trying.
		_, _ = h.db.Exec(ctx, "UPDATE phone_otps SET consumed_at = NOW() WHERE id = $1", id)
		return http.StatusTooManyRequests, "Too many wrong attempts. Request a new code."
	}

	// Constant-time compare. A byte-by-byte early exit leaks how much of the
	// code was right through response timing.
	if subtle.ConstantTimeCompare([]byte(hash), []byte(hashOTP(code))) != 1 {
		_, _ = h.db.Exec(ctx, "UPDATE phone_otps SET attempts = attempts + 1 WHERE id = $1", id)
		return http.StatusUnauthorized, "That code is not right"
	}

	if consume {
		if _, err := h.db.Exec(ctx,
			"UPDATE phone_otps SET consumed_at = NOW() WHERE id = $1", id); err != nil {
			return http.StatusInternalServerError, "Could not verify the code"
		}
	}

	return 0, ""
}

// VerifyOTP checks a code and signs in an existing citizen.
//
// When the number has no account yet this returns 200 with registered=false
// rather than an error: the client's next step is the profile form, which is a
// normal outcome, not a failure.
func (h *PhoneAuthHandler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req models.OTPVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	phone, ok := models.NormalizePhone(req.Phone)
	if !ok {
		writeError(w, http.StatusBadRequest, "Enter a valid 10-digit mobile number")
		return
	}
	if req.Code == "" {
		writeError(w, http.StatusBadRequest, "Enter the code you received")
		return
	}

	// Does an account exist? Checked before consuming the code so that a new
	// user's code survives for the register call that immediately follows.
	var exists bool
	if err := h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM users
		 WHERE phone = $1 AND deleted_at IS NULL AND is_deleted = FALSE)`, phone).Scan(&exists); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not process request")
		return
	}

	if !exists {
		// Validate the code without consuming it, so the client can post the
		// profile form with the same code.
		if status, msg := h.checkOTP(r.Context(), phone, req.Code, false); status != 0 {
			writeError(w, status, msg)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"registered":       false,
			"phone":            phone,
			"profile_complete": false,
		})
		return
	}

	if status, msg := h.checkOTP(r.Context(), phone, req.Code, true); status != 0 {
		writeError(w, status, msg)
		return
	}

	user, err := scanUser(h.db.QueryRow(r.Context(),
		`UPDATE users SET phone_verified_at = NOW(), updated_at = NOW()
		 WHERE phone = $1 AND deleted_at IS NULL AND is_deleted = FALSE
		 RETURNING `+userColumns, phone))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not sign you in")
		return
	}

	if !user.IsActive {
		writeError(w, http.StatusForbidden, "Account is deactivated")
		return
	}

	resp, err := h.issueTokens(r.Context(), user, false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// RegisterWithPhone creates a citizen account after the code checks out.
func (h *PhoneAuthHandler) RegisterWithPhone(w http.ResponseWriter, r *http.Request) {
	var req models.PhoneRegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	phone, ok := models.NormalizePhone(req.Phone)
	if !ok {
		writeError(w, http.StatusBadRequest, "Enter a valid 10-digit mobile number")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "Your name is required")
		return
	}
	if !models.ValidGender(req.Gender) {
		writeError(w, http.StatusBadRequest, "Select a gender option")
		return
	}
	if req.CityID == uuid.Nil {
		writeError(w, http.StatusBadRequest, "Select your city")
		return
	}

	// Consent gate. The account is not created without it — this is the whole
	// legal basis for holding the phone number, so it cannot be optional or
	// pre-ticked on the client.
	if !req.ConsentData {
		writeError(w, http.StatusBadRequest,
			"We need your agreement to process your data before creating an account")
		return
	}

	if err := h.assertCityExists(r.Context(), req.CityID.String()); err != nil {
		writeError(w, http.StatusBadRequest, "Select a city from the list")
		return
	}

	// Guard against a second registration racing the first.
	var exists bool
	if err := h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM users
		 WHERE phone = $1 AND deleted_at IS NULL AND is_deleted = FALSE)`, phone).Scan(&exists); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not process request")
		return
	}
	if exists {
		writeError(w, http.StatusConflict, "This number is already registered. Sign in instead.")
		return
	}

	if status, msg := h.checkOTP(r.Context(), phone, req.Code, true); status != 0 {
		writeError(w, status, msg)
		return
	}

	now := time.Now()
	var locationConsent *time.Time
	if req.ConsentLocation {
		locationConsent = &now
	}

	user, err := scanUser(h.db.QueryRow(r.Context(),
		`INSERT INTO users
		   (name, phone, phone_verified_at, gender, city_id, role, auth_provider,
		    consent_data_at, consent_location_at, consent_version)
		 VALUES ($1, $2, NOW(), $3, $4, 'public', 'phone_otp', $5, $6, $7)
		 RETURNING `+userColumns,
		req.Name, phone, req.Gender, req.CityID, now, locationConsent, models.ConsentVersion))
	if err != nil {
		log.Printf("citizen registration failed for %s: %v", phone, err)
		writeError(w, http.StatusInternalServerError, "Could not create your account")
		return
	}

	resp, err := h.issueTokens(r.Context(), user, true)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	writeJSON(w, http.StatusCreated, resp)
}

// PurgeExpiredOTPs deletes codes past their usefulness.
//
// Retaining them would keep a list of phone numbers with no purpose, which the
// DPDP Act's storage-limitation principle does not permit.
func PurgeExpiredOTPs(ctx context.Context, db *pgxpool.Pool) (int64, error) {
	tag, err := db.Exec(ctx,
		`DELETE FROM phone_otps WHERE expires_at < NOW() - INTERVAL '1 day'`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
