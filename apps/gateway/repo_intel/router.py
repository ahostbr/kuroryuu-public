"""
Gateway - Repo Intel Router

Provides AI-powered code analysis and generation using repo_intel data:
- POST /v1/repo_intel/roadmap - Generate feature roadmap from code analysis
- POST /v1/repo_intel/ideas - Generate improvement ideas from code analysis
- GET /v1/repo_intel/status - Get repo_intel index status
- POST /v1/repo_intel/refresh - Refresh repo_intel index
"""
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/repo_intel", tags=["repo_intel"])

# ============================================================================
# Paths
# ============================================================================
def get_project_root() -> Path:
    """Get Kuroryuu project root from env or detection."""
    if "KURORYUU_ROOT" in os.environ:
        return Path(os.environ["KURORYUU_ROOT"])
    # Walk up from gateway to find project root
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / "KURORYUU_BOOTSTRAP.md").exists():
            return parent
    raise RuntimeError("Could not find Kuroryuu project root")


def get_reports_dir() -> Path:
    """Get Reports/RepoIntel directory."""
    return get_project_root() / "Reports" / "RepoIntel"


def get_repo_intel_dir() -> Path:
    """Get ai/repo_intel directory."""
    return get_project_root() / "ai" / "repo_intel"


# ============================================================================
# Request/Response Models
# ============================================================================
class RepoIntelStatus(BaseModel):
    """Status of repo_intel index."""
    indexed: bool = False
    last_indexed: Optional[str] = None
    total_files: int = 0
    total_symbols: int = 0
    total_todos: int = 0
    available_reports: List[str] = []


class RoadmapRequest(BaseModel):
    """Request for roadmap generation."""
    product_vision: str = ""
    target_audience: str = ""
    timeframe: str = "quarter"  # quarter, half-year, year
    focus_areas: List[str] = []  # e.g., ["performance", "security", "features"]
    max_features: int = 12
    model: Optional[str] = None  # LLM model to use
    backend: Optional[str] = None  # LLM backend (lmstudio, cliproxyapi, claude)
    config: Optional[Dict[str, Any]] = None  # LLM config (model, temperature, etc.)


class IdeaRequest(BaseModel):
    """Request for idea generation."""
    categories: List[str] = ["improvement", "vulnerability", "performance", "documentation", "testing"]
    max_ideas: int = 20
    focus_apps: List[str] = []  # e.g., ["web", "gateway"]
    include_todos: bool = True
    model: Optional[str] = None  # LLM model to use
    backend: Optional[str] = None  # LLM backend (lmstudio, cliproxyapi, claude)
    config: Optional[Dict[str, Any]] = None  # LLM config (model, temperature, etc.)


class RoadmapFeature(BaseModel):
    """A generated roadmap feature."""
    title: str
    description: str
    phase: str  # now, next, later, future
    priority: str  # critical, high, medium, low
    effort: str  # xs, sm, md, lg, xl
    impact: str  # high, medium, low
    related_files: List[str] = []
    tags: List[str] = []


class Idea(BaseModel):
    """A generated improvement idea."""
    title: str
    description: str
    category: str
    impact: str
    effort: str
    rationale: str
    related_files: List[str] = []


class RoadmapResponse(BaseModel):
    """Response from roadmap generation."""
    ok: bool = True
    features: List[RoadmapFeature] = []
    context_used: Dict[str, Any] = {}
    error: Optional[str] = None


class IdeaResponse(BaseModel):
    """Response from idea generation."""
    ok: bool = True
    ideas: List[Idea] = []
    context_used: Dict[str, Any] = {}
    error: Optional[str] = None


# ============================================================================
# Idea Session Persistence Models
# ============================================================================
class SavedIdea(BaseModel):
    """A saved idea with metadata."""
    id: str
    title: str
    description: str
    type: str  # improvement, vulnerability, performance, documentation, testing
    impact: str
    effort: str
    rationale: str
    files: List[str] = []
    status: str = "active"  # active, dismissed, converted
    created_at: str
    updated_at: str


class IdeaSession(BaseModel):
    """A saved ideation session."""
    id: str
    name: str
    description: str = ""
    ideas: List[SavedIdea] = []
    created_at: str
    updated_at: str
    config: Dict[str, Any] = {}
    context_snapshot: Dict[str, Any] = {}  # repo_intel stats at save time


class SaveSessionRequest(BaseModel):
    """Request to save ideas to a session."""
    name: str
    description: str = ""
    ideas: List[SavedIdea]
    config: Dict[str, Any] = {}


class SaveSessionResponse(BaseModel):
    """Response from saving a session."""
    ok: bool = True
    session_id: str = ""
    error: Optional[str] = None


class SessionListItem(BaseModel):
    """Summary of a saved session for listing."""
    id: str
    name: str
    description: str = ""
    idea_count: int
    created_at: str
    updated_at: str


class SessionListResponse(BaseModel):
    """Response listing all saved sessions."""
    ok: bool = True
    sessions: List[SessionListItem] = []
    error: Optional[str] = None


class LoadSessionResponse(BaseModel):
    """Response from loading a session."""
    ok: bool = True
    session: Optional[IdeaSession] = None
    error: Optional[str] = None


class DeleteSessionResponse(BaseModel):
    """Response from deleting a session."""
    ok: bool = True
    error: Optional[str] = None


# ============================================================================
# Session Persistence Helpers
# ============================================================================
def get_sessions_dir() -> Path:
    """Get the directory for saved idea sessions."""
    sessions_dir = get_repo_intel_dir() / "idea_sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    return sessions_dir


def generate_session_id() -> str:
    """Generate a unique session ID."""
    import uuid
    return f"session-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"


def save_session_to_disk(session: IdeaSession) -> None:
    """Save a session to disk."""
    sessions_dir = get_sessions_dir()
    path = sessions_dir / f"{session.id}.json"
    path.write_text(json.dumps(session.model_dump(), indent=2), encoding="utf-8")


def load_session_from_disk(session_id: str) -> Optional[IdeaSession]:
    """Load a session from disk."""
    sessions_dir = get_sessions_dir()
    path = sessions_dir / f"{session_id}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return IdeaSession(**data)
    except Exception:
        return None


def list_sessions_from_disk() -> List[SessionListItem]:
    """List all saved sessions."""
    sessions_dir = get_sessions_dir()
    sessions = []
    for path in sessions_dir.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            sessions.append(SessionListItem(
                id=data.get("id", path.stem),
                name=data.get("name", "Untitled"),
                description=data.get("description", ""),
                idea_count=len(data.get("ideas", [])),
                created_at=data.get("created_at", ""),
                updated_at=data.get("updated_at", ""),
            ))
        except Exception:
            continue
    # Sort by updated_at descending
    sessions.sort(key=lambda s: s.updated_at, reverse=True)
    return sessions


def delete_session_from_disk(session_id: str) -> bool:
    """Delete a session from disk."""
    sessions_dir = get_sessions_dir()
    path = sessions_dir / f"{session_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False


# ============================================================================
# Helper Functions
# ============================================================================
def load_report(name: str) -> Optional[Dict[str, Any]]:
    """Load a repo_intel report JSON."""
    reports_dir = get_reports_dir()
    path = reports_dir / name
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def get_index_status() -> RepoIntelStatus:
    """Get current repo_intel index status."""
    reports_dir = get_reports_dir()
    
    if not reports_dir.exists():
        return RepoIntelStatus()
    
    # Check available reports
    available = []
    for f in reports_dir.iterdir():
        if f.suffix == ".json":
            available.append(f.name)
    
    if not available:
        return RepoIntelStatus(available_reports=available)
    
    # Load manifest for stats
    manifest = load_report("file_manifest.json")
    symbol_map = load_report("symbol_map.json")
    todo_backlog = load_report("todo_backlog.json")
    
    return RepoIntelStatus(
        indexed=True,
        last_indexed=manifest.get("generated_at") if manifest else None,
        total_files=manifest.get("total_files", 0) if manifest else 0,
        total_symbols=symbol_map.get("total_symbols", 0) if symbol_map else 0,
        total_todos=todo_backlog.get("total_matches", 0) if todo_backlog else 0,
        available_reports=available,
    )


def build_codebase_context() -> Dict[str, Any]:
    """Build context from repo_intel data for LLM prompts."""
    context = {
        "symbols": {},
        "components": [],
        "hooks": [],
        "endpoints": [],
        "todos": [],
        "dependencies": {},
    }
    
    # Load symbol map
    symbol_map = load_report("symbol_map.json")
    if symbol_map:
        symbols = symbol_map.get("symbols", [])
        # Group by kind
        by_kind = {}
        for s in symbols:
            kind = s.get("kind", "unknown")
            if kind not in by_kind:
                by_kind[kind] = []
            by_kind[kind].append({
                "name": s.get("name"),
                "file": s.get("file"),
                "app": s.get("app"),
            })
        context["symbols"] = by_kind
    
    # Load API map
    api_map = load_report("public_api_map.json")
    if api_map:
        ts_api = api_map.get("typescript", {})
        py_api = api_map.get("python", {})
        context["components"] = ts_api.get("components", [])[:30]  # Limit
        context["hooks"] = ts_api.get("hooks", [])[:20]
        context["endpoints"] = py_api.get("endpoints", [])[:30]
    
    # Load TODO backlog
    todo_backlog = load_report("todo_backlog.json")
    if todo_backlog:
        backlog = todo_backlog.get("backlog", {})
        todos = []
        for app, files in backlog.items():
            for filepath, items in files.items():
                for item in items[:5]:  # Limit per file
                    todos.append({
                        "app": app,
                        "file": filepath,
                        "pattern": item.get("pattern"),
                        "text": item.get("text", "")[:100],
                    })
        context["todos"] = todos[:50]  # Limit total
    
    # Load dependencies
    depmap = load_report("dependency_map.json")
    if depmap:
        context["dependencies"] = {
            "npm_count": depmap.get("summary", {}).get("unique_npm_deps", 0),
            "python_count": depmap.get("summary", {}).get("unique_python_deps", 0),
        }
    
    return context


def build_roadmap_prompt(request: RoadmapRequest, context: Dict[str, Any]) -> str:
    """Build a prompt for roadmap generation using repo_intel context."""
    prompt_parts = [
        "You are a product strategist analyzing a codebase to generate a feature roadmap.",
        "",
        "=== CODEBASE ANALYSIS ===",
    ]
    
    # Add component info
    if context.get("components"):
        prompt_parts.append(f"\nReact Components ({len(context['components'])} total):")
        for c in context["components"][:15]:
            prompt_parts.append(f"  - {c.get('name')} ({c.get('file')})")
    
    # Add hooks info
    if context.get("hooks"):
        prompt_parts.append(f"\nReact Hooks ({len(context['hooks'])} total):")
        for h in context["hooks"][:10]:
            prompt_parts.append(f"  - {h.get('name')}")
    
    # Add endpoints
    if context.get("endpoints"):
        prompt_parts.append(f"\nAPI Endpoints ({len(context['endpoints'])} total):")
        for e in context["endpoints"][:15]:
            prompt_parts.append(f"  - {e.get('route')} -> {e.get('function')}")
    
    # Add symbol counts
    if context.get("symbols"):
        prompt_parts.append("\nSymbol Summary:")
        for kind, items in context["symbols"].items():
            prompt_parts.append(f"  - {kind}: {len(items)}")
    
    # Add TODOs as feature hints
    if context.get("todos"):
        prompt_parts.append("\nExisting TODOs (potential features):")
        for t in context["todos"][:20]:
            prompt_parts.append(f"  - [{t.get('app')}] {t.get('text')[:80]}")
    
    # Add request context
    prompt_parts.append("\n=== ROADMAP REQUIREMENTS ===")
    if request.product_vision:
        prompt_parts.append(f"Product Vision: {request.product_vision}")
    if request.target_audience:
        prompt_parts.append(f"Target Audience: {request.target_audience}")
    prompt_parts.append(f"Timeframe: {request.timeframe}")
    if request.focus_areas:
        prompt_parts.append(f"Focus Areas: {', '.join(request.focus_areas)}")
    
    prompt_parts.extend([
        "",
        f"Generate {request.max_features} features for the roadmap.",
        "",
        "Output as a JSON array with objects containing:",
        "- title: Feature name",
        "- description: What it does and why",
        "- phase: 'now' | 'next' | 'later' | 'future'",
        "- priority: 'critical' | 'high' | 'medium' | 'low'",
        "- effort: 'xs' | 'sm' | 'md' | 'lg' | 'xl'",
        "- impact: 'high' | 'medium' | 'low'",
        "- related_files: Array of file paths this would touch",
        "- tags: Array of relevant tags",
        "",
        "Base your suggestions on the actual codebase structure shown above.",
        "Prioritize features that address TODOs and enhance existing functionality.",
    ])
    
    return "\n".join(prompt_parts)


def build_ideas_prompt(request: IdeaRequest, context: Dict[str, Any]) -> str:
    """Build a prompt for idea generation using repo_intel context."""
    prompt_parts = [
        "You are a senior software consultant analyzing a codebase to suggest improvements.",
        "",
        "=== CODEBASE ANALYSIS ===",
    ]
    
    # Add component info
    if context.get("components"):
        prompt_parts.append(f"\nReact Components ({len(context['components'])} total):")
        for c in context["components"][:15]:
            prompt_parts.append(f"  - {c.get('name')} ({c.get('file')})")
    
    # Add hooks
    if context.get("hooks"):
        prompt_parts.append(f"\nReact Hooks ({len(context['hooks'])} total):")
        for h in context["hooks"][:10]:
            prompt_parts.append(f"  - {h.get('name')}")
    
    # Add endpoints
    if context.get("endpoints"):
        prompt_parts.append(f"\nAPI Endpoints ({len(context['endpoints'])} total):")
        for e in context["endpoints"][:15]:
            prompt_parts.append(f"  - {e.get('route')} -> {e.get('function')}")
    
    # Add symbol counts
    if context.get("symbols"):
        prompt_parts.append("\nSymbol Summary:")
        for kind, items in context["symbols"].items():
            prompt_parts.append(f"  - {kind}: {len(items)}")
    
    # Add TODOs if requested
    if request.include_todos and context.get("todos"):
        prompt_parts.append("\nExisting TODOs/FIXMEs:")
        for t in context["todos"][:25]:
            prompt_parts.append(f"  - [{t.get('pattern')}] {t.get('text')[:80]}")
    
    # Dependencies
    if context.get("dependencies"):
        prompt_parts.append(f"\nDependencies: {context['dependencies'].get('npm_count', 0)} NPM, {context['dependencies'].get('python_count', 0)} Python")
    
    # Add request context with explicit constraints
    prompt_parts.append("\n=== IDEA REQUIREMENTS ===")
    prompt_parts.append(f"ONLY generate ideas in these categories: {', '.join(request.categories)}")
    prompt_parts.append("Do NOT generate ideas outside these categories.")
    if request.focus_apps:
        prompt_parts.append(f"Focus on apps: {', '.join(request.focus_apps)}")

    # Build category constraint for output schema
    category_options = " | ".join(f"'{c}'" for c in request.categories)

    prompt_parts.extend([
        "",
        f"Generate exactly {request.max_ideas} ideas. Each idea MUST be in one of: {', '.join(request.categories)}.",
        "",
        "Output as a JSON array with objects containing:",
        "- title: Concise idea name",
        "- description: What to improve and how",
        f"- category: {category_options}",
        "- impact: 'high' | 'medium' | 'low'",
        "- effort: 'low' | 'medium' | 'high'",
        "- rationale: Why this would help",
        "- related_files: Array of file paths this would affect",
        "",
        "Base your suggestions on the actual codebase structure shown above.",
        "Be specific and actionable. Reference actual files and patterns you see.",
    ])
    
    return "\n".join(prompt_parts)


# ============================================================================
# Endpoints
# ============================================================================
@router.get("/status")
async def get_status() -> RepoIntelStatus:
    """Get repo_intel index status."""
    return get_index_status()


@router.post("/refresh")
async def refresh_index(full: bool = False) -> Dict[str, Any]:
    """Refresh the repo_intel index."""
    repo_intel_dir = get_repo_intel_dir()
    script = repo_intel_dir / "run_all_intel.py"
    
    if not script.exists():
        raise HTTPException(status_code=404, detail="repo_intel not installed")
    
    args = ["python", str(script)]
    if full:
        args.append("--full")
    
    try:
        result = subprocess.run(
            args,
            cwd=str(get_project_root()),
            capture_output=True,
            text=True,
            timeout=120,
        )
        
        return {
            "ok": result.returncode == 0,
            "stdout": result.stdout[-2000:] if result.stdout else "",
            "stderr": result.stderr[-1000:] if result.stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Index refresh timed out"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/roadmap", response_model=RoadmapResponse)
async def generate_roadmap(request: RoadmapRequest) -> RoadmapResponse:
    """Generate a feature roadmap using repo_intel data."""
    from ..llm import get_backend, LLMMessage
    
    # Check if index exists
    status = get_index_status()
    if not status.indexed:
        return RoadmapResponse(
            ok=False,
            error="Repo intel not indexed. Call POST /v1/repo_intel/refresh first."
        )

    # Build context from repo_intel
    context = build_codebase_context()

    # Build prompt
    prompt = build_roadmap_prompt(request, context)

    # Call LLM
    try:
        from ..llm.backends.base import LLMConfig

        # Use requested backend, config override, env var, or default
        backend_name = (
            request.backend
            or (request.config.get("backend") if request.config else None)
            or os.environ.get("KURORYUU_LLM_BACKEND", "lmstudio")
        )
        print(f"[roadmap] request.backend={request.backend}, request.model={request.model}, resolved backend={backend_name}")
        backend = get_backend(backend_name)

        messages = [
            LLMMessage(role="system", content="You are a product strategist. Output only valid JSON."),
            LLMMessage(role="user", content=prompt),
        ]

        # Get model from request or use default
        model = (
            request.model
            or (request.config.get("model") if request.config else None)
            or "mistralai/devstral-small-2-2512"
        )
        config = LLMConfig(model=model, temperature=0.7, max_tokens=4000)
        
        response_text = ""
        async for event in backend.stream_chat(messages, config):
            if event.type == "delta" and event.text:
                response_text += event.text
            elif event.type == "error":
                return RoadmapResponse(ok=False, error=event.error_message or "LLM error")
        
        # Parse JSON from response
        import re
        match = re.search(r'\[[\s\S]*\]', response_text)
        if not match:
            return RoadmapResponse(ok=False, error="Failed to parse LLM response")
        
        features_data = json.loads(match.group(0))
        features = [RoadmapFeature(**f) for f in features_data]
        
        return RoadmapResponse(
            ok=True,
            features=features,
            context_used={
                "total_symbols": status.total_symbols,
                "total_files": status.total_files,
                "total_todos": status.total_todos,
            }
        )
        
    except Exception as e:
        return RoadmapResponse(ok=False, error=str(e))


@router.post("/ideas", response_model=IdeaResponse)
async def generate_ideas(request: IdeaRequest) -> IdeaResponse:
    """Generate improvement ideas using repo_intel data."""
    from ..llm import get_backend, LLMMessage
    
    # Check if index exists
    status = get_index_status()
    if not status.indexed:
        return IdeaResponse(
            ok=False,
            error="Repo intel not indexed. Call POST /v1/repo_intel/refresh first."
        )

    # Build context from repo_intel
    context = build_codebase_context()

    # Build prompt
    prompt = build_ideas_prompt(request, context)

    # Log the config being used in the prompt
    print(f"[ideas] Config in prompt: categories={request.categories}, max_ideas={request.max_ideas}")
    print(f"[ideas] Prompt IDEA REQUIREMENTS section:")
    print(f"  - ONLY generate ideas in these categories: {', '.join(request.categories)}")
    print(f"  - Generate exactly {request.max_ideas} ideas")

    # Call LLM
    try:
        from ..llm.backends.base import LLMConfig

        # Use requested backend, config override, env var, or default
        backend_name = (
            request.backend
            or (request.config.get("backend") if request.config else None)
            or os.environ.get("KURORYUU_LLM_BACKEND", "lmstudio")
        )
        print(f"[ideas] request.backend={request.backend}, request.model={request.model}, resolved backend={backend_name}")
        backend = get_backend(backend_name)

        messages = [
            LLMMessage(role="system", content="You are a senior software consultant. Output only valid JSON."),
            LLMMessage(role="user", content=prompt),
        ]

        # Get model from request or use default
        model = (
            request.model
            or (request.config.get("model") if request.config else None)
            or "mistralai/devstral-small-2-2512"
        )
        config = LLMConfig(model=model, temperature=0.7, max_tokens=4000)
        
        response_text = ""
        async for event in backend.stream_chat(messages, config):
            if event.type == "delta" and event.text:
                response_text += event.text
            elif event.type == "error":
                return IdeaResponse(ok=False, error=event.error_message or "LLM error")
        
        # Parse JSON from response
        import re
        match = re.search(r'\[[\s\S]*\]', response_text)
        if not match:
            return IdeaResponse(ok=False, error="Failed to parse LLM response")
        
        ideas_data = json.loads(match.group(0))
        ideas = [Idea(**i) for i in ideas_data]
        
        return IdeaResponse(
            ok=True,
            ideas=ideas,
            context_used={
                "total_symbols": status.total_symbols,
                "total_files": status.total_files,
                "total_todos": status.total_todos,
            }
        )
        
    except Exception as e:
        return IdeaResponse(ok=False, error=str(e))


@router.get("/context")
async def get_context() -> Dict[str, Any]:
    """Get the codebase context that would be used for generation."""
    status = get_index_status()
    if not status.indexed:
        raise HTTPException(status_code=404, detail="Repo intel not indexed")
    
    return build_codebase_context()


# ============================================================================
# Session Management Endpoints
# ============================================================================
@router.post("/sessions/save", response_model=SaveSessionResponse)
async def save_idea_session(request: SaveSessionRequest) -> SaveSessionResponse:
    """Save ideas to a named session."""
    try:
        session_id = generate_session_id()
        now = datetime.now().isoformat()
        
        # Get current repo_intel status for context snapshot
        status = get_index_status()
        
        session = IdeaSession(
            id=session_id,
            name=request.name,
            description=request.description,
            ideas=request.ideas,
            created_at=now,
            updated_at=now,
            config=request.config,
            context_snapshot={
                "total_files": status.total_files,
                "total_symbols": status.total_symbols,
                "total_todos": status.total_todos,
                "indexed_at": status.last_indexed,
            }
        )
        
        save_session_to_disk(session)
        
        return SaveSessionResponse(ok=True, session_id=session_id)
        
    except Exception as e:
        return SaveSessionResponse(ok=False, error=str(e))


@router.get("/sessions", response_model=SessionListResponse)
async def list_idea_sessions() -> SessionListResponse:
    """List all saved idea sessions."""
    try:
        sessions = list_sessions_from_disk()
        return SessionListResponse(ok=True, sessions=sessions)
    except Exception as e:
        return SessionListResponse(ok=False, error=str(e))


@router.get("/sessions/{session_id}", response_model=LoadSessionResponse)
async def load_idea_session(session_id: str) -> LoadSessionResponse:
    """Load a saved idea session."""
    try:
        session = load_session_from_disk(session_id)
        if not session:
            return LoadSessionResponse(ok=False, error=f"Session not found: {session_id}")
        return LoadSessionResponse(ok=True, session=session)
    except Exception as e:
        return LoadSessionResponse(ok=False, error=str(e))


@router.put("/sessions/{session_id}", response_model=SaveSessionResponse)
async def update_idea_session(session_id: str, request: SaveSessionRequest) -> SaveSessionResponse:
    """Update an existing idea session."""
    try:
        existing = load_session_from_disk(session_id)
        if not existing:
            return SaveSessionResponse(ok=False, error=f"Session not found: {session_id}")
        
        # Update session
        existing.name = request.name
        existing.description = request.description
        existing.ideas = request.ideas
        existing.config = request.config
        existing.updated_at = datetime.now().isoformat()
        
        save_session_to_disk(existing)
        
        return SaveSessionResponse(ok=True, session_id=session_id)
        
    except Exception as e:
        return SaveSessionResponse(ok=False, error=str(e))


@router.delete("/sessions/{session_id}", response_model=DeleteSessionResponse)
async def delete_idea_session(session_id: str) -> DeleteSessionResponse:
    """Delete a saved idea session."""
    try:
        if delete_session_from_disk(session_id):
            return DeleteSessionResponse(ok=True)
        return DeleteSessionResponse(ok=False, error=f"Session not found: {session_id}")
    except Exception as e:
        return DeleteSessionResponse(ok=False, error=str(e))


@router.post("/sessions/{session_id}/export")
async def export_idea_session(session_id: str, format: str = "markdown") -> Dict[str, Any]:
    """Export a session to markdown or JSON."""
    session = load_session_from_disk(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    if format == "json":
        return {"ok": True, "content": session.model_dump(), "format": "json"}
    
    # Markdown export
    lines = [
        f"# {session.name}",
        "",
        f"*Created: {session.created_at}*",
        f"*Last Updated: {session.updated_at}*",
        "",
    ]
    
    if session.description:
        lines.extend([session.description, ""])
    
    # Group by type
    by_type: Dict[str, List[SavedIdea]] = {}
    for idea in session.ideas:
        if idea.status == "dismissed":
            continue
        by_type.setdefault(idea.type, []).append(idea)
    
    type_emoji = {
        "vulnerability": "🔴",
        "improvement": "💡",
        "performance": "⚡",
        "documentation": "📚",
        "testing": "🧪",
    }
    
    for idea_type, ideas in by_type.items():
        emoji = type_emoji.get(idea_type, "💡")
        lines.append(f"## {emoji} {idea_type.title()} ({len(ideas)})")
        lines.append("")
        
        for idea in ideas:
            lines.append(f"### {idea.title}")
            lines.append(f"**Impact:** {idea.impact} | **Effort:** {idea.effort}")
            lines.append("")
            lines.append(idea.description)
            lines.append("")
            if idea.rationale:
                lines.append(f"*Rationale: {idea.rationale}*")
                lines.append("")
            if idea.files:
                lines.append("**Related Files:**")
                for f in idea.files[:5]:
                    lines.append(f"- `{f}`")
                lines.append("")
    
    # Context snapshot
    if session.context_snapshot:
        lines.extend([
            "---",
            "## Context Snapshot",
            f"- Files: {session.context_snapshot.get('total_files', 'N/A')}",
            f"- Symbols: {session.context_snapshot.get('total_symbols', 'N/A')}",
            f"- TODOs: {session.context_snapshot.get('total_todos', 'N/A')}",
        ])
    
    return {"ok": True, "content": "\n".join(lines), "format": "markdown"}

