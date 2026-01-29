"""File system tools for MCP_CORE - Routed k_files tool.

Provides read, write, list actions with sandboxed access to project root.

Routed tool: k_files(action, ...)
Actions: help, read, write, list
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional

from protocol import ToolRegistry

# Default sandbox root (fallback if no root provided)
DEFAULT_PROJECT_ROOT = Path(__file__).parent.parent.parent  # mcp_core -> apps -> Kuroryuu


def _resolve_path(path: str, root: Optional[str] = None) -> tuple[Path, Path]:
    """Resolve path relative to root, preventing escape.

    Args:
        path: Relative path to resolve
        root: Optional root directory (uses DEFAULT_PROJECT_ROOT if not provided)

    Returns:
        Tuple of (resolved_path, base_root) for use in relative path display
    """
    base = Path(root) if root else DEFAULT_PROJECT_ROOT

    # Handle absolute paths by making them relative
    if os.path.isabs(path):
        path = os.path.basename(path)

    resolved = (base / path).resolve()

    # Security: ensure path is within root
    try:
        resolved.relative_to(base.resolve())
    except ValueError:
        raise ValueError(f"Path escapes project root: {path}")

    return resolved, base.resolve()


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(root: Optional[str] = None, **kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_files."""
    base = Path(root) if root else DEFAULT_PROJECT_ROOT
    return {
        "ok": True,
        "data": {
            "tool": "k_files",
            "description": "File system operations sandboxed to project root",
            "project_root": str(base),
            "actions": {
                "help": "Show this help",
                "read": "Read file contents. Params: path (required), start_line, end_line",
                "write": "Write/overwrite entire file. Params: path, content (required), create_dirs",
                "edit": "Edit file using string replacement. Params: path, old_str, new_str (required)",
                "list": "List directory contents. Params: path (default '.')",
            },
            "edit_rules": [
                "old_str and new_str must be different",
                "old_str must appear exactly once in the file",
                "If file doesn't exist and old_str is empty, creates new file with new_str",
            ],
        },
        "error": None,
    }


def _action_read(
    path: str = "",
    start_line: int = 1,
    end_line: Optional[int] = None,
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Read contents of a file."""
    if not path:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "path is required"}

    try:
        resolved, base = _resolve_path(path, root)

        if not resolved.exists():
            return {"ok": False, "error_code": "NOT_FOUND", "message": f"File not found: {path}"}

        if not resolved.is_file():
            return {"ok": False, "error_code": "NOT_FILE", "message": f"Not a file: {path}"}

        content = resolved.read_text(encoding="utf-8")
        lines = content.splitlines()

        # Apply line range
        start_idx = max(0, start_line - 1)
        end_idx = end_line if end_line else len(lines)
        selected = lines[start_idx:end_idx]

        return {
            "ok": True,
            "content": "\n".join(selected),
            "path": str(resolved.relative_to(base)),
            "lines_read": len(selected),
            "total_lines": len(lines),
        }
    except Exception as e:
        return {"ok": False, "error_code": "READ_FAILED", "message": str(e)}


def _action_write(
    path: str = "",
    content: str = "",
    create_dirs: bool = True,
    force: bool = False,
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Write content to a file."""
    if not path:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "path is required"}
    if content is None:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "content is required"}

    try:
        resolved, base = _resolve_path(path, root)

        # Security: don't overwrite critical files
        protected = [".git", ".env", "node_modules", "__pycache__"]
        for part in resolved.parts:
            if part in protected:
                return {"ok": False, "error_code": "PROTECTED", "message": f"Cannot write to protected path: {path}"}

        # Safety: warn if write would drastically shrink existing file
        if resolved.exists() and not force:
            existing_size = resolved.stat().st_size
            new_size = len(content.encode("utf-8"))
            if existing_size > 100 and new_size < existing_size * 0.5:
                return {
                    "ok": False,
                    "error_code": "SIZE_WARNING",
                    "message": f"Write would shrink file from {existing_size} to {new_size} bytes ({int(100*new_size/existing_size)}%). "
                               f"Use action='edit' for targeted changes, or pass force=True to confirm full overwrite.",
                    "hint": "For small changes, use: k_files(action='edit', path=..., old_str='...', new_str='...')",
                }

        if create_dirs:
            resolved.parent.mkdir(parents=True, exist_ok=True)

        resolved.write_text(content, encoding="utf-8")

        return {
            "ok": True,
            "path": str(resolved.relative_to(base)),
            "bytes_written": len(content.encode("utf-8")),
        }
    except Exception as e:
        return {"ok": False, "error_code": "WRITE_FAILED", "message": str(e)}


def _action_list(
    path: str = ".",
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """List contents of a directory."""
    try:
        resolved, base = _resolve_path(path, root)

        if not resolved.exists():
            return {"ok": False, "error_code": "NOT_FOUND", "message": f"Path not found: {path}"}

        if not resolved.is_dir():
            return {"ok": False, "error_code": "NOT_DIR", "message": f"Not a directory: {path}"}

        entries = []
        for item in sorted(resolved.iterdir()):
            name = item.name
            if item.is_dir():
                name += "/"
            entries.append(name)

        return {
            "ok": True,
            "path": str(resolved.relative_to(base)),
            "entries": entries,
            "count": len(entries),
        }
    except Exception as e:
        return {"ok": False, "error_code": "LIST_FAILED", "message": str(e)}


def _action_edit(
    path: str = "",
    old_str: str = "",
    new_str: str = "",
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Edit a file using string replacement (Anthropic pattern).

    Rules:
    1. old_str and new_str must be different
    2. If file doesn't exist and old_str is empty, creates file with new_str
    3. old_str must appear exactly once in the file (prevents ambiguous edits)

    Args:
        path: File path relative to project root
        old_str: Exact string to find and replace (empty string = create new file)
        new_str: Replacement string
        root: Optional root directory (uses default if not provided)

    Returns:
        {ok, path, message} on success
        {ok: False, error_code, message} on failure
    """
    if not path:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "path is required"}

    # old_str and new_str must differ
    if old_str == new_str:
        return {
            "ok": False,
            "error_code": "INVALID_EDIT",
            "message": "old_str and new_str must be different",
        }

    try:
        resolved, base = _resolve_path(path, root)

        # Security: don't edit protected paths
        protected = [".git", ".env", "node_modules", "__pycache__"]
        for part in resolved.parts:
            if part in protected:
                return {"ok": False, "error_code": "PROTECTED", "message": f"Cannot edit protected path: {path}"}

        # Case 1: File doesn't exist
        if not resolved.exists():
            if old_str == "":
                # Create new file with new_str content
                resolved.parent.mkdir(parents=True, exist_ok=True)
                resolved.write_text(new_str, encoding="utf-8")
                return {
                    "ok": True,
                    "path": str(resolved.relative_to(base)),
                    "message": "File created",
                    "bytes_written": len(new_str.encode("utf-8")),
                }
            else:
                return {
                    "ok": False,
                    "error_code": "NOT_FOUND",
                    "message": f"File not found: {path}. Use old_str='' to create a new file.",
                }

        if not resolved.is_file():
            return {"ok": False, "error_code": "NOT_FILE", "message": f"Not a file: {path}"}

        # Case 2: File exists - perform replacement
        content = resolved.read_text(encoding="utf-8")

        # Count occurrences
        count = content.count(old_str)

        if count == 0:
            return {
                "ok": False,
                "error_code": "NOT_FOUND",
                "message": f"old_str not found in file. Make sure it matches exactly (including whitespace).",
                "hint": f"File has {len(content)} chars. First 200: {content[:200]!r}",
            }

        if count > 1:
            return {
                "ok": False,
                "error_code": "MULTIPLE_MATCHES",
                "message": f"old_str found {count} times. It must appear exactly once for safe replacement.",
                "hint": "Provide more context in old_str to make it unique.",
            }

        # Perform replacement
        new_content = content.replace(old_str, new_str, 1)
        resolved.write_text(new_content, encoding="utf-8")

        return {
            "ok": True,
            "path": str(resolved.relative_to(base)),
            "message": "File edited successfully",
            "old_len": len(old_str),
            "new_len": len(new_str),
            "diff": len(new_str) - len(old_str),
        }

    except Exception as e:
        return {"ok": False, "error_code": "EDIT_FAILED", "message": str(e)}


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "read": _action_read,
    "write": _action_write,
    "edit": _action_edit,
    "list": _action_list,
}


def k_files(
    action: str,
    path: str = "",
    content: str = "",
    old_str: str = "",
    new_str: str = "",
    start_line: int = 1,
    end_line: Optional[int] = None,
    create_dirs: bool = True,
    force: bool = False,
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Files - File system operations sandboxed to project root.

    Routed tool with actions: help, read, write, edit, list

    Args:
        action: Action to perform (required)
        path: File/directory path relative to project root
        content: Content to write (for write action)
        old_str: String to find and replace (for edit action)
        new_str: Replacement string (for edit action)
        start_line: Starting line 1-indexed (for read, default 1)
        end_line: Ending line inclusive (for read, default all)
        create_dirs: Create parent directories (for write, default True)
        root: Optional root directory (overrides default project root)

    Returns:
        {ok, ...} response dict
    """
    act = (action or "").strip().lower()

    if not act:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "action is required. Use action='help' for available actions.",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    handler = ACTION_HANDLERS.get(act)
    if not handler:
        return {
            "ok": False,
            "error_code": "UNKNOWN_ACTION",
            "message": f"Unknown action: {act}",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    return handler(
        path=path,
        content=content,
        old_str=old_str,
        new_str=new_str,
        start_line=start_line,
        end_line=end_line,
        create_dirs=create_dirs,
        force=force,
        root=root,
        **kwargs,
    )


# ============================================================================
# Registration
# ============================================================================

def register_file_tools(registry: ToolRegistry) -> None:
    """Register k_files routed tool with the registry."""

    registry.register(
        name="k_files",
        description="""File system operations sandboxed to project root.

ACTIONS:
- help: Show available actions and usage
- read: Read file contents (params: path, start_line, end_line)
- write: Write/overwrite entire file (params: path, content, create_dirs)
- edit: Edit file using string replacement (params: path, old_str, new_str)
- list: List directory contents (params: path)

EDIT RULES:
- old_str and new_str must be different
- old_str must appear exactly once in file
- If file doesn't exist and old_str='', creates new file with new_str

EXAMPLES:
k_files(action="read", path="src/main.py")
k_files(action="edit", path="app.py", old_str="def old():", new_str="def new():")
k_files(action="edit", path="new.txt", old_str="", new_str="Initial content")
k_files(action="list", path="src/")""",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "read", "write", "edit", "list"],
                    "description": "Action to perform",
                },
                "path": {
                    "type": "string",
                    "description": "File/directory path relative to project root",
                },
                "content": {
                    "type": "string",
                    "description": "Content to write (for write action)",
                },
                "old_str": {
                    "type": "string",
                    "description": "Exact string to find and replace (for edit action). Empty string to create new file.",
                },
                "new_str": {
                    "type": "string",
                    "description": "Replacement string (for edit action)",
                },
                "start_line": {
                    "type": "integer",
                    "default": 1,
                    "description": "Starting line 1-indexed (for read)",
                },
                "end_line": {
                    "type": "integer",
                    "description": "Ending line inclusive (for read)",
                },
                "create_dirs": {
                    "type": "boolean",
                    "default": True,
                    "description": "Create parent directories (for write)",
                },
                "force": {
                    "type": "boolean",
                    "default": False,
                    "description": "Bypass size shrink safety check for intentional full rewrites only (use with caution)",
                },
                "root": {
                    "type": "string",
                    "description": "Optional root directory path (overrides default project root)",
                },
            },
            "required": ["action"],
        },
        handler=k_files,
    )
