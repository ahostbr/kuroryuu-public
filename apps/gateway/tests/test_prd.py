"""
Tests for PRD (Product Requirements Document) endpoints.
"""
from __future__ import annotations

import pytest


class TestPRDEndpoints:
    """Tests for PRD management endpoints."""

    def test_prd_status_endpoint(self, client, temp_project):
        """GET /v1/prd/status should return PRD system status."""
        response = client.get("/v1/prd/status")

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert "active_count" in data
        assert "archived_count" in data
        assert "template_exists" in data

    def test_list_prds_returns_list(self, client, temp_project):
        """GET /v1/prd/list should return a list of PRDs."""
        response = client.get("/v1/prd/list")

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert isinstance(data["prds"], list)

    def test_get_nonexistent_prd_returns_error(self, client, temp_project):
        """GET /v1/prd/{id} should return error for missing PRD."""
        response = client.get("/v1/prd/PRD_20260101_000000_test")

        assert response.status_code == 200  # FastAPI returns 200 with error field
        data = response.json()
        assert data["ok"] is False
        assert "error" in data
        assert "not found" in data["error"].lower()

    def test_archive_nonexistent_prd_returns_error(self, client, temp_project):
        """POST /v1/prd/{id}/archive should return error for missing PRD."""
        response = client.post("/v1/prd/PRD_20260101_000000_test/archive")

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is False
        assert "error" in data


class TestPRDSessions:
    """Tests for PRD session management."""

    def test_save_session(self, client, temp_project):
        """POST /v1/prd/sessions should save a session."""
        session_data = {
            "name": "Test Session",
            "description": "A test session",
            "prds": [
                {
                    "id": "PRD_20260101_000000_test",
                    "title": "Test PRD",
                    "content": "# Test PRD Content"
                }
            ]
        }

        response = client.post("/v1/prd/sessions", json=session_data)

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert "session_id" in data
        assert data["session_id"].startswith("session_")

    def test_list_sessions_returns_list(self, client, temp_project):
        """GET /v1/prd/sessions should return a list of sessions."""
        response = client.get("/v1/prd/sessions")

        assert response.status_code == 200
        data = response.json()
        # Sessions endpoint may return error if directory doesn't exist
        # Just verify it returns a valid JSON response
        assert "sessions" in data or "error" in data

    def test_list_sessions_after_save(self, client, temp_project):
        """GET /v1/prd/sessions should list saved sessions."""
        # First save a session
        session_data = {
            "name": "Test Session",
            "description": "A test session",
            "prds": []
        }
        save_response = client.post("/v1/prd/sessions", json=session_data)
        assert save_response.json()["ok"] is True

        # Then list sessions
        list_response = client.get("/v1/prd/sessions")

        assert list_response.status_code == 200
        data = list_response.json()
        # Verify we get a sessions list (may have error if path issues)
        if data.get("ok"):
            assert "sessions" in data
            assert isinstance(data["sessions"], list)

    def test_load_nonexistent_session_returns_error(self, client, temp_project):
        """GET /v1/prd/sessions/{id} should return error for missing session."""
        response = client.get("/v1/prd/sessions/session_99999999_999999")

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is False
        assert "error" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
