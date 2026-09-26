package models

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestNormalizePhone(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
		ok   bool
	}{
		// The four spellings of one number that users actually type. All must
		// collapse to the same stored value or they become separate accounts.
		{"plain 10 digit", "9812345678", "+919812345678", true},
		{"with +91", "+919812345678", "+919812345678", true},
		{"with 91 prefix", "919812345678", "+919812345678", true},
		{"with leading zero", "09812345678", "+919812345678", true},
		{"with spaces", "98123 45678", "+919812345678", true},
		{"with dashes", "98123-45678", "+919812345678", true},
		{"with brackets and spaces", "(+91) 98123 45678", "+919812345678", true},

		// Indian mobile numbers never start below 6.
		{"starts with 5", "5812345678", "", false},
		{"starts with 0 after strip", "0123456789", "", false},
		{"landline-like", "1123456789", "", false},

		{"too short", "98123", "", false},
		{"too long", "98123456789012", "", false},
		{"empty", "", "", false},
		{"letters only", "notaphone", "", false},

		// Non-Indian numbers are kept verbatim rather than mangled into +91.
		{"uk number", "+447911123456", "+447911123456", true},
		{"us number", "+12025550123", "+12025550123", true},
		{"bogus international", "+1", "", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := NormalizePhone(tc.in)
			if ok != tc.ok {
				t.Fatalf("NormalizePhone(%q) ok = %v, want %v (got %q)", tc.in, ok, tc.ok, got)
			}
			if got != tc.want {
				t.Errorf("NormalizePhone(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestNormalizePhoneIsIdempotent(t *testing.T) {
	// Re-normalising a stored value must not corrupt it — this runs on every
	// sign-in, not just at registration.
	first, ok := NormalizePhone("09812345678")
	if !ok {
		t.Fatal("first normalisation failed")
	}
	second, ok := NormalizePhone(first)
	if !ok || second != first {
		t.Errorf("not idempotent: %q -> %q", first, second)
	}
}

func TestValidGender(t *testing.T) {
	valid := []Gender{GenderFemale, GenderMale, GenderOther, GenderUnspecified}
	for _, g := range valid {
		if !ValidGender(g) {
			t.Errorf("ValidGender(%q) = false, want true", g)
		}
	}

	// Anything outside the enum must be rejected before it reaches Postgres,
	// where it would surface as an opaque 500 instead of a field error.
	for _, g := range []Gender{"", "Female", "f", "unknown", "male "} {
		if ValidGender(g) {
			t.Errorf("ValidGender(%q) = true, want false", g)
		}
	}
}

func TestProfileComplete(t *testing.T) {
	now := time.Now()
	city := uuid.New()

	t.Run("citizen with everything", func(t *testing.T) {
		u := User{Role: RolePublic, Name: "Asha", CityID: &city, ConsentDataAt: &now}
		if !u.ProfileComplete() {
			t.Error("want complete")
		}
	})

	t.Run("citizen missing city", func(t *testing.T) {
		u := User{Role: RolePublic, Name: "Asha", ConsentDataAt: &now}
		if u.ProfileComplete() {
			t.Error("want incomplete without a city")
		}
	})

	t.Run("citizen missing consent", func(t *testing.T) {
		// This is the Google sign-up case: name and email arrive, consent does not.
		u := User{Role: RolePublic, Name: "Asha", CityID: &city}
		if u.ProfileComplete() {
			t.Error("want incomplete without consent")
		}
	})

	t.Run("citizen missing name", func(t *testing.T) {
		u := User{Role: RolePublic, CityID: &city, ConsentDataAt: &now}
		if u.ProfileComplete() {
			t.Error("want incomplete without a name")
		}
	})

	t.Run("staff account is always complete", func(t *testing.T) {
		// Staff are provisioned by an admin and never see the onboarding form,
		// so they must not be trapped in it.
		for _, role := range []UserRole{RoleAdmin, RolePoliceOfficer, RoleAnalyst} {
			u := User{Role: role, Name: "Officer"}
			if !u.ProfileComplete() {
				t.Errorf("role %q: want complete", role)
			}
		}
	})
}
