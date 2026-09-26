"""AI Agent API endpoints."""

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.models.schemas import ChatRequest, ChatResponse, AgentTaskRequest, AgentTaskResponse
from app.agents.crisis_agent import CrisisAgent
from app.agents.advisor_agent import SafetyAdvisorAgent
from app.agents.report_agent import ReportGeneratorAgent
from app.agents.patrol_agent import PatrolOptimizerAgent
from app.agents.analyst_agent import DataAnalystAgent

router = APIRouter()

# Initialize agents
crisis_agent = CrisisAgent()
advisor_agent = SafetyAdvisorAgent()
report_agent = ReportGeneratorAgent()
patrol_agent = PatrolOptimizerAgent()
analyst_agent = DataAnalystAgent()

AGENTS = {
    "crisis": crisis_agent,
    "advisor": advisor_agent,
    "report_gen": report_agent,
    "patrol_opt": patrol_agent,
    "data_analyst": analyst_agent,
}


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Send a message to an AI agent and get a response."""
    agent = AGENTS.get(request.agent_type)
    if not agent:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown agent type: {request.agent_type}. Available: {list(AGENTS.keys())}",
        )

    try:
        response = await agent.handle_message(
            message=request.message,
            session_id=request.session_id,
            context=request.context,
            language=request.language or "en",
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream a response from an AI agent using Server-Sent Events."""
    agent = AGENTS.get(request.agent_type)
    if not agent:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown agent type: {request.agent_type}",
        )

    async def event_generator():
        async for chunk in agent.stream_message(
            message=request.message,
            session_id=request.session_id,
            context=request.context,
            language=request.language or "en",
        ):
            yield {"event": "message", "data": chunk}
        yield {"event": "done", "data": ""}

    return EventSourceResponse(event_generator())


@router.post("/tasks/generate-report", response_model=AgentTaskResponse)
async def generate_report(request: AgentTaskRequest):
    """Trigger the Report Generator Agent to create a monthly report."""
    try:
        result = await report_agent.generate_report(
            city_id=request.params.get("city_id"),
            month=request.params.get("month"),
            year=request.params.get("year"),
        )
        return AgentTaskResponse(
            task_id=result["task_id"],
            status="completed",
            result=result,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


@router.post("/tasks/optimize-patrol", response_model=AgentTaskResponse)
async def optimize_patrol(request: AgentTaskRequest):
    """Trigger the Patrol Optimizer Agent to suggest patrol routes."""
    try:
        result = await patrol_agent.optimize(
            city_id=request.params.get("city_id"),
            shift=request.params.get("shift", "night"),
            officers_available=request.params.get("officers_available", 10),
        )
        return AgentTaskResponse(
            task_id=result["task_id"],
            status="completed",
            result=result,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")


@router.post("/tasks/analyze-data", response_model=AgentTaskResponse)
async def analyze_data(request: AgentTaskRequest):
    """Trigger the Data Analyst Agent to scan for anomalies."""
    try:
        result = await analyst_agent.analyze(
            city_id=request.params.get("city_id"),
        )
        return AgentTaskResponse(
            task_id=result["task_id"],
            status="completed",
            result=result,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
