"""Time-of-day risk adjustment.

MIRROR OF ``shared/src/time-risk.ts``. Read that file's header first — it explains
why this model is rule-based rather than learned, and which fields it is allowed
to use.

The two copies exist because the clients run in TypeScript and the advisor runs in
Python. ``shared/testdata/time-risk-vectors.json`` is asserted by both test suites,
so changing the arithmetic on one side fails the other side's tests.

One subtlety worth calling out: Python's built-in ``round`` uses banker's rounding
(``round(0.5) == 0``) while JavaScript's ``Math.round`` rounds half away from zero
(``Math.round(0.5) === 1``). Using ``round`` here would silently disagree with the
TypeScript implementation on exact-half values — which the golden vectors do hit.
``_js_round`` below reproduces the JavaScript behaviour.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

TimeBand = Literal["dawn", "morning", "afternoon", "evening", "night", "late_night"]

# Mirrors the risk bands in shared/src/risk.ts.
_RISK_BANDS: tuple[tuple[str, int], ...] = (
    ("critical", 80),
    ("high", 60),
    ("moderate", 40),
    ("low", 20),
    ("very_low", 0),
)


@dataclass(frozen=True)
class TimeBandDef:
    band: TimeBand
    label: str
    start_hour: int
    end_hour: int
    range: str
    exposure: float


TIME_BANDS: tuple[TimeBandDef, ...] = (
    TimeBandDef("dawn", "Early morning", 4, 6, "4am-6am", 0.55),
    TimeBandDef("morning", "Morning", 6, 12, "6am-12pm", 0.0),
    TimeBandDef("afternoon", "Afternoon", 12, 16, "12pm-4pm", 0.0),
    TimeBandDef("evening", "Evening", 16, 20, "4pm-8pm", 0.35),
    TimeBandDef("night", "Night", 20, 0, "8pm-12am", 0.75),
    TimeBandDef("late_night", "Late night", 0, 4, "12am-4am", 1.0),
)

MAX_INFRA_UPLIFT = 18.0

ZONE_TYPE_UPLIFT: dict[str, float] = {
    "commercial": 6.0,
    "institutional": 6.0,
    "industrial": 5.0,
    "rural": 4.0,
    "mixed": 3.0,
    "residential": 2.0,
}

ASSUMED_INFRA = 50.0

TIME_MODEL_DISCLAIMER = (
    "Time-of-day figures are modelled from lighting, patrol cover and how busy an "
    "area stays - not from recorded incident times."
)


def _js_round(x: float) -> int:
    """Round half away from zero, matching JavaScript's ``Math.round``."""
    return int(math.floor(x + 0.5)) if x >= 0 else int(math.ceil(x - 0.5))


def _clamp(n: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, n))


def risk_level_from_score(score: Optional[float]) -> str:
    """Mirror of ``riskLevelFromScore`` in shared/src/risk.ts."""
    if score is None:
        return "unscored"
    for level, minimum in _RISK_BANDS:
        if score >= minimum:
            return level
    return "very_low"


def band_def(band: str) -> TimeBandDef:
    for b in TIME_BANDS:
        if b.band == band:
            return b
    return TIME_BANDS[1]  # morning


def band_for_hour(hour: int) -> TimeBand:
    """Which band a local hour (0-23) falls in.

    Handles the band that wraps midnight; without that, 20:00-23:59 would fall
    through unmatched, which is precisely the window this feature exists for.
    """
    for b in TIME_BANDS:
        wraps = b.end_hour <= b.start_hour
        if wraps:
            if hour >= b.start_hour or hour < b.end_hour:
                return b.band
        elif b.start_hour <= hour < b.end_hour:
            return b.band
    return "morning"


@dataclass
class TimeRiskFactor:
    type: str
    label: str
    points: int
    detail: str


@dataclass
class TimeAdjustedRisk:
    band: str
    band_label: str
    base_score: Optional[float]
    adjusted_score: Optional[float]
    delta: int
    level: str
    factors: list[TimeRiskFactor] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "band": self.band,
            "band_label": self.band_label,
            "base_score": self.base_score,
            "adjusted_score": self.adjusted_score,
            "delta": self.delta,
            "level": self.level,
            "factors": [
                {"type": f.type, "label": f.label, "points": f.points, "detail": f.detail}
                for f in self.factors
            ],
        }


def time_adjusted_risk(
    band: str,
    risk_score: Optional[float] = None,
    infrastructure_score: Optional[float] = None,
    zone_type: Optional[str] = None,
) -> TimeAdjustedRisk:
    """Apply the time-of-day adjustment. See the TypeScript original for rationale."""
    definition = band_def(band)

    if risk_score is None:
        return TimeAdjustedRisk(
            band=band,
            band_label=definition.label,
            base_score=None,
            adjusted_score=None,
            delta=0,
            level="unscored",
            factors=[],
        )

    base = float(risk_score)
    infra = ASSUMED_INFRA if infrastructure_score is None else float(infrastructure_score)
    ztype = zone_type or "mixed"

    infra_deficit = _clamp((100.0 - infra) / 100.0, 0.0, 1.0)

    lighting_points = definition.exposure * infra_deficit * MAX_INFRA_UPLIFT
    isolation_points = definition.exposure * ZONE_TYPE_UPLIFT.get(
        ztype, ZONE_TYPE_UPLIFT["mixed"]
    )
    transport_points = definition.exposure * 4.0 if band in ("night", "late_night") else 0.0

    factors: list[TimeRiskFactor] = []
    if lighting_points >= 0.5:
        factors.append(
            TimeRiskFactor(
                "poor_lighting",
                "Lighting and patrol cover",
                _js_round(lighting_points),
                f"Infrastructure scores {_js_round(infra)}/100 here, which matters more after dark.",
            )
        )
    if isolation_points >= 0.5:
        factors.append(
            TimeRiskFactor(
                "isolation",
                "Fewer people around",
                _js_round(isolation_points),
                f"{ztype.capitalize()} areas empty out at this hour.",
            )
        )
    if transport_points >= 0.5:
        factors.append(
            TimeRiskFactor(
                "public_transport",
                "Thin transport options",
                _js_round(transport_points),
                "Buses and metro run less often, so waits are longer.",
            )
        )
    factors.sort(key=lambda f: f.points, reverse=True)

    adjusted = _clamp(base + lighting_points + isolation_points + transport_points, 0.0, 100.0)
    rounded = _js_round(adjusted * 10) / 10

    return TimeAdjustedRisk(
        band=band,
        band_label=definition.label,
        base_score=base,
        adjusted_score=rounded,
        delta=_js_round(rounded - base),
        level=risk_level_from_score(rounded),
        factors=factors,
    )


# ---------------------------------------------------------------------------
# The learning path
# ---------------------------------------------------------------------------

# Minimum incidents before observed band weights are trusted over the defaults.
# Below this, a handful of reports would swing a whole band's weighting and the
# result would look data-driven while being noise.
MIN_INCIDENTS_TO_FIT = 200


def fit_band_exposures(
    counts_by_band: dict[str, int],
    min_incidents: int = MIN_INCIDENTS_TO_FIT,
) -> Optional[dict[str, float]]:
    """Derive band exposures from observed incident counts per time band.

    This is the path that replaces the hand-set exposures the moment the
    ``incidents`` table actually holds rows with ``time_of_day`` populated. Until
    then it returns ``None`` and callers keep the documented defaults — it must
    never fabricate weights from a thin sample.

    The fit is deliberately simple: each band's exposure is its share of incidents
    relative to the busiest band, rescaled so the quietest daylight band sits at
    zero. A heavier model (gradient boosting over band + infrastructure + type)
    only becomes honest once there is enough data to validate it, and with a
    six-way categorical the ratio *is* the signal.

    Args:
        counts_by_band: incident counts keyed by ``time_of_day`` value.
        min_incidents: refuse to fit below this total.

    Returns:
        Band -> exposure in 0..1, or ``None`` when there is not enough data.
    """
    if not counts_by_band:
        return None

    total = sum(max(0, c) for c in counts_by_band.values())
    if total < min_incidents:
        return None

    # Per-hour rate, not raw count: `morning` spans six hours and `late_night`
    # four, so comparing totals would flatter the wider bands.
    rates: dict[str, float] = {}
    for b in TIME_BANDS:
        span = (b.end_hour - b.start_hour) % 24 or 24
        rates[b.band] = max(0, counts_by_band.get(b.band, 0)) / span

    lowest = min(rates.values())
    highest = max(rates.values())
    if highest <= lowest:
        # Perfectly flat distribution — no time signal to extract.
        return {b.band: 0.0 for b in TIME_BANDS}

    return {
        band: round((rate - lowest) / (highest - lowest), 4) for band, rate in rates.items()
    }


async def observed_band_counts(pool: Any) -> dict[str, int]:
    """Count incidents per time band from the database.

    Returns an empty dict when nothing is recorded, which is the current state of
    the project — ``incidents`` holds zero rows, which is why the defaults above
    are not learned.
    """
    query = """
        SELECT time_of_day::text AS band, COUNT(*) AS n
        FROM incidents
        WHERE deleted_at IS NULL AND is_deleted = FALSE AND time_of_day IS NOT NULL
        GROUP BY time_of_day
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query)
    return {r["band"]: int(r["n"]) for r in rows}
