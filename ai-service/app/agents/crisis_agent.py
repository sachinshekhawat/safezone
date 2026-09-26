"""SOS Crisis Agent — Guides victims through emergencies."""

from typing import Any, Optional

from app.agents.base_agent import BaseAgent
from app.models.schemas import ChatResponse


CRISIS_SYSTEM_PROMPT = """You are a crisis response assistant for SafeZone India. 
A user has activated an SOS alert or is in a potentially dangerous situation.

YOUR RULES:
1. Keep responses SHORT (1-3 sentences max) — the user may be in danger
2. Be calm, clear, and reassuring
3. NEVER ask for personal information (name, address, etc.)
4. Assess the situation with minimal questions
5. Provide actionable safety steps
6. Inform them that police have been alerted with their location
7. If user stops responding for 2+ messages, assume danger — escalate
8. Always remind them of emergency numbers: 112 (Police), 181 (Women Helpline)
9. If they mention a specific threat, advise immediate specific action

CONTEXT PROVIDED:
- Current location coordinates (lat/lng)  
- Nearest police station name and distance
- Area risk level
- Current time

Respond in {language}. If Hindi, use simple Hinglish (Roman script) that everyone can understand.
"""


class CrisisAgent(BaseAgent):
    """SOS Crisis Agent that guides victims through emergencies."""

    def __init__(self):
        super().__init__(
            agent_name="crisis_agent",
            system_prompt=CRISIS_SYSTEM_PROMPT,
        )

    async def handle_message(
        self,
        message: str,
        session_id: Optional[str] = None,
        context: Optional[dict[str, Any]] = None,
        language: str = "en",
    ) -> dict:
        """Handle a crisis message."""
        sid, history = self._get_or_create_session(session_id)

        # Inject context into system prompt if first message
        if len(history) == 1 and context:
            context_str = self._format_context(context)
            history[0]["content"] = self.system_prompt.format(language=language) + f"\n\n{context_str}"

        # Add user message
        history.append({"role": "user", "content": message})

        # Generate response
        response_text = await self._invoke_llm(history)

        # Add to history
        history.append({"role": "assistant", "content": response_text})

        return ChatResponse(
            session_id=sid,
            message=response_text,
            tools_used=[],
        ).model_dump()

    def _format_context(self, context: dict) -> str:
        """Format context data for the system prompt."""
        parts = ["CURRENT SITUATION:"]
        if "latitude" in context and "longitude" in context:
            parts.append(f"- Location: {context['latitude']:.4f}, {context['longitude']:.4f}")
        if "nearest_station" in context:
            parts.append(f"- Nearest police station: {context['nearest_station']}")
        if "station_distance" in context:
            parts.append(f"- Station distance: {context['station_distance']} km")
        if "risk_level" in context:
            parts.append(f"- Area risk level: {context['risk_level']}")
        if "time" in context:
            parts.append(f"- Current time: {context['time']}")
        parts.append("- Police have been automatically notified with live location")
        return "\n".join(parts)

    def _fallback_response(self, message: str) -> str:
        """Crisis-specific fallback when LLM is unavailable."""
        msg_lower = message.lower()

        if any(word in msg_lower for word in ["follow", "chase", "someone behind"]):
            return (
                "🚨 Go to the nearest crowded place immediately. "
                "Police have been alerted. Call 112 NOW. "
                "Keep your phone visible — it deters attackers."
            )
        elif any(word in msg_lower for word in ["help", "danger", "scared"]):
            return (
                "🚨 Stay calm. Police have been notified with your location. "
                "Move to a well-lit area if possible. Call 112 or 181 immediately."
            )
        elif any(word in msg_lower for word in ["safe", "okay", "fine"]):
            return (
                "✅ Glad you're safe. You can cancel the SOS if the situation is resolved. "
                "Police will continue monitoring until you confirm."
            )
        else:
            return (
                "🆘 Help is on the way. Police have your live location. "
                "Stay in a safe spot. Call 112 for immediate assistance."
            )
