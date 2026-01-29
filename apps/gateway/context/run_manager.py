"""
Run Manager

Manages run lifecycle for the stateless agent architecture:
- Creates run folders in WORKING/agent_runs/{run_id}/
- Maintains ai/current_run.json pointer
- Handles run state transitions
- Cleans up abandoned runs on startup
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from enum import Enum

from .run_id import generate_run_id, is_valid_run_id


class RunStatus(str, Enum):
    """Run lifecycle states."""
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ABANDONED = "abandoned"
    FAILED = "failed"


# ============================================================================
# Path Helpers
# ============================================================================

def get_project_root() -> Path:
    """Get project root directory."""
    return Path(__file__).parent.parent.parent.parent


def get_working_dir() -> Path:
    """Get WORKING directory (gitignored runtime data)."""
    working = get_project_root() / "WORKING"
    working.mkdir(parents=True, exist_ok=True)
    return working


def get_agent_runs_dir() -> Path:
    """Get agent runs directory."""
    runs_dir = get_working_dir() / "agent_runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    return runs_dir


def get_run_folder(run_id: str) -> Path:
    """Get folder for a specific run."""
    return get_agent_runs_dir() / run_id


def get_ai_dir() -> Path:
    """Get ai/ directory."""
    ai_dir = get_project_root() / "ai"
    ai_dir.mkdir(parents=True, exist_ok=True)
    return ai_dir


def get_current_run_file() -> Path:
    """Get ai/current_run.json path."""
    return get_ai_dir() / "current_run.json"


def get_settings_file() -> Path:
    """Get ai/settings.json path."""
    return get_ai_dir() / "settings.json"


# ============================================================================
# Settings
# ============================================================================

def load_settings() -> Dict[str, Any]:
    """Load settings from ai/settings.json."""
    settings_file = get_settings_file()
    if settings_file.exists():
        try:
            return json.loads(settings_file.read_text())
        except json.JSONDecodeError:
            pass
    
    # Defaults
    return {
        "context_budget": "compact",
        "strict_worker_guards": True,
        "abandon_after_seconds": 600
    }


# ============================================================================
# Current Run Pointer
# ============================================================================

def atomic_write_json(path: Path, data: Dict[str, Any]) -> None:
    """
    Write JSON atomically (temp file + os.replace).
    Prevents corruption on crash.
    On Windows, falls back to direct write if atomic replace fails.
    """
    import time
    content = json.dumps(data, indent=2)

    # Write to temp file in same directory
    fd, temp_path = tempfile.mkstemp(
        dir=path.parent,
        prefix=".tmp_",
        suffix=".json"
    )
    fd_closed = False
    try:
        os.write(fd, content.encode("utf-8"))
        os.close(fd)
        fd_closed = True

        # On Windows, retry os.replace a few times if target is locked
        max_retries = 3
        for attempt in range(max_retries):
            try:
                os.replace(temp_path, path)
                return  # Success
            except PermissionError:
                if attempt < max_retries - 1:
                    time.sleep(0.1 * (attempt + 1))
                else:
                    # Fallback: direct write (less atomic but works)
                    path.write_text(content, encoding="utf-8")
                    if os.path.exists(temp_path):
                        os.unlink(temp_path)
                    return
    except Exception:
        if not fd_closed:
            try:
                os.close(fd)
            except Exception:
                pass
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception:
                pass
        raise


def get_current_run() -> Optional[Dict[str, Any]]:
    """
    Get current run info from ai/current_run.json.
    
    Returns:
        Dict with run_id, started_at, last_update_at, status
        or None if no active run
    """
    current_file = get_current_run_file()
    if not current_file.exists():
        return None
    
    try:
        return json.loads(current_file.read_text())
    except json.JSONDecodeError:
        return None


def set_current_run(run_id: str, status: RunStatus = RunStatus.IN_PROGRESS) -> Dict[str, Any]:
    """
    Set current run pointer (leader only).
    
    Args:
        run_id: The active run ID
        status: Run status
        
    Returns:
        The current run data
    """
    now = datetime.now().isoformat()
    data = {
        "run_id": run_id,
        "started_at": now,
        "last_update_at": now,
        "status": status.value
    }
    atomic_write_json(get_current_run_file(), data)
    return data


def update_current_run_heartbeat() -> Optional[Dict[str, Any]]:
    """
    Update last_update_at for current run (leader only).
    
    Returns:
        Updated run data, or None if no active run
    """
    current = get_current_run()
    if not current:
        return None
    
    current["last_update_at"] = datetime.now().isoformat()
    atomic_write_json(get_current_run_file(), current)
    return current


def clear_current_run() -> None:
    """Clear current run pointer."""
    current_file = get_current_run_file()
    if current_file.exists():
        current_file.unlink()


# ============================================================================
# Run Folder Management
# ============================================================================

def create_run(run_id: Optional[str] = None) -> str:
    """
    Create a new run folder with initial files.
    
    Args:
        run_id: Optional run ID (generates if not provided)
        
    Returns:
        The run ID
    """
    if run_id is None:
        run_id = generate_run_id()
    
    run_folder = get_run_folder(run_id)
    run_folder.mkdir(parents=True, exist_ok=True)
    
    # Initialize leader_state.json
    leader_state = {
        "run_id": run_id,
        "created_at": datetime.now().isoformat(),
        "status": RunStatus.IN_PROGRESS.value,
        "tasks_dispatched": 0,
        "tasks_completed": 0,
        "current_goal": None,
        "context": {}
    }
    (run_folder / "leader_state.json").write_text(json.dumps(leader_state, indent=2))
    
    # Initialize empty worker_results.jsonl
    (run_folder / "worker_results.jsonl").touch()
    
    # Initialize empty task_log.jsonl
    (run_folder / "task_log.jsonl").touch()
    
    # Set as current run
    set_current_run(run_id)
    
    return run_id


def get_leader_state(run_id: str) -> Optional[Dict[str, Any]]:
    """Get leader state for a run."""
    state_file = get_run_folder(run_id) / "leader_state.json"
    if not state_file.exists():
        return None
    
    try:
        return json.loads(state_file.read_text())
    except json.JSONDecodeError:
        return None


def update_leader_state(run_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    Update leader state for a run.
    
    Args:
        run_id: The run ID
        updates: Dict of fields to update
        
    Returns:
        Updated leader state
    """
    state = get_leader_state(run_id) or {}
    state.update(updates)
    state["last_update_at"] = datetime.now().isoformat()
    
    state_file = get_run_folder(run_id) / "leader_state.json"
    atomic_write_json(state_file, state)
    
    return state


def append_task_log(run_id: str, entry: Dict[str, Any]) -> None:
    """
    Append entry to task_log.jsonl (audit trail).
    
    Args:
        run_id: The run ID
        entry: Log entry dict
    """
    entry["ts"] = datetime.now().isoformat()
    entry["run_id"] = run_id
    
    log_file = get_run_folder(run_id) / "task_log.jsonl"
    with open(log_file, "a") as f:
        f.write(json.dumps(entry) + "\n")


def append_worker_result(run_id: str, result: Dict[str, Any]) -> None:
    """
    Append worker result to worker_results.jsonl.
    
    Args:
        run_id: The run ID
        result: Worker result dict
    """
    result["ts"] = datetime.now().isoformat()
    result["run_id"] = run_id
    
    results_file = get_run_folder(run_id) / "worker_results.jsonl"
    with open(results_file, "a") as f:
        f.write(json.dumps(result) + "\n")


def complete_run(run_id: str, status: RunStatus = RunStatus.COMPLETED) -> None:
    """
    Mark a run as completed.
    
    Args:
        run_id: The run ID
        status: Final status (COMPLETED or FAILED)
    """
    update_leader_state(run_id, {
        "status": status.value,
        "completed_at": datetime.now().isoformat()
    })
    
    # Clear current run if this was it
    current = get_current_run()
    if current and current.get("run_id") == run_id:
        clear_current_run()


# ============================================================================
# Context Pack Storage (Trap #2 fix - workers read from run folder, not ai/*)
# ============================================================================

def save_context_pack(run_id: str, context_pack: Dict[str, Any]) -> Path:
    """
    Save context pack to run folder (leader only).
    
    Workers should read from this file instead of ai/* directly.
    This ensures workers never touch leader-owned state.
    
    Args:
        run_id: The run ID
        context_pack: The context pack dict from build_context_pack()
        
    Returns:
        Path to saved file
    """
    pack_file = get_run_folder(run_id) / "context_pack.json"
    context_pack["saved_at"] = datetime.now().isoformat()
    atomic_write_json(pack_file, context_pack)
    return pack_file


def load_context_pack(run_id: str) -> Optional[Dict[str, Any]]:
    """
    Load context pack from run folder (for workers).
    
    Workers call this instead of building context from ai/*.
    
    Args:
        run_id: The run ID
        
    Returns:
        Context pack dict, or None if not found
    """
    pack_file = get_run_folder(run_id) / "context_pack.json"
    if not pack_file.exists():
        return None
    
    try:
        return json.loads(pack_file.read_text())
    except json.JSONDecodeError:
        return None


def get_context_pack_for_role(
    run_id: Optional[str],
    agent_role: str,
    budget: str = "compact"
) -> Optional[Dict[str, Any]]:
    """
    Get context pack appropriate for the agent role.
    
    - Leader: builds fresh context pack from ai/*, saves to run folder
    - Worker: loads pre-built context pack from run folder
    
    Args:
        run_id: The run ID (required for workers)
        agent_role: "leader" or "worker"
        budget: Context budget level
        
    Returns:
        Context pack dict, or None if worker has no run_id
    """
    if agent_role == "worker":
        if not run_id:
            return None  # Workers MUST have a run_id
        return load_context_pack(run_id)
    
    # Leader mode - import here to avoid circular import
    from .context_pack import build_context_pack
    
    pack = build_context_pack(run_id, agent_role, budget)
    pack_dict = pack.to_dict()
    
    # Save to run folder if we have a run_id
    if run_id:
        save_context_pack(run_id, pack_dict)
    
    return pack_dict


# ============================================================================
# Cleanup
# ============================================================================

def list_runs() -> List[Dict[str, Any]]:
    """List all runs with their status."""
    runs = []
    runs_dir = get_agent_runs_dir()
    
    for run_folder in runs_dir.iterdir():
        if not run_folder.is_dir():
            continue
        
        run_id = run_folder.name
        if not is_valid_run_id(run_id):
            continue
        
        state = get_leader_state(run_id)
        if state:
            runs.append({
                "run_id": run_id,
                "status": state.get("status", "unknown"),
                "created_at": state.get("created_at"),
                "last_update_at": state.get("last_update_at")
            })
    
    return sorted(runs, key=lambda r: r.get("created_at", ""), reverse=True)


def cleanup_abandoned_runs() -> List[str]:
    """
    Mark stale runs as abandoned.
    
    Runs with status=in_progress and no heartbeat for >abandon_after_seconds
    are marked as abandoned.
    
    Returns:
        List of abandoned run IDs
    """
    settings = load_settings()
    abandon_after = settings.get("abandon_after_seconds", 600)
    
    abandoned = []
    now = datetime.now()
    
    for run_info in list_runs():
        if run_info.get("status") != RunStatus.IN_PROGRESS.value:
            continue
        
        last_update = run_info.get("last_update_at")
        if not last_update:
            continue
        
        try:
            last_dt = datetime.fromisoformat(last_update)
            age_seconds = (now - last_dt).total_seconds()
            
            if age_seconds > abandon_after:
                run_id = run_info["run_id"]
                update_leader_state(run_id, {
                    "status": RunStatus.ABANDONED.value,
                    "abandoned_at": now.isoformat(),
                    "abandon_reason": f"No heartbeat for {age_seconds:.0f}s"
                })
                abandoned.append(run_id)
        except (ValueError, TypeError):
            continue
    
    return abandoned


# ============================================================================
# Initialization
# ============================================================================

def init_run_manager() -> Dict[str, Any]:
    """
    Initialize run manager on startup.
    
    - Ensures directories exist
    - Cleans up abandoned runs
    
    Returns:
        Status dict
    """
    # Ensure directories
    get_agent_runs_dir()
    
    # Cleanup abandoned
    abandoned = cleanup_abandoned_runs()
    
    # Get current run if any
    current = get_current_run()
    
    return {
        "ok": True,
        "abandoned_count": len(abandoned),
        "abandoned_runs": abandoned,
        "current_run": current.get("run_id") if current else None
    }
