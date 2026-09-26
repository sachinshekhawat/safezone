"""Data Analyst Agent — Detects anomalies and data quality issues."""

import uuid
from typing import Any, Optional
from app.agents.base_agent import BaseAgent
from app.database import get_pool


class DataAnalystAgent(BaseAgent):
    """Analyzes incoming data for anomalies, quality issues, and insights."""

    def __init__(self):
        super().__init__(
            agent_name="data_analyst",
            system_prompt=(
                "You are a data quality analyst for SafeZone India. "
                "Analyze incident data for anomalies, quality issues, and patterns. "
                "Flag anything unusual and suggest investigations."
            ),
        )

    async def handle_message(self, message: str, session_id=None, context=None, language="en") -> dict:
        """Handle data analysis queries."""
        from app.models.schemas import ChatResponse
        sid, history = self._get_or_create_session(session_id)
        history.append({"role": "user", "content": message})
        response = await self._invoke_llm(history)
        history.append({"role": "assistant", "content": response})
        return ChatResponse(session_id=sid, message=response, tools_used=[]).model_dump()

    async def analyze(self, city_id: Optional[str] = None) -> dict:
        """Run automated data analysis."""
        task_id = str(uuid.uuid4())

        try:
            pool = await get_pool()
            findings = []

            # Check 1: Zones with sudden spikes
            spike_rows = await pool.fetch("""
                WITH monthly AS (
                    SELECT zone_id, incident_year, incident_month, COUNT(*) AS cnt
                    FROM incidents WHERE deleted_at IS NULL
                    GROUP BY zone_id, incident_year, incident_month
                ),
                with_avg AS (
                    SELECT *, AVG(cnt) OVER (PARTITION BY zone_id ORDER BY incident_year, incident_month 
                                              ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS avg_6m
                    FROM monthly
                )
                SELECT z.name, w.cnt, w.avg_6m, w.incident_year, w.incident_month
                FROM with_avg w
                JOIN zones z ON w.zone_id = z.id
                WHERE w.cnt > COALESCE(w.avg_6m, 0) * 2 AND w.avg_6m > 0
                ORDER BY w.incident_year DESC, w.incident_month DESC
                LIMIT 10
            """)

            for row in spike_rows:
                findings.append({
                    "type": "spike",
                    "severity": "high",
                    "zone": row["name"],
                    "message": f"Spike detected: {row['cnt']} incidents vs {row['avg_6m']:.1f} avg",
                    "period": f"{row['incident_year']}-{row['incident_month']:02d}",
                })

            # Check 2: Unverified incident ratio
            unverified = await pool.fetchrow("""
                SELECT COUNT(*) FILTER (WHERE NOT is_verified) AS unverified,
                       COUNT(*) AS total
                FROM incidents WHERE deleted_at IS NULL
            """)

            if unverified and unverified["total"] > 0:
                ratio = unverified["unverified"] / unverified["total"]
                if ratio > 0.3:
                    findings.append({
                        "type": "data_quality",
                        "severity": "medium",
                        "message": f"{ratio*100:.0f}% of incidents are unverified ({unverified['unverified']}/{unverified['total']})",
                    })

            return {
                "task_id": task_id,
                "findings_count": len(findings),
                "findings": findings,
                "status": "completed",
            }

        except Exception as e:
            return {"task_id": task_id, "status": "failed", "error": str(e)}
