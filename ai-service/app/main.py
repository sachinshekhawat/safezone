"""SafeZone India AI/ML Service — FastAPI Application."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.routes import api_router
from app.database import init_db, close_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    await init_db()
    print("🤖 SafeZone India AI Service started")
    print(f"📡 Running on http://0.0.0.0:{settings.port}")
    yield
    # Shutdown
    await close_db()
    print("👋 AI Service stopped")


app = FastAPI(
    title="SafeZone India AI Service",
    description="ML predictions and AI agents for safety risk analysis",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "safezone-india-ai",
        "version": "0.1.0",
    }
