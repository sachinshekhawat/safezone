package googleauth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	testKID = "test-key-1"
	testAud = "1234567890-ios.apps.googleusercontent.com"
)

// newTestVerifier returns a Verifier pointed at a local JWKS server holding the
// public half of the returned key.
func newTestVerifier(t *testing.T, audiences ...string) (*Verifier, *rsa.PrivateKey) {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	jwks := map[string]any{
		"keys": []map[string]string{{
			"kid": testKID,
			"kty": "RSA",
			"alg": "RS256",
			"use": "sig",
			"n":   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(jwks)
	}))
	t.Cleanup(srv.Close)

	v := NewVerifier(audiences...)
	v.certsURL = srv.URL
	return v, key
}

// signToken produces an RS256 token with the test key id.
func signToken(t *testing.T, key *rsa.PrivateKey, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = testKID
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return s
}

func validClaims() jwt.MapClaims {
	return jwt.MapClaims{
		"iss":            "https://accounts.google.com",
		"aud":            testAud,
		"sub":            "108234567890123456789",
		"email":          "asha@example.com",
		"email_verified": true,
		"name":           "Asha Sharma",
		"picture":        "https://lh3.googleusercontent.com/a/abc",
		"iat":            time.Now().Add(-time.Minute).Unix(),
		"exp":            time.Now().Add(time.Hour).Unix(),
	}
}

func TestVerifyAcceptsValidToken(t *testing.T) {
	v, key := newTestVerifier(t, testAud)

	claims, err := v.Verify(context.Background(), signToken(t, key, validClaims()))
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}

	if claims.Subject != "108234567890123456789" {
		t.Errorf("Subject = %q", claims.Subject)
	}
	if claims.Email != "asha@example.com" || !claims.EmailVerified {
		t.Errorf("email = %q verified = %v", claims.Email, claims.EmailVerified)
	}
	if claims.Name != "Asha Sharma" {
		t.Errorf("Name = %q", claims.Name)
	}
}

func TestVerifyRejectsWrongAudience(t *testing.T) {
	// The attack this blocks: a token minted for someone else's Google app is
	// perfectly valid and correctly signed. Without an audience check it would
	// authenticate here, letting any third-party app impersonate our users.
	v, key := newTestVerifier(t, testAud)

	claims := validClaims()
	claims["aud"] = "999-someone-elses-app.apps.googleusercontent.com"

	if _, err := v.Verify(context.Background(), signToken(t, key, claims)); err == nil {
		t.Fatal("token for a different audience was accepted")
	}
}

func TestVerifyRejectsWrongIssuer(t *testing.T) {
	v, key := newTestVerifier(t, testAud)

	claims := validClaims()
	claims["iss"] = "https://evil.example.com"

	if _, err := v.Verify(context.Background(), signToken(t, key, claims)); err == nil {
		t.Fatal("token with a foreign issuer was accepted")
	}
}

func TestVerifyAcceptsBothGoogleIssuerForms(t *testing.T) {
	for _, iss := range []string{"accounts.google.com", "https://accounts.google.com"} {
		v, key := newTestVerifier(t, testAud)
		claims := validClaims()
		claims["iss"] = iss
		if _, err := v.Verify(context.Background(), signToken(t, key, claims)); err != nil {
			t.Errorf("issuer %q rejected: %v", iss, err)
		}
	}
}

func TestVerifyRejectsExpiredToken(t *testing.T) {
	v, key := newTestVerifier(t, testAud)

	claims := validClaims()
	claims["exp"] = time.Now().Add(-time.Hour).Unix()
	claims["iat"] = time.Now().Add(-2 * time.Hour).Unix()

	if _, err := v.Verify(context.Background(), signToken(t, key, claims)); err == nil {
		t.Fatal("expired token was accepted")
	}
}

func TestVerifyRejectsAlgorithmConfusion(t *testing.T) {
	// The classic JWT attack: re-sign the token with HMAC, using the public key
	// (or anything else) as the secret, hoping the server will verify it
	// symmetrically. WithValidMethods + the SigningMethodRSA check must refuse.
	v, _ := newTestVerifier(t, testAud)

	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, validClaims())
	tok.Header["kid"] = testKID
	forged, err := tok.SignedString([]byte("public-key-as-secret"))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	if _, err := v.Verify(context.Background(), forged); err == nil {
		t.Fatal("HS256-signed token was accepted")
	}
}

func TestVerifyRejectsTokenSignedByAnotherKey(t *testing.T) {
	v, _ := newTestVerifier(t, testAud)

	other, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	if _, err := v.Verify(context.Background(), signToken(t, other, validClaims())); err == nil {
		t.Fatal("token signed by an unknown key was accepted")
	}
}

func TestVerifyRejectsMissingSubject(t *testing.T) {
	v, key := newTestVerifier(t, testAud)

	claims := validClaims()
	delete(claims, "sub")

	if _, err := v.Verify(context.Background(), signToken(t, key, claims)); err == nil {
		t.Fatal("token without a subject was accepted")
	}
}

func TestVerifyNotConfigured(t *testing.T) {
	v := NewVerifier() // no client IDs
	if v.Configured() {
		t.Fatal("Configured() should be false with no client IDs")
	}

	_, err := v.Verify(context.Background(), "anything")
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("err = %v, want ErrNotConfigured", err)
	}
}

func TestNewVerifierIgnoresEmptyClientIDs(t *testing.T) {
	// app.json commonly has only one of the three platform IDs filled in; the
	// empty ones must not become a wildcard audience.
	v := NewVerifier("", testAud, "")
	if !v.Configured() {
		t.Fatal("want configured")
	}
	if len(v.audiences) != 1 || !v.audiences[testAud] {
		t.Errorf("audiences = %v, want only %q", v.audiences, testAud)
	}
	if v.audiences[""] {
		t.Error("empty string must not be an accepted audience")
	}
}

func TestVerifyAcceptsStringEmailVerified(t *testing.T) {
	v, key := newTestVerifier(t, testAud)

	claims := validClaims()
	claims["email_verified"] = "true"

	got, err := v.Verify(context.Background(), signToken(t, key, claims))
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !got.EmailVerified {
		t.Error("string \"true\" should parse as verified")
	}
}

func TestVerifyMultipleAudiences(t *testing.T) {
	// iOS, Android and web client IDs must all be honoured by one server.
	const androidAud = "1234567890-android.apps.googleusercontent.com"
	v, key := newTestVerifier(t, testAud, androidAud)

	for _, aud := range []string{testAud, androidAud} {
		claims := validClaims()
		claims["aud"] = aud
		if _, err := v.Verify(context.Background(), signToken(t, key, claims)); err != nil {
			t.Errorf("audience %q rejected: %v", aud, err)
		}
	}
}
