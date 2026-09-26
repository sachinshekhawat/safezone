"""Risk by audience.

MIRROR OF ``shared/src/risk-profile.ts``. Read that file's header for the honest
position on why a men's risk score cannot currently be measured. Pinned by
``shared/testdata/risk-profile-vectors.json``, asserted from both languages.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from app.models.time_risk import risk_level_from_score

RiskProfile = Literal["general", "women"]

RISK_PROFILES: tuple[dict[str, str], ...] = (
    {
        "profile": "general",
        "label": "General",
        "description": (
            "Risk to anyone in the area, from the general condition of the zone. "
            "Modelled, not separately measured."
        ),
    },
    {
        "profile": "women",
        "label": "For women",
        "description": (
            "Risk to women, which is what the recorded incident data measures directly."
        ),
    },
)

GENDERED_SHARE = 0.28
WOMEN_DESK_RELIEF = 4.0

GENDERED_ZONE_WEIGHT: dict[str, float] = {
    "commercial": 1.15,
    "institutional": 1.1,
    "mixed": 1.0,
    "residential": 0.95,
    "industrial": 1.05,
    "rural": 1.1,
}

GENERAL_PROFILE_DISCLAIMER = (
    "The general figure is modelled. Recorded incidents here describe crimes against "
    "women, so risk to men is inferred from the area's condition rather than measured."
)

WOMEN_PROFILE_DISCLAIMER = (
    "Based on recorded incidents involving women, adjusted for local reporting rates "
    "and whether a women's help desk is nearby."
)


def _js_round(x: float) -> int:
    """Round half away from zero, matching JavaScript's Math.round."""
    return int(math.floor(x + 0.5)) if x >= 0 else int(math.ceil(x - 0.5))


def _clamp(n: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, n))


def _round1(n: float) -> float:
    return _js_round(n * 10) / 10


@dataclass
class ProfiledRisk:
    profile: str
    base_score: Optional[float]
    score: Optional[float]
    level: str
    delta: int
    data_backed: bool
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile": self.profile,
            "base_score": self.base_score,
            "score": self.score,
            "level": self.level,
            "delta": self.delta,
            "data_backed": self.data_backed,
            "notes": list(self.notes),
        }


def profile_for_gender(gender: Optional[str]) -> RiskProfile:
    """Which profile suits a user's stated gender."""
    return "women" if gender == "female" else "general"


def profiled_risk(
    profile: str,
    risk_score: Optional[float] = None,
    infrastructure_score: Optional[float] = None,
    zone_type: Optional[str] = None,
    nearest_station_has_women_desk: Optional[bool] = None,
    female_literacy_rate: Optional[float] = None,
    profile_scores: Optional[dict[str, float]] = None,
) -> ProfiledRisk:
    """Score an area for a given audience. See the TypeScript original."""
    if risk_score is None:
        return ProfiledRisk(
            profile=profile,
            base_score=None,
            score=None,
            level="unscored",
            delta=0,
            data_backed=False,
            notes=[],
        )

    base = float(risk_score)

    supplied = (profile_scores or {}).get(profile)
    if supplied is not None:
        s = _round1(_clamp(float(supplied), 0.0, 100.0))
        return ProfiledRisk(
            profile=profile,
            base_score=base,
            score=s,
            level=risk_level_from_score(s),
            delta=_js_round(s - base),
            data_backed=True,
            notes=["Scored directly from recorded incident data for this group."],
        )

    ztype = zone_type or "mixed"
    weight = GENDERED_ZONE_WEIGHT.get(ztype, 1.0)
    notes: list[str] = []

    if profile == "women":
        score = base

        emphasis = base * GENDERED_SHARE * (weight - 1)
        if abs(emphasis) >= 0.5:
            score += emphasis
            notes.append(
                f"{ztype.capitalize()} areas carry more harassment risk."
                if emphasis > 0
                else f"{ztype.capitalize()} areas carry relatively less of it."
            )

        if nearest_station_has_women_desk:
            score -= WOMEN_DESK_RELIEF
            notes.append("The nearest police station has a women\u2019s help desk.")

        if female_literacy_rate is not None and female_literacy_rate < 70:
            underreport = ((70 - _clamp(float(female_literacy_rate), 0.0, 70.0)) / 70) * 6
            if underreport >= 0.5:
                score += underreport
                notes.append(
                    "Reporting rates are likely lower here, so the recorded figure "
                    "understates risk."
                )

        s = _round1(_clamp(score, 0.0, 100.0))
        return ProfiledRisk(
            profile=profile,
            base_score=base,
            score=s,
            level=risk_level_from_score(s),
            delta=_js_round(s - base),
            data_backed=True,
            notes=notes,
        )

    removed = base * GENDERED_SHARE * weight
    s = _round1(_clamp(base - removed, 0.0, 100.0))
    notes.append("Estimated by discounting the gender-specific part of the recorded score.")
    notes.append("No male-victim data is recorded yet, so this is a model estimate.")

    return ProfiledRisk(
        profile=profile,
        base_score=base,
        score=s,
        level=risk_level_from_score(s),
        delta=_js_round(s - base),
        data_backed=False,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# The learning path
# ---------------------------------------------------------------------------

MIN_PER_GENDER_TO_FIT = 150


def fit_gendered_share(counts_by_gender: dict[str, int]) -> Optional[float]:
    """Derive GENDERED_SHARE from recorded victim genders.

    Replaces the documented 0.28 assumption once ``incidents.victim_gender`` has
    enough rows. The share is the proportion of incidents whose victim is female,
    which is the fraction of the recorded signal that is gender-specific.

    Returns ``None`` when there is not enough data in *both* the female and the
    non-female groups. A one-sided sample cannot establish a ratio, and a ratio
    fitted from 3 male records would look learned while being noise — which is the
    failure mode this whole module is written to avoid.
    """
    if not counts_by_gender:
        return None

    female = max(0, counts_by_gender.get("female", 0))
    male = max(0, counts_by_gender.get("male", 0))
    other = max(0, counts_by_gender.get("other", 0))
    # 'unknown' is excluded: it carries no gender signal, and counting it as
    # non-female would bias the share downward purely by how complete the
    # source records happen to be.
    non_female = male + other

    if female < MIN_PER_GENDER_TO_FIT or non_female < MIN_PER_GENDER_TO_FIT:
        return None

    total = female + non_female
    return round(female / total, 4)


async def observed_gender_counts(pool: Any) -> dict[str, int]:
    """Count incidents by victim gender. Empty until the column is populated."""
    query = """
        SELECT victim_gender::text AS gender, COUNT(*) AS n
        FROM incidents
        WHERE deleted_at IS NULL AND is_deleted = FALSE
        GROUP BY victim_gender
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query)
    return {r["gender"]: int(r["n"]) for r in rows}
