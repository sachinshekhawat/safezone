-- Migration: 000009_seed_initial_data
-- Description: Seed initial cities, data sources, and admin user

-- ========================
-- SEED: Data Sources
-- ========================
INSERT INTO data_sources (id, name, source_type, url, reliability) VALUES
    (uuid_generate_v4(), 'NCRB Crime in India', 'government', 'https://ncrb.gov.in/crime-in-india.html', 'high'),
    (uuid_generate_v4(), 'Delhi Police Open Data', 'government', 'https://delhipolice.gov.in', 'high'),
    (uuid_generate_v4(), 'Rajasthan Police', 'government', 'https://police.rajasthan.gov.in', 'high'),
    (uuid_generate_v4(), 'UP Police', 'government', 'https://uppolice.gov.in', 'high'),
    (uuid_generate_v4(), 'MP Police', 'government', 'https://mppolice.gov.in', 'high'),
    (uuid_generate_v4(), 'National Crime Records Bureau Reports', 'government', 'https://ncrb.gov.in', 'high');

-- ========================
-- SEED: Initial Cities
-- ========================
INSERT INTO cities (id, name, state, latitude, longitude, population, literacy_rate, female_literacy_rate, tier) VALUES
    ('a1000000-0000-0000-0000-000000000001', 'Delhi', 'Delhi', 28.6139, 77.2090, 20000000, 86.34, 80.93, 'metro'),
    ('a1000000-0000-0000-0000-000000000002', 'Alwar', 'Rajasthan', 27.5530, 76.6346, 341422, 64.54, 47.14, 'tier3'),
    ('a1000000-0000-0000-0000-000000000003', 'Jaipur', 'Rajasthan', 26.9124, 75.7873, 3073350, 76.44, 64.64, 'tier1'),
    ('a1000000-0000-0000-0000-000000000004', 'Lucknow', 'Uttar Pradesh', 26.8467, 80.9462, 3382000, 79.33, 73.40, 'metro'),
    ('a1000000-0000-0000-0000-000000000005', 'Bhopal', 'Madhya Pradesh', 23.2599, 77.4126, 1883381, 80.37, 73.67, 'tier1');

-- ========================
-- SEED: Sample Zones for Delhi
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000001', 'Connaught Place', 'commercial', 28.6315, 77.2167, 1.5, '110001'),
    ('a1000000-0000-0000-0000-000000000001', 'Paharganj', 'commercial', 28.6436, 77.2137, 1.0, '110055'),
    ('a1000000-0000-0000-0000-000000000001', 'Chandni Chowk', 'commercial', 28.6506, 77.2334, 1.2, '110006'),
    ('a1000000-0000-0000-0000-000000000001', 'Karol Bagh', 'mixed', 28.6514, 77.1907, 2.0, '110005'),
    ('a1000000-0000-0000-0000-000000000001', 'Saket', 'residential', 28.5244, 77.2066, 2.5, '110017'),
    ('a1000000-0000-0000-0000-000000000001', 'Dwarka', 'residential', 28.5921, 77.0460, 5.0, '110075'),
    ('a1000000-0000-0000-0000-000000000001', 'Rohini', 'residential', 28.7495, 77.0565, 4.0, '110085'),
    ('a1000000-0000-0000-0000-000000000001', 'Shahdara', 'mixed', 28.6719, 77.2914, 3.0, '110032'),
    ('a1000000-0000-0000-0000-000000000001', 'Mehrauli', 'mixed', 28.5172, 77.1780, 2.5, '110030'),
    ('a1000000-0000-0000-0000-000000000001', 'Najafgarh', 'rural', 28.6093, 76.9799, 4.0, '110043');

-- ========================
-- SEED: Sample Zones for Alwar
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000002', 'Alwar City Center', 'commercial', 27.5530, 76.6346, 2.0, '301001'),
    ('a1000000-0000-0000-0000-000000000002', 'Rajgarh', 'rural', 27.2246, 76.6177, 5.0, '301408'),
    ('a1000000-0000-0000-0000-000000000002', 'Behror', 'mixed', 27.8908, 76.2834, 3.0, '301701'),
    ('a1000000-0000-0000-0000-000000000002', 'Tijara', 'rural', 27.9366, 76.8554, 4.0, '301411'),
    ('a1000000-0000-0000-0000-000000000002', 'Kishangarh Bas', 'rural', 27.9020, 76.6025, 3.5, '301403');

-- ========================
-- SEED: Sample Zones for Jaipur
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000003', 'Pink City (Walled City)', 'commercial', 26.9239, 75.8267, 1.5, '302002'),
    ('a1000000-0000-0000-0000-000000000003', 'Malviya Nagar', 'residential', 26.8554, 75.8131, 3.0, '302017'),
    ('a1000000-0000-0000-0000-000000000003', 'Mansarovar', 'residential', 26.8681, 75.7568, 3.5, '302020'),
    ('a1000000-0000-0000-0000-000000000003', 'Vaishali Nagar', 'residential', 26.9120, 75.7260, 2.5, '302021'),
    ('a1000000-0000-0000-0000-000000000003', 'Sanganer', 'industrial', 26.8257, 75.7929, 4.0, '302029');

-- ========================
-- SEED: Sample Zones for Lucknow
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000004', 'Hazratganj', 'commercial', 26.8500, 80.9500, 1.5, '226001'),
    ('a1000000-0000-0000-0000-000000000004', 'Aminabad', 'commercial', 26.8446, 80.9219, 1.0, '226018'),
    ('a1000000-0000-0000-0000-000000000004', 'Gomti Nagar', 'residential', 26.8563, 81.0050, 3.5, '226010'),
    ('a1000000-0000-0000-0000-000000000004', 'Aliganj', 'residential', 26.8952, 80.9413, 2.5, '226024'),
    ('a1000000-0000-0000-0000-000000000004', 'Chinhat', 'mixed', 26.8800, 81.0600, 4.0, '226028');

-- ========================
-- SEED: Sample Zones for Bhopal
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000005', 'Old Bhopal (Chowk)', 'commercial', 23.2636, 77.4126, 1.5, '462001'),
    ('a1000000-0000-0000-0000-000000000005', 'New Market', 'commercial', 23.2358, 77.4330, 1.0, '462003'),
    ('a1000000-0000-0000-0000-000000000005', 'Arera Colony', 'residential', 23.2200, 77.4300, 2.5, '462016'),
    ('a1000000-0000-0000-0000-000000000005', 'Kolar', 'mixed', 23.1800, 77.4200, 4.0, '462042'),
    ('a1000000-0000-0000-0000-000000000005', 'Hoshangabad Road', 'industrial', 23.1900, 77.4700, 5.0, '462026');

-- ========================
-- SEED: Admin User (password: admin123 — change immediately)
-- ========================
-- Password hash for 'admin123' using bcrypt
INSERT INTO users (id, email, password_hash, name, role, department, is_active) VALUES
    ('b1000000-0000-0000-0000-000000000001', 'admin@safezone.in', '$2a$12$LQv3c1yqBo9SkvXS7QTJPOeZGJGz/pBKQF2rJI.rZf3qK.I1VxYl6', 'System Admin', 'admin', 'SafeZone India', TRUE);
