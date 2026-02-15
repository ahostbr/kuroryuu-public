"""
Tests for Task Management endpoints.
"""
from __future__ import annotations

import pytest


class TestTaskEndpoints:
    """Tests for task management endpoints."""

    def test_list_tasks_empty(self, client, temp_project):
        """GET /v1/tasks/list should return empty list when no tasks exist."""
        response = client.get("/v1/tasks/list")

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert isinstance(data["tasks"], list)
        # May have 0 tasks since we created an empty todo.md
        assert len(data["tasks"]) == 0

    def test_create_task(self, client, temp_project):
        """POST /v1/tasks/create should create a task successfully."""
        task_data = {
            "title": "Test Task",
            "description": "This is a test task",
            "status": "backlog",
            "priority": "high",
            "tags": ["test", "api"]
        }

        response = client.post("/v1/tasks/create", json=task_data)

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["task_id"] is not None
        assert data["task_id"].startswith("T")
        assert "message" in data

    def test_list_tasks_after_create(self, client, temp_project):
        """GET /v1/tasks/list should return created task."""
        # First create a task
        task_data = {
            "title": "Test Task",
            "description": "This is a test task",
            "status": "backlog"
        }
        create_response = client.post("/v1/tasks/create", json=task_data)
        assert create_response.json()["ok"] is True
        task_id = create_response.json()["task_id"]

        # Then list tasks
        list_response = client.get("/v1/tasks/list")

        assert list_response.status_code == 200
        data = list_response.json()
        assert data["ok"] is True
        assert len(data["tasks"]) >= 1

        # Find our task in the list
        task_ids = [t["id"] for t in data["tasks"]]
        assert task_id in task_ids

    def test_get_task_by_id(self, client, temp_project):
        """GET /v1/tasks/{task_id} should return task with metadata."""
        # First create a task
        task_data = {
            "title": "Test Task",
            "description": "Detailed description",
            "priority": "high"
        }
        create_response = client.post("/v1/tasks/create", json=task_data)
        task_id = create_response.json()["task_id"]

        # Then get the task
        get_response = client.get(f"/v1/tasks/{task_id}")

        assert get_response.status_code == 200
        data = get_response.json()
        assert data["ok"] is True
        assert data["task_id"] == task_id
        assert "meta" in data

    def test_update_task_metadata(self, client, temp_project):
        """PUT /v1/tasks/{task_id}/meta should update sidecar metadata."""
        # First create a task
        task_data = {"title": "Test Task", "description": "Original"}
        create_response = client.post("/v1/tasks/create", json=task_data)
        task_id = create_response.json()["task_id"]

        # Update metadata
        update_data = {
            "description": "Updated description",
            "priority": "critical",
            "worklog": "Docs/worklogs/test.md"
        }
        update_response = client.put(f"/v1/tasks/{task_id}/meta", json=update_data)

        assert update_response.status_code == 200
        data = update_response.json()
        assert data["ok"] is True

    def test_get_nonexistent_task_returns_error(self, client, temp_project):
        """GET /v1/tasks/{task_id} should return error for missing task."""
        response = client.get("/v1/tasks/T999999")

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is False
        assert "error" in data

    def test_create_task_with_minimal_data(self, client, temp_project):
        """POST /v1/tasks/create should work with only required fields."""
        task_data = {
            "title": "Minimal Task"
        }

        response = client.post("/v1/tasks/create", json=task_data)

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["task_id"] is not None


class TestTaskMetadata:
    """Tests for task metadata (sidecar) functionality."""

    def test_task_metadata_persists(self, client, temp_project):
        """Task metadata should persist across list and get operations."""
        # Create task with metadata
        task_data = {
            "title": "Task With Meta",
            "description": "Detailed description",
            "priority": "high",
            "category": "feature"
        }
        create_response = client.post("/v1/tasks/create", json=task_data)
        task_id = create_response.json()["task_id"]

        # List tasks and verify metadata is included
        list_response = client.get("/v1/tasks/list")
        tasks = list_response.json()["tasks"]
        task = next((t for t in tasks if t["id"] == task_id), None)

        assert task is not None
        assert task.get("description") == "Detailed description"
        assert task.get("priority") == "high"
        assert task.get("category") == "feature"

    def test_update_preserves_existing_metadata(self, client, temp_project):
        """PUT /v1/tasks/{task_id}/meta should preserve unmodified fields."""
        # Create task with metadata
        task_data = {
            "title": "Task",
            "description": "Original",
            "priority": "low"
        }
        create_response = client.post("/v1/tasks/create", json=task_data)
        task_id = create_response.json()["task_id"]

        # Update only priority
        update_response = client.put(
            f"/v1/tasks/{task_id}/meta",
            json={"priority": "high"}
        )
        assert update_response.json()["ok"] is True

        # Get task and verify description is still there
        get_response = client.get(f"/v1/tasks/{task_id}")
        meta = get_response.json()["meta"]

        assert meta.get("priority") == "high"
        assert meta.get("description") == "Original"  # Should be preserved


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
