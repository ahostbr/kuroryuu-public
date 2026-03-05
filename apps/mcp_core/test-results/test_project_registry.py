import json
import tempfile
from pathlib import Path
import pytest

# Will import from project_registry once created
from project_registry import ProjectRegistry


@pytest.fixture
def registry(tmp_path):
    """Create a registry with a temp storage path."""
    reg_file = tmp_path / "registry.json"
    return ProjectRegistry(registry_path=reg_file, harness_root=tmp_path / "harness")


@pytest.fixture
def sample_project(tmp_path):
    """Create a sample project directory."""
    project_dir = tmp_path / "my-app"
    project_dir.mkdir()
    (project_dir / "package.json").write_text('{"name": "my-app"}')
    return project_dir


def test_register_project(registry, sample_project):
    result = registry.register(project_id="my-app", root=sample_project)
    assert result["ok"] is True
    assert result["project"]["id"] == "my-app"
    assert result["project"]["root"] == str(sample_project)


def test_list_projects(registry, sample_project):
    registry.register("my-app", sample_project)
    result = registry.list_projects()
    assert len(result) == 1
    assert result[0]["id"] == "my-app"


def test_get_project(registry, sample_project):
    registry.register("my-app", sample_project)
    result = registry.get("my-app")
    assert result is not None
    assert result["id"] == "my-app"


def test_get_missing_project(registry):
    result = registry.get("nonexistent")
    assert result is None


def test_resolve_from_cwd(registry, sample_project):
    registry.register("my-app", sample_project)
    result = registry.resolve_from_path(sample_project)
    assert result is not None
    assert result["id"] == "my-app"


def test_resolve_from_subdirectory(registry, sample_project):
    registry.register("my-app", sample_project)
    subdir = sample_project / "src" / "components"
    subdir.mkdir(parents=True)
    result = registry.resolve_from_path(subdir)
    assert result is not None
    assert result["id"] == "my-app"


def test_remove_project(registry, sample_project):
    registry.register("my-app", sample_project)
    registry.remove("my-app")
    assert registry.get("my-app") is None


def test_registry_persistence(tmp_path, sample_project):
    reg_file = tmp_path / "registry.json"
    harness_root = tmp_path / "harness"
    reg1 = ProjectRegistry(registry_path=reg_file, harness_root=harness_root)
    reg1.register("my-app", sample_project)

    reg2 = ProjectRegistry(registry_path=reg_file, harness_root=harness_root)
    assert reg2.get("my-app") is not None


def test_duplicate_register_updates(registry, sample_project):
    registry.register("my-app", sample_project, name="Old Name")
    registry.register("my-app", sample_project, name="New Name")
    result = registry.get("my-app")
    assert result["name"] == "New Name"


def test_harness_dir(registry, sample_project):
    registry.register("my-app", sample_project)
    project = registry.get("my-app")
    harness = Path(project["harness"])
    assert "my-app" in str(harness)
