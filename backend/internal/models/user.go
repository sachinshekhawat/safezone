package models

import (
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ========================
// User
// ========================

// UserRole represents the role of a user in the system.
type UserRole string

const (
	RoleAdmin         UserRole = "admin"
	RolePoliceOfficer UserRole = "police_officer"
	RoleAnalyst       UserRole = "analyst"
	RolePublic        UserRole = "public"
)

// Gender is a citizen's self-declared gender.
//
// GenderUnspecified exists so that using the app never requires disclosing it.
type Gender string

const (
	GenderFemale      Gender = "female"
	GenderMale        Gender = "male"
	GenderOther       Gender = "other"
	GenderUnspecified Gender = "prefer_not_to_say"
)

// ValidGender reports whether g is one of the enum values in the database.
func ValidGender(g Gender) bool {
	switch g {
	case GenderFemale, GenderMale, GenderOther, GenderUnspecified:
		return true
	}
	return false
}

// AuthProvider records how an account authenticates.
type AuthProvider string

const (
	AuthProviderPassword AuthProvider = "password" // staff: email + password
	AuthProviderPhoneOTP AuthProvider = "phone_otp"
	AuthProviderGoogle   AuthProvider = "google"
)

// ConsentVersion identifies the privacy notice a user agreed to.
//
// Bump this when the notice materially changes: consent recorded against an
// older version is no longer consent to the new terms, and the app must ask
// again rather than silently carrying the old agreement forward.
const ConsentVersion = "2026-09-1"

// User represents an authenticated user — staff or citizen.
type User struct {
	ID           uuid.UUID `json:"id"`
	Email        *string   `json:"email,omitempty"`
	PasswordHash *string   `json:"-"` // never serialize
	Name         string    `json:"name"`
	Role         UserRole  `json:"role"`

	// Citizen fields.
	Phone           *string      `json:"phone,omitempty"`
	PhoneVerifiedAt *time.Time   `json:"phone_verified_at,omitempty"`
	Gender          *Gender      `json:"gender,omitempty"`
	CityID          *uuid.UUID   `json:"city_id,omitempty"`
	AuthProvider    AuthProvider `json:"auth_provider"`
	GoogleSub       *string      `json:"-"` // internal identifier, not for clients
	AvatarURL       *string      `json:"avatar_url,omitempty"`

	ConsentDataAt     *time.Time `json:"consent_data_at,omitempty"`
	ConsentLocationAt *time.Time `json:"consent_location_at,omitempty"`
	ConsentVersion    *string    `json:"consent_version,omitempty"`

	// Staff fields.
	Department     *string    `json:"department,omitempty"`
	BadgeNumber    *string    `json:"badge_number,omitempty"`
	AssignedCityID *uuid.UUID `json:"assigned_city_id,omitempty"`

	IsActive    bool       `json:"is_active"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty"`
	IsDeleted   bool       `json:"-"`
}

// ProfileComplete reports whether the client can proceed straight to the app.
//
// A citizen account is only usable once we know who she is, which city's data to
// show, and that she agreed to us processing her data. Google sign-in returns a
// name but no city and no consent, so the client must finish onboarding.
func (u *User) ProfileComplete() bool {
	if u.Role != RolePublic {
		return true // staff accounts are provisioned, not self-onboarded
	}
	return u.Name != "" && u.CityID != nil && u.ConsentDataAt != nil
}

// ========================
// Auth — email + password (staff)
// ========================

// LoginRequest is the request body for user login.
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
}

// RegisterRequest is the request body for staff user registration.
type RegisterRequest struct {
	Email      string   `json:"email" validate:"required,email"`
	Password   string   `json:"password" validate:"required,min=8"`
	Name       string   `json:"name" validate:"required"`
	Role       UserRole `json:"role"`
	Department *string  `json:"department,omitempty"`
}

// ========================
// Auth — phone OTP (citizens)
// ========================

// OTPRequest asks for a verification code to be sent to a phone number.
type OTPRequest struct {
	Phone string `json:"phone" validate:"required"`
}

// OTPRequestResponse confirms a code was issued.
type OTPRequestResponse struct {
	Sent          bool `json:"sent"`
	ExpiresInSecs int  `json:"expires_in_secs"`
	// RetryAfterSecs is how long the caller must wait before requesting again.
	RetryAfterSecs int `json:"retry_after_secs"`
	// DevCode is populated ONLY when no SMS provider is configured, so the flow
	// is testable locally. It is never set when SMS_PROVIDER is set.
	DevCode string `json:"dev_code,omitempty"`
}

// OTPVerifyRequest submits a code for a phone number.
type OTPVerifyRequest struct {
	Phone string `json:"phone" validate:"required"`
	Code  string `json:"code" validate:"required"`
}

// PhoneRegisterRequest completes citizen onboarding after the phone is verified.
//
// Consent is carried as explicit booleans rather than being inferred from the
// request arriving: the server records a timestamp only when the user actually
// ticked the box.
type PhoneRegisterRequest struct {
	Phone           string    `json:"phone" validate:"required"`
	Code            string    `json:"code" validate:"required"`
	Name            string    `json:"name" validate:"required"`
	Gender          Gender    `json:"gender" validate:"required"`
	CityID          uuid.UUID `json:"city_id" validate:"required"`
	ConsentData     bool      `json:"consent_data"`
	ConsentLocation bool      `json:"consent_location"`
}

// ========================
// Auth — Google
// ========================

// GoogleAuthRequest carries the ID token returned by Google Sign-In.
type GoogleAuthRequest struct {
	IDToken string `json:"id_token" validate:"required"`
	// Optional profile completion, sent when the client already knows these —
	// lets sign-up finish in one round trip instead of two.
	Gender          *Gender    `json:"gender,omitempty"`
	CityID          *uuid.UUID `json:"city_id,omitempty"`
	ConsentData     bool       `json:"consent_data"`
	ConsentLocation bool       `json:"consent_location"`
}

// ProfileUpdateRequest fills in whatever onboarding still needs.
type ProfileUpdateRequest struct {
	Name            *string    `json:"name,omitempty"`
	Gender          *Gender    `json:"gender,omitempty"`
	CityID          *uuid.UUID `json:"city_id,omitempty"`
	ConsentData     *bool      `json:"consent_data,omitempty"`
	ConsentLocation *bool      `json:"consent_location,omitempty"`
}

// ========================
// Responses
// ========================

// AuthResponse is the response after successful authentication.
type AuthResponse struct {
	Token        string `json:"token"`
	RefreshToken string `json:"refresh_token"`
	User         User   `json:"user"`
	ExpiresAt    int64  `json:"expires_at"`
	// ProfileComplete tells the client whether to land on the app or on the
	// remaining onboarding step.
	ProfileComplete bool `json:"profile_complete"`
	// IsNewUser distinguishes sign-up from sign-in for the client's copy.
	IsNewUser bool `json:"is_new_user"`
}

// TokenClaims holds JWT custom claims.
type TokenClaims struct {
	UserID uuid.UUID `json:"user_id"`
	Email  string    `json:"email"`
	Role   UserRole  `json:"role"`
}

// ========================
// Phone normalisation
// ========================

// indianMobile matches a 10-digit Indian mobile number. Indian mobile numbers
// never begin with 0-5, which is what makes landlines and typos rejectable.
var indianMobile = regexp.MustCompile(`^[6-9]\d{9}$`)

// NormalizePhone converts user input to E.164, defaulting to +91 (India).
//
// Normalising at the edge matters more than it looks: "+919812345678",
// "09812345678" and "98123 45678" are the same person, and without this they
// would each create a separate account and each fail to receive the other's OTP.
func NormalizePhone(raw string) (string, bool) {
	s := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' || r == '+' {
			return r
		}
		return -1 // drop spaces, dashes, brackets
	}, raw)

	switch {
	case strings.HasPrefix(s, "+91"):
		s = strings.TrimPrefix(s, "+91")
	case strings.HasPrefix(s, "91") && len(s) == 12:
		s = strings.TrimPrefix(s, "91")
	case strings.HasPrefix(s, "0") && len(s) == 11:
		s = strings.TrimPrefix(s, "0")
	case strings.HasPrefix(s, "+"):
		// A non-Indian number. Keep it as given rather than mangling it, but
		// only if it is plausibly E.164.
		digits := strings.TrimPrefix(s, "+")
		if len(digits) >= 8 && len(digits) <= 15 {
			return s, true
		}
		return "", false
	}

	if !indianMobile.MatchString(s) {
		return "", false
	}
	return "+91" + s, true
}
