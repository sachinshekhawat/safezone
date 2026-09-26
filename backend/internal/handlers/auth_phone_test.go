package handlers

import (
	"strings"
	"testing"
)

func TestGenerateOTPShape(t *testing.T) {
	for i := 0; i < 200; i++ {
		code, err := generateOTP()
		if err != nil {
			t.Fatalf("generateOTP: %v", err)
		}
		if len(code) != otpLength {
			t.Fatalf("length = %d, want %d (%q)", len(code), otpLength, code)
		}
		if strings.TrimFunc(code, func(r rune) bool { return r >= '0' && r <= '9' }) != "" {
			t.Fatalf("non-digit in code %q", code)
		}
	}
}

func TestGenerateOTPIsNotPredictable(t *testing.T) {
	// A weak generator shows up as repeats in a small sample. With 10^6 possible
	// codes, 500 draws should essentially never collide; if they do, the source
	// is not random and an attacker can predict the next code.
	seen := make(map[string]bool, 500)
	dupes := 0
	for i := 0; i < 500; i++ {
		code, err := generateOTP()
		if err != nil {
			t.Fatalf("generateOTP: %v", err)
		}
		if seen[code] {
			dupes++
		}
		seen[code] = true
	}
	if dupes > 1 {
		t.Errorf("%d duplicate codes in 500 draws — generator is not random enough", dupes)
	}

	// All digits should appear across the sample. A generator stuck on a subset
	// would shrink the keyspace dramatically.
	var all strings.Builder
	for code := range seen {
		all.WriteString(code)
	}
	for d := '0'; d <= '9'; d++ {
		if !strings.ContainsRune(all.String(), d) {
			t.Errorf("digit %q never generated across 500 codes", d)
		}
	}
}

func TestHashOTP(t *testing.T) {
	const code = "123456"

	h := hashOTP(code)
	if len(h) != 64 {
		t.Fatalf("hash length = %d, want 64 hex chars", len(h))
	}
	if h == code || strings.Contains(h, code) {
		t.Fatal("hash must not contain the plaintext code")
	}

	if hashOTP(code) != h {
		t.Error("hash is not deterministic")
	}
	if hashOTP("123457") == h {
		t.Error("different codes produced the same hash")
	}
}

func TestNullIfEmpty(t *testing.T) {
	if nullIfEmpty("") != nil {
		t.Error(`nullIfEmpty("") should be nil so the column stays NULL, not ''`)
	}
	got := nullIfEmpty("https://example.com/a.png")
	if got == nil || *got != "https://example.com/a.png" {
		t.Errorf("nullIfEmpty passed through incorrectly: %v", got)
	}
}

func TestConsentVersionIf(t *testing.T) {
	if consentVersionIf(false) != nil {
		t.Error("no consent given: version must stay NULL")
	}
	if v := consentVersionIf(true); v == nil || *v == "" {
		t.Error("consent given: a version must be recorded")
	}
}

func TestDerefStr(t *testing.T) {
	if derefStr(nil) != "" {
		t.Error("nil should deref to empty string")
	}
	s := "Asha"
	if derefStr(&s) != "Asha" {
		t.Error("non-nil deref failed")
	}
}
