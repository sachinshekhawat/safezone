package middleware

import (
	"net/http"
	"sync"
	"time"
)

// RateLimiter implements a simple in-memory rate limiter per IP.
type RateLimiter struct {
	requests map[string][]time.Time
	mu       sync.RWMutex
	limit    int
	window   time.Duration
}

// NewRateLimiter creates a new rate limiter.
func NewRateLimiter(requestsPerMinute int) *RateLimiter {
	rl := &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    requestsPerMinute,
		window:   time.Minute,
	}
	// Clean up old entries periodically
	go rl.cleanup()
	return rl
}

// Limit creates an HTTP middleware that rate limits requests per IP.
func (rl *RateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr

		rl.mu.Lock()
		now := time.Now()
		windowStart := now.Add(-rl.window)

		// Filter out old requests
		var recent []time.Time
		for _, t := range rl.requests[ip] {
			if t.After(windowStart) {
				recent = append(recent, t)
			}
		}

		if len(recent) >= rl.limit {
			rl.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"code":429,"message":"Rate limit exceeded. Please try again later."}`))
			return
		}

		recent = append(recent, now)
		rl.requests[ip] = recent
		rl.mu.Unlock()

		next.ServeHTTP(w, r)
	})
}

// cleanup periodically removes old entries from the rate limiter.
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-rl.window)
		for ip, times := range rl.requests {
			var recent []time.Time
			for _, t := range times {
				if t.After(cutoff) {
					recent = append(recent, t)
				}
			}
			if len(recent) == 0 {
				delete(rl.requests, ip)
			} else {
				rl.requests[ip] = recent
			}
		}
		rl.mu.Unlock()
	}
}
