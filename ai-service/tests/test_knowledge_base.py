"""Tests for the RAG knowledge base.

These run against the lexical fallback so they do not require chromadb.
"""

from __future__ import annotations

import pytest

from app.rag.knowledge_base import (
    SAFETY_DOCUMENTS,
    Document,
    KnowledgeBase,
    _tokenize,
)


@pytest.fixture
def kb() -> KnowledgeBase:
    # use_chroma=False keeps the test deterministic and dependency-free.
    return KnowledgeBase(use_chroma=False)


def test_corpus_is_non_empty_and_well_formed():
    assert len(SAFETY_DOCUMENTS) >= 5
    for doc in SAFETY_DOCUMENTS:
        assert doc.id and doc.title and doc.text and doc.category
        assert len(doc.text) > 80, f"{doc.id} text looks like a stub"


def test_document_ids_are_unique():
    ids = [d.id for d in SAFETY_DOCUMENTS]
    assert len(ids) == len(set(ids))


def test_backend_is_lexical_when_chroma_disabled(kb):
    assert kb.backend == "lexical"


def test_tokenize_drops_stopwords_and_punctuation():
    tokens = _tokenize("What is the SAFEST route, at night?")
    assert "the" not in tokens
    assert "is" not in tokens
    assert "safest" in tokens
    assert "night" in tokens


def test_search_returns_at_most_k(kb):
    for k in (1, 2, 3, 5):
        assert len(kb.search("police helpline number", k=k)) <= k


def test_search_with_zero_k_returns_empty(kb):
    assert kb.search("anything", k=0) == []


def test_search_finds_helpline_document(kb):
    hits = kb.search("what emergency number should I call for police", k=3)
    assert hits
    assert any(h["id"] == "helplines-national" for h in hits)


def test_search_finds_night_travel_document(kb):
    hits = kb.search("is it safe to walk alone at night in a dark area", k=3)
    assert hits
    assert any(h["id"] == "night-travel-practice" for h in hits)


def test_search_finds_risk_score_explanation(kb):
    hits = kb.search("what does a risk score of 75 mean", k=3)
    assert hits
    assert any(h["id"].startswith("risk-score") for h in hits)


def test_search_finds_fir_document(kb):
    hits = kb.search("how do I file an FIR complaint", k=3)
    assert hits
    assert any(h["id"] == "reporting-fir" for h in hits)


def test_results_are_ordered_by_descending_score(kb):
    hits = kb.search("police station complaint report", k=5)
    scores = [h["score"] for h in hits]
    assert scores == sorted(scores, reverse=True)


def test_unmatched_query_returns_empty(kb):
    # Nonsense tokens appear in no document.
    assert kb.search("zzzqqq wibblefrotz xyzzyplugh", k=3) == []


def test_empty_query_returns_empty(kb):
    assert kb.search("", k=3) == []
    assert kb.search("the and of is", k=3) == []


def test_build_context_includes_titles_and_text(kb):
    context = kb.build_context("emergency helpline number", k=2)
    assert context
    assert "[" in context and "]" in context
    assert "112" in context


def test_build_context_empty_when_nothing_matches(kb):
    assert kb.build_context("zzzqqq wibblefrotz", k=3) == ""


def test_search_is_deterministic(kb):
    a = kb.search("night safety travel", k=3)
    b = kb.search("night safety travel", k=3)
    assert [h["id"] for h in a] == [h["id"] for h in b]


def test_get_by_id(kb):
    assert kb.get("helplines-national") is not None
    assert kb.get("no-such-doc") is None


def test_categories_are_sorted_and_unique(kb):
    categories = kb.categories()
    assert categories == sorted(set(categories))
    assert "emergency" in categories


def test_custom_corpus_is_respected():
    docs = (
        Document(
            id="custom-1",
            title="Custom guidance",
            text="This is a bespoke document about streetlight coverage in Alwar." * 3,
            category="custom",
            tags=("streetlight", "alwar"),
        ),
    )
    kb = KnowledgeBase(documents=docs, use_chroma=False)

    hits = kb.search("streetlight alwar", k=3)
    assert len(hits) == 1
    assert hits[0]["id"] == "custom-1"
    assert kb.categories() == ["custom"]


def test_privacy_corpus_contains_no_personal_identifiers():
    """The corpus must not contain anything resembling personal data."""
    for doc in SAFETY_DOCUMENTS:
        lowered = doc.text.lower()
        assert "aadhaar" not in lowered
        assert "@" not in doc.text, f"{doc.id} contains an email-like string"
