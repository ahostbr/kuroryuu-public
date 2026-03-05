"""Project management tools for MCP_CORE - Routed k_project tool.

Provides tools for managing Kuroryuu projects: register, list, get, remove,
provision, analyze, and index.

Routed tool: k_project(action, ...)
Actions: help, register, list, get, remove, provision, analyze, index
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

from protocol import ToolRegistry

try:
    from .project_registry import ProjectRegistry
    from .paths import get_registry
except ImportError:
    from project_registry import ProjectRegistry
    from paths import get_registry


# ============================================================================
# Stack detection helpers
# ============================================================================

def _detect_stack(root: Path) -> Dict[str, Any]:
    """Auto-detect project stack: languages, frameworks, package managers."""
    languages = []
    frameworks = []
    package_managers = []

    root = Path(root)

    # Node.js / JavaScript / TypeScript
    pkg_json = root / "package.json"
    if pkg_json.exists():
        languages.append("javascript")
        try:
            pkg = json.loads(pkg_json.read_text(encoding="utf-8"))
            deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

            if any(k.startswith("typescript") or k == "@types/node" for k in deps):
                languages.append("typescript")
            if "react" in deps:
                frameworks.append("react")
            if "next" in deps:
                frameworks.append("next")
            if "vue" in deps:
                frameworks.append("vue")
            if "svelte" in deps:
                frameworks.append("svelte")
            if "express" in deps:
                frameworks.append("express")
            if "fastify" in deps:
                frameworks.append("fastify")
            if "electron" in deps or "electron-builder" in deps:
                frameworks.append("electron")
        except (json.JSONDecodeError, OSError):
            pass

        # Detect package manager
        if (root / "pnpm-lock.yaml").exists():
            package_managers.append("pnpm")
        elif (root / "yarn.lock").exists():
            package_managers.append("yarn")
        elif (root / "bun.lockb").exists():
            package_managers.append("bun")
        elif (root / "package-lock.json").exists():
            package_managers.append("npm")

    # Python
    if (root / "pyproject.toml").exists() or (root / "requirements.txt").exists() or (root / "setup.py").exists():
        languages.append("python")
        if (root / "pyproject.toml").exists():
            try:
                content = (root / "pyproject.toml").read_text(encoding="utf-8")
                if "fastapi" in content.lower():
                    frameworks.append("fastapi")
                if "django" in content.lower():
                    frameworks.append("django")
                if "flask" in content.lower():
                    frameworks.append("flask")
                if "poetry" in content:
                    package_managers.append("poetry")
            except OSError:
                pass
        if (root / "requirements.txt").exists():
            try:
                content = (root / "requirements.txt").read_text(encoding="utf-8").lower()
                if "fastapi" in content:
                    frameworks.append("fastapi")
                if "django" in content:
                    frameworks.append("django")
                if "flask" in content:
                    frameworks.append("flask")
            except OSError:
                pass
        if not package_managers or "poetry" not in package_managers:
            package_managers.append("pip")

    # Go
    if (root / "go.mod").exists():
        languages.append("go")

    # Rust
    if (root / "Cargo.toml").exists():
        languages.append("rust")
        package_managers.append("cargo")

    # .NET
    if any(root.glob("*.sln")) or any(root.glob("*.csproj")):
        languages.append("csharp")
        package_managers.append("dotnet")

    # Deduplicate
    return {
        "languages": list(dict.fromkeys(languages)),
        "frameworks": list(dict.fromkeys(frameworks)),
        "package_managers": list(dict.fromkeys(package_managers)),
    }


def _format_stack_summary(stack: Dict[str, Any]) -> str:
    """Format stack dict into a human-readable summary string."""
    parts = []
    if stack.get("languages"):
        parts.append("Languages: " + ", ".join(stack["languages"]))
    if stack.get("frameworks"):
        parts.append("Frameworks: " + ", ".join(stack["frameworks"]))
    if stack.get("package_managers"):
        parts.append("Package managers: " + ", ".join(stack["package_managers"]))
    return " | ".join(parts) if parts else "No stack detected"


# ============================================================================
# Action implementations
# ============================================================================

def _get_registry_or_error():
    """Get the project registry or return an error dict."""
    reg = get_registry()
    if reg is None:
        return None, {"ok": False, "error": "Project registry not initialized"}
    return reg, None


def _action_help(**kwargs: Any) -> Dict[str, Any]:
    return {
        "ok": True,
        "data": {
            "tool": "k_project",
            "description": "Project lifecycle management",
            "actions": {
                "help": "Show this help",
                "register": "Register a folder as a Kuroryuu project. Params: root (required), project_id (optional), name (optional)",
                "list": "List all registered projects",
                "get": "Get project by ID or resolve from path. Params: project_id OR path",
                "remove": "Unregister a project. Params: project_id (required)",
                "provision": "Generate project scaffolding (.kuroryuu.json, CLAUDE.md, ai/). Params: project_id (required)",
                "analyze": "Auto-detect project stack. Params: project_id OR root (required)",
                "index": "Build RAG index for project. Params: project_id (required)",
            },
        },
    }


def _action_register(**kwargs: Any) -> Dict[str, Any]:
    reg, err = _get_registry_or_error()
    if err:
        return err

    root = kwargs.get("root")
    if not root:
        return {"ok": False, "error": "root parameter is required"}

    root_path = Path(root).resolve()
    if not root_path.is_dir():
        return {"ok": False, "error": f"Directory does not exist: {root}"}

    project_id = kwargs.get("project_id") or root_path.name
    name = kwargs.get("name")

    # Auto-detect stack
    stack = _detect_stack(root_path)

    result = reg.register(project_id=project_id, root=root_path, name=name, stack=stack)
    return result


def _action_list(**kwargs: Any) -> Dict[str, Any]:
    reg, err = _get_registry_or_error()
    if err:
        return err

    projects = reg.list_projects()
    return {"ok": True, "projects": projects, "count": len(projects)}


def _action_get(**kwargs: Any) -> Dict[str, Any]:
    reg, err = _get_registry_or_error()
    if err:
        return err

    project_id = kwargs.get("project_id")
    path = kwargs.get("path")

    if project_id:
        project = reg.get(project_id)
    elif path:
        project = reg.resolve_from_path(Path(path))
    else:
        return {"ok": False, "error": "Either project_id or path is required"}

    if project is None:
        return {"ok": False, "error": f"Project not found: {project_id or path}"}
    return {"ok": True, "project": project}


def _action_remove(**kwargs: Any) -> Dict[str, Any]:
    reg, err = _get_registry_or_error()
    if err:
        return err

    project_id = kwargs.get("project_id")
    if not project_id:
        return {"ok": False, "error": "project_id is required"}

    removed = reg.remove(project_id)
    if removed:
        return {"ok": True, "message": f"Project '{project_id}' unregistered"}
    return {"ok": False, "error": f"Project not found: {project_id}"}


def _action_provision(**kwargs: Any) -> Dict[str, Any]:
    reg, err = _get_registry_or_error()
    if err:
        return err

    project_id = kwargs.get("project_id")
    if not project_id:
        return {"ok": False, "error": "project_id is required"}

    project = reg.get(project_id)
    if project is None:
        return {"ok": False, "error": f"Project not found: {project_id}. Register it first."}

    root = Path(project["root"])
    harness = Path(project["harness"])

    # Import templates (deferred to avoid circular at module level)
    try:
        from project_templates import (
            generate_claude_md,
            generate_kuroryuu_json,
            generate_mcp_json,
            generate_todo_md,
        )
    except ImportError:
        return {"ok": False, "error": "project_templates module not available"}

    created = []

    # 1. .kuroryuu.json in project root
    kuroryuu_json_path = root / ".kuroryuu.json"
    kuroryuu_json_path.write_text(
        json.dumps(generate_kuroryuu_json(project_id), indent=2),
        encoding="utf-8",
    )
    created.append(str(kuroryuu_json_path))

    # 2. .claude/mcp.json
    claude_dir = root / ".claude"
    claude_dir.mkdir(exist_ok=True)
    mcp_json_path = claude_dir / "mcp.json"
    mcp_json_path.write_text(
        json.dumps(generate_mcp_json(), indent=2),
        encoding="utf-8",
    )
    created.append(str(mcp_json_path))

    # 3. CLAUDE.md
    stack_summary = _format_stack_summary(project.get("stack", {}))
    claude_md_path = root / "CLAUDE.md"
    if not claude_md_path.exists():
        claude_md_path.write_text(
            generate_claude_md(project.get("name", project_id), stack_summary),
            encoding="utf-8",
        )
        created.append(str(claude_md_path))

    # 4. ai/prds/ directory
    prds_dir = root / "ai" / "prds"
    prds_dir.mkdir(parents=True, exist_ok=True)
    created.append(str(prds_dir))

    # 5. ai/todo.md
    todo_path = root / "ai" / "todo.md"
    if not todo_path.exists():
        todo_path.write_text(
            generate_todo_md(project.get("name", project_id)),
            encoding="utf-8",
        )
        created.append(str(todo_path))

    # 6. External harness directories
    for subdir in ["checkpoints", "rag_index", "inbox", "sessions", "worklogs", "collective"]:
        d = harness / subdir
        d.mkdir(parents=True, exist_ok=True)
        created.append(str(d))

    return {"ok": True, "created": created, "project_id": project_id}


def _action_analyze(**kwargs: Any) -> Dict[str, Any]:
    reg, err = _get_registry_or_error()
    if err:
        return err

    project_id = kwargs.get("project_id")
    root = kwargs.get("root")

    if project_id:
        project = reg.get(project_id)
        if project is None:
            return {"ok": False, "error": f"Project not found: {project_id}"}
        root_path = Path(project["root"])
    elif root:
        root_path = Path(root).resolve()
    else:
        return {"ok": False, "error": "Either project_id or root is required"}

    if not root_path.is_dir():
        return {"ok": False, "error": f"Directory does not exist: {root_path}"}

    stack = _detect_stack(root_path)

    # Update registry if project exists
    if project_id:
        reg.register(project_id=project_id, root=root_path, stack=stack)

    return {
        "ok": True,
        "root": str(root_path),
        "stack": stack,
        "summary": _format_stack_summary(stack),
    }


def _action_index(**kwargs: Any) -> Dict[str, Any]:
    """Trigger RAG index build for a project."""
    project_id = kwargs.get("project_id")
    if not project_id:
        return {"ok": False, "error": "project_id is required"}

    # Delegate to k_rag with project_id context
    # For now, return a placeholder — actual implementation in Task 6
    return {
        "ok": True,
        "message": f"RAG index build for project '{project_id}' — use k_rag(action='index', project_id='{project_id}') directly",
        "project_id": project_id,
    }


# ============================================================================
# Router
# ============================================================================

ACTION_MAP = {
    "help": _action_help,
    "register": _action_register,
    "list": _action_list,
    "get": _action_get,
    "remove": _action_remove,
    "provision": _action_provision,
    "analyze": _action_analyze,
    "index": _action_index,
}


def k_project(arguments: Dict[str, Any]) -> list:
    """Route k_project actions."""
    action = arguments.get("action", "help")
    handler = ACTION_MAP.get(action)
    if handler is None:
        return [{"type": "text", "text": json.dumps({
            "ok": False,
            "error": f"Unknown action: {action}. Available: {', '.join(ACTION_MAP.keys())}",
        })}]

    result = handler(**arguments)
    return [{"type": "text", "text": json.dumps(result, indent=2)}]


# ============================================================================
# Registration
# ============================================================================

def register_project_tools(registry: ToolRegistry) -> None:
    """Register k_project routed tool with the registry."""

    registry.register(
        name="k_project",
        description="Project lifecycle management. Actions: help, register, list, get, remove, provision, analyze, index",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "register", "list", "get", "remove", "provision", "analyze", "index"],
                    "description": "Action to perform",
                },
                "root": {
                    "type": "string",
                    "description": "Project root directory path (for register, analyze)",
                },
                "project_id": {
                    "type": "string",
                    "description": "Project identifier (auto-derived from folder name if omitted)",
                },
                "name": {
                    "type": "string",
                    "description": "Human-readable project name",
                },
                "path": {
                    "type": "string",
                    "description": "Filesystem path to resolve project from (for get)",
                },
            },
            "required": ["action"],
        },
        handler=k_project,
    )
