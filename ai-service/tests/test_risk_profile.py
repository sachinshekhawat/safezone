"""Risk profile tests.

Reads the SAME golden vectors as shared/src/risk-profile.test.ts.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.models.risk_profile import (
    GENERAL_PROFILE_DISCLAIMER,
    MIN_PER_GENDER_TO_FIT,
    RISK_PROFILES,
    fit_gendered_share,
    profile_for_gender,
    profiled_risk,
)

VECTORS_PATH = (
    Path(__file__).resolve().parents[2] / "shared" / "testdata" / "risk-profile-vectors.json"
)


def load_vectors() -> dict:
    if not VECTORS_PATH.exists():
        pytest.fail(
            f"Golden vectors missing at {VECTORS_PATH}. They are what keeps the "
            "Python and TypeScript profile models in step."
        )
    return json.loads(VECTORS_PATH.read_text())


VECTORS = load_vectors()


@pytest.mark.parametrize("gender,expected", sorted(VECTORS["profileForGender"].items()))
def test_profile_for_gender_golden(gender: str, expected: str):
    assert profile_for_gender(gender) == expected


def test_absent_gender_is_general():
    # Declining to state a gender must not be silently read as female — pink mode
    # and the women profile are both opt-in on a stated value.
    assert profile_for_gender(None) == "general"


@pytest.mark.parametrize("case", VECTORS["cases"], ids=[c["name"] for c in VECTORS["cases"]])
def test_profiled_risk_golden(case: dict):
    i = case["input"]
    got = profiled_risk(
        profile=case["profile"],
        risk_score=i.get("riskScore"),
        infrastructure_score=i.get("infrastructureScore"),
        zone_type=i.get("zoneType"),
        nearest_station_has_women_desk=i.get("nearestStationHasWomenDesk"),
        female_literacy_rate=i.get("femaleLiteracyRate"),
        profile_scores=i.get("profileScores"),
    )
    assert got.score == case["expect"]["score"]
    assert got.delta == case["expect"]["delta"]
    assert got.level == case["expect"]["level"]
    assert got.data_backed == case["expect"]["dataBacked"]


def test_two_profiles():
    assert [p["profile"] for p in RISK_PROFILES] == ["general", "women"]


@pytest.mark.parametrize("zone", ["commercial", "residential", "mixed", "rural", "industrial", "institutional"])
@pytest.mark.parametrize("score", [10, 40, 70, 95])
def test_women_never_below_general(zone: str, score: int):
    women = profiled_risk(profile="women", risk_score=score, zone_type=zone)
    general = profiled_risk(profile="general", risk_score=score, zone_type=zone)
    assert women.score >= general.score


@pytest.mark.parametrize("profile", ["general", "women"])
def test_stays_on_scale(profile: str):
    for score in (0, 5, 50, 95, 100):
        for lit in (0, 50, 100):
            for desk in (True, False):
                got = profiled_risk(
                    profile=profile,
                    risk_score=score,
                    zone_type="commercial",
                    female_literacy_rate=lit,
                    nearest_station_has_women_desk=desk,
                )
                assert 0 <= got.score <= 100


def test_general_profile_is_flagged_as_modelled():
    got = profiled_risk(profile="general", risk_score=50, zone_type="mixed")
    assert got.data_backed is False
    assert "model estimate" in " ".join(got.notes).lower()


def test_supplied_score_for_other_profile_is_ignored():
    got = profiled_risk(
        profile="general", risk_score=50, zone_type="mixed", profile_scores={"women": 80}
    )
    assert got.data_backed is False
    assert got.score != 80


def test_disclaimer_is_explicit():
    assert "modelled" in GENERAL_PROFILE_DISCLAIMER.lower()


# ---------------------------------------------------------------- learning path


def test_fit_refuses_empty():
    assert fit_gendered_share({}) is None


def test_fit_refuses_one_sided_sample():
    # The current state of the project: women-only records. A ratio cannot be
    # established from one side of it.
    assert fit_gendered_share({"female": 5000, "male": 0, "other": 0}) is None


def test_fit_refuses_thin_non_female_sample():
    assert fit_gendered_share({"female": 5000, "male": 3, "other": 1}) is None


def test_fit_excludes_unknown_from_the_ratio():
    # 'unknown' says nothing about gender. Counting it as non-female would make
    # the share depend on how complete the source records are.
    a = fit_gendered_share({"female": 300, "male": 300, "unknown": 0})
    b = fit_gendered_share({"female": 300, "male": 300, "unknown": 99999})
    assert a == b == 0.5


def test_fit_produces_a_share_in_range():
    share = fit_gendered_share({"female": 700, "male": 300})
    assert share == 0.7
    assert 0.0 <= share <= 1.0


def test_fit_threshold_is_per_group():
    exactly = fit_gendered_share(
        {"female": MIN_PER_GENDER_TO_FIT, "male": MIN_PER_GENDER_TO_FIT}
    )
    assert exactly == 0.5
    just_under = fit_gendered_share(
        {"female": MIN_PER_GENDER_TO_FIT, "male": MIN_PER_GENDER_TO_FIT - 1}
    )
    assert just_under is None
