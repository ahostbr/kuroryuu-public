"""Integration tests for Browser Agent API.

Tests the browser agent registration, task lifecycle, and workflow management.
Requires the Kuroryuu stack to be running (.\run_all.ps1).
"""

import pytest
import json
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


GATEWAY_URL = "http://127.0.0.1:8200"


def _request(
    endpoint: str,
    method: str = "GET",
    data: Optional[dict] = None,
    timeout: int = 10,
) -> dict:
    """Make HTTP request to Gateway."""
    url = f"{GATEWAY_URL}{endpoint}"

    if data:
        body = json.dumps(data).encode("utf-8")
        req = Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
    else:
        req = Request(url, method=method)

    try:
        with urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as e:
        return {"error": f"HTTP {e.code}", "detail": e.reason}
    except URLError as e:
        return {"error": "Connection failed", "detail": str(e.reason)}


class TestGatewayHealth:
    """Test Gateway availability."""

    def test_health_endpoint(self):
        """Gateway health check returns ok."""
        result = _request("/health")
        assert result.get("ok") is True or result.get("status") == "healthy"

    def test_browser_stats_endpoint(self):
        """Browser stats endpoint is accessible."""
        result = _request("/v1/browser/stats")
        assert result.get("ok") is True
        assert "agents" in result
        assert "tasks" in result


class TestBrowserAgentRegistration:
    """Test browser agent registration lifecycle."""

    def test_register_agent(self):
        """Register a browser agent successfully."""
        result = _request("/v1/browser/register", method="POST", data={
            "browser_version": "120.0.0",
            "extension_version": "1.0.0",
            "claude_extension_detected": False,
            "capabilities": ["navigate", "screenshot"]
        })

        assert result.get("ok") is True
        assert "agent_id" in result
        assert result["agent_id"].startswith("browser_")

        # Store for cleanup
        self.__class__.test_agent_id = result["agent_id"]

    def test_list_agents(self):
        """List agents includes registered agent."""
        result = _request("/v1/browser/agents")

        assert result.get("ok") is True
        assert "agents" in result
        assert isinstance(result["agents"], list)

    def test_get_agent(self):
        """Get specific agent by ID."""
        agent_id = getattr(self.__class__, "test_agent_id", None)
        if not agent_id:
            pytest.skip("No test agent registered")

        result = _request(f"/v1/browser/agents/{agent_id}")

        assert result.get("ok") is True
        assert "agent" in result
        assert result["agent"]["agent_id"] == agent_id

    def test_agent_heartbeat(self):
        """Update agent heartbeat."""
        agent_id = getattr(self.__class__, "test_agent_id", None)
        if not agent_id:
            pytest.skip("No test agent registered")

        result = _request(f"/v1/browser/heartbeat?agent_id={agent_id}", method="POST")

        assert result.get("ok") is True

    def test_deregister_agent(self):
        """Deregister agent cleans up."""
        agent_id = getattr(self.__class__, "test_agent_id", None)
        if not agent_id:
            pytest.skip("No test agent registered")

        result = _request(f"/v1/browser/agents/{agent_id}", method="DELETE")

        assert result.get("ok") is True


class TestBrowserTaskLifecycle:
    """Test browser task creation and completion."""

    @classmethod
    def setup_class(cls):
        """Register a test agent for task tests."""
        result = _request("/v1/browser/register", method="POST", data={
            "browser_version": "120.0.0",
            "extension_version": "1.0.0",
            "claude_extension_detected": False,
            "capabilities": ["navigate", "form_fill", "click", "extract", "screenshot"]
        })
        cls.agent_id = result.get("agent_id")

    @classmethod
    def teardown_class(cls):
        """Cleanup test agent."""
        if hasattr(cls, "agent_id") and cls.agent_id:
            _request(f"/v1/browser/agents/{cls.agent_id}", method="DELETE")

    def test_create_task(self):
        """Create a browser task successfully."""
        result = _request("/v1/browser/tasks", method="POST", data={
            "target_url": "https://example.com",
            "task_type": "navigate",
            "instructions": "Navigate to example.com",
            "timeout_ms": 30000,
            "assign_to": self.agent_id,
        })

        assert result.get("ok") is True
        assert "task_id" in result
        assert result["task_id"].startswith("bt_")

        self.__class__.test_task_id = result["task_id"]

    def test_get_pending_tasks(self):
        """Get pending tasks for agent."""
        result = _request(f"/v1/browser/tasks/{self.agent_id}")

        assert result.get("ok") is True
        assert "tasks" in result
        assert isinstance(result["tasks"], list)

    def test_complete_task(self):
        """Complete a browser task."""
        task_id = getattr(self.__class__, "test_task_id", None)
        if not task_id:
            pytest.skip("No test task created")

        result = _request("/v1/browser/complete", method="POST", data={
            "agent_id": self.agent_id,
            "task_id": task_id,
            "success": True,
            "result": {"final_url": "https://example.com"},
        })

        assert result.get("ok") is True

    def test_create_task_with_workflow_steps(self):
        """Task completion with workflow steps saves workflow."""
        # Create task
        task_result = _request("/v1/browser/tasks", method="POST", data={
            "target_url": "https://example.com/form",
            "task_type": "form_fill",
            "instructions": "Fill out the contact form",
            "timeout_ms": 30000,
            "assign_to": self.agent_id,
        })

        task_id = task_result.get("task_id")
        assert task_id is not None

        # Complete with workflow steps
        result = _request("/v1/browser/complete", method="POST", data={
            "agent_id": self.agent_id,
            "task_id": task_id,
            "success": True,
            "result": {},
            "workflow_steps": [
                {"action": "navigate", "timestamp_ms": 0},
                {"action": "type", "selector": "[name=email]", "value": "test@test.com", "timestamp_ms": 1000},
                {"action": "click", "selector": "button[type=submit]", "timestamp_ms": 2000},
            ],
        })

        assert result.get("ok") is True
        # Workflow should be saved
        if result.get("workflow_id"):
            assert result["workflow_id"].startswith("wf_")


class TestBrowserWorkflows:
    """Test workflow storage and retrieval."""

    def test_submit_workflow(self):
        """Submit a workflow directly."""
        result = _request("/v1/browser/learn", method="POST", data={
            "task_description": "Login to GitHub test workflow",
            "target_url": "https://github.com/login",
            "steps": [
                {"action": "navigate", "timestamp_ms": 0},
                {"action": "type", "selector": "#login_field", "value": "testuser", "timestamp_ms": 500},
                {"action": "type", "selector": "#password", "value": "testpass", "timestamp_ms": 1000},
                {"action": "click", "selector": "[type=submit]", "timestamp_ms": 1500},
            ],
            "success": True,
            "tags": ["github", "login", "auth"],
        })

        assert result.get("ok") is True
        assert "workflow_id" in result

        self.__class__.test_workflow_id = result["workflow_id"]

    def test_query_workflows(self):
        """Query workflows by keyword."""
        result = _request("/v1/browser/workflows?query=github&limit=5")

        assert result.get("ok") is True
        assert "workflows" in result
        assert isinstance(result["workflows"], list)

    def test_get_workflow(self):
        """Get specific workflow by ID."""
        workflow_id = getattr(self.__class__, "test_workflow_id", None)
        if not workflow_id:
            pytest.skip("No test workflow submitted")

        result = _request(f"/v1/browser/workflows/{workflow_id}")

        assert result.get("ok") is True
        assert "workflow" in result
        assert result["workflow"]["workflow_id"] == workflow_id

    def test_failed_workflow_not_saved(self):
        """Failed workflows are not saved."""
        result = _request("/v1/browser/learn", method="POST", data={
            "task_description": "This should fail",
            "target_url": "https://example.com/fail",
            "steps": [{"action": "navigate", "timestamp_ms": 0}],
            "success": False,
        })

        # Should return ok but no workflow_id
        assert result.get("ok") is False or result.get("workflow_id") == ""


class TestBrowserStats:
    """Test statistics endpoint."""

    def test_stats_structure(self):
        """Stats endpoint returns expected structure."""
        result = _request("/v1/browser/stats")

        assert result.get("ok") is True

        # Agents stats
        assert "agents" in result
        assert "total" in result["agents"]
        assert "alive" in result["agents"]
        assert "busy" in result["agents"]

        # Tasks stats
        assert "tasks" in result
        assert "total" in result["tasks"]
        assert "pending" in result["tasks"]
        assert "completed" in result["tasks"]

        # Workflows stats
        assert "workflows" in result
        assert "total" in result["workflows"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
