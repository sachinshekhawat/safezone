// Package googleauth verifies Google Sign-In ID tokens.
//
// Verification is done locally against Google's published signing keys rather
// than by calling the tokeninfo endpoint: tokeninfo adds a network round trip to
// every sign-in, is rate limited, and turns Google availability into a hard
// dependency of our login path.
package googleauth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	certsURL    = "https://www.googleapis.com/oauth2/v3/certs"
	cacheTTL    = 1 * time.Hour
	httpTimeout = 10 * time.Second
)

// Google signs with these two issuer strings; both are legitimate.
var validIssuers = map[string]bool{
	"accounts.google.com":         true,
	"https://accounts.google.com": true,
}

// ErrNotConfigured is returned when no Google client IDs were provided.
var ErrNotConfigured = errors.New("google sign-in is not configured")

// Claims is the subset of the ID token we rely on.
type Claims struct {
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
	Picture       string
}

// Verifier validates ID tokens for a fixed set of audiences.
type Verifier struct {
	// audiences holds every OAuth client ID that may appear in `aud`. iOS,
	// Android and web each have their own client ID for the same app, so a
	// single expected value would reject two of the three platforms.
	audiences map[string]bool

	// certsURL is a field rather than a constant so tests can serve their own
	// key set. Nothing in production should override it.
	certsURL string

	client *http.Client

	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

// NewVerifier builds a Verifier. Empty client IDs are ignored.
func NewVerifier(clientIDs ...string) *Verifier {
	auds := make(map[string]bool)
	for _, id := range clientIDs {
		if id != "" {
			auds[id] = true
		}
	}
	return &Verifier{
		audiences: auds,
		certsURL:  certsURL,
		client:    &http.Client{Timeout: httpTimeout},
		keys:      make(map[string]*rsa.PublicKey),
	}
}

// Configured reports whether at least one audience is known.
func (v *Verifier) Configured() bool { return len(v.audiences) > 0 }

// jwk is one entry of Google's JSON Web Key Set.
type jwk struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// refreshKeys fetches and caches Google's signing keys.
func (v *Verifier) refreshKeys(ctx context.Context) error {
	v.mu.RLock()
	fresh := time.Since(v.fetchedAt) < cacheTTL && len(v.keys) > 0
	v.mu.RUnlock()
	if fresh {
		return nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.certsURL, nil)
	if err != nil {
		return err
	}
	resp, err := v.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("google certs endpoint returned %d", resp.StatusCode)
	}

	var body struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return err
	}

	parsed := make(map[string]*rsa.PublicKey, len(body.Keys))
	for _, k := range body.Keys {
		if k.Kty != "RSA" {
			continue
		}
		nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		parsed[k.Kid] = &rsa.PublicKey{
			N: new(big.Int).SetBytes(nBytes),
			E: int(new(big.Int).SetBytes(eBytes).Int64()),
		}
	}

	if len(parsed) == 0 {
		return errors.New("no usable RSA keys in google certs response")
	}

	v.mu.Lock()
	v.keys = parsed
	v.fetchedAt = time.Now()
	v.mu.Unlock()
	return nil
}

func (v *Verifier) keyFor(kid string) (*rsa.PublicKey, bool) {
	v.mu.RLock()
	defer v.mu.RUnlock()
	k, ok := v.keys[kid]
	return k, ok
}

// Verify checks an ID token's signature, issuer, audience and expiry.
func (v *Verifier) Verify(ctx context.Context, idToken string) (*Claims, error) {
	if !v.Configured() {
		return nil, ErrNotConfigured
	}

	if err := v.refreshKeys(ctx); err != nil {
		return nil, fmt.Errorf("could not load google signing keys: %w", err)
	}

	token, err := jwt.Parse(idToken, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method %v", t.Header["alg"])
		}
		kid, _ := t.Header["kid"].(string)
		key, ok := v.keyFor(kid)
		if !ok {
			// Google rotates keys; a miss may just mean our cache is stale.
			v.mu.Lock()
			v.fetchedAt = time.Time{}
			v.mu.Unlock()
			if err := v.refreshKeys(ctx); err != nil {
				return nil, err
			}
			if key, ok = v.keyFor(kid); !ok {
				return nil, fmt.Errorf("unknown key id %q", kid)
			}
		}
		return key, nil
	}, jwt.WithValidMethods([]string{"RS256"}))
	if err != nil {
		return nil, fmt.Errorf("invalid id token: %w", err)
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid id token claims")
	}

	iss, _ := claims["iss"].(string)
	if !validIssuers[iss] {
		return nil, fmt.Errorf("unexpected issuer %q", iss)
	}

	// Audience must match one of our client IDs. Without this check any valid
	// Google token from any app in the world would authenticate here.
	aud, _ := claims["aud"].(string)
	if !v.audiences[aud] {
		return nil, errors.New("id token was not issued for this app")
	}

	sub, _ := claims["sub"].(string)
	if sub == "" {
		return nil, errors.New("id token has no subject")
	}

	email, _ := claims["email"].(string)
	// Google encodes this as a bool, but has historically sent the string
	// "true" through some paths, so accept both.
	emailVerified := false
	switch ev := claims["email_verified"].(type) {
	case bool:
		emailVerified = ev
	case string:
		emailVerified = ev == "true"
	}

	name, _ := claims["name"].(string)
	picture, _ := claims["picture"].(string)

	return &Claims{
		Subject:       sub,
		Email:         email,
		EmailVerified: emailVerified,
		Name:          name,
		Picture:       picture,
	}, nil
}
