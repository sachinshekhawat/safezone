"""Shared pytest fixtures for the SafeZone AI service test suite.

These tests deliberately avoid the heavy optional dependencies (langchain,
chromadb, xgboost) so they run in a slim environment. Modules that need those
are exercised through their documented fallback paths.
"""

from __future__ import annotations

import os
import sys
from uuid import UUID

import pytest

# Make `app` importable when pytest is run from the ai-service directory.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def zone_id() -> UUID:
    """A stable zone UUID for request objects."""
    return UUID("a1000000-0000-0000-0000-000000000001")


@pytest.fixture
def monthly_series() -> list[dict]:
    """12 months of increasing incident counts."""
    return [
        {"month": ((i) % 12) + 1, "year": 2024 + (i // 12), "count": 2 + i}
        for i in range(12)
    ]
