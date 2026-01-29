"""Kuroryuu Stdio MCP Server - FastMCP-based server for Kiro IDE.

This server replicates all Kuroryuu MCP_CORE tools using FastMCP with stdio transport.
It's designed specifically for Kiro IDE which requires stdio-based MCP servers.

Tools exposed (prefixed with kuroryuu_):
- RAG: kuroryuu_rag_query, kuroryuu_rag_status, kuroryuu_rag_index
- Inbox: kuroryuu_inbox_send, kuroryuu_inbox_list, kuroryuu_inbox_read, kuroryuu_inbox_claim, kuroryuu_inbox_complete
- Checkpoints: kuroryuu_checkpoint_save, kuroryuu_checkpoint_list, kuroryuu_checkpoint_load
- Working Memory: kuroryuu_get_working_context, kuroryuu_set_goal, kuroryuu_add_blocker, etc.
- Files: kuroryuu_read_file, kuroryuu_write_file, kuroryuu_list_dir
"""

from __future__ import annotations

import datetime as dt
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from mcp.server.fastmcp import FastMCP

# =============================================================================
# IMPORTANT: Never write to stdout (print). Use stderr for logs.
# =============================================================================

def _elog(msg: str) -> None:
    """Log to stderr only - never stdout."""
    sys.stderr.write(msg.rstrip() + "\n")
    sys.stderr.flush()


def _env_bool(name: str, default: bool = False) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    val = os.environ.get(name)
    if val is None:
        return default
    try:
        return int(val.strip())
    except Exception:
        return default


# =============================================================================
# Configuration
# =============================================================================

def _get_project_root() -> Path:
    """Get project root from env or derive from __file__."""
    env_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if env_root:
        return Path(env_root).resolve()
    # __file__ is apps/mcp_stdio/server.py -> go up 2 levels
    return Path(__file__).resolve().parent.parent.parent

PROJECT_ROOT = _get_project_root()
WORKING_ROOT = Path(os.environ.get("KURORYUU_WORKING_ROOT", str(PROJECT_ROOT / "WORKING"))).resolve()
ALLOW_EXTERNAL_ROOT = _env_bool("KURORYUU_ALLOW_EXTERNAL_ROOT", False)
RAG_USE_RG = _env_bool("KURORYUU_RAG_USE_RG", True)
RAG_MAX_FILE_BYTES = _env_int("KURORYUU_RAG_MAX_FILE_BYTES", 1500000)
RAG_DEFAULT_EXTS = ".py,.md,.txt,.json,.yml,.yaml,.ts,.tsx,.js,.jsx,.html,.css"

# =============================================================================
# FastMCP Server
# =============================================================================

mcp = FastMCP("Kuroryuu MCP", json_response=True)

# =============================================================================
# Helper Functions
# =============================================================================

def _now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _iso(dt_obj: dt.datetime) -> str:
    return dt_obj.isoformat(timespec="seconds")


def _ts_for_filename(dt_obj: dt.datetime) -> str:
    return dt_obj.strftime("%Y%m%d_%H%M%S")


def _safe_string(value: str, max_len: int = 64) -> str:
    s = (value or "").strip()
    if not s:
        return ""
    s = re.sub(r"[^A-Za-z0-9_\-]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_-")
    return s[:max_len]


def _validate_root(root: Optional[str]) -> Tuple[Path, List[str]]:
    """Validate and resolve root path."""
    warnings: List[str] = []
    if not root:
        return PROJECT_ROOT, warnings
    try:
        if ".." in root:
            warnings.append(f"Path traversal rejected: {root}")
            return PROJECT_ROOT, warnings
        resolved = Path(root).resolve()
        try:
            resolved.relative_to(PROJECT_ROOT)
            return resolved, warnings
        except ValueError:
            pass
        if ALLOW_EXTERNAL_ROOT:
            warnings.append(f"Using external root: {resolved}")
            return resolved, warnings
        else:
            warnings.append(f"External root rejected: {resolved}")
            return PROJECT_ROOT, warnings
    except Exception as e:
        warnings.append(f"Invalid root path: {e}")
        return PROJECT_ROOT, warnings


def _get_default_exts() -> Set[str]:
    exts_str = os.environ.get("KURORYUU_RAG_DEFAULT_EXTS", RAG_DEFAULT_EXTS)
    return {e.strip().lower() if e.startswith(".") else f".{e.strip().lower()}" for e in exts_str.split(",") if e.strip()}


SKIP_DIRS: Set[str] = {
    ".git", ".hg", ".svn", "__pycache__", "node_modules", ".venv", "venv",
    "Binaries", "Intermediate", "DerivedDataCache", "Saved", ".kiro", "WORKING",
}


def _should_skip_dir(name: str) -> bool:
    return name in SKIP_DIRS or name.startswith(".")


# =============================================================================
# Ripgrep Integration
# =============================================================================

def _find_ripgrep() -> Optional[str]:
    if not RAG_USE_RG:
        return None
    rg_path = shutil.which("rg")
    if rg_path:
        return rg_path
    common_paths = [
        r"C:\Program Files\ripgrep\rg.exe",
        r"C:\scoop\shims\rg.exe",
        os.path.expanduser(r"~\scoop\shims\rg.exe"),
    ]
    for p in common_paths:
        if os.path.isfile(p):
            return p
    return None


def _search_with_ripgrep(
    query: str, root: Path, exts: Set[str], case_sensitive: bool, top_k: int, context_lines: int = 8
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    rg_path = _find_ripgrep()
    if not rg_path:
        raise RuntimeError("ripgrep not available")
    stats = {"files_scanned": 0, "files_skipped": 0}
    cmd = [rg_path, "--line-number", "--no-heading", "--with-filename"]
    if not case_sensitive:
        cmd.append("--smart-case")
    else:
        cmd.append("--case-sensitive")
    for ext in exts:
        ext_clean = ext.lstrip(".")
        cmd.extend(["-g", f"*.{ext_clean}"])
    for skip_dir in SKIP_DIRS:
        cmd.extend(["--glob", f"!{skip_dir}/**"])
    cmd.extend(["--max-filesize", f"{RAG_MAX_FILE_BYTES}b"])
    cmd.append(query)
    cmd.append(str(root))
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, cwd=str(root))
    except subprocess.TimeoutExpired:
        raise RuntimeError("ripgrep timed out")
    except Exception as e:
        raise RuntimeError(f"ripgrep failed: {e}")
    
    matches: List[Dict[str, Any]] = []
    seen_files: Set[str] = set()
    file_matches: Dict[str, List[Tuple[int, str]]] = {}
    
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        match = re.match(r"^(.+?):(\d+):(.*)$", line)
        if not match:
            continue
        file_path, line_num_str, match_text = match.groups()
        line_num = int(line_num_str)
        try:
            abs_path = (root / file_path).resolve()
            rel_path = str(abs_path.relative_to(root)).replace("\\", "/")
        except Exception:
            rel_path = file_path.replace("\\", "/")
        seen_files.add(rel_path)
        if rel_path not in file_matches:
            file_matches[rel_path] = []
        file_matches[rel_path].append((line_num, match_text))
    
    stats["files_scanned"] = len(seen_files)
    ranked_files: List[Tuple[str, int, int]] = []
    for path, hits in file_matches.items():
        first_line = min(h[0] for h in hits)
        ranked_files.append((path, first_line, len(hits)))
    ranked_files.sort(key=lambda x: (-x[2], x[1]))
    
    for path, first_line, match_count in ranked_files[:top_k * 2]:
        try:
            full_path = root / path
            content = full_path.read_text(encoding="utf-8", errors="replace")
            lines = content.splitlines()
            hits = file_matches[path]
            best_line = hits[0][0]
            start = max(1, best_line - context_lines)
            end = min(len(lines), best_line + context_lines)
            snippet = "\n".join(lines[start - 1:end])
            score = min(1.0, match_count / 10) * 0.7 + (1.0 / (1 + ranked_files.index((path, first_line, match_count)))) * 0.3
            matches.append({
                "path": path, "start_line": start, "end_line": end,
                "snippet": snippet[:1000], "score": round(score, 4), "match_kind": "keyword",
            })
            if len(matches) >= top_k:
                break
        except Exception:
            continue
    return matches, stats


def _search_python_fallback(
    query: str, root: Path, exts: Set[str], case_sensitive: bool, top_k: int, context_lines: int = 8
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    stats = {"files_scanned": 0, "files_skipped": 0}
    query_search = query if case_sensitive else query.lower()
    file_hits: List[Tuple[str, int, int, List[int]]] = []
    
    for path in root.rglob("*"):
        if not path.is_file() or path.is_symlink():
            stats["files_skipped"] += 1
            continue
        skip = False
        try:
            rel_parts = path.relative_to(root).parts[:-1]
            for p in rel_parts:
                if _should_skip_dir(p):
                    skip = True
                    break
        except ValueError:
            skip = True
        if skip:
            stats["files_skipped"] += 1
            continue
        ext = path.suffix.lower()
        if exts and ext not in exts:
            stats["files_skipped"] += 1
            continue
        try:
            if path.stat().st_size > RAG_MAX_FILE_BYTES:
                stats["files_skipped"] += 1
                continue
        except Exception:
            stats["files_skipped"] += 1
            continue
        stats["files_scanned"] += 1
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            content_search = content if case_sensitive else content.lower()
            if query_search not in content_search:
                continue
            lines = content.splitlines()
            lines_search = content_search.splitlines()
            match_lines: List[int] = []
            for i, line in enumerate(lines_search):
                if query_search in line:
                    match_lines.append(i + 1)
            if match_lines:
                rel_path = str(path.relative_to(root)).replace("\\", "/")
                file_hits.append((rel_path, match_lines[0], len(match_lines), match_lines))
        except Exception:
            continue
    
    file_hits.sort(key=lambda x: (-x[2], x[1]))
    matches: List[Dict[str, Any]] = []
    for path, first_line, match_count, all_lines in file_hits[:top_k]:
        try:
            full_path = root / path
            content = full_path.read_text(encoding="utf-8", errors="replace")
            lines = content.splitlines()
            start = max(1, first_line - context_lines)
            end = min(len(lines), first_line + context_lines)
            snippet = "\n".join(lines[start - 1:end])
            rank = file_hits.index((path, first_line, match_count, all_lines))
            score = min(1.0, match_count / 10) * 0.7 + (1.0 / (1 + rank)) * 0.3
            matches.append({
                "path": path, "start_line": start, "end_line": end,
                "snippet": snippet[:1000], "score": round(score, 4), "match_kind": "keyword",
            })
        except Exception:
            continue
    return matches, stats



# =============================================================================
# RAG Tools
# =============================================================================

@mcp.tool(
    name="kuroryuu_rag_query",
    description="Search project files by keyword. Uses ripgrep if available, otherwise pure Python. Returns matching code snippets with context.",
)
def kuroryuu_rag_query(
    query: str,
    top_k: int = 8,
    exts: Optional[List[str]] = None,
    root: Optional[str] = None,
    case_sensitive: bool = False,
) -> Dict[str, Any]:
    """Search project files by keyword."""
    start_time = time.time()
    if not query or not query.strip():
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "query is required", "details": {}}
    query = query.strip()
    top_k = max(1, min(25, top_k))
    search_root, warnings = _validate_root(root)
    if exts:
        ext_filter = {e.lower() if e.startswith(".") else f".{e.lower()}" for e in exts if e}
    else:
        ext_filter = _get_default_exts()
    try:
        matches: List[Dict[str, Any]] = []
        stats: Dict[str, int] = {"files_scanned": 0, "files_skipped": 0, "elapsed_ms": 0}
        rag_mode = "keyword_fallback"
        rg_path = _find_ripgrep()
        if rg_path:
            try:
                matches, stats = _search_with_ripgrep(query, search_root, ext_filter, case_sensitive, top_k)
                rag_mode = "keyword_rg"
            except Exception as e:
                warnings.append(f"ripgrep failed ({e}), using Python fallback")
                matches, stats = _search_python_fallback(query, search_root, ext_filter, case_sensitive, top_k)
        else:
            matches, stats = _search_python_fallback(query, search_root, ext_filter, case_sensitive, top_k)
        elapsed_ms = int((time.time() - start_time) * 1000)
        stats["elapsed_ms"] = elapsed_ms
        result: Dict[str, Any] = {
            "ok": True, "rag_mode": rag_mode, "query": query, "root": str(search_root),
            "matches": matches, "stats": stats,
        }
        if warnings:
            result["warnings"] = warnings
        return result
    except Exception as e:
        return {"ok": False, "error_code": "QUERY_FAILED", "message": str(e), "details": {"root": str(search_root)}}


@mcp.tool(
    name="kuroryuu_rag_status",
    description="Check RAG index status, ripgrep availability, and configuration.",
)
def kuroryuu_rag_status() -> Dict[str, Any]:
    """Check RAG status."""
    try:
        index_dir = WORKING_ROOT / "rag_index"
        rg_path = _find_ripgrep()
        return {
            "ok": True, "indexed": False, "chunk_count": 0, "doc_count": 0,
            "index_path": str(index_dir), "project_root": str(PROJECT_ROOT),
            "ripgrep_available": rg_path is not None, "ripgrep_path": rg_path,
            "max_file_bytes": RAG_MAX_FILE_BYTES, "default_exts": list(_get_default_exts()),
        }
    except Exception as e:
        return {"ok": False, "error_code": "STATUS_FAILED", "message": str(e), "details": {}}


@mcp.tool(
    name="kuroryuu_rag_index",
    description="Build or rebuild RAG BM25 index for the project.",
)
def kuroryuu_rag_index(root: Optional[str] = None, force: bool = False) -> Dict[str, Any]:
    """Build RAG index."""
    return {"ok": True, "message": "Index building not implemented in stdio server - use rag_query for live search"}


# =============================================================================
# Inbox Tools
# =============================================================================

INBOX_ROOT = WORKING_ROOT / "inbox"
MAILDIR_FOLDERS = ("new", "cur", "tmp", "done", "dead")


def _ensure_maildir(root: Path) -> Dict[str, Path]:
    folders: Dict[str, Path] = {}
    for folder in MAILDIR_FOLDERS:
        d = root / folder
        d.mkdir(parents=True, exist_ok=True)
        folders[folder] = d
    return folders


def _write_json_atomic(dest: Path, obj: Dict[str, Any], tmp_dir: Path) -> None:
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_file = tmp_dir / f".{dest.name}.tmp_{uuid.uuid4().hex[:8]}"
    data = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
    with tmp_file.open("w", encoding="utf-8", newline="\n") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    dest.parent.mkdir(parents=True, exist_ok=True)
    os.replace(str(tmp_file), str(dest))


def _safe_read_json(path: Path) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    try:
        with path.open("r", encoding="utf-8") as f:
            obj = json.load(f)
        if isinstance(obj, dict):
            return obj, []
        return None, ["JSON root is not an object"]
    except FileNotFoundError:
        return None, ["file not found"]
    except json.JSONDecodeError as exc:
        return None, [f"invalid json: {exc}"]
    except Exception as exc:
        return None, [f"read failed: {exc}"]


def _find_message_by_id(msg_id: str, folders: Dict[str, Path], search_folders: List[str]) -> Tuple[Optional[Path], Optional[str]]:
    for folder_name in search_folders:
        folder = folders.get(folder_name)
        if not folder:
            continue
        for p in folder.glob("*.json"):
            if msg_id in p.name:
                return p, folder_name
            obj, _ = _safe_read_json(p)
            if obj and obj.get("id") == msg_id:
                return p, folder_name
    return None, None


def _list_messages_sorted(folder: Path) -> List[Path]:
    files = list(folder.glob("*.json"))
    return sorted(files, key=lambda p: p.name)


@mcp.tool(
    name="kuroryuu_inbox_send",
    description="Send a message to the inbox (creates in new/ folder).",
)
def kuroryuu_inbox_send(payload: Any, title: str = "", thread_id: str = "") -> Dict[str, Any]:
    """Send inbox message."""
    if payload is None:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "payload is required", "details": {}}
    try:
        folders = _ensure_maildir(INBOX_ROOT)
        now = _now_utc()
        msg_id = str(uuid.uuid4())
        msg: Dict[str, Any] = {
            "schema": "kuroryuu_inbox_v1", "id": msg_id, "created_at": _iso(now),
            "status": "new", "thread_id": thread_id or "", "title": title or "", "payload": payload,
        }
        ts = _ts_for_filename(now)
        safe_title = _safe_string(title, max_len=32)
        fname = f"{ts}__{safe_title}__{msg_id}.json" if safe_title else f"{ts}__{msg_id}.json"
        dest = folders["new"] / fname
        _write_json_atomic(dest, msg, folders["tmp"])
        return {"ok": True, "message": msg, "path": str(dest), "folder": "new"}
    except Exception as e:
        return {"ok": False, "error_code": "SEND_FAILED", "message": str(e), "details": {}}


@mcp.tool(
    name="kuroryuu_inbox_list",
    description="List messages in a folder (new, cur, done, dead).",
)
def kuroryuu_inbox_list(folder: str = "new", limit: int = 50, include_payload: bool = False) -> Dict[str, Any]:
    """List inbox messages."""
    try:
        folder_key = (folder or "new").strip().lower()
        if folder_key not in ("new", "cur", "done", "dead"):
            return {"ok": False, "error_code": "BAD_REQUEST", "message": f"Invalid folder: {folder}", "details": {}}
        limit = max(1, min(200, int(limit or 50)))
        folders = _ensure_maildir(INBOX_ROOT)
        target = folders[folder_key]
        files = _list_messages_sorted(target)
        messages: List[Dict[str, Any]] = []
        for p in files[:limit]:
            obj, _ = _safe_read_json(p)
            if obj is None:
                messages.append({"id": p.stem, "path": str(p), "error": "read failed"})
                continue
            entry: Dict[str, Any] = {
                "id": obj.get("id", p.stem), "created_at": obj.get("created_at", ""),
                "status": obj.get("status", ""), "title": obj.get("title", ""),
                "thread_id": obj.get("thread_id", ""), "path": str(p),
            }
            if include_payload:
                entry["payload"] = obj.get("payload")
            messages.append(entry)
        return {"ok": True, "folder": folder_key, "count": len(messages), "messages": messages}
    except Exception as e:
        return {"ok": False, "error_code": "LIST_FAILED", "message": str(e), "details": {}}


@mcp.tool(
    name="kuroryuu_inbox_read",
    description="Read a message by ID.",
)
def kuroryuu_inbox_read(id: str, folder: str = "") -> Dict[str, Any]:
    """Read inbox message."""
    if not id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "id is required", "details": {}}
    try:
        folders = _ensure_maildir(INBOX_ROOT)
        if folder:
            folder_key = folder.strip().lower()
            if folder_key not in ("new", "cur", "done", "dead"):
                return {"ok": False, "error_code": "BAD_REQUEST", "message": f"Invalid folder: {folder}", "details": {}}
            search_order = [folder_key]
        else:
            search_order = ["new", "cur", "done", "dead"]
        path, found_folder = _find_message_by_id(id, folders, search_order)
        if path is None:
            return {"ok": False, "error_code": "NOT_FOUND", "message": f"Message not found: {id}", "details": {}}
        obj, _ = _safe_read_json(path)
        if obj is None:
            return {"ok": False, "error_code": "READ_FAILED", "message": "Failed to read message", "details": {}}
        return {"ok": True, "message": obj, "path": str(path), "folder": found_folder}
    except Exception as e:
        return {"ok": False, "error_code": "READ_FAILED", "message": str(e), "details": {}}


@mcp.tool(
    name="kuroryuu_inbox_claim",
    description="Claim a message (move from new to cur). If id omitted, claims FIFO oldest.",
)
def kuroryuu_inbox_claim(id: str = "") -> Dict[str, Any]:
    """Claim inbox message."""
    try:
        folders = _ensure_maildir(INBOX_ROOT)
        now = _now_utc()
        if id:
            path, _ = _find_message_by_id(id, folders, ["new"])
            if path is None:
                return {"ok": False, "error_code": "NOT_FOUND", "message": f"Message not found in new/: {id}", "details": {}}
        else:
            files = _list_messages_sorted(folders["new"])
            if not files:
                return {"ok": False, "error_code": "NOT_FOUND", "message": "No messages in new/ to claim", "details": {}}
            path = files[0]
        obj, _ = _safe_read_json(path)
        if obj is None:
            return {"ok": False, "error_code": "READ_FAILED", "message": "Failed to read message", "details": {}}
        obj["status"] = "cur"
        obj["claimed_at"] = _iso(now)
        dest = folders["cur"] / path.name
        _write_json_atomic(dest, obj, folders["tmp"])
        path.unlink(missing_ok=True)
        return {"ok": True, "message": obj, "from_folder": "new", "to_folder": "cur", "path": str(dest)}
    except Exception as e:
        return {"ok": False, "error_code": "CLAIM_FAILED", "message": str(e), "details": {}}


@mcp.tool(
    name="kuroryuu_inbox_complete",
    description="Complete a claimed message (move from cur to done or dead).",
)
def kuroryuu_inbox_complete(id: str, status: str = "done", note: str = "") -> Dict[str, Any]:
    """Complete inbox message."""
    if not id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "id is required", "details": {}}
    try:
        status_key = (status or "done").strip().lower()
        if status_key not in ("done", "dead"):
            return {"ok": False, "error_code": "BAD_REQUEST", "message": f"Invalid status: {status}", "details": {}}
        folders = _ensure_maildir(INBOX_ROOT)
        now = _now_utc()
        path, _ = _find_message_by_id(id, folders, ["cur"])
        if path is None:
            return {"ok": False, "error_code": "NOT_FOUND", "message": f"Message not found in cur/: {id}", "details": {}}
        obj, _ = _safe_read_json(path)
        if obj is None:
            return {"ok": False, "error_code": "READ_FAILED", "message": "Failed to read message", "details": {}}
        obj["status"] = status_key
        obj["completed_at"] = _iso(now)
        if note.strip():
            obj["completion_note"] = note.strip()
        dest = folders[status_key] / path.name
        _write_json_atomic(dest, obj, folders["tmp"])
        path.unlink(missing_ok=True)
        return {"ok": True, "message": obj, "from_folder": "cur", "to_folder": status_key, "path": str(dest)}
    except Exception as e:
        return {"ok": False, "error_code": "COMPLETE_FAILED", "message": str(e), "details": {}}


# =============================================================================
# Checkpoint Tools
# =============================================================================

CHECKPOINT_ROOT = WORKING_ROOT / "checkpoints"


@mcp.tool(
    name="kuroryuu_checkpoint_save",
    description="Save a checkpoint with arbitrary JSON data.",
)
def kuroryuu_checkpoint_save(
    name: str, data: Any, summary: str = "", tags: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Save checkpoint."""
    if not name:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "name is required"}
    if data is None:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "data is required"}
    try:
        now = _now_utc()
        safe_name = _safe_string(name) or "default"
        checkpoint_id = f"cp_{_ts_for_filename(now)}_{uuid.uuid4().hex[:8]}"
        checkpoint: Dict[str, Any] = {
            "schema": "kuroryuu_checkpoint_v1", "id": checkpoint_id, "name": safe_name,
            "saved_at": _iso(now), "summary": summary or "", "tags": tags or [], "data": data,
        }
        cp_dir = CHECKPOINT_ROOT / safe_name
        cp_dir.mkdir(parents=True, exist_ok=True)
        filename = f"checkpoint_{_ts_for_filename(now)}.json"
        cp_path = cp_dir / filename
        with cp_path.open("w", encoding="utf-8") as f:
            json.dump(checkpoint, f, ensure_ascii=False, indent=2)
        return {"ok": True, "id": checkpoint_id, "name": safe_name, "path": str(cp_path), "saved_at": _iso(now)}
    except Exception as e:
        return {"ok": False, "error_code": "SAVE_FAILED", "message": str(e)}


@mcp.tool(
    name="kuroryuu_checkpoint_list",
    description="List available checkpoints.",
)
def kuroryuu_checkpoint_list(name: str = "", limit: int = 20) -> Dict[str, Any]:
    """List checkpoints."""
    try:
        CHECKPOINT_ROOT.mkdir(parents=True, exist_ok=True)
        checkpoints: List[Dict[str, Any]] = []
        safe_name = _safe_string(name) if name else ""
        if safe_name:
            cp_dir = CHECKPOINT_ROOT / safe_name
            if cp_dir.is_dir():
                files = sorted(cp_dir.glob("checkpoint_*.json"), key=lambda p: p.name, reverse=True)
                for p in files[:max(1, int(limit or 20))]:
                    obj, _ = _safe_read_json(p)
                    if obj:
                        checkpoints.append({
                            "id": obj.get("id", p.stem), "name": obj.get("name", safe_name),
                            "saved_at": obj.get("saved_at", ""), "summary": obj.get("summary", ""),
                            "tags": obj.get("tags", []), "path": str(p),
                        })
        else:
            for cp_dir in sorted(CHECKPOINT_ROOT.iterdir(), key=lambda p: p.name, reverse=True):
                if not cp_dir.is_dir() or cp_dir.name.startswith("_"):
                    continue
                files = sorted(cp_dir.glob("checkpoint_*.json"), key=lambda p: p.name, reverse=True)
                for p in files[:5]:
                    obj, _ = _safe_read_json(p)
                    if obj:
                        checkpoints.append({
                            "id": obj.get("id", p.stem), "name": obj.get("name", cp_dir.name),
                            "saved_at": obj.get("saved_at", ""), "summary": obj.get("summary", ""),
                            "tags": obj.get("tags", []), "path": str(p),
                        })
                if len(checkpoints) >= limit:
                    break
        checkpoints.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
        return {"ok": True, "count": len(checkpoints[:limit]), "checkpoints": checkpoints[:limit]}
    except Exception as e:
        return {"ok": False, "error_code": "LIST_FAILED", "message": str(e)}


@mcp.tool(
    name="kuroryuu_checkpoint_load",
    description="Load a checkpoint by ID or latest by name.",
)
def kuroryuu_checkpoint_load(id: str = "", name: str = "") -> Dict[str, Any]:
    """Load checkpoint."""
    if not id and not name:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "id or name is required"}
    try:
        if not id or id == "latest":
            if not name:
                return {"ok": False, "error_code": "MISSING_PARAM", "message": "name is required when id is 'latest'"}
            safe_name = _safe_string(name)
            cp_dir = CHECKPOINT_ROOT / safe_name
            if not cp_dir.is_dir():
                return {"ok": False, "error_code": "NOT_FOUND", "message": f"No checkpoints for name: {name}"}
            files = sorted(cp_dir.glob("checkpoint_*.json"), key=lambda p: p.name, reverse=True)
            if not files:
                return {"ok": False, "error_code": "NOT_FOUND", "message": f"No checkpoints found for: {name}"}
            obj, _ = _safe_read_json(files[0])
            if obj is None:
                return {"ok": False, "error_code": "READ_FAILED", "message": "Failed to read checkpoint"}
            return {"ok": True, "checkpoint": obj, "path": str(files[0])}
        for cp_dir in CHECKPOINT_ROOT.iterdir():
            if not cp_dir.is_dir() or cp_dir.name.startswith("_"):
                continue
            for p in cp_dir.glob("checkpoint_*.json"):
                obj, _ = _safe_read_json(p)
                if obj and obj.get("id") == id:
                    return {"ok": True, "checkpoint": obj, "path": str(p)}
        return {"ok": False, "error_code": "NOT_FOUND", "message": f"Checkpoint not found: {id}"}
    except Exception as e:
        return {"ok": False, "error_code": "LOAD_FAILED", "message": str(e)}


# =============================================================================
# Working Memory Tools
# =============================================================================

AI_DIR = PROJECT_ROOT / "ai"
WORKING_MEMORY_PATH = AI_DIR / "working_memory.json"


def _load_working_memory() -> Dict[str, Any]:
    if not WORKING_MEMORY_PATH.exists():
        return {"recent_actions": [], "tool_call_count": 0, "last_inject_at": 0, "active_goal": "", "blockers": [], "next_steps": []}
    try:
        return json.loads(WORKING_MEMORY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"recent_actions": [], "tool_call_count": 0, "last_inject_at": 0, "active_goal": "", "blockers": [], "next_steps": []}


def _save_working_memory(wm: Dict[str, Any]) -> None:
    AI_DIR.mkdir(parents=True, exist_ok=True)
    WORKING_MEMORY_PATH.write_text(json.dumps(wm, indent=2), encoding="utf-8")


@mcp.tool(
    name="kuroryuu_get_working_context",
    description="Get current working memory context including recent actions, goal, blockers, and next steps.",
)
def kuroryuu_get_working_context() -> Dict[str, Any]:
    """Get working context."""
    wm = _load_working_memory()
    todo_path = AI_DIR / "todo.md"
    todo_content = ""
    if todo_path.exists():
        try:
            todo_content = todo_path.read_text(encoding="utf-8")
        except Exception:
            pass
    return {
        "ok": True, "working_memory": wm, "todo_path": str(todo_path),
        "todo_exists": todo_path.exists(), "todo_preview": todo_content[:500] if todo_content else "(empty)",
    }


@mcp.tool(
    name="kuroryuu_set_goal",
    description="Set the active goal in working memory.",
)
def kuroryuu_set_goal(goal: str) -> Dict[str, Any]:
    """Set goal."""
    if not goal:
        return {"ok": False, "error": "Goal cannot be empty"}
    wm = _load_working_memory()
    wm["active_goal"] = goal[:200]
    _save_working_memory(wm)
    return {"ok": True, "goal": goal[:200]}


@mcp.tool(
    name="kuroryuu_add_blocker",
    description="Add a blocker to working memory.",
)
def kuroryuu_add_blocker(blocker: str) -> Dict[str, Any]:
    """Add blocker."""
    if not blocker:
        return {"ok": False, "error": "Blocker cannot be empty"}
    wm = _load_working_memory()
    blockers = wm.get("blockers", [])
    blockers.append(blocker[:100])
    wm["blockers"] = blockers[-5:]
    _save_working_memory(wm)
    return {"ok": True, "blocker": blocker[:100], "all_blockers": wm["blockers"]}


@mcp.tool(
    name="kuroryuu_clear_blockers",
    description="Clear all blockers from working memory.",
)
def kuroryuu_clear_blockers() -> Dict[str, Any]:
    """Clear blockers."""
    wm = _load_working_memory()
    cleared = len(wm.get("blockers", []))
    wm["blockers"] = []
    _save_working_memory(wm)
    return {"ok": True, "cleared": cleared}


@mcp.tool(
    name="kuroryuu_set_next_steps",
    description="Set next action items in working memory.",
)
def kuroryuu_set_next_steps(steps: List[str]) -> Dict[str, Any]:
    """Set next steps."""
    if not steps:
        return {"ok": False, "error": "Steps cannot be empty"}
    wm = _load_working_memory()
    wm["next_steps"] = [s[:100] for s in steps[:5]]
    _save_working_memory(wm)
    return {"ok": True, "steps": wm["next_steps"]}


@mcp.tool(
    name="kuroryuu_reset_working_memory",
    description="Reset working memory for new task.",
)
def kuroryuu_reset_working_memory() -> Dict[str, Any]:
    """Reset working memory."""
    wm = {"recent_actions": [], "tool_call_count": 0, "last_inject_at": 0, "active_goal": "", "blockers": [], "next_steps": []}
    _save_working_memory(wm)
    return {"ok": True, "message": "Working memory reset"}


# =============================================================================
# File Tools
# =============================================================================

def _resolve_file_path(path: str) -> Path:
    if os.path.isabs(path):
        path = os.path.basename(path)
    resolved = (PROJECT_ROOT / path).resolve()
    try:
        resolved.relative_to(PROJECT_ROOT)
    except ValueError:
        raise ValueError(f"Path escapes project root: {path}")
    return resolved


@mcp.tool(
    name="kuroryuu_read_file",
    description="Read contents of a file. Path is relative to project root.",
)
def kuroryuu_read_file(path: str, start_line: int = 1, end_line: Optional[int] = None) -> Dict[str, Any]:
    """Read file."""
    try:
        resolved = _resolve_file_path(path)
        if not resolved.exists():
            return {"ok": False, "error": f"File not found: {path}"}
        if not resolved.is_file():
            return {"ok": False, "error": f"Not a file: {path}"}
        content = resolved.read_text(encoding="utf-8")
        lines = content.splitlines()
        start_idx = max(0, start_line - 1)
        end_idx = end_line if end_line else len(lines)
        selected = lines[start_idx:end_idx]
        return {
            "ok": True, "content": "\n".join(selected),
            "path": str(resolved.relative_to(PROJECT_ROOT)), "lines_read": len(selected), "total_lines": len(lines),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@mcp.tool(
    name="kuroryuu_write_file",
    description="Write content to a file. Path is relative to project root.",
)
def kuroryuu_write_file(path: str, content: str, create_dirs: bool = True) -> Dict[str, Any]:
    """Write file."""
    try:
        resolved = _resolve_file_path(path)
        protected = [".git", ".env", "node_modules", "__pycache__"]
        for part in resolved.parts:
            if part in protected:
                return {"ok": False, "error": f"Cannot write to protected path: {path}"}
        if create_dirs:
            resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_text(content, encoding="utf-8")
        return {"ok": True, "path": str(resolved.relative_to(PROJECT_ROOT)), "bytes_written": len(content.encode("utf-8"))}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@mcp.tool(
    name="kuroryuu_list_dir",
    description="List contents of a directory. Path is relative to project root.",
)
def kuroryuu_list_dir(path: str = ".") -> Dict[str, Any]:
    """List directory."""
    try:
        resolved = _resolve_file_path(path)
        if not resolved.exists():
            return {"ok": False, "error": f"Path not found: {path}"}
        if not resolved.is_dir():
            return {"ok": False, "error": f"Not a directory: {path}"}
        entries = []
        for item in sorted(resolved.iterdir()):
            name = item.name
            if item.is_dir():
                name += "/"
            entries.append(name)
        return {"ok": True, "path": str(resolved.relative_to(PROJECT_ROOT)), "entries": entries}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# =============================================================================
# Main Entry Point
# =============================================================================

def main() -> None:
    """Run the Kuroryuu Stdio MCP server."""
    _elog("[INFO] Starting Kuroryuu Stdio MCP Server")
    _elog(f"[INFO] Project root: {PROJECT_ROOT}")
    _elog(f"[INFO] Working root: {WORKING_ROOT}")
    _elog(f"[INFO] Ripgrep available: {_find_ripgrep() is not None}")
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
