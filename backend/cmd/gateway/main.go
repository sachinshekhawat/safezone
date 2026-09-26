package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/safezone-india/backend/internal/config"
	"github.com/safezone-india/backend/internal/database"
	"github.com/safezone-india/backend/internal/googleauth"
	"github.com/safezone-india/backend/internal/handlers"
	"github.com/safezone-india/backend/internal/middleware"
	"github.com/safezone-india/backend/internal/sms"
	ws "github.com/safezone-india/backend/internal/websocket"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("🛡️  SafeZone India API Gateway starting...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Connect to PostgreSQL
	dbPool, err := database.NewPostgresPool(ctx, cfg.DatabaseURL())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close(dbPool)

	// Connect to Redis (optional — don't fail if unavailable)
	redisClient, err := database.NewRedisClient(ctx, cfg.RedisURL)
	if err != nil {
		log.Printf("⚠️  Redis not available (non-fatal): %v", err)
		redisClient = nil
	} else {
		defer database.CloseRedis(redisClient)
	}

	// Initialize WebSocket hub for SOS
	hub := ws.NewHub()
	go hub.Run()

	// Initialize handlers
	healthHandler := handlers.NewHealthHandler(dbPool, redisClient)
	authHandler := handlers.NewAuthHandler(dbPool, cfg.JWTSecret, cfg.JWTExpiryHours, cfg.JWTRefreshExpiryDays)

	// Citizen sign-in. The SMS sender is swappable; with no provider configured
	// the OTP is logged and echoed in the response so local dev works.
	var smsSender sms.Sender
	if cfg.SMSProvider == "" {
		smsSender = sms.NewLogSender()
	} else {
		log.Fatalf("SMS_PROVIDER=%q is set but no provider implementation is wired up yet", cfg.SMSProvider)
	}
	phoneAuthHandler := handlers.NewPhoneAuthHandler(authHandler, smsSender)

	googleVerifier := googleauth.NewVerifier(
		cfg.GoogleIOSClientID, cfg.GoogleAndroidClientID, cfg.GoogleWebClientID,
	)
	if !googleVerifier.Configured() {
		log.Println("ℹ️  Google sign-in disabled — set GOOGLE_IOS_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID / GOOGLE_WEB_CLIENT_ID to enable.")
	}
	googleAuthHandler := handlers.NewGoogleAuthHandler(authHandler, googleVerifier)

	cityHandler := handlers.NewCityHandler(dbPool)
	zoneHandler := handlers.NewZoneHandler(dbPool)
	sosHandler := handlers.NewSOSHandler(dbPool, hub)

	// Rate limiter
	rateLimiter := middleware.NewRateLimiter(cfg.RateLimitRPM)

	// Create router
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.JSONContentType)
	r.Use(rateLimiter.Limit)

	// CORS
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.CORSAllowedOrigins},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Device-ID"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// ========================
	// Public routes (no auth)
	// ========================
	r.Get("/health", healthHandler.Check)
	r.Post("/api/v1/auth/login", authHandler.Login)
	r.Post("/api/v1/auth/register", authHandler.Register)

	// Citizen onboarding. Grouped so the OTP endpoints can carry a stricter
	// rate limit than the rest of the API: each call here can cost real money
	// and lands an unsolicited SMS on someone's phone.
	r.Route("/api/v1/auth/phone", func(r chi.Router) {
		r.Use(middleware.NewRateLimiter(cfg.RateLimitSOSRPM).Limit)
		r.Post("/otp", phoneAuthHandler.RequestOTP)
		r.Post("/verify", phoneAuthHandler.VerifyOTP)
		r.Post("/register", phoneAuthHandler.RegisterWithPhone)
	})

	r.Post("/api/v1/auth/google", googleAuthHandler.SignIn)
	r.Get("/api/v1/auth/google/status", googleAuthHandler.Status)

	// Public data endpoints
	r.Route("/api/v1/public", func(r chi.Router) {
		r.Get("/cities", cityHandler.List)
		// Registered before /cities/{id} so "nearest" is never parsed as an ID.
		r.Get("/cities/nearest", cityHandler.NearestCity)
		r.Get("/cities/{id}", cityHandler.GetByID)
		r.Get("/zones", zoneHandler.List)
		r.Get("/zones/{id}", zoneHandler.GetByID)
		r.Get("/zones/city/{cityId}", zoneHandler.ListByCity)
		r.Post("/zones/nearby", zoneHandler.FindNearby)
		r.Get("/zones/{id}/risk", zoneHandler.GetRiskScore)
	})

	// SOS endpoint — no auth required (emergency access)
	r.Post("/api/v1/sos/trigger", sosHandler.TriggerSOS)
	// Batched location flush for mobile background tasks. Also unauthenticated:
	// the victim has no account, and the unguessable SOS UUID is the capability.
	// Reading these points back stays behind auth (see sosHandler.Routes).
	r.Post("/api/v1/sos/{id}/locations", sosHandler.IngestLocations)

	// WebSocket for SOS live location
	r.Get("/ws/sos", sosHandler.WebSocketHandler)

	// ========================
	// Protected routes (JWT required)
	// ========================
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(middleware.JWTAuth(cfg.JWTSecret))

		// Authenticated user
		r.Get("/auth/me", authHandler.Me)
		// Finishes onboarding for accounts that arrived without a full profile
		// (Google sign-up gives us a name and nothing else).
		r.Patch("/auth/me", authHandler.UpdateProfile)

		// City management (admin only)
		r.Route("/cities", func(r chi.Router) {
			r.Use(middleware.RequireRole("admin", "analyst"))
			r.Mount("/", cityHandler.Routes())
		})

		// Zone management
		r.Route("/zones", func(r chi.Router) {
			r.Use(middleware.RequireRole("admin", "analyst"))
			r.Mount("/", zoneHandler.Routes())
		})

		// SOS management (police + admin)
		r.Route("/sos", func(r chi.Router) {
			r.Use(middleware.RequireRole("admin", "police_officer"))
			r.Mount("/", sosHandler.Routes())
		})
	})

	// ========================
	// Start server
	// ========================
	server := &http.Server{
		Addr:         ":" + cfg.GatewayPort,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("🛑 Shutting down server...")
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer shutdownCancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Fatalf("Server shutdown error: %v", err)
		}
	}()

	log.Printf("🚀 API Gateway running on http://localhost:%s", cfg.GatewayPort)
	log.Printf("📡 WebSocket endpoint: ws://localhost:%s/ws/sos", cfg.GatewayPort)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}

	log.Println("👋 Server stopped")
}
