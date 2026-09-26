package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSanitizeMigrationName(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"add_widgets", "add_widgets"},
		{"Add Widgets", "add_widgets"},
		{"Test Scratch Migration!", "test_scratch_migration"},
		{"  trailing-and-leading  ", "trailing_and_leading"},
		{"CamelCaseName", "camelcasename"},
		{"multiple___underscores", "multiple___underscores"},
		{"weird!!!chars@@@here", "weird_chars_here"},
		{"123_numeric_start", "123_numeric_start"},
		{"!!!", ""},
		{"", ""},
	}

	for _, c := range cases {
		if got := sanitizeMigrationName(c.in); got != c.want {
			t.Errorf("sanitizeMigrationName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestLoadMigrationsPairsUpAndDown(t *testing.T) {
	dir := t.TempDir()

	files := []string{
		"000001_init_extensions.up.sql",
		"000001_init_extensions.down.sql",
		"000002_core_entities.up.sql",
		"000002_core_entities.down.sql",
		"000010_later_one.up.sql",
		"000010_later_one.down.sql",
		// Files that must be ignored:
		"README.md",
		"notes.txt",
		"000003_missing_suffix.sql",
	}
	for _, f := range files {
		if err := os.WriteFile(filepath.Join(dir, f), []byte("-- test\n"), 0o644); err != nil {
			t.Fatalf("writing %s: %v", f, err)
		}
	}

	migrations, err := loadMigrations(dir)
	if err != nil {
		t.Fatalf("loadMigrations returned error: %v", err)
	}

	if len(migrations) != 3 {
		t.Fatalf("expected 3 migrations, got %d: %+v", len(migrations), migrations)
	}

	// Must be sorted ascending by version.
	wantVersions := []int64{1, 2, 10}
	for i, want := range wantVersions {
		if migrations[i].Version != want {
			t.Errorf("migrations[%d].Version = %d, want %d", i, migrations[i].Version, want)
		}
	}

	if migrations[0].Name != "init_extensions" {
		t.Errorf("migrations[0].Name = %q, want %q", migrations[0].Name, "init_extensions")
	}

	// Every discovered migration must have both directions resolved.
	for _, m := range migrations {
		if m.UpPath == "" {
			t.Errorf("migration %06d_%s missing UpPath", m.Version, m.Name)
		}
		if m.DownPath == "" {
			t.Errorf("migration %06d_%s missing DownPath", m.Version, m.Name)
		}
	}
}

func TestLoadMigrationsDetectsMissingDownFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "000001_only_up.up.sql"), []byte("-- x\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	migrations, err := loadMigrations(dir)
	if err != nil {
		t.Fatalf("loadMigrations returned error: %v", err)
	}
	if len(migrations) != 1 {
		t.Fatalf("expected 1 migration, got %d", len(migrations))
	}
	if migrations[0].DownPath != "" {
		t.Errorf("expected empty DownPath, got %q", migrations[0].DownPath)
	}
}

func TestLoadMigrationsEmptyDir(t *testing.T) {
	migrations, err := loadMigrations(t.TempDir())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(migrations) != 0 {
		t.Errorf("expected no migrations, got %d", len(migrations))
	}
}

func TestLoadMigrationsMissingDir(t *testing.T) {
	if _, err := loadMigrations(filepath.Join(t.TempDir(), "does-not-exist")); err == nil {
		t.Error("expected an error for a missing directory, got nil")
	}
}

// The real migrations directory must parse cleanly and have matching pairs,
// otherwise `make migrate-up` will fail at runtime.
func TestRealMigrationsDirectoryIsWellFormed(t *testing.T) {
	dir := filepath.Join("..", "..", migrationsDir)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		t.Skipf("migrations dir not found at %s", dir)
	}

	migrations, err := loadMigrations(dir)
	if err != nil {
		t.Fatalf("loadMigrations(%s): %v", dir, err)
	}
	if len(migrations) == 0 {
		t.Fatal("no migrations discovered in the real migrations directory")
	}

	for i, m := range migrations {
		if m.UpPath == "" {
			t.Errorf("migration %06d_%s is missing its .up.sql file", m.Version, m.Name)
		}
		if m.DownPath == "" {
			t.Errorf("migration %06d_%s is missing its .down.sql file", m.Version, m.Name)
		}
		// Versions must be contiguous starting at 1 so ordering is unambiguous.
		if want := int64(i + 1); m.Version != want {
			t.Errorf("migration at index %d has version %d, want contiguous %d", i, m.Version, want)
		}
	}
}
