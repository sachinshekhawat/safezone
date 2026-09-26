-- Migration: 000010_expand_city_zone_coverage
-- Description: Expand coverage from 5 to 20 cities with their localities as zones.
--
-- DATA PROVENANCE — READ BEFORE RELYING ON THIS
-- ---------------------------------------------
-- * Coordinates are approximate city/locality centroids (~2-3 decimal places).
--   Good enough for nearest-city resolution and map placement, not for
--   navigation or boundary decisions.
-- * population / literacy_rate / female_literacy_rate are APPROXIMATE figures
--   in the spirit of Census 2011 and are included so the UI has something to
--   render. They MUST be verified against the actual Census/NCRB releases
--   before any official or public-facing use. Where a figure is not reasonably
--   known it is left NULL rather than invented.
-- * Zone extents (radius_km) are rough estimates of locality size.
--
-- This migration adds NO risk scores and NO incidents. Risk scores come from
-- `make seed` (development) or the ML pipeline (production), so no synthetic
-- figure is ever baked into the schema itself.

-- ========================
-- CITIES
-- ========================
INSERT INTO cities (id, name, state, latitude, longitude, population, literacy_rate, female_literacy_rate, tier) VALUES
    ('a1000000-0000-0000-0000-000000000006', 'Mumbai',     'Maharashtra',    19.0760, 72.8777, 12442373, 89.2, 86.4, 'metro'),
    ('a1000000-0000-0000-0000-000000000007', 'Bengaluru',  'Karnataka',      12.9716, 77.5946,  8443675, 88.7, 85.3, 'metro'),
    ('a1000000-0000-0000-0000-000000000008', 'Chennai',    'Tamil Nadu',     13.0827, 80.2707,  4646732, 90.2, 87.0, 'metro'),
    ('a1000000-0000-0000-0000-000000000009', 'Kolkata',    'West Bengal',    22.5726, 88.3639,  4496694, 87.1, 84.1, 'metro'),
    ('a1000000-0000-0000-0000-00000000000a', 'Hyderabad',  'Telangana',      17.3850, 78.4867,  6809970, 83.3, 79.7, 'metro'),
    ('a1000000-0000-0000-0000-00000000000b', 'Pune',       'Maharashtra',    18.5204, 73.8567,  3124458, 89.6, 86.1, 'metro'),
    ('a1000000-0000-0000-0000-00000000000c', 'Ahmedabad',  'Gujarat',        23.0225, 72.5714,  5577940, 88.3, 83.5, 'metro'),
    ('a1000000-0000-0000-0000-00000000000d', 'Surat',      'Gujarat',        21.1702, 72.8311,  4467797, 86.6, 81.0, 'tier1'),
    ('a1000000-0000-0000-0000-00000000000e', 'Nagpur',     'Maharashtra',    21.1458, 79.0882,  2405421, 91.9, 89.0, 'tier1'),
    ('a1000000-0000-0000-0000-00000000000f', 'Indore',     'Madhya Pradesh', 22.7196, 75.8577,  1964086, 87.4, 82.5, 'tier1'),
    ('a1000000-0000-0000-0000-000000000010', 'Kanpur',     'Uttar Pradesh',  26.4499, 80.3319,  2765348, 81.3, 75.1, 'tier1'),
    ('a1000000-0000-0000-0000-000000000011', 'Patna',      'Bihar',          25.5941, 85.1376,  1684222, 82.7, 76.6, 'tier1'),
    ('a1000000-0000-0000-0000-000000000012', 'Kochi',      'Kerala',          9.9312, 76.2673,   601574, 97.5, 96.5, 'tier2'),
    ('a1000000-0000-0000-0000-000000000013', 'Chandigarh', 'Chandigarh',     30.7333, 76.7794,  1055450, 86.0, 81.4, 'tier2'),
    ('a1000000-0000-0000-0000-000000000014', 'Guwahati',   'Assam',          26.1445, 91.7362,   957352, 91.1, 88.2, 'tier2');

-- ========================
-- ZONES — Mumbai
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000006', 'Colaba',            'commercial',    18.9067, 72.8147, 1.5, '400005'),
    ('a1000000-0000-0000-0000-000000000006', 'Dadar',             'mixed',         19.0178, 72.8478, 2.0, '400014'),
    ('a1000000-0000-0000-0000-000000000006', 'Bandra West',       'residential',   19.0596, 72.8295, 2.5, '400050'),
    ('a1000000-0000-0000-0000-000000000006', 'Andheri East',      'commercial',    19.1136, 72.8697, 3.5, '400069'),
    ('a1000000-0000-0000-0000-000000000006', 'Borivali',          'residential',   19.2307, 72.8567, 3.5, '400066'),
    ('a1000000-0000-0000-0000-000000000006', 'Kurla',             'mixed',         19.0726, 72.8845, 2.5, '400070'),
    ('a1000000-0000-0000-0000-000000000006', 'Govandi',           'residential',   19.0553, 72.9200, 2.0, '400043'),
    ('a1000000-0000-0000-0000-000000000006', 'Mulund',            'residential',   19.1726, 72.9425, 3.0, '400080');

-- ========================
-- ZONES — Bengaluru
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000007', 'Majestic',          'commercial',    12.9767, 77.5713, 1.5, '560009'),
    ('a1000000-0000-0000-0000-000000000007', 'Koramangala',       'residential',   12.9352, 77.6245, 2.5, '560034'),
    ('a1000000-0000-0000-0000-000000000007', 'Indiranagar',       'mixed',         12.9784, 77.6408, 2.0, '560038'),
    ('a1000000-0000-0000-0000-000000000007', 'Whitefield',        'commercial',    12.9698, 77.7500, 4.0, '560066'),
    ('a1000000-0000-0000-0000-000000000007', 'Electronic City',   'industrial',    12.8452, 77.6602, 4.5, '560100'),
    ('a1000000-0000-0000-0000-000000000007', 'Yeshwanthpur',      'industrial',    13.0230, 77.5540, 2.5, '560022'),
    ('a1000000-0000-0000-0000-000000000007', 'Jayanagar',         'residential',   12.9250, 77.5938, 2.5, '560041'),
    ('a1000000-0000-0000-0000-000000000007', 'Hebbal',            'mixed',         13.0358, 77.5970, 3.0, '560024');

-- ========================
-- ZONES — Chennai
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000008', 'George Town',       'commercial',    13.0925, 80.2870, 1.5, '600001'),
    ('a1000000-0000-0000-0000-000000000008', 'T Nagar',           'commercial',    13.0418, 80.2341, 2.0, '600017'),
    ('a1000000-0000-0000-0000-000000000008', 'Adyar',             'residential',   13.0012, 80.2565, 2.5, '600020'),
    ('a1000000-0000-0000-0000-000000000008', 'Velachery',         'residential',   12.9791, 80.2210, 3.0, '600042'),
    ('a1000000-0000-0000-0000-000000000008', 'Anna Nagar',        'residential',   13.0850, 80.2101, 2.5, '600040'),
    ('a1000000-0000-0000-0000-000000000008', 'Ambattur',          'industrial',    13.1143, 80.1548, 3.5, '600053'),
    ('a1000000-0000-0000-0000-000000000008', 'Tambaram',          'mixed',         12.9249, 80.1000, 3.0, '600045');

-- ========================
-- ZONES — Kolkata
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000009', 'Burrabazar',        'commercial',    22.5786, 88.3561, 1.5, '700007'),
    ('a1000000-0000-0000-0000-000000000009', 'Park Street',       'commercial',    22.5530, 88.3520, 1.2, '700016'),
    ('a1000000-0000-0000-0000-000000000009', 'Salt Lake',         'residential',   22.5800, 88.4200, 3.5, '700064'),
    ('a1000000-0000-0000-0000-000000000009', 'Howrah',            'mixed',         22.5958, 88.2636, 3.0, '711101'),
    ('a1000000-0000-0000-0000-000000000009', 'Behala',            'residential',   22.4989, 88.3120, 3.0, '700034'),
    ('a1000000-0000-0000-0000-000000000009', 'Dum Dum',           'mixed',         22.6420, 88.4312, 2.5, '700028'),
    ('a1000000-0000-0000-0000-000000000009', 'Jadavpur',          'institutional', 22.4960, 88.3710, 2.0, '700032');

-- ========================
-- ZONES — Hyderabad
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-00000000000a', 'Charminar',         'commercial',    17.3616, 78.4747, 1.5, '500002'),
    ('a1000000-0000-0000-0000-00000000000a', 'Abids',             'commercial',    17.3905, 78.4750, 1.5, '500001'),
    ('a1000000-0000-0000-0000-00000000000a', 'Banjara Hills',     'residential',   17.4126, 78.4392, 2.5, '500034'),
    ('a1000000-0000-0000-0000-00000000000a', 'Gachibowli',        'commercial',    17.4401, 78.3489, 3.5, '500032'),
    ('a1000000-0000-0000-0000-00000000000a', 'Secunderabad',      'mixed',         17.4399, 78.4983, 3.0, '500003'),
    ('a1000000-0000-0000-0000-00000000000a', 'Kukatpally',        'residential',   17.4948, 78.3996, 3.0, '500072'),
    ('a1000000-0000-0000-0000-00000000000a', 'LB Nagar',          'mixed',         17.3457, 78.5522, 3.0, '500074');

-- ========================
-- ZONES — Pune
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-00000000000b', 'Shivajinagar',      'commercial',    18.5308, 73.8475, 2.0, '411005'),
    ('a1000000-0000-0000-0000-00000000000b', 'Kothrud',           'residential',   18.5074, 73.8077, 2.5, '411038'),
    ('a1000000-0000-0000-0000-00000000000b', 'Hinjawadi',         'industrial',    18.5913, 73.7389, 4.0, '411057'),
    ('a1000000-0000-0000-0000-00000000000b', 'Viman Nagar',       'residential',   18.5679, 73.9143, 2.5, '411014'),
    ('a1000000-0000-0000-0000-00000000000b', 'Hadapsar',          'mixed',         18.5089, 73.9260, 3.0, '411028'),
    ('a1000000-0000-0000-0000-00000000000b', 'Pimpri',            'industrial',    18.6298, 73.7997, 3.5, '411017');

-- ========================
-- ZONES — Ahmedabad
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-00000000000c', 'Lal Darwaja',       'commercial',    23.0258, 72.5873, 1.5, '380001'),
    ('a1000000-0000-0000-0000-00000000000c', 'Navrangpura',       'mixed',         23.0364, 72.5615, 2.0, '380009'),
    ('a1000000-0000-0000-0000-00000000000c', 'Satellite',         'residential',   23.0300, 72.5100, 2.5, '380015'),
    ('a1000000-0000-0000-0000-00000000000c', 'Maninagar',         'residential',   22.9960, 72.6020, 2.5, '380008'),
    ('a1000000-0000-0000-0000-00000000000c', 'Naroda',            'industrial',    23.0700, 72.6600, 3.5, '382330'),
    ('a1000000-0000-0000-0000-00000000000c', 'Bopal',             'residential',   23.0330, 72.4700, 3.0, '380058');

-- ========================
-- ZONES — Surat
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-00000000000d', 'Nanpura',           'commercial',    21.1870, 72.8100, 1.5, '395001'),
    ('a1000000-0000-0000-0000-00000000000d', 'Adajan',            'residential',   21.1959, 72.7933, 2.5, '395009'),
    ('a1000000-0000-0000-0000-00000000000d', 'Varachha',          'industrial',    21.2049, 72.8600, 3.0, '395006'),
    ('a1000000-0000-0000-0000-00000000000d', 'Udhna',             'industrial',    21.1600, 72.8400, 3.0, '394210'),
    ('a1000000-0000-0000-0000-00000000000d', 'Vesu',              'residential',   21.1400, 72.7700, 2.5, '395007');

-- ========================
-- ZONES — Nagpur
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-00000000000e', 'Sitabuldi',         'commercial',    21.1466, 79.0822, 1.5, '440012'),
    ('a1000000-0000-0000-0000-00000000000e', 'Dharampeth',        'mixed',         21.1385, 79.0663, 2.0, '440010'),
    ('a1000000-0000-0000-0000-00000000000e', 'Sadar',             'mixed',         21.1600, 79.0800, 2.0, '440001'),
    ('a1000000-0000-0000-0000-00000000000e', 'Hingna',            'industrial',    21.0800, 78.9600, 3.5, '441110'),
    ('a1000000-0000-0000-0000-00000000000e', 'Manish Nagar',      'residential',   21.0900, 79.0500, 2.5, '440015');

-- ========================
-- ZONES — Indore
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-00000000000f', 'Rajwada',           'commercial',    22.7177, 75.8545, 1.5, '452002'),
    ('a1000000-0000-0000-0000-00000000000f', 'Vijay Nagar',       'residential',   22.7530, 75.8937, 2.5, '452010'),
    ('a1000000-0000-0000-0000-00000000000f', 'Palasia',           'commercial',    22.7240, 75.8880, 1.8, '452001'),
    ('a1000000-0000-0000-0000-00000000000f', 'Rau',               'industrial',    22.6300, 75.8100, 3.0, '453331'),
    ('a1000000-0000-0000-0000-00000000000f', 'Sudama Nagar',      'residential',   22.6900, 75.8400, 2.5, '452009');

-- ========================
-- ZONES — Kanpur
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000010', 'Kanpur Cantt',      'mixed',         26.4560, 80.3670, 2.5, '208004'),
    ('a1000000-0000-0000-0000-000000000010', 'Swaroop Nagar',     'residential',   26.4820, 80.3180, 2.0, '208002'),
    ('a1000000-0000-0000-0000-000000000010', 'Govind Nagar',      'residential',   26.4370, 80.2960, 2.5, '208006'),
    ('a1000000-0000-0000-0000-000000000010', 'Panki',             'industrial',    26.4500, 80.2200, 3.5, '208020'),
    ('a1000000-0000-0000-0000-000000000010', 'Kidwai Nagar',      'residential',   26.4400, 80.3300, 2.0, '208011');

-- ========================
-- ZONES — Patna
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000011', 'Patna Junction',    'commercial',    25.6020, 85.1370, 1.5, '800001'),
    ('a1000000-0000-0000-0000-000000000011', 'Kankarbagh',        'residential',   25.5940, 85.1600, 2.5, '800020'),
    ('a1000000-0000-0000-0000-000000000011', 'Boring Road',       'mixed',         25.6130, 85.1200, 2.0, '800001'),
    ('a1000000-0000-0000-0000-000000000011', 'Danapur',           'mixed',         25.6350, 85.0480, 3.0, '801503'),
    ('a1000000-0000-0000-0000-000000000011', 'Patliputra',        'residential',   25.6200, 85.1000, 2.0, '800013');

-- ========================
-- ZONES — Kochi
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000012', 'Fort Kochi',        'commercial',     9.9658, 76.2422, 1.5, '682001'),
    ('a1000000-0000-0000-0000-000000000012', 'Ernakulam South',   'commercial',     9.9670, 76.2870, 2.0, '682016'),
    ('a1000000-0000-0000-0000-000000000012', 'Kakkanad',          'commercial',    10.0150, 76.3420, 3.0, '682030'),
    ('a1000000-0000-0000-0000-000000000012', 'Edappally',         'mixed',         10.0250, 76.3080, 2.5, '682024'),
    ('a1000000-0000-0000-0000-000000000012', 'Aluva',             'mixed',         10.1080, 76.3520, 2.5, '683101');

-- ========================
-- ZONES — Chandigarh
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000013', 'Sector 17',         'commercial',    30.7410, 76.7820, 1.5, '160017'),
    ('a1000000-0000-0000-0000-000000000013', 'Sector 22',         'mixed',         30.7330, 76.7810, 1.5, '160022'),
    ('a1000000-0000-0000-0000-000000000013', 'Sector 35',         'residential',   30.7250, 76.7560, 1.8, '160035'),
    ('a1000000-0000-0000-0000-000000000013', 'Manimajra',         'mixed',         30.7180, 76.8320, 2.5, '160101'),
    ('a1000000-0000-0000-0000-000000000013', 'Industrial Area',   'industrial',    30.7060, 76.8000, 2.5, '160002');

-- ========================
-- ZONES — Guwahati
-- ========================
INSERT INTO zones (city_id, name, zone_type, latitude, longitude, radius_km, pin_code) VALUES
    ('a1000000-0000-0000-0000-000000000014', 'Paltan Bazaar',     'commercial',    26.1830, 91.7530, 1.5, '781008'),
    ('a1000000-0000-0000-0000-000000000014', 'Dispur',            'institutional', 26.1400, 91.7900, 2.0, '781006'),
    ('a1000000-0000-0000-0000-000000000014', 'Beltola',           'residential',   26.1290, 91.8020, 2.5, '781028'),
    ('a1000000-0000-0000-0000-000000000014', 'Maligaon',          'mixed',         26.1650, 91.6900, 2.5, '781011'),
    ('a1000000-0000-0000-0000-000000000014', 'Jalukbari',         'mixed',         26.1520, 91.6650, 2.5, '781014');
