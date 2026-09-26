package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/safezone-india/backend/internal/models"
)

type contextKey string

const UserContextKey contextKey = "user"

// JWTAuth creates a middleware that validates JWT tokens.
func JWTAuth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"code":401,"message":"Missing authorization header"}`, http.StatusUnauthorized)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				http.Error(w, `{"code":401,"message":"Invalid authorization header format"}`, http.StatusUnauthorized)
				return
			}

			tokenString := parts[1]
			token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				return []byte(jwtSecret), nil
			})

			if err != nil || !token.Valid {
				http.Error(w, `{"code":401,"message":"Invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(w, `{"code":401,"message":"Invalid token claims"}`, http.StatusUnauthorized)
				return
			}

			// Extract user info from claims.
			userIDStr, _ := claims["user_id"].(string)
			userID, err := uuid.Parse(userIDStr)
			if err != nil {
				http.Error(w, `{"code":401,"message":"Invalid user ID in token"}`, http.StatusUnauthorized)
				return
			}

			// Comma-ok on every claim. A citizen signing in with a phone number
			// has no email, so an unchecked assertion here panics on a perfectly
			// valid token — and an attacker could trigger the same with a
			// hand-rolled one.
			email, _ := claims["email"].(string)
			role, _ := claims["role"].(string)
			if role == "" {
				http.Error(w, `{"code":401,"message":"Invalid token claims"}`, http.StatusUnauthorized)
				return
			}

			tokenClaims := &models.TokenClaims{
				UserID: userID,
				Email:  email,
				Role:   models.UserRole(role),
			}

			ctx := context.WithValue(r.Context(), UserContextKey, tokenClaims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole creates a middleware that checks if the user has one of the required roles.
func RequireRole(roles ...models.UserRole) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(UserContextKey).(*models.TokenClaims)
			if !ok {
				http.Error(w, `{"code":401,"message":"Unauthorized"}`, http.StatusUnauthorized)
				return
			}

			for _, role := range roles {
				if claims.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}

			http.Error(w, `{"code":403,"message":"Insufficient permissions"}`, http.StatusForbidden)
		})
	}
}

// GetUserFromContext extracts user claims from the request context.
func GetUserFromContext(ctx context.Context) (*models.TokenClaims, bool) {
	claims, ok := ctx.Value(UserContextKey).(*models.TokenClaims)
	return claims, ok
}

// GenerateToken creates a new JWT token for a user.
func GenerateToken(user *models.User, secret string, expiryHours int) (string, error) {
	// Citizens have no email. Emit "" rather than null so the claim always has a
	// consistent type, and carry the phone separately for audit trails.
	email := ""
	if user.Email != nil {
		email = *user.Email
	}
	phone := ""
	if user.Phone != nil {
		phone = *user.Phone
	}

	claims := jwt.MapClaims{
		"user_id": user.ID.String(),
		"email":   email,
		"phone":   phone,
		"role":    string(user.Role),
		"exp":     time.Now().Add(time.Duration(expiryHours) * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// GenerateRefreshToken creates a refresh token with longer expiry.
func GenerateRefreshToken(user *models.User, secret string, expiryDays int) (string, error) {
	claims := jwt.MapClaims{
		"user_id": user.ID.String(),
		"type":    "refresh",
		"exp":     time.Now().Add(time.Duration(expiryDays) * 24 * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}
