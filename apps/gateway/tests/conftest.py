"""
Pytest configuration and fixtures for Gateway API tests.
"""
from __future__ import annotations

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Add project root to sys.path to allow imports from apps.gateway
project_root = Path(__file__).resolve().parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))


@pytest.fixture
def client(monkeypatch):
    """FastAPI test client."""
    # Mock the security checks to allow test client
    # The middleware checks request.client.host which returns "testclient" for TestClient

    # 1. Mock TrafficMonitoringMiddleware to allow "testclient" IP
    from apps.gateway.traffic.middleware import TrafficMonitoringMiddleware

    original_is_external = TrafficMonitoringMiddleware._is_external_connection

    def mock_is_external(self, client_ip: str) -> bool:
        if client_ip == "testclient":
            return False
        return original_is_external(self, client_ip)

    monkeypatch.setattr(
        TrafficMonitoringMiddleware,
        "_is_external_connection",
        mock_is_external
    )

    # 2. Mock OriginValidationMiddleware to allow test requests
    from apps.gateway.traffic.middleware import OriginValidationMiddleware
    from starlette.responses import Response

    original_dispatch = OriginValidationMiddleware.dispatch

    async def mock_dispatch(self, request, call_next):
        # Allow all requests from testclient
        if request.client and request.client.host == "testclient":
            return await call_next(request)
        return await original_dispatch(self, request, call_next)

    monkeypatch.setattr(
        OriginValidationMiddleware,
        "dispatch",
        mock_dispatch
    )

    # Import app at fixture time to avoid module-level side effects
    from apps.gateway.server import app
    return TestClient(app, base_url="http://127.0.0.1:8200")


@pytest.fixture
def temp_project(tmp_path, monkeypatch):
    """
    Create a temporary project directory with ai/ structure.

    Sets KURORYUU_PROJECT_ROOT environment variable to point to tmp_path.
    """
    # Create ai/ directory structure
    ai_dir = tmp_path / "ai"
    ai_dir.mkdir()

    # Create todo.md with proper structure
    todo_content = """# Tasks

## Backlog

## Active

## Delayed

## Done

## Claude Tasks
"""
    (ai_dir / "todo.md").write_text(todo_content, encoding="utf-8")

    # Create empty task-meta.json
    (ai_dir / "task-meta.json").write_text('{"version": 1, "tasks": {}}', encoding="utf-8")

    # Create PRD directories
    prd_dir = ai_dir / "prd"
    prd_dir.mkdir()
    (prd_dir / "active").mkdir()
    (prd_dir / "archive").mkdir()
    (prd_dir / "sessions").mkdir()

    # Set environment variable to use this temp directory
    monkeypatch.setenv("KURORYUU_PROJECT_ROOT", str(tmp_path))

    return tmp_path
