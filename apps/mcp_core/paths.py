"""
Centralized Path Utilities for Kuroryuu MCP Core

Provides path-agnostic helpers that work regardless of where the repo is located.
All paths are derived from either:
1. KURORYUU_PROJECT_ROOT environment variable (set by desktop app on startup)
2. __file__-based calculation (fallback for development)

Usage:
    from paths import get_project_root, get_ai_dir, get_hooks_dir

    project = get_project_root()  # Returns Path object
    ai = get_ai_dir()  # Returns Path to ai/ directory
"""

import os
from pathlib import Path
from functools import lru_cache


@lru_cache(maxsize=1)
def get_project_root() -> Path:
    """
    Get the project root directory.

    Priority:
    1. KURORYUU_PROJECT_ROOT environment variable
    2. Derive from __file__ location (mcp_core/ -> apps/ -> Kuroryuu)

    Returns:
        Path to project root directory
    """
    env_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if env_root:
        return Path(env_root).resolve()

    # __file__ is apps/mcp_core/paths.py -> go up 2 levels to Kuroryuu
    return Path(__file__).resolve().parent.parent.parent


def get_apps_dir() -> Path:
    """Get the apps/ directory."""
    return get_project_root() / "apps"


def get_ai_dir() -> Path:
    """Get the ai/ directory."""
    return get_project_root() / "ai"


def get_hooks_dir() -> Path:
    """Get the ai/hooks/ directory (alias for harness dir)."""
    return get_ai_dir()


def get_harness_dir() -> Path:
    """Get the ai/ directory (harness files location)."""
    return get_ai_dir()


def get_working_dir() -> Path:
    """Get the WORKING/ directory."""
    return get_project_root() / "WORKING"


def get_checkpoints_dir() -> Path:
    """Get the ai/checkpoints/ directory."""
    return get_ai_dir() / "checkpoints"


def get_models_dir() -> Path:
    """Get the ai/models/ directory."""
    return get_ai_dir() / "models"


def get_todo_path() -> Path:
    """Get the ai/todo.md file path."""
    return get_ai_dir() / "todo.md"


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
