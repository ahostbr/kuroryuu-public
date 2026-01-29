"""Repo Intel tools - repository intelligence and structured analysis.

Provides access to pre-computed JSON indices for:
- Symbol maps (functions, classes, components)
- Module dependency graphs
- API route maps
- React hook usage
- TODO/FIXME backlog
- Dependency analysis

Routed tool: k_repo_intel(action, ...)
Actions: help, status, run, get, list
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from .paths import get_project_root
except ImportError:
    from paths import get_project_root

# ============================================================================
# Configuration
# ============================================================================

def _get_project_root() -> Path:
    """Get project root from env or centralized paths."""
    return get_project_root()


def _get_reports_dir() -> Path:
    """Get repo intel reports directory."""
    return _get_project_root() / "Reports" / "RepoIntel"


def _get_scripts_dir() -> Path:
    """Get repo intel scripts directory."""
    return _get_project_root() / "ai" / "repo_intel"


# ============================================================================
# Report definitions
# ============================================================================

AVAILABLE_REPORTS = {
    "symbol_map": {
        "file": "symbol_map.json",
        "description": "All symbols: functions, classes, components, hooks, types",
    },
    "public_api": {
        "file": "public_api_map.json",
        "description": "Exported API surface for TypeScript and Python",
    },
    "module_graph": {
        "file": "module_graph.json",
        "description": "Import/export dependency graph",
    },
    "routes": {
        "file": "route_map.json",
        "description": "FastAPI endpoint routes",
    },
    "components": {
        "file": "component_tree.json",
        "description": "React component listing",
    },
    "hooks": {
        "file": "hook_usage.json",
        "description": "React hook usage across components",
    },
    "todos": {
        "file": "todo_backlog.json",
        "description": "TODO/FIXME/HACK markers by file",
    },
    "dependencies": {
        "file": "dependency_map.json",
        "description": "NPM and Python dependencies by app",
    },
    "manifest": {
        "file": "file_manifest.json",
        "description": "All scanned files with metadata",
    },
}


# ============================================================================
# Action handlers
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """Show help information."""
    return {
        "ok": True,
        "data": {
            "tool": "k_repo_intel",
            "description": "Repository intelligence - structured code analysis",
            "actions": {
                "help": "Show this help",
                "status": "Check if reports exist and their age",
                "run": "Run repo intel suite. Params: full (bool), only (str: indexer|todo|depmap)",
                "get": "Get a specific report. Params: report (required), query (optional path filter)",
                "list": "List available reports",
            },
            "reports": AVAILABLE_REPORTS,
            "project_root": str(_get_project_root()),
            "reports_dir": str(_get_reports_dir()),
        },
    }


def _action_status(**kwargs: Any) -> Dict[str, Any]:
    """Check status of repo intel reports."""
    reports_dir = _get_reports_dir()

    if not reports_dir.exists():
        return {
            "ok": True,
            "exists": False,
            "message": "Reports directory does not exist. Run: k_repo_intel(action='run')",
            "reports_dir": str(reports_dir),
        }

    status = {}
    for name, info in AVAILABLE_REPORTS.items():
        file_path = reports_dir / info["file"]
        if file_path.exists():
            stat = file_path.stat()
            status[name] = {
                "exists": True,
                "size_bytes": stat.st_size,
                "modified": stat.st_mtime,
                "file": info["file"],
            }
        else:
            status[name] = {
                "exists": False,
                "file": info["file"],
            }

    existing = sum(1 for s in status.values() if s.get("exists"))
    return {
        "ok": True,
        "exists": True,
        "reports_dir": str(reports_dir),
        "total_reports": len(AVAILABLE_REPORTS),
        "existing_reports": existing,
        "reports": status,
    }


def _action_run(
    full: bool = False,
    only: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Run the repo intel suite."""
    scripts_dir = _get_scripts_dir()
    run_script = scripts_dir / "run_all_intel.py"

    if not run_script.exists():
        return {
            "ok": False,
            "error": f"Script not found: {run_script}",
        }

    cmd = [sys.executable, str(run_script)]
    if full:
        cmd.append("--full")
    if only:
        if only not in ("indexer", "todo", "depmap"):
            return {
                "ok": False,
                "error": f"Invalid 'only' value: {only}. Must be: indexer, todo, or depmap",
            }
        cmd.extend(["--only", only])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
            cwd=str(_get_project_root()),
        )

        return {
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout,
            "stderr": result.stderr[-1000:] if len(result.stderr) > 1000 else result.stderr,
            "command": " ".join(cmd),
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "error": "Repo intel timed out after 5 minutes",
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
        }


def _action_get(
    report: str = "",
    query: Optional[str] = None,
    limit: int = 50,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Get a specific report."""
    if not report:
        return {
            "ok": False,
            "error": "Missing 'report' parameter. Use action='list' to see available reports.",
        }

    if report not in AVAILABLE_REPORTS:
        return {
            "ok": False,
            "error": f"Unknown report: {report}. Available: {list(AVAILABLE_REPORTS.keys())}",
        }

    reports_dir = _get_reports_dir()
    file_path = reports_dir / AVAILABLE_REPORTS[report]["file"]

    if not file_path.exists():
        return {
            "ok": False,
            "error": f"Report not found: {file_path}. Run: k_repo_intel(action='run')",
        }

    try:
        with file_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return {
            "ok": False,
            "error": f"Invalid JSON in report: {e}",
        }

    # Apply query filter if provided
    if query and isinstance(data, dict):
        filtered = {}
        query_lower = query.lower()
        for key, value in data.items():
            if query_lower in key.lower():
                filtered[key] = value

        # Limit results
        if len(filtered) > limit:
            keys = list(filtered.keys())[:limit]
            filtered = {k: filtered[k] for k in keys}
            truncated = True
        else:
            truncated = False

        return {
            "ok": True,
            "report": report,
            "query": query,
            "matches": len(filtered),
            "truncated": truncated,
            "data": filtered,
        }

    # For lists or unfiltered, apply limit
    if isinstance(data, list) and len(data) > limit:
        return {
            "ok": True,
            "report": report,
            "total": len(data),
            "truncated": True,
            "limit": limit,
            "data": data[:limit],
        }

    # Check dict size
    if isinstance(data, dict) and len(data) > limit:
        keys = list(data.keys())[:limit]
        return {
            "ok": True,
            "report": report,
            "total_keys": len(data),
            "truncated": True,
            "limit": limit,
            "data": {k: data[k] for k in keys},
        }

    return {
        "ok": True,
        "report": report,
        "data": data,
    }


def _action_list(**kwargs: Any) -> Dict[str, Any]:
    """List available reports."""
    reports_dir = _get_reports_dir()

    reports = []
    for name, info in AVAILABLE_REPORTS.items():
        file_path = reports_dir / info["file"]
        reports.append({
            "name": name,
            "file": info["file"],
            "description": info["description"],
            "exists": file_path.exists(),
        })

    return {
        "ok": True,
        "reports_dir": str(reports_dir),
        "reports": reports,
    }


# ============================================================================
# Main dispatcher
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "status": _action_status,
    "run": _action_run,
    "get": _action_get,
    "list": _action_list,
}


def k_repo_intel(
    action: str,
    report: str = "",
    query: Optional[str] = None,
    full: bool = False,
    only: Optional[str] = None,
    limit: int = 50,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Repo Intel - Repository intelligence and structured analysis.

    Actions:
        help    - Show help
        status  - Check report status
        run     - Run repo intel suite
        get     - Get a specific report
        list    - List available reports
    """
    action = (action or "").strip().lower()

    if not action:
        return {"ok": False, "error": "Missing 'action' parameter"}

    handler = ACTION_HANDLERS.get(action)
    if not handler:
        return {
            "ok": False,
            "error": f"Unknown action: {action}. Valid: {list(ACTION_HANDLERS.keys())}",
        }

    return handler(
        report=report,
        query=query,
        full=full,
        only=only,
        limit=limit,
        **kwargs,
    )


# ============================================================================
# Tool registration
# ============================================================================

def register_repo_intel_tools(registry: "ToolRegistry") -> None:
    """Register k_repo_intel routed tool with the registry."""

    registry.register(
        name="k_repo_intel",
        description="Repository intelligence - structured code analysis. Actions: help, status, run, get, list",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "description": "Action to perform",
                    "enum": ["help", "status", "run", "get", "list"],
                },
                "report": {
                    "type": "string",
                    "description": "Report name for 'get' action: symbol_map, public_api, module_graph, routes, components, hooks, todos, dependencies, manifest",
                },
                "query": {
                    "type": "string",
                    "description": "Filter query for 'get' action (searches keys)",
                },
                "full": {
                    "type": "boolean",
                    "default": False,
                    "description": "Force full rebuild for 'run' action",
                },
                "only": {
                    "type": "string",
                    "enum": ["indexer", "todo", "depmap"],
                    "description": "Run only specific tool for 'run' action",
                },
                "limit": {
                    "type": "integer",
                    "default": 50,
                    "description": "Max items to return for 'get' action",
                },
            },
            "required": ["action"],
        },
        handler=k_repo_intel,
    )
