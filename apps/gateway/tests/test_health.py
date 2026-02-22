"""
Tests for Gateway health and status endpoints.
"""
from __future__ import annotations

import pytest


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    def test_health_endpoint_returns_ok(self, client):
        """GET /v1/health should return 200 with status ok."""
        response = client.get("/v1/health")

        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") is True
        assert "status" in data
        assert "version" in data

    def test_root_endpoint_redirects_or_returns_info(self, client):
        """GET / should return useful response (may be redirect to docs)."""
        response = client.get("/", follow_redirects=False)

        # Accept 200 (info page), 3xx (redirect), or 404 (no web dist in CI)
        assert response.status_code in (200, 404) or 300 <= response.status_code < 400

    def test_tasks_health_endpoint(self, client, temp_project):
        """GET /v1/tasks/health should return health status."""
        response = client.get("/v1/tasks/health")

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert "todo_path" in data
        assert "exists" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
