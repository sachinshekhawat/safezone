package database

import (
	"context"
	"fmt"
	"log"

	"github.com/redis/go-redis/v9"
)

// NewRedisClient creates a new Redis client connection.
func NewRedisClient(ctx context.Context, redisURL string) (*redis.Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("unable to parse Redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	// Verify connection
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("unable to ping Redis: %w", err)
	}

	log.Println("✅ Connected to Redis")
	return client, nil
}

// CloseRedis gracefully closes the Redis client.
func CloseRedis(client *redis.Client) {
	if client != nil {
		_ = client.Close()
		log.Println("🔌 Redis connection closed")
	}
}
