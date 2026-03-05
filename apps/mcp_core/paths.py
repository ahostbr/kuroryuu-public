"""
Centralized Path Utilities for Kuroryuu MCP Core

Provides path-agnostic helpers that work regardless of where the repo is located.
All paths are derived from either:
1. Project registry lookup (when project_id is provided)
2. KURORYUU_PROJECT_ROOT environment variable (set by desktop app on startup)
3. __file__-based calculation (fallback for development)

Usage:
    from paths import get_project_root, get_ai_dir, get_hooks_dir

    project = get_project_root()  # Returns Path object (default/Kuroryuu)
    ai = get_ai_dir(project_id="my-app")  # Returns Path to my-app's ai/ directory
"""

import os
from pathlib import Path
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from project_registry import ProjectRegistry

# Module-level registry reference (injected at startup via set_registry)
_registry: Optional["ProjectRegistry"] = None


def set_registry(registry: Optional["ProjectRegistry"]) -> None:
    """Inject the project registry for project-aware path resolution."""
    global _registry
    _registry = registry


def get_registry() -> Optional["ProjectRegistry"]:
    """Get the current project registry instance."""
    return _registry


def _resolve_from_registry(project_id: str):
    """Look up a project in the registry. Returns project dict or None."""
    if _registry is None:
        return None
    return _registry.get(project_id)


def get_project_root(project_id: Optional[str] = None) -> Path:
    """
    Get the project root directory.

    Priority:
    1. project_id lookup in registry (if provided)
    2. KURORYUU_PROJECT_ROOT environment variable
    3. Derive from __file__ location (mcp_core/ -> apps/ -> Kuroryuu)
    """
    if project_id:
        project = _resolve_from_registry(project_id)
        if project:
            return Path(project["root"])

    env_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if env_root:
        return Path(env_root).resolve()

    # __file__ is apps/mcp_core/paths.py -> go up 2 levels to Kuroryuu
    return Path(__file__).resolve().parent.parent.parent


def get_apps_dir(project_id: Optional[str] = None) -> Path:
    """Get the apps/ directory."""
    return get_project_root(project_id) / "apps"


def get_ai_dir(project_id: Optional[str] = None) -> Path:
    """Get the ai/ directory (lives in project root)."""
    return get_project_root(project_id) / "ai"


def get_hooks_dir(project_id: Optional[str] = None) -> Path:
    """Get the ai/hooks/ directory (alias for ai dir)."""
    return get_ai_dir(project_id)


def get_harness_dir(project_id: Optional[str] = None) -> Path:
    """Get the harness directory.

    When project_id is provided, returns the external harness path
    (~/.kuroryuu/projects/{id}/). Otherwise returns the ai/ directory.
    """
    if project_id:
        project = _resolve_from_registry(project_id)
        if project:
            return Path(project["harness"])
    return get_ai_dir()


def get_working_dir(project_id: Optional[str] = None) -> Path:
    """Get the WORKING/ directory."""
    if project_id:
        project = _resolve_from_registry(project_id)
        if project:
            return Path(project["harness"])
    return get_project_root() / "WORKING"


def get_checkpoints_dir(project_id: Optional[str] = None) -> Path:
    """Get the checkpoints directory.

    When project_id is provided, returns external harness checkpoints.
    Otherwise returns ai/checkpoints/.
    """
    if project_id:
        project = _resolve_from_registry(project_id)
        if project:
            return Path(project["harness"]) / "checkpoints"
    return get_ai_dir() / "checkpoints"


def get_models_dir(project_id: Optional[str] = None) -> Path:
    """Get the ai/models/ directory."""
    return get_ai_dir(project_id) / "models"


def get_todo_path(project_id: Optional[str] = None) -> Path:
    """Get the ai/todo.md file path (lives in project root)."""
    return get_ai_dir(project_id) / "todo.md"


def get_rag_index_dir(project_id: Optional[str] = None) -> Path:
    """Get the RAG index directory.

    When project_id is provided, returns external harness rag_index.
    Otherwise returns WORKING/rag_index.
    """
    if project_id:
        project = _resolve_from_registry(project_id)
        if project:
            return Path(project["harness"]) / "rag_index"
    return get_project_root() / "WORKING" / "rag_index"


def get_inbox_dir(project_id: Optional[str] = None) -> Path:
    """Get the inbox directory.

    When project_id is provided, returns external harness inbox.
    Otherwise returns ai/inbox.
    """
    if project_id:
        project = _resolve_from_registry(project_id)
        if project:
            return Path(project["harness"]) / "inbox"
    return get_ai_dir() / "inbox"


def get_memory_path(project_id: Optional[str] = None) -> Path:
    """Get the working memory file path.

    When project_id is provided, returns external harness working_memory.json.
    Otherwise returns ai/working_memory.json.
    """
    if project_id:
        project = _resolve_from_registry(project_id)
        if project:
            return Path(project["harness"]) / "working_memory.json"
    return get_ai_dir() / "working_memory.json"


# Legacy compatibility - some files use these variable names
def _get_legacy_ai_dir() -> Path:
    """Legacy alias for get_ai_dir()."""
    return get_ai_dir()


# For imports like: AI_DIR = get_ai_dir_or_env("KURORYUU_HOOKS_DIR")
def get_ai_dir_or_env(env_var: str = "KURORYUU_HOOKS_DIR") -> Path:
    """
    Get AI directory, preferring environment variable if set.

    This maintains backward compatibility with existing code that uses
    os.environ.get("KURORYUU_HOOKS_DIR", "<PROJECT_ROOT>/ai")

    Args:
        env_var: Environment variable name to check first

    Returns:
        Path to the AI directory
    """
    env_value = os.environ.get(env_var)
    if env_value:
        return Path(env_value)
    return get_ai_dir()
