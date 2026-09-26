-- Rollback: 000009_seed_initial_data
-- Remove seeded data in reverse dependency order

DELETE FROM users WHERE email = 'admin@safezone.in';

DELETE FROM zones WHERE city_id IN (
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-000000000005'
);

DELETE FROM cities WHERE id IN (
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-000000000005'
);

DELETE FROM data_sources WHERE name IN (
    'NCRB Crime in India',
    'Delhi Police Open Data',
    'Rajasthan Police',
    'UP Police',
    'MP Police',
    'National Crime Records Bureau Reports'
);
