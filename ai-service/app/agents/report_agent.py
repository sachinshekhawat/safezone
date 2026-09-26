"""Report Generator Agent — Auto-generates monthly safety reports."""

import uuid
from typing import Any, Optional
from app.agents.base_agent import BaseAgent
from app.database import get_pool


class ReportGeneratorAgent(BaseAgent):
    """Generates monthly safety reports for police and government."""

    def __init__(self):
        super().__init__(
            agent_name="report_generator",
            system_prompt=(
                "You are a data analyst generating safety reports for Indian law enforcement. "
                "Use the provided data to write clear, actionable reports. "
                "Focus on trends, areas needing attention, and resource allocation recommendations."
            ),
        )

    async def handle_message(self, message: str, session_id=None, context=None, language="en") -> dict:
        """Handle report-related queries."""
        from app.models.schemas import ChatResponse
        sid, history = self._get_or_create_session(session_id)
        history.append({"role": "user", "content": message})
        response = await self._invoke_llm(history)
        history.append({"role": "assistant", "content": response})
        return ChatResponse(session_id=sid, message=response, tools_used=[]).model_dump()

    async def generate_report(
        self,
        city_id: Optional[str] = None,
        month: Optional[int] = None,
        year: Optional[int] = None,
    ) -> dict:
        """Generate a comprehensive monthly report."""
        task_id = str(uuid.uuid4())

        try:
            pool = await get_pool()

            # Fetch incident data
            query = """
                SELECT i.incident_type, i.victim_age_range, i.perpetrator_type,
                       i.time_of_day, i.is_fir_filed, z.name AS zone_name
                FROM incidents i
                JOIN zones z ON i.zone_id = z.id
                WHERE i.deleted_at IS NULL
            """
            params = []
            if city_id:
                query += " AND z.city_id = $1"
                params.append(city_id)

            rows = await pool.fetch(query, *params)

            # Build report summary
            total = len(rows)
            fir_filed = sum(1 for r in rows if r["is_fir_filed"])

            report_data = {
                "total_incidents": total,
                "fir_filed": fir_filed,
                "fir_rate": round(fir_filed / total * 100, 1) if total > 0 else 0,
            }

            # Generate narrative with LLM
            prompt = f"""Generate a concise monthly safety report based on this data:
            - Total incidents: {total}
            - FIR filing rate: {report_data['fir_rate']}%
            
            Keep it professional, data-driven, and actionable."""

            narrative = await self._invoke_llm([
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": prompt},
            ])

            return {
                "task_id": task_id,
                "status": "completed",
                "report": report_data,
                "narrative": narrative,
            }

        except Exception as e:
            return {
                "task_id": task_id,
                "status": "failed",
                "error": str(e),
            }
