package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds all application configuration.
type Config struct {
	// Database
	DBHost     string
	DBPort     int
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	// Redis
	RedisURL string

	// JWT
	JWTSecret            string
	JWTExpiryHours       int
	JWTRefreshExpiryDays int

	// Gateway
	GatewayPort string
	Environment string

	// CORS
	CORSAllowedOrigins string

	// AI Service
	AIServiceURL string

	// Rate Limiting
	RateLimitRPM    int
	RateLimitSOSRPM int

	// Google Sign-In. One client ID per platform — the same app has a
	// different OAuth client on iOS, Android and web, and all three can appear
	// in an ID token's `aud`.
	GoogleIOSClientID     string
	GoogleAndroidClientID string
	GoogleWebClientID     string

	// SMS provider for phone OTPs. Empty means codes are logged, not sent.
	SMSProvider string
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	// Load .env file if it exists (development)
	_ = godotenv.Load("../.env")
	_ = godotenv.Load(".env")

	cfg := &Config{
		DBHost:               getEnv("DB_HOST", "localhost"),
		DBPort:               getEnvInt("DB_PORT", 5432),
		DBUser:               getEnv("DB_USER", "safezone"),
		DBPassword:           getEnv("DB_PASSWORD", "safezone_dev_password"),
		DBName:               getEnv("DB_NAME", "safezone_india"),
		DBSSLMode:            getEnv("DB_SSL_MODE", "disable"),
		RedisURL:             getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:            getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		JWTExpiryHours:       getEnvInt("JWT_EXPIRY_HOURS", 24),
		JWTRefreshExpiryDays: getEnvInt("JWT_REFRESH_EXPIRY_DAYS", 7),
		GatewayPort:          getEnv("GATEWAY_PORT", "8080"),
		Environment:          getEnv("GATEWAY_ENV", "development"),
		CORSAllowedOrigins:   getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000"),
		AIServiceURL:         getEnv("AI_SERVICE_URL", "http://localhost:8090"),
		RateLimitRPM:         getEnvInt("RATE_LIMIT_RPM", 60),
		RateLimitSOSRPM:      getEnvInt("RATE_LIMIT_SOS_RPM", 10),

		GoogleIOSClientID:     getEnv("GOOGLE_IOS_CLIENT_ID", ""),
		GoogleAndroidClientID: getEnv("GOOGLE_ANDROID_CLIENT_ID", ""),
		GoogleWebClientID:     getEnv("GOOGLE_WEB_CLIENT_ID", ""),

		SMSProvider: getEnv("SMS_PROVIDER", ""),
	}

	return cfg, nil
}

// DatabaseURL returns the PostgreSQL connection string.
func (c *Config) DatabaseURL() string {
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=%s",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName, c.DBSSLMode,
	)
}

// IsDevelopment returns true if running in development mode.
func (c *Config) IsDevelopment() bool {
	return c.Environment == "development"
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}
