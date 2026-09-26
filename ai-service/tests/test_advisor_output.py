"""Tests for advisor output shaping and time-band resolution."""

from __future__ import annotations

import pytest

from app.agents.advisor_agent import SafetyAdvisorAgent
from app.agents.plain_text import to_plain_text


# ---------------------------------------------------------------- sanitiser


def test_strips_bold_and_italics():
    got = to_plain_text("Connaught Place has a **moderate** score and is *busy*.")
    assert got == "Connaught Place has a moderate score and is busy."
    assert "*" not in got


def test_strips_markdown_links_but_keeps_the_label():
    got = to_plain_text("Read the [safety guide](https://example.com/guide) first.")
    assert got == "Read the safety guide first."
    assert "http" not in got


def test_removes_bare_urls():
    got = to_plain_text("See https://example.com/x for details.")
    assert "http" not in got
    assert "example.com" not in got


def test_nested_bold_inside_link_leaves_no_asterisks():
    got = to_plain_text("Try [**this**](https://x.com).")
    assert "*" not in got
    assert "this" in got


def test_bullets_become_sentences_not_deletions():
    # The content of a list is usually the actual advice — dropping the lines
    # would throw away the answer.
    got = to_plain_text("Do this:\n- Stick to main roads\n- Share your trip\n")
    assert "Stick to main roads." in got
    assert "Share your trip." in got
    assert "-" not in got


def test_numbered_lists_are_flattened():
    got = to_plain_text("1. Call 112\n2. Move to a lit area\n")
    assert "Call 112." in got
    assert "Move to a lit area." in got
    assert not got.startswith("1.")


def test_bullet_already_ending_in_punctuation_is_not_double_terminated():
    got = to_plain_text("- Stay alert.\n")
    assert got == "Stay alert."
    assert ".." not in got


def test_strips_headings_and_quotes():
    got = to_plain_text("## Safety\n> be careful\nPlain line")
    assert "#" not in got
    assert ">" not in got
    assert "Safety" in got and "be careful" in got


def test_strips_code_ticks():
    assert to_plain_text("Dial `112` now.") == "Dial 112 now."


def test_collapses_excess_blank_lines():
    got = to_plain_text("One\n\n\n\nTwo")
    assert got == "One\n\nTwo"


def test_keeps_helpline_numbers_intact():
    # Numbers are the one thing that must survive untouched.
    text = "Police is 112 and the women's helpline is 181."
    assert to_plain_text(text) == text


def test_handles_empty_and_none_like_input():
    assert to_plain_text("") == ""
    assert to_plain_text("   \n  ") == ""


def test_horizontal_rules_removed():
    got = to_plain_text("Above\n---\nBelow")
    assert "---" not in got
    assert "Above" in got and "Below" in got


def test_is_idempotent():
    once = to_plain_text("**Bold** and [link](https://x.com)")
    assert to_plain_text(once) == once


# ---------------------------------------------------------------- band resolution


@pytest.fixture
def agent() -> SafetyAdvisorAgent:
    return SafetyAdvisorAgent()


@pytest.mark.parametrize(
    "question,expected",
    [
        ("is saket safe late night", "late_night"),
        ("is saket safe after midnight", "late_night"),
        ("is saket safe at night", "night"),
        ("is it ok tonight", "night"),
        ("how about in the evening", "evening"),
        ("safe in the afternoon?", "afternoon"),
        ("what about early morning", "dawn"),
        ("is it fine in the morning", "morning"),
    ],
)
def test_band_from_question_wording(agent: SafetyAdvisorAgent, question: str, expected: str):
    assert agent._resolve_band(question, None) == expected


def test_late_night_wins_over_night(agent: SafetyAdvisorAgent):
    # "late night" contains "night"; the longer phrase must win or every
    # late-night question would be answered for the milder band.
    assert agent._resolve_band("is chandni chowk safe late night", None) == "late_night"


def test_explicit_band_from_caller_beats_question_wording(agent: SafetyAdvisorAgent):
    # The UI's time filter is an explicit choice and should not be second-guessed
    # by a stray word in the question.
    assert agent._resolve_band("is it safe at night", {"time_band": "morning"}) == "morning"


def test_invalid_explicit_band_is_ignored(agent: SafetyAdvisorAgent):
    assert agent._resolve_band("is it safe at night", {"time_band": "teatime"}) == "night"


def test_local_hour_used_when_question_has_no_time_word(agent: SafetyAdvisorAgent):
    assert agent._resolve_band("is saket safe", {"local_hour": 2}) == "late_night"
    assert agent._resolve_band("is saket safe", {"local_hour": 9}) == "morning"
    assert agent._resolve_band("is saket safe", {"local_hour": 22}) == "night"


def test_bad_local_hour_falls_back_without_raising(agent: SafetyAdvisorAgent):
    band = agent._resolve_band("is saket safe", {"local_hour": "not-a-number"})
    assert band in {"dawn", "morning", "afternoon", "evening", "night", "late_night"}


# ---------------------------------------------------------------- time context


def test_time_context_names_factors_for_a_dark_hour(agent: SafetyAdvisorAgent):
    zones = [
        {
            "zone_name": "Test Zone",
            "risk_score": 50,
            "infrastructure_score": 20,
            "zone_type": "commercial",
        }
    ]
    text, payload = agent._format_time_context("late_night", zones)

    assert "late night" in text.lower()
    assert "Factor:" in text
    assert "MODEL ESTIMATE" in text, "the prompt must be told this is modelled, not observed"
    assert payload is not None
    assert payload["delta"] > 0
    assert payload["adjusted_score"] > 50


def test_time_context_is_flat_at_midday(agent: SafetyAdvisorAgent):
    zones = [
        {
            "zone_name": "Test Zone",
            "risk_score": 50,
            "infrastructure_score": 20,
            "zone_type": "commercial",
        }
    ]
    text, payload = agent._format_time_context("afternoon", zones)
    assert "adds nothing" in text
    assert payload["delta"] == 0


def test_time_context_without_zones_still_states_the_hour(agent: SafetyAdvisorAgent):
    text, payload = agent._format_time_context("night", [])
    assert "night" in text.lower()
    assert payload is None


def test_time_context_handles_unscored_zone(agent: SafetyAdvisorAgent):
    zones = [{"zone_name": "New Zone", "risk_score": None}]
    text, payload = agent._format_time_context("late_night", zones)
    assert payload is None, "an unscored zone must not gain a modelled number"
    assert "late night" in text.lower()


def test_fallback_response_is_plain_and_has_numbers(agent: SafetyAdvisorAgent):
    got = agent._fallback_response("anything")
    assert "*" not in got and "#" not in got and "http" not in got
    assert "112" in got and "181" in got
    assert to_plain_text(got) == got
