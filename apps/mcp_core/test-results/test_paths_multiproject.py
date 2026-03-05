import tempfile
from pathlib import Path
import pytest

from project_registry import ProjectRegistry
from paths import (
    get_project_root,
    get_ai_dir,
    get_harness_dir,
    get_working_dir,
    get_checkpoints_dir,
    get_todo_path,
    set_registry,
)


@pytest.fixture
def setup_registry(tmp_path):
    reg_file = tmp_path / "registry.json"
    harness_root = tmp_path / "harness"
    registry = ProjectRegistry(registry_path=reg_file, harness_root=harness_root)
    project_dir = tmp_path / "my-app"
    project_dir.mkdir()
    (project_dir / "ai").mkdir()
    registry.register("my-app", project_dir)
    set_registry(registry)
    yield registry, project_dir
    set_registry(None)  # cleanup


def test_get_project_root_with_id(setup_registry):
    registry, project_dir = setup_registry
    root = get_project_root(project_id="my-app")
    assert root == project_dir.resolve()


def test_get_ai_dir_with_id(setup_registry):
    registry, project_dir = setup_registry
    ai = get_ai_dir(project_id="my-app")
    assert ai == project_dir.resolve() / "ai"


def test_get_harness_dir_with_id(setup_registry):
    registry, project_dir = setup_registry
    harness = get_harness_dir(project_id="my-app")
    assert "my-app" in str(harness)


def test_get_checkpoints_dir_with_id(setup_registry):
    registry, project_dir = setup_registry
    cp = get_checkpoints_dir(project_id="my-app")
    assert "checkpoints" in str(cp)


def test_get_todo_path_with_id(setup_registry):
    registry, project_dir = setup_registry
    todo = get_todo_path(project_id="my-app")
    assert todo == project_dir.resolve() / "ai" / "todo.md"


def test_default_behavior_unchanged():
    """Calling without project_id uses existing behavior."""
    root = get_project_root()
    assert root.exists()  # Should resolve to Kuroryuu root or env var
