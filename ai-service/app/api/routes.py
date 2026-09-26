"""API route mounting."""

from fastapi import APIRouter
from app.api.health import router as health_router
from app.api.ml_routes import router as ml_router
from app.api.agent_routes import router as agent_router

api_router = APIRouter()

api_router.include_router(health_router, prefix="/health", tags=["Health"])
api_router.include_router(ml_router, prefix="/ml", tags=["ML Predictions"])
api_router.include_router(agent_router, prefix="/agents", tags=["AI Agents"])
