"""Safety Advisor Agent — Answers area safety questions from recorded data."""

from datetime import datetime
from typing import Any, Optional

from app.agents.base_agent import BaseAgent
from app.agents.plain_text import to_plain_text
from app.agents.tools.zone_lookup import (
    format_zone_facts,
    lookup_zones,
    risk_band_guidance,
)
from app.models.schemas import ChatResponse
from app.models.time_risk import (
    TIME_BANDS,
    band_def,
    band_for_hour,
    time_adjusted_risk,
)
from app.rag.knowledge_base import knowledge_base


ADVISOR_SYSTEM_PROMPT = """You are the SafeZone India Safety Advisor. You talk to a
woman who wants a straight answer about whether an area is safe, usually on her
phone, often while she is deciding whether to set out.

HOW TO SOUND
Talk like a calm, well-informed friend who knows the local data. Short sentences.
Plain words. Get to the answer in the first line — never open with a preamble or
repeat her question back to her.

FORMATTING — this matters, obey it exactly:
- Write flowing prose. No bullet points, no numbered lists, no headings.
- No asterisks, no bold, no italics, no markdown of any kind.
- No links and no website addresses. If she needs a number, write the number.
- Under 120 words. Three short paragraphs at most. Usually one or two is better.

WHAT TO SAY
Lead with the verdict: is it fine, is it worth care, or should she avoid it.
Then give the one or two things that actually change her odds right now — not a
generic safety checklist. If the data shows a specific weakness, such as poor
lighting or a station being far away, say that instead of speaking in general terms.

TIME OF DAY
A TIME CONTEXT block tells you the hour she is asking about. Answer for that hour,
not for the average day. If the risk is materially worse at that hour, say so and
say why, using the factors given. If she asks about a different time than now,
answer for the time she asked about.

GROUNDING RULES — these override your own knowledge:
- When a ZONE DATA section appears below, it is the authoritative source. Use its
  risk score, risk level and nearest police station. Do not describe the area from
  memory.
- With no ZONE DATA section, say plainly you have no recorded data for that area,
  then give general precautions. Never invent a score, a station name or a distance.
- When ZONE DATA marks a score as development seed data, call the figure
  provisional.
- The base score comes from reported incidents. Any time-adjusted score is a model
  estimate built from lighting, patrol cover and how busy an area stays. Do not
  present a modelled figure as an observed one.
- Under-reporting is common, so never tell her an area is definitively safe.
- Base procedural advice on the SAFETY GUIDANCE excerpts rather than improvising
  legal detail.

HELPLINES
Include a number only when it fits what she asked. When it does, write it inline,
like: police 112, women's helpline 181. Do not append a standing list of helplines
to every reply — repeated boilerplate gets skimmed past, and then it is not there
when it matters. If she sounds like she is in danger right now, lead with calling
112 and keep the rest very short.

Close with something steadying and practical, not a warning. Respond in {language}."""


class SafetyAdvisorAgent(BaseAgent):
    """Safety Advisor Agent that answers area safety questions."""

    def __init__(self):
        super().__init__(
            agent_name="safety_advisor",
            system_prompt=ADVISOR_SYSTEM_PROMPT,
        )

    async def handle_message(
        self,
        message: str,
        session_id: Optional[str] = None,
        context: Optional[dict[str, Any]] = None,
        language: str = "en",
    ) -> dict:
        """Handle a safety inquiry, grounded in recorded zone data."""
        sid, history = self._get_or_create_session(session_id)

        # Format system prompt with language
        if len(history) == 1:
            history[0]["content"] = self.system_prompt.format(language=language)

        tools_used: list[str] = []

        # 1. Resolve any area the user named against the database.
        zones = await lookup_zones(message)
        if zones:
            tools_used.append("zone_lookup")

        # 2. Retrieve vetted procedural guidance for this question.
        guidance = knowledge_base.build_context(message, k=2)
        if guidance:
            tools_used.append("knowledge_base")

        # 3. Any context the caller supplied explicitly (e.g. the user's GPS zone).
        caller_context = self._format_context(context) if context else ""
        if caller_context:
            tools_used.append("caller_context")

        # 4. Which hour the answer should be about, and what that does to the score.
        band = self._resolve_band(message, context)
        time_context, time_adjusted = self._format_time_context(band, zones)
        tools_used.append("time_of_day_model")

        # Grounding is attached to the user turn, not the system prompt, so it
        # reflects the area named in *this* question rather than the first one.
        grounded_message = self._build_grounded_message(
            message, zones, guidance, caller_context, time_context
        )

        history.append({"role": "user", "content": grounded_message})
        response_text = await self._invoke_llm(history)
        # Enforce plain prose regardless of what the model returned. Markdown
        # renders literally in the chat bubble, and models drift back to bullet
        # lists over a long conversation however firmly the prompt asks.
        response_text = to_plain_text(response_text)
        # Store the plain question in history so the transcript stays readable
        # and the context block does not accumulate across turns.
        history[-1] = {"role": "user", "content": message}
        history.append({"role": "assistant", "content": response_text})

        return ChatResponse(
            session_id=sid,
            message=response_text,
            tools_used=tools_used,
            metadata={
                "zones_matched": [z["zone_name"] for z in zones],
                "grounded": bool(zones),
                "time_band": band,
                "time_adjusted": time_adjusted,
            },
        ).model_dump()

    def _resolve_band(self, message: str, context: Optional[dict[str, Any]]) -> str:
        """Work out which hour the question is about.

        Priority: an explicit band from the caller, then a time word in the
        question, then the caller's local hour, then the server's hour. The
        server's clock is last because it says nothing about where she is.
        """
        if context:
            explicit = context.get("time_band")
            if explicit in {b.band for b in TIME_BANDS}:
                return str(explicit)

        lowered = message.lower()
        # Checked longest-phrase first so "late night" does not match as "night".
        for phrase, band in (
            ("late night", "late_night"),
            ("midnight", "late_night"),
            ("after midnight", "late_night"),
            ("early morning", "dawn"),
            ("dawn", "dawn"),
            ("tonight", "night"),
            ("night", "night"),
            ("evening", "evening"),
            ("afternoon", "afternoon"),
            ("morning", "morning"),
        ):
            if phrase in lowered:
                return band

        if context and context.get("local_hour") is not None:
            try:
                return band_for_hour(int(context["local_hour"]))
            except (TypeError, ValueError):
                pass

        return band_for_hour(datetime.now().hour)

    def _format_time_context(self, band: str, zones: list[dict[str, Any]]) -> tuple[str, Any]:
        """Describe the hour, and how it changes the first matched zone's score."""
        definition = band_def(band)
        lines = [
            f"- Asking about: {definition.label.lower()} ({definition.range})",
        ]

        adjusted_payload: Any = None
        if zones and zones[0].get("risk_score") is not None:
            z = zones[0]
            adjusted = time_adjusted_risk(
                band=band,
                risk_score=float(z["risk_score"]),
                infrastructure_score=(
                    float(z["infrastructure_score"])
                    if z.get("infrastructure_score") is not None
                    else None
                ),
                zone_type=z.get("zone_type"),
            )
            adjusted_payload = adjusted.to_dict()

            if adjusted.delta > 0:
                lines.append(
                    f"- Modelled score for {z['zone_name']} at this hour: "
                    f"{adjusted.adjusted_score}/100 ({adjusted.level}), up "
                    f"{adjusted.delta} points from its all-hours {adjusted.base_score}/100"
                )
                for f in adjusted.factors:
                    lines.append(f"- Factor: {f.label} (+{f.points}) — {f.detail}")
                lines.append(
                    "- This adjustment is a MODEL ESTIMATE from lighting, patrol cover "
                    "and footfall, not from recorded incident times. Do not call it observed."
                )
            else:
                lines.append(
                    f"- At this hour the model adds nothing to {z['zone_name']}'s "
                    f"all-hours score of {adjusted.base_score}/100 ({adjusted.level})"
                )

        return "\n".join(lines), adjusted_payload

    def _build_grounded_message(
        self,
        message: str,
        zones: list[dict[str, Any]],
        guidance: str,
        caller_context: str,
        time_context: str = "",
    ) -> str:
        """Attach retrieved facts to the user's question."""
        parts = [f"USER QUESTION: {message}"]

        if time_context:
            parts.append("TIME CONTEXT (answer for this hour):\n" + time_context)

        if zones:
            parts.append("ZONE DATA (authoritative — cite these figures):\n" + format_zone_facts(zones))
            parts.append(risk_band_guidance(zones[0].get("risk_level")))
        else:
            parts.append(
                "ZONE DATA: none found for the area named. Tell the user you have "
                "no recorded data for it and give general precautions only."
            )

        if caller_context:
            parts.append("CALLER-SUPPLIED CONTEXT:\n" + caller_context)

        if guidance:
            parts.append("SAFETY GUIDANCE (use for procedural advice):\n" + guidance)

        return "\n\n".join(parts)

    def _format_context(self, context: dict) -> str:
        """Format available data context."""
        parts = []
        if "zone_name" in context:
            parts.append(f"- Zone: {context['zone_name']}")
        if "city_name" in context:
            parts.append(f"- City: {context['city_name']}")
        if "risk_score" in context:
            parts.append(f"- Current risk score: {context['risk_score']}/100")
        if "risk_level" in context:
            parts.append(f"- Risk level: {context['risk_level']}")
        if "incident_count" in context:
            parts.append(f"- Recent incidents (6 months): {context['incident_count']}")
        if "trend" in context:
            parts.append(f"- Trend: {context['trend']}")
        return "\n".join(parts)

    def _fallback_response(self, message: str) -> str:
        """Fallback when LLM unavailable."""
        return (
            "I cannot reach the safety data right now, so I do not want to guess at "
            "a score for that area. Stick to well-lit main roads, tell someone you "
            "trust where you are heading, and note the registration number before "
            "you get into a cab or auto. Police is 112 and the women's helpline is "
            "181, and the SOS button here works even without an account."
        )
