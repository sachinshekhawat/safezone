// Command migrate applies, rolls back, and scaffolds SQL migrations.
//
// This is a self-contained runner built on pgx (already a project dependency)
// rather than golang-migrate, whose test-dependency graph (dktest -> docker ->
// x/tools) forces the go directive above the 1.22 target this project and its
// Dockerfile are pinned to.
//
// It reads the same file layout golang-migrate uses, so the existing
// migrations/NNNNNN_name.{up,down}.sql files work unchanged:
//
//	migrations/000001_init_extensions.up.sql
//	migrations/000001_init_extensions.down.sql
//
// Applied versions are tracked one-row-per-migration in schema_migrations, and
// every migration runs inside a transaction guarded by a session advisory lock.
//
// Usage:
//
//	go run cmd/migrate/main.go up               # apply all pending migrations
//	go run cmd/migrate/main.go down             # roll back the most recent migration
//	go run cmd/migrate/main.go down-all         # roll back everything (needs CONFIRM_DOWN_ALL=yes)
//	go run cmd/migrate/main.go status           # show applied and pending migrations
//	go run cmd/migrate/main.go create <name>    # scaffold a new up/down pair
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/safezone-india/backend/internal/config"
	"github.com/safezone-india/backend/internal/database"
)

const (
	migrationsDir = "migrations"
	// Arbitrary but fixed key so concurrent migrate processes serialize.
	advisoryLockKey = 947_120_183
)

// migration is one version with its up/down file paths.
type migration struct {
	Version  int64
	Name     string
	UpPath   string
	DownPath string
}

var migrationFilePattern = regexp.MustCompile(`^(\d+)_(.+)\.(up|down)\.sql$`)

func main() {
	log.SetFlags(0)

	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}
	command := os.Args[1]

	// `create` only touches the filesystem — no database required.
	if command == "create" {
		if len(os.Args) < 3 {
			log.Fatal("❌ create requires a name, e.g. make migrate-create NAME=add_widgets")
		}
		if err := createMigration(strings.Join(os.Args[2:], "_")); err != nil {
			log.Fatalf("❌ %v", err)
		}
		return
	}

	// Refuse destructive operations before touching the database at all.
	if command == "down-all" && os.Getenv("CONFIRM_DOWN_ALL") != "yes" {
		log.Fatal("❌ Refusing to drop the entire schema. Re-run with CONFIRM_DOWN_ALL=yes if you are certain.")
	}

	migrations, err := loadMigrations(migrationsDir)
	if err != nil {
		log.Fatalf("❌ %v", err)
	}
	if len(migrations) == 0 {
		log.Fatalf("❌ No migrations found in %s/ (run from the backend/ directory)", migrationsDir)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("❌ Failed to load config: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	pool, err := database.NewPostgresPool(ctx, cfg.DatabaseURL())
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}
	defer database.Close(pool)

	// Hold one connection for the whole run so the advisory lock stays valid.
	conn, err := pool.Acquire(ctx)
	if err != nil {
		log.Fatalf("❌ Failed to acquire connection: %v", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", advisoryLockKey); err != nil {
		log.Fatalf("❌ Failed to acquire migration lock: %v", err)
	}
	defer func() {
		unlockCtx, unlockCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer unlockCancel()
		if _, err := conn.Exec(unlockCtx, "SELECT pg_advisory_unlock($1)", advisoryLockKey); err != nil {
			log.Printf("⚠️  Failed to release migration lock: %v", err)
		}
	}()

	if err := ensureVersionTable(ctx, conn.Conn()); err != nil {
		log.Fatalf("❌ %v", err)
	}

	applied, err := appliedVersions(ctx, conn.Conn())
	if err != nil {
		log.Fatalf("❌ %v", err)
	}

	switch command {
	case "up":
		err = runUp(ctx, conn.Conn(), migrations, applied)
	case "down":
		err = runDown(ctx, conn.Conn(), migrations, applied, 1)
	case "down-all":
		err = runDown(ctx, conn.Conn(), migrations, applied, len(applied))
	case "status", "version":
		printStatus(migrations, applied)
	default:
		log.Printf("❌ Unknown command: %s", command)
		usage()
		os.Exit(1)
	}

	if err != nil {
		log.Fatalf("❌ %v", err)
	}
}

// ensureVersionTable creates the bookkeeping table if it does not exist.
func ensureVersionTable(ctx context.Context, conn *pgx.Conn) error {
	_, err := conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    BIGINT      PRIMARY KEY,
			name       TEXT        NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`)
	if err != nil {
		return fmt.Errorf("creating schema_migrations: %w", err)
	}
	return nil
}

func appliedVersions(ctx context.Context, conn *pgx.Conn) (map[int64]bool, error) {
	rows, err := conn.Query(ctx, "SELECT version FROM schema_migrations ORDER BY version")
	if err != nil {
		return nil, fmt.Errorf("reading applied versions: %w", err)
	}
	defer rows.Close()

	applied := make(map[int64]bool)
	for rows.Next() {
		var v int64
		if err := rows.Scan(&v); err != nil {
			return nil, fmt.Errorf("scanning version: %w", err)
		}
		applied[v] = true
	}
	return applied, rows.Err()
}

func runUp(ctx context.Context, conn *pgx.Conn, migrations []migration, applied map[int64]bool) error {
	pending := make([]migration, 0, len(migrations))
	for _, m := range migrations {
		if !applied[m.Version] {
			pending = append(pending, m)
		}
	}

	if len(pending) == 0 {
		log.Println("✅ Schema already up to date")
		printStatus(migrations, applied)
		return nil
	}

	for _, m := range pending {
		if m.UpPath == "" {
			return fmt.Errorf("migration %06d_%s has no .up.sql file", m.Version, m.Name)
		}
		sqlBytes, err := os.ReadFile(m.UpPath)
		if err != nil {
			return fmt.Errorf("reading %s: %w", m.UpPath, err)
		}

		log.Printf("⬆️  Applying %06d_%s", m.Version, m.Name)
		if err := inTx(ctx, conn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(sqlBytes)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx,
				"INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
				m.Version, m.Name)
			return err
		}); err != nil {
			return fmt.Errorf("applying %06d_%s: %w", m.Version, m.Name, err)
		}
		applied[m.Version] = true
	}

	log.Printf("✅ Applied %d migration(s)", len(pending))
	printStatus(migrations, applied)
	return nil
}

func runDown(ctx context.Context, conn *pgx.Conn, migrations []migration, applied map[int64]bool, steps int) error {
	// Roll back newest-first.
	ordered := make([]migration, len(migrations))
	copy(ordered, migrations)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Version > ordered[j].Version })

	rolled := 0
	for _, m := range ordered {
		if rolled >= steps {
			break
		}
		if !applied[m.Version] {
			continue
		}
		if m.DownPath == "" {
			return fmt.Errorf("migration %06d_%s has no .down.sql file; cannot roll back", m.Version, m.Name)
		}

		sqlBytes, err := os.ReadFile(m.DownPath)
		if err != nil {
			return fmt.Errorf("reading %s: %w", m.DownPath, err)
		}

		log.Printf("⬇️  Reverting %06d_%s", m.Version, m.Name)
		if err := inTx(ctx, conn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(sqlBytes)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, "DELETE FROM schema_migrations WHERE version = $1", m.Version)
			return err
		}); err != nil {
			return fmt.Errorf("reverting %06d_%s: %w", m.Version, m.Name, err)
		}
		delete(applied, m.Version)
		rolled++
	}

	if rolled == 0 {
		log.Println("✅ Nothing to roll back")
		return nil
	}
	log.Printf("✅ Rolled back %d migration(s)", rolled)
	printStatus(migrations, applied)
	return nil
}

// inTx runs fn inside a transaction, rolling back on any error.
func inTx(ctx context.Context, conn *pgx.Conn, fn func(pgx.Tx) error) error {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(ctx); rbErr != nil && !errors.Is(rbErr, pgx.ErrTxClosed) {
			return fmt.Errorf("%w (rollback also failed: %v)", err, rbErr)
		}
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

func printStatus(migrations []migration, applied map[int64]bool) {
	var current int64
	pending := 0
	for _, m := range migrations {
		if applied[m.Version] {
			if m.Version > current {
				current = m.Version
			}
		} else {
			pending++
		}
	}

	if current == 0 {
		log.Println("📋 Current version: none (no migrations applied)")
	} else {
		log.Printf("📋 Current version: %06d", current)
	}
	log.Printf("📋 Applied: %d   Pending: %d   Total: %d", len(applied), pending, len(migrations))

	if pending > 0 {
		for _, m := range migrations {
			if !applied[m.Version] {
				log.Printf("   • pending %06d_%s", m.Version, m.Name)
			}
		}
	}
}

// loadMigrations scans a migrations directory and pairs up/down files by version.
func loadMigrations(dir string) ([]migration, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", dir, err)
	}

	byVersion := make(map[int64]*migration)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		matches := migrationFilePattern.FindStringSubmatch(e.Name())
		if matches == nil {
			continue
		}

		version, err := strconv.ParseInt(matches[1], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid version in %s: %w", e.Name(), err)
		}

		m, ok := byVersion[version]
		if !ok {
			m = &migration{Version: version, Name: matches[2]}
			byVersion[version] = m
		}

		path := filepath.Join(dir, e.Name())
		if matches[3] == "up" {
			m.UpPath = path
		} else {
			m.DownPath = path
		}
	}

	result := make([]migration, 0, len(byVersion))
	for _, m := range byVersion {
		result = append(result, *m)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Version < result[j].Version })
	return result, nil
}

var nonSlugChars = regexp.MustCompile(`[^a-z0-9_]+`)

// sanitizeMigrationName converts a free-form name into a filesystem-safe slug.
func sanitizeMigrationName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	name = nonSlugChars.ReplaceAllString(name, "_")
	return strings.Trim(name, "_")
}

// createMigration scaffolds the next sequential up/down pair, matching the
// existing 000001_name.up.sql convention.
func createMigration(name string) error {
	name = sanitizeMigrationName(name)
	if name == "" {
		return errors.New("migration name is empty after sanitizing")
	}

	migrations, err := loadMigrations(migrationsDir)
	if err != nil {
		return err
	}

	var maxVersion int64
	for _, m := range migrations {
		if m.Version > maxVersion {
			maxVersion = m.Version
		}
	}

	next := fmt.Sprintf("%06d", maxVersion+1)
	for _, direction := range []string{"up", "down"} {
		path := filepath.Join(migrationsDir, fmt.Sprintf("%s_%s.%s.sql", next, name, direction))
		if _, err := os.Stat(path); err == nil {
			return fmt.Errorf("%s already exists", path)
		}
		header := fmt.Sprintf("-- Migration: %s_%s\n-- Description: TODO\n\n", next, name)
		if err := os.WriteFile(path, []byte(header), 0o644); err != nil {
			return fmt.Errorf("writing %s: %w", path, err)
		}
		log.Printf("✅ Created %s", path)
	}
	return nil
}

func usage() {
	log.Println(`SafeZone India — migration tool

Commands:
  up                 Apply all pending migrations
  down               Roll back the most recent migration
  down-all           Roll back every migration (requires CONFIRM_DOWN_ALL=yes)
  status             Show applied and pending migrations
  create <name>      Scaffold a new up/down migration pair`)
}
