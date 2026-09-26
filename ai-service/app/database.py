"""Async PostgreSQL database connection."""

import asyncpg
from app.config import settings

_pool: asyncpg.Pool | None = None


async def init_db():
    """Initialize the database connection pool."""
    global _pool
    _pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=2,
        max_size=10,
    )
    print("✅ AI Service connected to PostgreSQL")


async def close_db():
    """Close the database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        print("🔌 AI Service PostgreSQL connection closed")


async def get_pool() -> asyncpg.Pool:
    """Get the database connection pool."""
    if _pool is None:
        raise RuntimeError("Database not initialized")
    return _pool
