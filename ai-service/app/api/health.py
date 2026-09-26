"""Health check endpoints for the AI service."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def health():
    """AI service health check."""
    return {"status": "healthy", "service": "ai-ml"}
