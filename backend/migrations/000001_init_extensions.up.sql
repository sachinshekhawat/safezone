-- Migration: 000001_init_extensions
-- Description: Enable required PostgreSQL extensions

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Trigram similarity for text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
