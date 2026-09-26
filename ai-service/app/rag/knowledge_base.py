"""Retrieval-augmented grounding for the safety agents.

The agents answer questions like "is this area safe at night?". Those answers
must be grounded in vetted guidance rather than improvised by the LLM, so this
module holds a small curated corpus and a retriever over it.

Two backends:

* **ChromaDB** — used when ``chromadb`` is installed (see requirements.txt).
* **Lexical fallback** — a dependency-free scorer used otherwise, so the service
  degrades gracefully instead of failing to start.

The corpus contains only public, non-personal information: official helpline
numbers, statutory references and general safety practice. It contains no
victim data of any kind.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from app.config import settings


@dataclass(frozen=True)
class Document:
    """A single retrievable guidance snippet."""

    id: str
    title: str
    text: str
    category: str
    tags: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "text": self.text,
            "category": self.category,
            "tags": list(self.tags),
        }


# =========================
# Curated corpus
# =========================

SAFETY_DOCUMENTS: tuple[Document, ...] = (
    Document(
        id="helplines-national",
        title="National emergency helplines",
        category="emergency",
        tags=("helpline", "emergency", "police", "number", "call"),
        text=(
            "India-wide emergency numbers: 112 is the single emergency number for "
            "police, fire and ambulance. 181 is the Women Helpline. 1091 is the "
            "Women in Distress helpline. 1098 is CHILDLINE for children. 1930 is "
            "for cyber financial fraud. All are free and available 24x7. 112 can "
            "be reached even from a locked phone."
        ),
    ),
    Document(
        id="sos-what-happens",
        title="What happens when you trigger SOS",
        category="emergency",
        tags=("sos", "panic", "button", "location", "live"),
        text=(
            "Triggering SOS in SafeZone sends your current coordinates to the "
            "nearest registered police station and begins streaming your live "
            "location. No account is required. Location points are retained for a "
            "maximum of 72 hours and then purged automatically. You can cancel an "
            "SOS yourself if you are safe. SOS is not a substitute for calling "
            "112 — do both when you can."
        ),
    ),
    Document(
        id="night-travel-practice",
        title="Reducing risk when travelling at night",
        category="practice",
        tags=("night", "travel", "alone", "late", "dark", "walking", "auto", "cab"),
        text=(
            "Practical steps that reduce exposure when travelling after dark: "
            "prefer well-lit main roads over shortcuts through unlit stretches; "
            "share your live trip with a trusted contact; note the vehicle "
            "registration number before boarding a cab or auto and send it to "
            "someone; sit in the rear seat; keep one earphone out so you stay aware "
            "of your surroundings; and if a vehicle deviates from the expected "
            "route, call 112 and speak your location out loud."
        ),
    ),
    Document(
        id="risk-score-meaning",
        title="How to read a SafeZone risk score",
        category="methodology",
        tags=("risk", "score", "meaning", "interpret", "level", "heat", "map"),
        text=(
            "A zone risk score runs from 0 to 100 and is banded as very_low (0-19), "
            "low (20-39), moderate (40-59), high (60-79) and critical (80-100). It "
            "is computed from reported incident frequency, how recent those reports "
            "are, demographic indicators, infrastructure such as lighting and police "
            "density, and the recent trend. A high score means reported risk is "
            "elevated relative to other zones — it is a statistical signal for "
            "resource allocation, not a prediction about any individual, and not a "
            "statement that an area is unsafe at a given moment."
        ),
    ),
    Document(
        id="risk-score-limits",
        title="Limitations of the risk data",
        category="methodology",
        tags=("limitation", "caveat", "accuracy", "bias", "underreporting"),
        text=(
            "Risk scores inherit the biases of their sources. Crimes against women "
            "are widely under-reported, so a low score may reflect low reporting "
            "rather than low risk. Better-policed areas can show higher counts "
            "simply because reporting is easier there. Scores are recomputed monthly "
            "and lag real conditions. They should never be used to profile "
            "individuals, set insurance or rental terms, or justify restricting "
            "anyone's movement."
        ),
    ),
    Document(
        id="reporting-fir",
        title="Filing a police report (FIR)",
        category="legal",
        tags=("fir", "report", "complaint", "police", "station", "zero"),
        text=(
            "An FIR can be filed at any police station; under the 'Zero FIR' rule a "
            "station must register a cognizable offence even if it occurred outside "
            "its jurisdiction and then transfer it. Refusal to register a cognizable "
            "offence can be escalated to the Superintendent of Police or the "
            "Magistrate. A copy of the FIR must be given free of charge. Complaints "
            "can also be filed online in many states and with the National "
            "Commission for Women. This is general information, not legal advice."
        ),
    ),
    Document(
        id="identity-protection",
        title="Protection of a survivor's identity",
        category="legal",
        tags=("identity", "privacy", "anonymity", "disclosure", "228a", "name"),
        text=(
            "Disclosing the identity of a survivor of certain sexual offences is a "
            "criminal offence in India (historically IPC Section 228A, carried "
            "forward under the Bharatiya Nyaya Sanhita). Statements can be recorded "
            "by a woman officer and, where applicable, at the survivor's residence. "
            "SafeZone therefore stores no names, addresses or FIR numbers — only "
            "age brackets, zone-level location and aggregate counts."
        ),
    ),
    Document(
        id="privacy-dpdp",
        title="What SafeZone stores about you",
        category="privacy",
        tags=("privacy", "data", "dpdp", "store", "retention", "personal"),
        text=(
            "Under the Digital Personal Data Protection Act 2023, SafeZone minimises "
            "personal data. Incident records hold no victim identity — only an age "
            "bracket, zone, month and year. SOS location streams are retained for at "
            "most 72 hours. Every access to sensitive records is written to an audit "
            "log. Accounts exist for police, analysts and administrators; public "
            "users can view risk data and raise SOS without an account."
        ),
    ),
    Document(
        id="workplace-harassment",
        title="Workplace harassment redressal",
        category="legal",
        tags=("workplace", "office", "harassment", "posh", "committee", "employer"),
        text=(
            "The Sexual Harassment of Women at Workplace (Prevention, Prohibition "
            "and Redressal) Act 2013 requires every employer with ten or more "
            "employees to constitute an Internal Committee to receive complaints. "
            "Complaints are normally to be filed within three months of the "
            "incident, extendable at the committee's discretion. Where no Internal "
            "Committee exists, a Local Committee at the district level receives the "
            "complaint. This is general information, not legal advice."
        ),
    ),
    Document(
        id="supporting-someone",
        title="Supporting someone in immediate danger",
        category="practice",
        tags=("help", "bystander", "support", "friend", "danger", "intervene"),
        text=(
            "If someone appears to be in immediate danger, call 112 first and give a "
            "precise location and landmark. Do not put yourself at risk to intervene "
            "physically. Drawing attention — turning on lights, making noise, asking "
            "loudly whether the person needs help — is often effective and safer. "
            "Stay with the person until help arrives if it is safe to do so, and let "
            "them decide what they want reported."
        ),
    ),
    Document(
        id="patrol-allocation",
        title="How patrol suggestions are produced",
        category="methodology",
        tags=("patrol", "route", "police", "allocation", "shift", "optimise"),
        text=(
            "Patrol suggestions rank zones by current risk score weighted by the "
            "time-of-day pattern of past reports, then distribute the available "
            "officers across the highest-weighted zones subject to travel distance. "
            "Output is advisory input for a duty officer, not an automated command, "
            "and should be reviewed against local knowledge before deployment."
        ),
    ),
)


# =========================
# Retriever
# =========================

_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Very common words carry no retrieval signal.
_STOPWORDS = frozenset(
    """
    a an the is are was were be been being am and or but if then than that this these those
    of to in on at by for with from as it its i you he she they we my your our their
    do does did done doing have has had having will would can could should may might must
    what when where which who whom how why not no nor so such about into over under
    me us them there here also very more most some any all both each few other own same
    """.split()
)


def _tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS]


class KnowledgeBase:
    """Retriever over the curated safety corpus.

    Uses ChromaDB when available and a lexical scorer otherwise. Both backends
    expose the same ``search`` signature.
    """

    def __init__(
        self,
        documents: Optional[tuple[Document, ...]] = None,
        use_chroma: bool = True,
        persist_dir: Optional[str] = None,
    ):
        self.documents: tuple[Document, ...] = documents or SAFETY_DOCUMENTS
        self._by_id = {d.id: d for d in self.documents}
        self._collection = None
        self.backend = "lexical"

        # Precompute document token sets and IDF weights for the fallback.
        self._doc_tokens: dict[str, list[str]] = {
            d.id: _tokenize(f"{d.title} {d.text} {' '.join(d.tags)}") for d in self.documents
        }
        self._idf = self._compute_idf()

        if use_chroma:
            self._try_init_chroma(persist_dir or settings.chroma_persist_dir)

    # ---- ChromaDB backend ----

    def _try_init_chroma(self, persist_dir: str) -> None:
        try:
            import chromadb
            from chromadb.config import Settings as ChromaSettings

            # Telemetry is disabled deliberately: this is a privacy-first project
            # and the corpus/queries must not leave the deployment.
            client = chromadb.PersistentClient(
                path=persist_dir,
                settings=ChromaSettings(anonymized_telemetry=False),
            )
            collection = client.get_or_create_collection(name="safezone_safety_kb")

            # Only (re)populate when the corpus size changed.
            if collection.count() != len(self.documents):
                if collection.count():
                    collection.delete(ids=[d.id for d in self.documents])
                collection.add(
                    ids=[d.id for d in self.documents],
                    documents=[f"{d.title}. {d.text}" for d in self.documents],
                    metadatas=[
                        {"title": d.title, "category": d.category, "tags": ",".join(d.tags)}
                        for d in self.documents
                    ],
                )

            self._collection = collection
            self.backend = "chromadb"
        except Exception:
            # Any failure (missing package, unwritable path, version drift)
            # leaves the lexical fallback in place.
            self._collection = None
            self.backend = "lexical"

    # ---- Lexical backend ----

    def _compute_idf(self) -> dict[str, float]:
        n_docs = max(1, len(self.documents))
        doc_freq: dict[str, int] = {}
        for tokens in self._doc_tokens.values():
            for token in set(tokens):
                doc_freq[token] = doc_freq.get(token, 0) + 1
        return {
            token: math.log(1 + n_docs / (1 + freq))
            for token, freq in doc_freq.items()
        }

    def _lexical_search(self, query: str, k: int) -> list[tuple[Document, float]]:
        query_tokens = _tokenize(query)
        if not query_tokens:
            return []

        scored: list[tuple[Document, float]] = []
        for doc in self.documents:
            tokens = self._doc_tokens[doc.id]
            if not tokens:
                continue
            counts: dict[str, int] = {}
            for token in tokens:
                counts[token] = counts.get(token, 0) + 1

            score = 0.0
            for qt in query_tokens:
                if qt in counts:
                    # Sub-linear term frequency, weighted by inverse document frequency.
                    score += (1 + math.log(counts[qt])) * self._idf.get(qt, 1.0)
                # Exact tag hits are a strong signal.
                if qt in doc.tags:
                    score += 2.0

            if score > 0:
                # Normalise by document length so long docs don't dominate.
                scored.append((doc, score / math.sqrt(len(tokens))))

        scored.sort(key=lambda pair: (-pair[1], pair[0].id))
        return scored[:k]

    # ---- Public API ----

    def search(self, query: str, k: int = 3) -> list[dict[str, Any]]:
        """Return up to ``k`` guidance snippets relevant to ``query``.

        Results are ordered most-relevant first. An empty list means nothing in
        the corpus matched, in which case the caller should fall back to generic
        advice rather than inventing specifics.
        """
        if k <= 0:
            return []

        if self._collection is not None:
            try:
                result = self._collection.query(query_texts=[query], n_results=k)
                ids = (result.get("ids") or [[]])[0]
                distances = (result.get("distances") or [[]])[0]
                out: list[dict[str, Any]] = []
                for i, doc_id in enumerate(ids):
                    doc = self._by_id.get(doc_id)
                    if doc is None:
                        continue
                    payload = doc.to_dict()
                    if i < len(distances) and distances[i] is not None:
                        payload["distance"] = float(distances[i])
                    out.append(payload)
                if out:
                    return out
            except Exception:
                pass  # Fall through to lexical.

        return [
            {**doc.to_dict(), "score": round(score, 4)}
            for doc, score in self._lexical_search(query, k)
        ]

    def build_context(self, query: str, k: int = 3) -> str:
        """Render retrieved snippets as a prompt context block.

        Returns an empty string when nothing matched, so callers can detect the
        ungrounded case explicitly.
        """
        hits = self.search(query, k)
        if not hits:
            return ""
        return "\n\n".join(f"[{hit['title']}]\n{hit['text']}" for hit in hits)

    def get(self, doc_id: str) -> Optional[Document]:
        """Look up a document by id."""
        return self._by_id.get(doc_id)

    def categories(self) -> list[str]:
        """All distinct categories present in the corpus."""
        return sorted({d.category for d in self.documents})


# Module-level instance reused by the agents.
knowledge_base = KnowledgeBase()
