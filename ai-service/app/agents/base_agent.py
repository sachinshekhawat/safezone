"""Base agent class with LangChain + Gemini setup."""

from __future__ import annotations

import logging
import uuid
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# People using this may be in danger. A slow answer is a failed answer, so cap
# how long we will wait on the LLM before falling back to rule-based guidance.
LLM_TIMEOUT_SECONDS = 20
LLM_MAX_RETRIES = 1


class BaseAgent(ABC):
    """Base class for all AI agents in SafeZone India.

    Provides common functionality:
    - Session management
    - LLM initialization (Gemini)
    - Message history tracking
    - Tool execution
    """

    def __init__(self, agent_name: str, system_prompt: str):
        self.agent_name = agent_name
        self.system_prompt = system_prompt
        self.sessions: dict[str, list[dict]] = {}
        self._llm = None
        # Set once we know the LLM cannot be built, so we stop retrying
        # construction on every single message.
        self._llm_unavailable = False

    @property
    def llm(self):
        """Lazy-initialize the LLM. Returns None when it is unavailable."""
        if self._llm is not None or self._llm_unavailable:
            return self._llm

        if not settings.gemini_api_key:
            logger.warning(
                "GEMINI_API_KEY is not set — agent %s will use rule-based fallbacks",
                self.agent_name,
            )
            self._llm_unavailable = True
            return None

        try:
            from langchain_google_genai import ChatGoogleGenerativeAI

            self._llm = ChatGoogleGenerativeAI(
                model=settings.gemini_model,
                google_api_key=settings.gemini_api_key,
                temperature=0.3,
                max_output_tokens=1024,
                # Without these, a retired or misnamed model retries with
                # escalating backoff for several minutes before giving up.
                max_retries=LLM_MAX_RETRIES,
                timeout=LLM_TIMEOUT_SECONDS,
            )
        except Exception:
            logger.exception("Failed to initialise LLM for agent %s", self.agent_name)
            self._llm_unavailable = True
            self._llm = None

        return self._llm

    def _get_or_create_session(self, session_id: Optional[str]) -> tuple[str, list[dict]]:
        """Get existing session or create a new one."""
        if session_id and session_id in self.sessions:
            return session_id, self.sessions[session_id]

        new_id = session_id or str(uuid.uuid4())
        self.sessions[new_id] = [{"role": "system", "content": self.system_prompt}]
        return new_id, self.sessions[new_id]

    @abstractmethod
    async def handle_message(
        self,
        message: str,
        session_id: Optional[str] = None,
        context: Optional[dict[str, Any]] = None,
        language: str = "en",
    ) -> dict:
        """Handle a user message and return a response."""
        ...

    async def stream_message(
        self,
        message: str,
        session_id: Optional[str] = None,
        context: Optional[dict[str, Any]] = None,
        language: str = "en",
    ) -> AsyncIterator[str]:
        """Stream a response token by token. Default: yield full response."""
        response = await self.handle_message(message, session_id, context, language)
        yield response.get("message", "")

    async def _invoke_llm(self, messages: list[dict]) -> str:
        """Invoke the LLM with messages. Falls back to rule-based if unavailable."""
        if self.llm is None:
            return self._fallback_response(messages[-1].get("content", ""))

        try:
            from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

            lc_messages = []
            for msg in messages:
                if msg["role"] == "system":
                    lc_messages.append(SystemMessage(content=msg["content"]))
                elif msg["role"] == "user":
                    lc_messages.append(HumanMessage(content=msg["content"]))
                elif msg["role"] == "assistant":
                    lc_messages.append(AIMessage(content=msg["content"]))

            response = await self.llm.ainvoke(lc_messages)
            return response.content
        except Exception:
            # Log the real cause for operators, but never surface provider error
            # text to someone who may be in an emergency — give them the
            # actionable fallback instead.
            logger.exception("LLM call failed for agent %s", self.agent_name)
            return self._fallback_response(messages[-1].get("content", ""))

    def _fallback_response(self, message: str) -> str:
        """Fallback response when LLM is unavailable."""
        return (
            "I'm currently operating in offline mode. "
            "For emergencies, please call 112 (Police) or 181 (Women Helpline). "
            "Stay safe."
        )
