"""Training data loaders.

Two sources are supported:

1. ``fetch_training_rows`` — real rows assembled from PostgreSQL. This is what
   production training uses once incident and demographic data has been ingested.
2. ``generate_synthetic_dataset`` — a deterministic synthetic set used to
   bootstrap a model artifact before real data exists.

Synthetic rows are explicitly labelled and must never be presented as
NCRB-derived statistics.
"""

from __future__ import annotations

import math
import random
from typing import Any, Optional

from app.models.risk_predictor import RiskPredictor

# Feature order is owned by RiskPredictor so training and inference can never drift.
FEATURE_NAMES: list[str] = list(RiskPredictor.FEATURE_NAMES)
ZONE_TYPE_MAP: dict[str, int] = dict(RiskPredictor.ZONE_TYPE_MAP)
TARGET_NAME = "overall_score"


# =========================
# Real data (PostgreSQL)
# =========================

# One row per (zone, month) with the recorded risk score as the target.
TRAINING_QUERY = """
SELECT
    rs.overall_score                                        AS overall_score,
    rs.calculated_for_month                                 AS month,
    z.zone_type::text                                       AS zone_type,

    COALESCE(inc.count_1m,  0)                              AS incident_count_1m,
    COALESCE(inc.count_3m,  0)                              AS incident_count_3m,
    COALESCE(inc.count_6m,  0)                              AS incident_count_6m,
    COALESCE(inc.count_12m, 0)                              AS incident_count_12m,

    COALESCE(d.population_density_per_sqkm, 0)              AS population_density,
    COALESCE(d.literacy_rate_percent, c.literacy_rate, 0)   AS literacy_rate,
    COALESCE(d.female_literacy_rate_percent,
             c.female_literacy_rate, 0)                     AS female_literacy_rate,
    COALESCE(d.unemployment_rate, 0)                        AS unemployment_rate,
    COALESCE(d.police_per_1000, 0)                          AS police_per_1000,
    COALESCE(d.streetlights_per_km, 0)                      AS streetlights_per_km,
    COALESCE(d.cctv_count, 0)                               AS cctv_count,
    COALESCE(d.public_transport_routes, 0)                  AS public_transport_routes,
    COALESCE(sp.active_count, 0)                            AS active_safety_programs
FROM risk_scores rs
JOIN zones  z ON z.id = rs.zone_id AND z.is_deleted = FALSE
JOIN cities c ON c.id = z.city_id
LEFT JOIN LATERAL (
    SELECT * FROM demographic_data dd
    WHERE dd.zone_id = z.id AND dd.is_deleted = FALSE
    ORDER BY dd.year DESC
    LIMIT 1
) d ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE i.is_deleted = FALSE) AS active_count
    FROM safety_programs i
    WHERE i.zone_id = z.id AND i.status = 'active' AND i.is_deleted = FALSE
) sp ON TRUE
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE age_months < 1)  AS count_1m,
        COUNT(*) FILTER (WHERE age_months < 3)  AS count_3m,
        COUNT(*) FILTER (WHERE age_months < 6)  AS count_6m,
        COUNT(*) FILTER (WHERE age_months < 12) AS count_12m
    FROM (
        SELECT
            (rs.calculated_for_year * 12 + rs.calculated_for_month)
              - (i.incident_year * 12 + i.incident_month) AS age_months
        FROM incidents i
        WHERE i.zone_id = z.id AND i.is_deleted = FALSE
    ) aged
    WHERE age_months >= 0
) inc ON TRUE
WHERE rs.overall_score IS NOT NULL
ORDER BY rs.calculated_for_year, rs.calculated_for_month
"""


async def fetch_training_rows(pool: Any) -> list[dict[str, Any]]:
    """Assemble training rows from PostgreSQL.

    Args:
        pool: an ``asyncpg`` pool (see ``app.database.get_pool``).

    Returns:
        A list of dicts, each containing every name in ``FEATURE_NAMES``
        (except ``zone_type_encoded``, which is derived) plus ``overall_score``.
    """
    async with pool.acquire() as conn:
        records = await conn.fetch(TRAINING_QUERY)
    return [dict(r) for r in records]


# =========================
# Synthetic bootstrap data
# =========================


def generate_synthetic_dataset(
    n_samples: int = 2000,
    seed: int = 42,
) -> list[dict[str, Any]]:
    """Generate a deterministic synthetic training set.

    The target is produced by a known generative function plus noise, so a
    correctly wired model should be able to recover it. This exists purely to
    bootstrap a model artifact; it encodes no real-world crime statistics.
    """
    rng = random.Random(seed)
    zone_types = list(ZONE_TYPE_MAP.keys())
    rows: list[dict[str, Any]] = []

    for _ in range(n_samples):
        zone_type = rng.choice(zone_types)

        incident_12m = rng.randint(0, 60)
        # Nested windows must stay consistent: 1m <= 3m <= 6m <= 12m.
        incident_6m = rng.randint(0, incident_12m) if incident_12m else 0
        incident_3m = rng.randint(0, incident_6m) if incident_6m else 0
        incident_1m = rng.randint(0, incident_3m) if incident_3m else 0

        population_density = rng.uniform(500, 35_000)
        literacy_rate = rng.uniform(45, 95)
        female_literacy_rate = max(20.0, literacy_rate - rng.uniform(0, 20))
        unemployment_rate = rng.uniform(1, 25)
        police_per_1000 = rng.uniform(0, 3)
        streetlights_per_km = rng.uniform(0, 40)
        cctv_count = rng.randint(0, 120)
        public_transport_routes = rng.randint(0, 40)
        active_safety_programs = rng.randint(0, 6)
        month = rng.randint(1, 12)

        # Generative target: incidents and deprivation push risk up;
        # policing, lighting, surveillance and programmes push it down.
        score = (
            18.0
            + 0.45 * incident_12m
            + 1.10 * incident_1m
            + 0.22 * (100 - literacy_rate)
            + 0.30 * unemployment_rate
            + 0.00035 * population_density
            - 4.50 * police_per_1000
            - 0.28 * streetlights_per_km
            - 0.06 * cctv_count
            - 2.20 * active_safety_programs
            # Mild seasonality (winter months skew higher).
            + 2.5 * math.cos((month - 1) / 12 * 2 * math.pi)
            + {
                "commercial": 6.0,
                "mixed": 3.0,
                "industrial": 1.0,
                "rural": 0.0,
                "residential": -3.0,
                "institutional": -5.0,
            }[zone_type]
            + rng.gauss(0, 4.0)
        )
        score = max(0.0, min(100.0, score))

        rows.append(
            {
                "incident_count_1m": incident_1m,
                "incident_count_3m": incident_3m,
                "incident_count_6m": incident_6m,
                "incident_count_12m": incident_12m,
                "population_density": round(population_density, 2),
                "literacy_rate": round(literacy_rate, 2),
                "female_literacy_rate": round(female_literacy_rate, 2),
                "unemployment_rate": round(unemployment_rate, 2),
                "police_per_1000": round(police_per_1000, 3),
                "streetlights_per_km": round(streetlights_per_km, 2),
                "cctv_count": cctv_count,
                "public_transport_routes": public_transport_routes,
                "active_safety_programs": active_safety_programs,
                "zone_type": zone_type,
                "month": month,
                TARGET_NAME: round(score, 2),
                "_synthetic": True,
            }
        )

    return rows


# =========================
# Row -> feature vector
# =========================


def row_to_features(row: dict[str, Any]) -> list[float]:
    """Convert a training row into a feature vector ordered by FEATURE_NAMES.

    Keeping this the single conversion point guarantees training-time and
    inference-time feature order match.
    """
    encoded = ZONE_TYPE_MAP.get(str(row.get("zone_type", "mixed")), ZONE_TYPE_MAP["mixed"])
    values: list[float] = []
    for name in FEATURE_NAMES:
        if name == "zone_type_encoded":
            values.append(float(encoded))
        else:
            values.append(float(row.get(name, 0) or 0))
    return values


def build_xy(
    rows: list[dict[str, Any]],
    target: str = TARGET_NAME,
) -> tuple[list[list[float]], list[float]]:
    """Split rows into an (X, y) pair, skipping rows with no target."""
    x: list[list[float]] = []
    y: list[float] = []
    for row in rows:
        value: Optional[Any] = row.get(target)
        if value is None:
            continue
        x.append(row_to_features(row))
        y.append(float(value))
    return x, y
