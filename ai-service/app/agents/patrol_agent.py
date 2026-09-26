"""Patrol Optimizer Agent — Suggests optimal patrol routes."""

import uuid
from typing import Any, Optional
from app.agents.base_agent import BaseAgent
from app.database import get_pool


class PatrolOptimizerAgent(BaseAgent):
    """Optimizes police patrol routes based on risk scores and time patterns."""

    def __init__(self):
        super().__init__(
            agent_name="patrol_optimizer",
            system_prompt=(
                "You are a patrol route optimizer for Indian police. "
                "Given risk scores, time patterns, and available officers, "
                "suggest optimal patrol deployments to maximize coverage of high-risk areas."
            ),
        )

    async def handle_message(self, message: str, session_id=None, context=None, language="en") -> dict:
        """Handle patrol-related queries."""
        from app.models.schemas import ChatResponse
        sid, history = self._get_or_create_session(session_id)
        history.append({"role": "user", "content": message})
        response = await self._invoke_llm(history)
        history.append({"role": "assistant", "content": response})
        return ChatResponse(session_id=sid, message=response, tools_used=[]).model_dump()

    async def optimize(
        self,
        city_id: Optional[str] = None,
        shift: str = "night",
        officers_available: int = 10,
    ) -> dict:
        """Generate patrol optimization suggestions."""
        task_id = str(uuid.uuid4())

        try:
            pool = await get_pool()

            # Fetch high-risk zones
            rows = await pool.fetch("""
                SELECT z.name, z.latitude, z.longitude, rs.overall_score, rs.risk_level
                FROM risk_scores rs
                JOIN zones z ON rs.zone_id = z.id
                WHERE rs.risk_level IN ('critical', 'high')
                ORDER BY rs.overall_score DESC
                LIMIT 20
            """)

            high_risk_zones = [
                {
                    "zone": r["name"],
                    "risk_score": float(r["overall_score"]),
                    "risk_level": r["risk_level"],
                    "lat": float(r["latitude"]),
                    "lng": float(r["longitude"]),
                }
                for r in rows
            ]

            # Simple allocation: proportional to risk score
            total_risk = sum(z["risk_score"] for z in high_risk_zones)
            allocations = []
            for zone in high_risk_zones[:officers_available]:
                officers = max(1, round(zone["risk_score"] / total_risk * officers_available))
                allocations.append({
                    "zone": zone["zone"],
                    "officers_recommended": officers,
                    "risk_score": zone["risk_score"],
                    "priority": "HIGH" if zone["risk_level"] == "critical" else "MEDIUM",
                    "shift": shift,
                })

            # Generate narrative
            prompt = f"""Given {officers_available} officers for {shift} shift, 
            and {len(high_risk_zones)} high-risk zones, suggest a patrol strategy.
            Top zones: {[z['zone'] for z in high_risk_zones[:5]]}"""

            narrative = await self._invoke_llm([
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": prompt},
            ])

            return {
                "task_id": task_id,
                "shift": shift,
                "officers_available": officers_available,
                "allocations": allocations,
                "narrative": narrative,
            }

        except Exception as e:
            return {"task_id": task_id, "status": "failed", "error": str(e)}
