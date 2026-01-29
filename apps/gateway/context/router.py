"""
Router - Context Management

Endpoints for managing agent context lifecycle:
- Reset context for fresh starts
- Export context to documents for handoff
- Manage conversation state
- Get working context for external CLIs (stateless architecture)
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
import json

from .run_manager import (
    get_current_run,
    get_leader_state,
    get_ai_dir,
    list_runs,
    cleanup_abandoned_runs,
    init_run_manager
)

router = APIRouter(prefix="/v1/context", tags=["context"])

# ============================================================================
# Models
# ============================================================================
class ContextExportRequest(BaseModel):
    """Request to export current context."""
    title: str
    summary: str
    files_touched: List[str] = []
    next_steps: List[str] = []
    tags: List[str] = []

class ContextExportResponse(BaseModel):
    """Response with exported doc path."""
    ok: bool = True
    doc_path: Optional[str] = None
    error: Optional[str] = None

class ContextResetRequest(BaseModel):
    """Request to reset context."""
    reason: str = "manual reset"
    archive_current: bool = True

class ContextResetResponse(BaseModel):
    """Response confirming reset."""
    ok: bool = True
    archived_to: Optional[str] = None
    message: str = "Context reset complete"

class ContextStatusResponse(BaseModel):
    """Current context status."""
    ok: bool = True
    exports_count: int = 0
    last_export: Optional[str] = None
    last_reset: Optional[str] = None

# ============================================================================
# Storage
# ============================================================================
def get_context_dir() -> Path:
    """Get context data directory."""
    root = Path(__file__).parent.parent.parent
    context_dir = root / "ai" / "context"
    context_dir.mkdir(parents=True, exist_ok=True)
    return context_dir

def get_exports_dir() -> Path:
    """Get exports directory."""
    exports_dir = get_context_dir() / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    return exports_dir

def get_archives_dir() -> Path:
    """Get archives directory."""
    archives_dir = get_context_dir() / "archives"
    archives_dir.mkdir(parents=True, exist_ok=True)
    return archives_dir

def get_state_file() -> Path:
    """Get context state file."""
    return get_context_dir() / "state.json"

def load_state() -> Dict[str, Any]:
    """Load context state."""
    state_file = get_state_file()
    if state_file.exists():
        return json.loads(state_file.read_text())
    return {"exports": [], "last_reset": None}

def save_state(state: Dict[str, Any]) -> None:
    """Save context state."""
    get_state_file().write_text(json.dumps(state, indent=2))

# ============================================================================
# Endpoints
# ============================================================================
@router.get("/status", response_model=ContextStatusResponse)
async def get_status() -> ContextStatusResponse:
    """Get current context status."""
    state = load_state()
    exports = list(get_exports_dir().glob("*.md"))
    
    last_export = None
    if exports:
        latest = max(exports, key=lambda p: p.stat().st_mtime)
        last_export = latest.stem
    
    return ContextStatusResponse(
        ok=True,
        exports_count=len(exports),
        last_export=last_export,
        last_reset=state.get("last_reset")
    )

@router.post("/export", response_model=ContextExportResponse)
async def export_context(request: ContextExportRequest) -> ContextExportResponse:
    """
    Export current context to a markdown document.
    
    Use this before a context reset to preserve work state.
    """
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        slug = request.title.lower().replace(" ", "_")[:30]
        filename = f"CONTEXT_{timestamp}_{slug}.md"
        
        # Build markdown document
        content = f"""# Context Export: {request.title}

**Exported:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
**Tags:** {', '.join(request.tags) if request.tags else 'none'}

---

## Summary

{request.summary}

---

## Files Touched

"""
        for f in request.files_touched:
            content += f"- `{f}`\n"
        
        content += """
---

## Next Steps

"""
        for i, step in enumerate(request.next_steps, 1):
            content += f"{i}. {step}\n"
        
        content += """
---

## Usage

To continue this work, load this context export and resume from the next steps.

```
/context load {filename}
```
"""
        
        # Save document
        doc_path = get_exports_dir() / filename
        doc_path.write_text(content)
        
        # Update state
        state = load_state()
        state["exports"].append({
            "filename": filename,
            "title": request.title,
            "timestamp": timestamp,
            "tags": request.tags
        })
        save_state(state)
        
        return ContextExportResponse(ok=True, doc_path=str(doc_path))
        
    except Exception as e:
        return ContextExportResponse(ok=False, error=str(e))

@router.post("/reset", response_model=ContextResetResponse)
async def reset_context(request: ContextResetRequest) -> ContextResetResponse:
    """
    Reset context for a fresh start.
    
    This clears conversation state and optionally archives current state.
    Use after exporting important context.
    """
    try:
        archived_to = None
        
        if request.archive_current:
            # Archive current state
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            archive_file = get_archives_dir() / f"archive_{timestamp}.json"
            
            state = load_state()
            state["archived_at"] = timestamp
            state["archive_reason"] = request.reason
            archive_file.write_text(json.dumps(state, indent=2))
            archived_to = str(archive_file)
        
        # Reset state
        new_state = {
            "exports": [],
            "last_reset": datetime.now().isoformat(),
            "reset_reason": request.reason
        }
        save_state(new_state)
        
        return ContextResetResponse(
            ok=True,
            archived_to=archived_to,
            message=f"Context reset. Reason: {request.reason}"
        )
        
    except Exception as e:
        return ContextResetResponse(ok=False, message=str(e))

@router.get("/exports")
async def list_exports() -> Dict[str, Any]:
    """List all context exports."""
    exports = []
    for path in sorted(get_exports_dir().glob("*.md"), reverse=True):
        exports.append({
            "filename": path.name,
            "size": path.stat().st_size,
            "modified": datetime.fromtimestamp(path.stat().st_mtime).isoformat()
        })
    return {"ok": True, "exports": exports}

@router.get("/exports/{filename}")
async def get_export(filename: str) -> Dict[str, Any]:
    """Get a specific export."""
    path = get_exports_dir() / filename
    if not path.exists():
        return {"ok": False, "error": "Export not found"}
    
    return {
        "ok": True,
        "filename": filename,
        "content": path.read_text()
    }


# ============================================================================
# Working Context (Stateless Architecture)
# ============================================================================

class WorkingContextResponse(BaseModel):
    """Response with current working context for external CLIs."""
    ok: bool = True
    run_id: Optional[str] = None
    status: Optional[str] = None
    todo_summary: Optional[str] = None
    leader_state: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


def get_todo_summary() -> Optional[str]:
    """Get summary from ai/todo.md if it exists."""
    todo_file = get_ai_dir() / "todo.md"
    if not todo_file.exists():
        return None
    
    content = todo_file.read_text()
    # Return first 1000 chars as summary
    if len(content) > 1000:
        return content[:1000] + "\n...(truncated)"
    return content


@router.get("/working", response_model=WorkingContextResponse)
async def get_working_context() -> WorkingContextResponse:
    """
    Get current working context for external CLIs.
    
    Returns the active run's state, todo summary, and leader state.
    External CLIs can call this to fetch context before making requests.
    
    Part of the stateless agent architecture:
    - Workers call this to get context pack
    - Leaders call this to check current state
    """
    try:
        current = get_current_run()
        
        if not current:
            return WorkingContextResponse(
                ok=True,
                run_id=None,
                status="no_active_run",
                todo_summary=get_todo_summary(),
                leader_state=None
            )
        
        run_id = current.get("run_id")
        leader_state = get_leader_state(run_id) if run_id else None
        
        return WorkingContextResponse(
            ok=True,
            run_id=run_id,
            status=current.get("status"),
            todo_summary=get_todo_summary(),
            leader_state=leader_state
        )
        
    except Exception as e:
        return WorkingContextResponse(ok=False, error=str(e))


@router.get("/runs")
async def get_runs() -> Dict[str, Any]:
    """List all agent runs with their status."""
    try:
        runs = list_runs()
        current = get_current_run()
        
        return {
            "ok": True,
            "current_run_id": current.get("run_id") if current else None,
            "runs": runs
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/runs/cleanup")
async def cleanup_runs() -> Dict[str, Any]:
    """Manually trigger cleanup of abandoned runs."""
    try:
        abandoned = cleanup_abandoned_runs()
        return {
            "ok": True,
            "abandoned_count": len(abandoned),
            "abandoned_runs": abandoned
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
