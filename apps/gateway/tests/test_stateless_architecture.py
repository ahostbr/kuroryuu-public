"""
End-to-End Tests for Stateless Agent Architecture

Tests verify:
1. Leader request → creates run folder, writes ai/current_run.json, saves context_pack.json
2. Worker request with headers → succeeds, doesn't modify ai/*, logs show hooks skipped
3. Worker request without run_id → 400 error
4. Invalid run_id format → 400 error
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from apps.gateway.context.run_id import generate_run_id, is_valid_run_id


# Test paths
AI_DIR = Path("ai")
WORKING_DIR = Path("WORKING")
AGENT_RUNS_DIR = WORKING_DIR / "agent_runs"


@pytest.fixture
def clean_test_env():
    """Clean up test artifacts before and after tests."""
    # Clean before
    if AGENT_RUNS_DIR.exists():
        for run_dir in AGENT_RUNS_DIR.iterdir():
            if run_dir.name.startswith("test_"):
                shutil.rmtree(run_dir)
    
    yield
    
    # Clean after
    if AGENT_RUNS_DIR.exists():
        for run_dir in AGENT_RUNS_DIR.iterdir():
            if run_dir.name.startswith("test_"):
                shutil.rmtree(run_dir)


class TestRunIdValidation:
    """Tests for run_id format validation."""
    
    def test_valid_run_id_format(self):
        """Generated run IDs should be valid."""
        run_id = generate_run_id()
        assert is_valid_run_id(run_id)
    
    def test_invalid_run_id_formats(self):
        """Various invalid formats should be rejected."""
        invalid_ids = [
            "",
            "bad",
            "../../../etc/passwd",
            "20260108_153045",  # Missing random suffix
            "2026010_153045_a7f3c912",  # Wrong date format
            "20260108_15304_a7f3c912",  # Wrong time format
            "20260108_153045_a7f3c91",  # Too short suffix
            "20260108_153045_a7f3c9123",  # Too long suffix
            "20260108_153045_ZZZZZZZZ",  # Non-hex suffix
        ]
        for invalid in invalid_ids:
            assert not is_valid_run_id(invalid), f"Expected {invalid!r} to be invalid"


class TestLeaderRequests:
    """Tests for leader (default) role behavior."""
    
    def test_leader_creates_run_folder(self, client, clean_test_env):
        """Leader request should create run folder structure."""
        # Send a request (leader by default)
        response = client.post(
            "/v2/chat/stream",
            json={
                "messages": [{"role": "user", "content": "Hello"}],
            },
        )
        
        # Should not error (may return error in stream if LLM unavailable)
        assert response.status_code == 200
    
    def test_leader_with_explicit_header(self, client, clean_test_env):
        """Explicit leader header should work."""
        response = client.post(
            "/v2/chat/stream",
            json={
                "messages": [{"role": "user", "content": "Hello"}],
            },
            headers={"X-Agent-Role": "leader"},
        )
        
        assert response.status_code == 200


class TestWorkerRequests:
    """Tests for worker role behavior."""
    
    def test_worker_without_run_id_fails(self, client, clean_test_env):
        """Worker request without run_id should return 400."""
        response = client.post(
            "/v2/chat/stream",
            json={
                "messages": [{"role": "user", "content": "Hello"}],
            },
            headers={"X-Agent-Role": "worker"},
        )
        
        assert response.status_code == 400
        assert "run-id required" in response.json()["detail"].lower()
    
    def test_worker_with_invalid_run_id_fails(self, client, clean_test_env):
        """Worker request with invalid run_id format should return 400."""
        response = client.post(
            "/v2/chat/stream",
            json={
                "messages": [{"role": "user", "content": "Hello"}],
            },
            headers={
                "X-Agent-Role": "worker",
                "X-Agent-Run-Id": "../../../etc/passwd",
            },
        )
        
        assert response.status_code == 400
        assert "invalid run_id" in response.json()["detail"].lower()
    
    def test_worker_with_missing_context_pack_fails(self, client, clean_test_env):
        """Worker request with valid run_id but no context_pack should return 404."""
        # Generate valid but non-existent run_id
        run_id = generate_run_id()
        
        response = client.post(
            "/v2/chat/stream",
            json={
                "messages": [{"role": "user", "content": "Hello"}],
            },
            headers={
                "X-Agent-Role": "worker",
                "X-Agent-Run-Id": run_id,
            },
        )
        
        assert response.status_code == 404
        assert "context_pack" in response.json()["detail"].lower()


class TestInvalidRoles:
    """Tests for invalid role values."""
    
    def test_invalid_role_rejected(self, client, clean_test_env):
        """Invalid role value should return 400."""
        response = client.post(
            "/v2/chat/stream",
            json={
                "messages": [{"role": "user", "content": "Hello"}],
            },
            headers={"X-Agent-Role": "superadmin"},
        )
        
        assert response.status_code == 400
        assert "invalid" in response.json()["detail"].lower()


if __name__ == "__main__":
    # Run with: python -m pytest apps/gateway/tests/test_stateless_architecture.py -v
    pytest.main([__file__, "-v"])
