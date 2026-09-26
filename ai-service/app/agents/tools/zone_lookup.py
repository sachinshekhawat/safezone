"""Zone lookup tools — the factual grounding layer for the agents.

The advisor agent must answer "is X safe at night?" from recorded risk data, not
from the model's own recollection of a place. These helpers resolve a free-text
area name to its row in PostgreSQL and return the numbers the prompt should cite.

Everything here is zone-level and aggregate. No victim or personal data is read.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from app.database import get_pool

logger = logging.getLogger(__name__)

# Words that show up in questions but never in a zone name. Stripping them stops
# "is saket safe at night" from trying to match the whole sentence.
_QUESTION_WORDS = frozenset(
    """
    is are was were be am do does did how what when where which who why should
    can could would will may might must safe safety safer safest risk risky
    danger dangerous unsafe area zone place neighbourhood neighborhood locality
    at in on near around by for the a an of to from my me i you it and or but
    night nights evening morning afternoon day daytime late alone travel
    travelling traveling visit visiting going go live living work working
    tonight now today tomorrow week weekend please tell about me know think
    good bad ok okay advice advise help
    """.split()
)

# Single-word zone names we must still match even though they look generic.
_MIN_TOKEN_LEN = 3

ZONE_LOOKUP_QUERY = """
SELECT
    z.id::text                              AS zone_id,
    z.name                                  AS zone_name,
    z.zone_type::text                       AS zone_type,
    z.latitude, z.longitude, z.pin_code,
    c.name                                  AS city_name,
    c.state                                 AS state,
    rs.overall_score                        AS risk_score,
    rs.risk_level::text                     AS risk_level,
    rs.trend_direction                      AS trend_direction,
    rs.incident_frequency_score             AS incident_frequency_score,
    rs.infrastructure_score                 AS infrastructure_score,
    rs.calculated_for_month                 AS score_month,
    rs.calculated_for_year                  AS score_year,
    rs.score_breakdown                      AS score_breakdown,
    ps.name                                 AS station_name,
    ps.has_women_desk                       AS station_women_desk,
    ps.distance_km                          AS station_distance_km
FROM zones z
JOIN cities c ON c.id = z.city_id
LEFT JOIN LATERAL (
    SELECT overall_score, risk_level, trend_direction, incident_frequency_score,
           infrastructure_score, calculated_for_month, calculated_for_year,
           score_breakdown
    FROM risk_scores
    WHERE zone_id = z.id
    ORDER BY calculated_for_year DESC, calculated_for_month DESC
    LIMIT 1
) rs ON TRUE
LEFT JOIN LATERAL (
    SELECT p.name, p.has_women_desk,
           ST_Distance(
               ST_SetSRID(ST_MakePoint(z.longitude, z.latitude), 4326)::geography,
               ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography
           ) / 1000.0 AS distance_km
    FROM police_stations p
    WHERE p.is_active = TRUE
    ORDER BY ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography
             <-> ST_SetSRID(ST_MakePoint(z.longitude, z.latitude), 4326)::geography
    LIMIT 1
) ps ON TRUE
WHERE z.deleted_at IS NULL AND z.is_deleted = FALSE
  AND LOWER(z.name) = ANY($1::text[])
LIMIT 5
"""

ZONE_FUZZY_QUERY = ZONE_LOOKUP_QUERY.replace(
    "AND LOWER(z.name) = ANY($1::text[])",
    "AND EXISTS (SELECT 1 FROM unnest($1::text[]) t WHERE LOWER(z.name) LIKE '%' || t || '%')",
)


def extract_candidate_names(message: str) -> list[str]:
    """Pull plausible place-name tokens out of a free-text question.

    Returns lowercased candidates, longest first, so multi-word names like
    "connaught place" are tried before the single word "place".
    """
    cleaned = re.sub(r"[^\w\s]", " ", message.lower())
    tokens = [t for t in cleaned.split() if t not in _QUESTION_WORDS and len(t) >= _MIN_TOKEN_LEN]
    if not tokens:
        return []

    candidates: list[str] = []
    # Contiguous runs of up to 3 kept tokens, longest first.
    for size in (3, 2, 1):
        for i in range(len(tokens) - size + 1):
            phrase = " ".join(tokens[i : i + size])
            if phrase not in candidates:
                candidates.append(phrase)
    return candidates[:12]


async def lookup_zones(message: str) -> list[dict[str, Any]]:
    """Resolve area names in ``message`` to zone rows with their latest risk score.

    Tries exact name matches first, then falls back to substring matching.
    Returns an empty list when nothing matches or the database is unreachable —
    callers must handle the ungrounded case rather than inventing numbers.
    """
    candidates = extract_candidate_names(message)
    if not candidates:
        return []

    try:
        pool = await get_pool()
    except RuntimeError:
        logger.warning("Zone lookup skipped: database pool not initialised")
        return []

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(ZONE_LOOKUP_QUERY, candidates)
            if not rows:
                rows = await conn.fetch(ZONE_FUZZY_QUERY, candidates)
        return [dict(r) for r in rows]
    except Exception:
        logger.exception("Zone lookup failed")
        return []


def format_zone_facts(zones: list[dict[str, Any]]) -> str:
    """Render zone rows as a factual block for the system prompt.

    Deliberately explicit about provenance: if a score came from synthetic seed
    data the agent is told so, to stop it presenting development numbers as
    official statistics.
    """
    if not zones:
        return ""

    blocks: list[str] = []
    for z in zones:
        lines = [f"Zone: {z['zone_name']} ({z['city_name']}, {z['state']})"]
        lines.append(f"- Type: {z['zone_type']}")
        if z.get("pin_code"):
            lines.append(f"- PIN code: {z['pin_code']}")

        if z.get("risk_score") is not None:
            lines.append(
                f"- Risk score: {float(z['risk_score']):.1f}/100 "
                f"({z['risk_level']}) for {z['score_month']}/{z['score_year']}"
            )
            if z.get("trend_direction"):
                lines.append(f"- Trend: {z['trend_direction']}")
            if z.get("infrastructure_score") is not None:
                lines.append(
                    f"- Infrastructure score (lighting/policing/CCTV): "
                    f"{float(z['infrastructure_score']):.1f}/100"
                )
        else:
            lines.append("- Risk score: not yet calculated for this zone")

        if z.get("station_name"):
            desk = "has a women's help desk" if z.get("station_women_desk") else "no women's help desk"
            dist = z.get("station_distance_km")
            dist_txt = f"{float(dist):.1f} km away" if dist is not None else "distance unknown"
            lines.append(f"- Nearest police station: {z['station_name']}, {dist_txt} ({desk})")

        breakdown = z.get("score_breakdown")
        if breakdown:
            # asyncpg returns JSONB as a string.
            source = ""
            if isinstance(breakdown, str):
                import json

                try:
                    source = (json.loads(breakdown) or {}).get("source", "")
                except ValueError:
                    source = ""
            elif isinstance(breakdown, dict):
                source = breakdown.get("source", "")
            if source == "synthetic_seed":
                lines.append(
                    "- DATA PROVENANCE: this score is development seed data, not "
                    "an official NCRB statistic. Say so if you quote it."
                )

        blocks.append("\n".join(lines))

    return "\n\n".join(blocks)


def risk_band_guidance(risk_level: Optional[str]) -> str:
    """Short interpretation guide so the model bands scores consistently."""
    return (
        "Risk bands: very_low 0-19, low 20-39, moderate 40-59, high 60-79, "
        "critical 80-100. A score reflects *reported* incidents and local "
        "infrastructure, and under-reporting is common — never claim an area is "
        "definitively safe because its score is low."
    )
