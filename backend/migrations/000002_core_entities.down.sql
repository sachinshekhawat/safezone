-- Rollback: 000002_core_entities
DROP TABLE IF EXISTS police_stations;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS data_sources;
DROP TABLE IF EXISTS zones;
DROP TABLE IF EXISTS cities;

DROP TYPE IF EXISTS reliability_rating;
DROP TYPE IF EXISTS source_type;
DROP TYPE IF EXISTS station_type;
DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS zone_type;
DROP TYPE IF EXISTS city_tier;
