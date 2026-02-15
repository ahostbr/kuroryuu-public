"""
Router - PRD (Product Requirements Document)

Generate structured PRDs from feature descriptions.
"""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
import json
import asyncio
import os

# Import prompt building logic
from .prompts import build_prd_prompt

router = APIRouter(prefix="/v1/prd", tags=["prd"])

# ============================================================================
# Models
# ============================================================================
class PRDGenerateRequest(BaseModel):
    """Request to generate a PRD."""
    title: str
    description: str
    scope: str = "feature"  # feature, epic, task
    include_tech_spec: bool = True
    include_acceptance: bool = True
    model: Optional[str] = None  # LLM model to use
    backend: Optional[str] = None  # LLM backend (lmstudio, cliproxyapi, claude)
    config: Optional[Dict[str, Any]] = None

class PRDData(BaseModel):
    """PRD data model for frontend."""
    id: str
    title: str
    scope: str
    status: str
    content: str
    created_at: str
    updated_at: str

class PRDResponse(BaseModel):
    """Response with PRD details."""
    ok: bool = True
    data: Optional[PRDData] = None
    prd_id: str = ""
    prd_path: Optional[str] = None
    content: str = ""
    error: Optional[str] = None

    # Task creation fallback (when LMStudio unavailable)
    task_created: bool = False
    task_id: Optional[str] = None
    message: Optional[str] = None

class PRDListItem(BaseModel):
    """PRD list entry."""
    id: str
    title: str
    scope: str
    status: str
    created_at: str
    updated_at: str

# ============================================================================
# Storage
# ============================================================================
def get_prd_dir() -> Path:
    """Get PRD storage directory."""
    root = Path(__file__).parent.parent.parent
    prd_dir = root / "ai" / "prd"
    prd_dir.mkdir(parents=True, exist_ok=True)
    return prd_dir

def get_active_dir() -> Path:
    """Get active PRDs directory."""
    active = get_prd_dir() / "active"
    active.mkdir(parents=True, exist_ok=True)
    return active

def get_archive_dir() -> Path:
    """Get archived PRDs directory."""
    archive = get_prd_dir() / "archive"
    archive.mkdir(parents=True, exist_ok=True)
    return archive

def get_template() -> str:
    """Get PRD template."""
    template_path = get_prd_dir() / "PRD_TEMPLATE.md"
    if template_path.exists():
        return template_path.read_text()
    return DEFAULT_TEMPLATE

DEFAULT_TEMPLATE = """# PRD: {title}

**ID:** {prd_id}
**Status:** Draft
**Scope:** {scope}
**Created:** {created}
**Author:** AI Assistant

---

## Overview

### Problem Statement
{problem}

### Proposed Solution
{solution}

### Goals
{goals}

---

## Requirements

### Functional Requirements
{functional}

### Non-Functional Requirements
{non_functional}

---

## Technical Specification

### Architecture
{architecture}

### Data Model
{data_model}

### API Changes
{api_changes}

---

## Implementation Plan

### Phases
{phases}

### Timeline Estimate
{timeline}

---

## Acceptance Criteria

{acceptance}

---

## Open Questions

{questions}

---

## Appendix

### Related Documents
- None yet

### Change Log
| Date | Change | Author |
|------|--------|--------|
| {created} | Initial draft | AI |
"""

# ============================================================================
# Endpoints
# ============================================================================
@router.get("/status")
async def prd_status() -> Dict[str, Any]:
    """Get PRD system status."""
    active = list(get_active_dir().glob("*.md"))
    archived = list(get_archive_dir().glob("*.md"))
    
    return {
        "ok": True,
        "active_count": len(active),
        "archived_count": len(archived),
        "template_exists": (get_prd_dir() / "PRD_TEMPLATE.md").exists()
    }

@router.post("/generate", response_model=PRDResponse)
async def generate_prd(request: PRDGenerateRequest) -> PRDResponse:
    """
    Generate a new PRD from description using LMStudio with repo_intel context.

    Uses codebase analysis to generate context-aware product requirements.
    """
    try:
        # STEP 1: Check backend health
        from ..llm import get_backend
        # Use requested backend, env override, or default to lmstudio
        backend_name = request.backend or os.environ.get("KURORYUU_LLM_BACKEND", "lmstudio")
        backend = get_backend(backend_name)
        health = await backend.health_check()

        if not health.get("ok"):
            # LMStudio unavailable - create task fallback
            return await _create_prd_task_fallback(request)

        # STEP 2: LMStudio available - continue existing flow
        # Build codebase context from repo_intel
        from ..repo_intel.router import build_codebase_context
        context = build_codebase_context()

        # Build prompt using new prompt builder
        prompt = build_prd_prompt(
            title=request.title,
            description=request.description,
            scope=request.scope,
            include_tech_spec=request.include_tech_spec,
            include_acceptance=request.include_acceptance,
            context=context,
        )

        # Get LLM backend (use already determined backend_name from above)
        from ..llm import get_backend, LLMMessage
        from ..llm.backends.base import LLMConfig

        # backend_name already set from request or env

        # Prepare messages
        messages = [
            LLMMessage(
                role="system",
                content="You are a senior product manager and technical architect with deep knowledge of software development."
            ),
            LLMMessage(role="user", content=prompt),
        ]

        # Configure LLM
        model = request.model or "mistralai/devstral-small-2-2512"
        config = LLMConfig(
            model=model,
            temperature=0.7,
            max_tokens=8000
        )

        # Stream chat completion
        response_text = ""
        async for event in backend.stream_chat(messages, config):
            if event.type == "delta" and event.text:
                response_text += event.text
            elif event.type == "error":
                return PRDResponse(ok=False, error=event.error_message or "LLM error")

        # Generate PRD ID and metadata
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        slug = request.title.lower().replace(" ", "-")[:30]
        slug = ''.join(c if c.isalnum() or c == '-' else '' for c in slug)
        prd_id = f"PRD_{timestamp}_{slug}"

        # Build full PRD with header
        content = f"""# PRD: {request.title}

**ID:** {prd_id}
**Status:** Draft
**Scope:** {request.scope}
**Created:** {datetime.now().strftime("%Y-%m-%d %H:%M")}
**Author:** LMStudio ({model})

---

{response_text.strip()}
"""

        # Save to file
        prd_path = get_active_dir() / f"{prd_id}.md"
        prd_path.write_text(content, encoding="utf-8")

        # Save metadata to index
        meta_path = get_prd_dir() / "index.json"
        if meta_path.exists():
            index = json.loads(meta_path.read_text())
        else:
            index = {"prds": []}

        created_at = datetime.now().isoformat()
        index["prds"].append({
            "id": prd_id,
            "title": request.title,
            "scope": request.scope,
            "status": "draft",
            "created_at": created_at,
            "updated_at": created_at,
        })
        meta_path.write_text(json.dumps(index, indent=2), encoding="utf-8")

        # Return response matching frontend expectations
        return PRDResponse(
            ok=True,
            data=PRDData(
                id=prd_id,
                title=request.title,
                scope=request.scope,
                status="draft",
                content=content,
                created_at=created_at,
                updated_at=created_at,
            ),
            prd_id=prd_id,
            prd_path=str(prd_path),
            content=content,
        )

    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        return PRDResponse(ok=False, error=error_msg)

async def _create_prd_task_fallback(request: PRDGenerateRequest) -> PRDResponse:
    """Create task in ai/todo.md when LMStudio unavailable."""
    try:
        from ..orchestration.todo_md import TodoMdParser

        parser = TodoMdParser()
        task_ids = parser.get_next_task_ids(1)
        task_id = task_ids[0]

        # Serialize PRD config
        prd_config = {
            "title": request.title,
            "description": request.description,
            "scope": request.scope,
            "include_tech_spec": request.include_tech_spec,
            "include_acceptance": request.include_acceptance,
            "model": request.model or "mistralai/devstral-small-2-2512",
        }

        # Format task line
        task_line = (
            f"- [ ] {task_id}: Generate PRD: {request.title} - "
            f"Read ai/prompts/workflows/create-prd.md - "
            f"PRD Config: {json.dumps(prd_config)} "
            f"**PRIORITY_HIGH** @agent"
        )

        # Append to Backlog
        added_ids = parser.append_to_backlog([task_line])

        if not added_ids:
            return PRDResponse(ok=False, error="Failed to create task")

        return PRDResponse(
            ok=True,
            task_created=True,
            task_id=task_id,
            message=f"LMStudio unavailable. Task {task_id} created in Backlog."
        )
    except Exception as e:
        import traceback
        error_msg = f"Task creation failed: {str(e)}\n{traceback.format_exc()}"
        return PRDResponse(ok=False, error=error_msg)

@router.get("/list")
async def list_prds(status: str = "all") -> Dict[str, Any]:
    """List all PRDs."""
    prds = []
    
    # Active PRDs
    for path in get_active_dir().glob("*.md"):
        prds.append({
            "id": path.stem,
            "status": "active",
            "filename": path.name,
            "modified": datetime.fromtimestamp(path.stat().st_mtime).isoformat()
        })
    
    # Archived PRDs
    if status in ("all", "archived"):
        for path in get_archive_dir().glob("*.md"):
            prds.append({
                "id": path.stem,
                "status": "archived",
                "filename": path.name,
                "modified": datetime.fromtimestamp(path.stat().st_mtime).isoformat()
            })
    
    return {"ok": True, "prds": prds}

@router.get("/{prd_id}")
async def get_prd(prd_id: str) -> Dict[str, Any]:
    """Get a specific PRD."""
    # Check active
    path = get_active_dir() / f"{prd_id}.md"
    if not path.exists():
        path = get_archive_dir() / f"{prd_id}.md"
    
    if not path.exists():
        return {"ok": False, "error": "PRD not found"}
    
    return {
        "ok": True,
        "id": prd_id,
        "content": path.read_text(),
        "status": "active" if "active" in str(path) else "archived"
    }

class PRDUpdateRequest(BaseModel):
    """Request to update PRD content."""
    content: str

@router.put("/{prd_id}")
async def update_prd(prd_id: str, request: PRDUpdateRequest) -> Dict[str, Any]:
    """Update PRD content."""
    path = get_active_dir() / f"{prd_id}.md"
    if not path.exists():
        return {"ok": False, "error": "PRD not found"}

    path.write_text(request.content, encoding="utf-8")
    return {"ok": True, "message": f"Updated {prd_id}"}

@router.post("/{prd_id}/archive")
async def archive_prd(prd_id: str) -> Dict[str, Any]:
    """Archive a PRD."""
    source = get_active_dir() / f"{prd_id}.md"
    if not source.exists():
        return {"ok": False, "error": "PRD not found in active"}

    dest = get_archive_dir() / f"{prd_id}.md"
    source.rename(dest)

    return {"ok": True, "message": f"Archived {prd_id}"}

# ============================================================================
# Session Management
# ============================================================================
def get_sessions_dir() -> Path:
    """Get sessions storage directory."""
    sessions_dir = get_prd_dir() / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    return sessions_dir

class PRDSessionSaveRequest(BaseModel):
    """Request to save a PRD session."""
    name: str
    description: Optional[str] = ""
    prds: List[Dict[str, Any]]

@router.post("/sessions")
async def save_session(request: PRDSessionSaveRequest) -> Dict[str, Any]:
    """Save current PRD session."""
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        session_id = f"session_{timestamp}"

        session_data = {
            "id": session_id,
            "name": request.name,
            "description": request.description,
            "created_at": datetime.now().isoformat(),
            "prd_count": len(request.prds),
            "prds": request.prds,
        }

        session_path = get_sessions_dir() / f"{session_id}.json"
        session_path.write_text(json.dumps(session_data, indent=2), encoding="utf-8")

        return {"ok": True, "session_id": session_id}
    except Exception as e:
        import traceback
        error_msg = f"Failed to save session: {str(e)}\n{traceback.format_exc()}"
        return {"ok": False, "error": error_msg}

@router.get("/sessions")
async def list_sessions() -> Dict[str, Any]:
    """List all saved PRD sessions."""
    try:
        sessions = []
        for path in get_sessions_dir().glob("*.json"):
            data = json.loads(path.read_text(encoding="utf-8"))
            sessions.append({
                "id": data.get("id", path.stem),
                "name": data.get("name", "Unnamed Session"),
                "description": data.get("description", ""),
                "created_at": data.get("created_at", ""),
                "prd_count": data.get("prd_count", 0),
            })

        # Sort by created_at descending
        sessions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return {"ok": True, "sessions": sessions}
    except Exception as e:
        import traceback
        error_msg = f"Failed to list sessions: {str(e)}\n{traceback.format_exc()}"
        return {"ok": False, "error": error_msg, "sessions": []}

@router.get("/sessions/{session_id}")
async def load_session(session_id: str) -> Dict[str, Any]:
    """Load a saved PRD session."""
    try:
        session_path = get_sessions_dir() / f"{session_id}.json"
        if not session_path.exists():
            return {"ok": False, "error": "Session not found"}

        data = json.loads(session_path.read_text(encoding="utf-8"))
        return {"ok": True, "prds": data.get("prds", [])}
    except Exception as e:
        import traceback
        error_msg = f"Failed to load session: {str(e)}\n{traceback.format_exc()}"
        return {"ok": False, "error": error_msg}

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str) -> Dict[str, Any]:
    """Delete a saved PRD session."""
    try:
        session_path = get_sessions_dir() / f"{session_id}.json"
        if not session_path.exists():
            return {"ok": False, "error": "Session not found"}

        session_path.unlink()
        return {"ok": True, "message": f"Deleted session {session_id}"}
    except Exception as e:
        import traceback
        error_msg = f"Failed to delete session: {str(e)}\n{traceback.format_exc()}"
        return {"ok": False, "error": error_msg}
