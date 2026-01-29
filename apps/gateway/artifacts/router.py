"""
Router - Artifacts

REST API for canvas artifact management:
- POST /v1/artifacts - Create artifact
- GET /v1/artifacts - List artifacts
- GET /v1/artifacts/{id} - Get artifact
- PUT /v1/artifacts/{id} - Update artifact
- DELETE /v1/artifacts/{id} - Delete artifact
- GET /v1/artifacts/{id}/render - Render to format
- POST /v1/artifacts/{id}/close - Close interactive session
- GET /v1/artifacts/{id}/versions - Get version history
- GET /v1/artifacts/{id}/versions/{version} - Get specific version
"""

from __future__ import annotations

import json
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, Response

from .models import (
    Artifact,
    ArtifactCreate,
    ArtifactUpdate,
    ArtifactResponse,
    ArtifactListResponse,
    ArtifactRenderResponse,
    ArtifactExportResponse,
    ArtifactCloseRequest,
    ArtifactCloseResponse,
    CANVAS_SCENARIOS,
)
from .storage import get_storage

# Import WebSocket broadcast functions for real-time updates
from ..websocket import (
    broadcast_artifact_created,
    broadcast_artifact_updated,
    broadcast_artifact_deleted,
    broadcast_artifact_session_closed,
)

router = APIRouter(prefix="/v1/artifacts", tags=["artifacts"])


# ============================================================================
# Renderers
# ============================================================================


def render_to_html(artifact: Artifact) -> str:
    """Render artifact to HTML."""
    title = artifact.title
    content = artifact.content

    if artifact.type == "document":
        markdown_content = content.get("markdown", content.get("text", ""))
        return f"""<!DOCTYPE html>
<html>
<head>
  <title>{title}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }}
    pre {{ background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; }}
  </style>
</head>
<body>
  <h1>{title}</h1>
  <div class="canvas-document" data-artifact-id="{artifact.id}" data-scenario="{artifact.scenario}">
    <pre>{markdown_content}</pre>
  </div>
</body>
</html>"""

    elif artifact.type == "diagram":
        nodes = content.get("nodes", [])
        edges = content.get("edges", [])
        return f"""<!DOCTYPE html>
<html>
<head>
  <title>{title}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 1200px; margin: 2rem auto; padding: 0 1rem; }}
    .diagram-info {{ background: #f5f5f5; padding: 1rem; border-radius: 4px; }}
  </style>
</head>
<body>
  <h1>{title}</h1>
  <div class="canvas-diagram" data-artifact-id="{artifact.id}"
       data-nodes='{json.dumps(nodes)}' data-edges='{json.dumps(edges)}'>
    <div class="diagram-info">
      <p>Diagram with {len(nodes)} nodes and {len(edges)} edges</p>
      <p>Load this in the Canvas view for interactive editing.</p>
    </div>
  </div>
</body>
</html>"""

    elif artifact.type == "code":
        code = content.get("code", content.get("text", ""))
        language = content.get("language", "plaintext")
        return f"""<!DOCTYPE html>
<html>
<head>
  <title>{title}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }}
    pre {{ background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 4px; overflow-x: auto; }}
    code {{ font-family: 'Fira Code', monospace; }}
  </style>
</head>
<body>
  <h1>{title}</h1>
  <pre class="canvas-code" data-language="{language}"><code>{code}</code></pre>
</body>
</html>"""

    elif artifact.type == "calendar":
        events = content.get("events", [])
        return f"""<!DOCTYPE html>
<html>
<head>
  <title>{title}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }}
    .event {{ background: #e3f2fd; padding: 0.5rem; margin: 0.5rem 0; border-radius: 4px; }}
  </style>
</head>
<body>
  <h1>{title}</h1>
  <div class="canvas-calendar" data-artifact-id="{artifact.id}">
    <h2>Events ({len(events)})</h2>
    {"".join(f'<div class="event">{e.get("title", "Event")} - {e.get("startTime", "")}</div>' for e in events)}
  </div>
</body>
</html>"""

    else:
        return f"""<!DOCTYPE html>
<html>
<head><title>{title}</title></head>
<body>
  <h1>{title}</h1>
  <pre>{json.dumps(content, indent=2)}</pre>
</body>
</html>"""


def render_to_svg(artifact: Artifact) -> str:
    """Render artifact to SVG (basic placeholder)."""
    title = artifact.title

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
  <rect width="100%" height="100%" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/>
  <text x="200" y="90" text-anchor="middle" fill="#495057" font-family="system-ui, sans-serif" font-size="16">
    {artifact.type.title()}: {title[:30]}{"..." if len(title) > 30 else ""}
  </text>
  <text x="200" y="120" text-anchor="middle" fill="#6c757d" font-family="system-ui, sans-serif" font-size="12">
    ID: {artifact.id}
  </text>
</svg>"""


def render_to_markdown(artifact: Artifact) -> str:
    """Render artifact to Markdown."""
    title = artifact.title
    content = artifact.content

    if artifact.type == "document":
        return content.get("markdown", content.get("text", f"# {title}\n\nNo content."))

    elif artifact.type == "diagram":
        nodes = content.get("nodes", [])
        edges = content.get("edges", [])
        md = f"# {title}\n\n## Nodes\n"
        for node in nodes:
            label = node.get("data", {}).get("label", node.get("id", "Node"))
            md += f"- **{node.get('id', '?')}**: {label}\n"
        md += "\n## Edges\n"
        for edge in edges:
            md += f"- {edge.get('source', '?')} → {edge.get('target', '?')}\n"
        return md

    elif artifact.type == "code":
        code = content.get("code", content.get("text", ""))
        language = content.get("language", "")
        return f"# {title}\n\n```{language}\n{code}\n```"

    elif artifact.type == "calendar":
        events = content.get("events", [])
        md = f"# {title}\n\n## Events\n"
        for event in events:
            md += f"- **{event.get('title', 'Event')}**: {event.get('startTime', '')} - {event.get('endTime', '')}\n"
        return md

    else:
        return f"# {title}\n\n```json\n{json.dumps(content, indent=2)}\n```"


# ============================================================================
# Endpoints
# ============================================================================


@router.post("", response_model=ArtifactResponse)
@router.post("/", response_model=ArtifactResponse, include_in_schema=False)
async def create_artifact(data: ArtifactCreate) -> ArtifactResponse:
    """Create a new canvas artifact."""
    try:
        storage = get_storage()
        artifact = storage.create(data)
        # Broadcast to all connected clients for real-time updates
        await broadcast_artifact_created(artifact.model_dump())
        return ArtifactResponse(ok=True, artifact=artifact)
    except ValueError as e:
        return ArtifactResponse(ok=False, error=str(e))
    except Exception as e:
        return ArtifactResponse(ok=False, error=f"Failed to create artifact: {e}")


@router.get("", response_model=ArtifactListResponse)
@router.get("/", response_model=ArtifactListResponse, include_in_schema=False)
async def list_artifacts(
    type: Optional[str] = Query(None, description="Filter by canvas type"),
    limit: int = Query(50, ge=1, le=200, description="Max results"),
    offset: int = Query(0, ge=0, description="Skip N results"),
) -> ArtifactListResponse:
    """List all artifacts with optional filtering."""
    try:
        storage = get_storage()
        artifacts, total = storage.list(canvas_type=type, limit=limit, offset=offset)
        return ArtifactListResponse(
            ok=True, artifacts=artifacts, count=len(artifacts), total=total
        )
    except Exception as e:
        return ArtifactListResponse(ok=False, error=f"Failed to list artifacts: {e}")


@router.get("/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact(artifact_id: str) -> ArtifactResponse:
    """Get an artifact by ID."""
    try:
        storage = get_storage()
        artifact = storage.get(artifact_id)
        if not artifact:
            return ArtifactResponse(ok=False, error=f"Artifact not found: {artifact_id}")
        return ArtifactResponse(ok=True, artifact=artifact)
    except Exception as e:
        return ArtifactResponse(ok=False, error=f"Failed to get artifact: {e}")


@router.put("/{artifact_id}", response_model=ArtifactResponse)
async def update_artifact(artifact_id: str, data: ArtifactUpdate) -> ArtifactResponse:
    """Update an artifact."""
    try:
        storage = get_storage()
        artifact = storage.update(artifact_id, data)
        if not artifact:
            return ArtifactResponse(ok=False, error=f"Artifact not found: {artifact_id}")
        # Broadcast changes for real-time collaborative editing
        await broadcast_artifact_updated(
            artifact_id=artifact_id,
            changes=data.model_dump(exclude_none=True),
            version=artifact.version,
        )
        return ArtifactResponse(ok=True, artifact=artifact)
    except ValueError as e:
        return ArtifactResponse(ok=False, error=str(e))
    except Exception as e:
        return ArtifactResponse(ok=False, error=f"Failed to update artifact: {e}")


@router.delete("/{artifact_id}")
async def delete_artifact(artifact_id: str) -> Dict[str, Any]:
    """Delete an artifact."""
    try:
        storage = get_storage()
        deleted = storage.delete(artifact_id)
        if not deleted:
            return {"ok": False, "error": f"Artifact not found: {artifact_id}"}
        # Broadcast deletion for instant UI updates
        await broadcast_artifact_deleted(artifact_id)
        return {"ok": True, "artifact_id": artifact_id, "deleted": True}
    except Exception as e:
        return {"ok": False, "error": f"Failed to delete artifact: {e}"}


@router.get("/{artifact_id}/render", response_model=ArtifactRenderResponse)
async def render_artifact(
    artifact_id: str,
    format: Literal["json", "html", "svg", "markdown"] = Query("json"),
) -> Response:
    """Render an artifact to a specified format."""
    try:
        storage = get_storage()
        artifact = storage.get(artifact_id)
        if not artifact:
            return Response(
                content=json.dumps({"ok": False, "error": f"Artifact not found: {artifact_id}"}),
                media_type="application/json",
                status_code=404,
            )

        if format == "json":
            return Response(
                content=json.dumps(artifact.model_dump(), indent=2, default=str),
                media_type="application/json",
            )
        elif format == "html":
            return HTMLResponse(content=render_to_html(artifact))
        elif format == "svg":
            return Response(content=render_to_svg(artifact), media_type="image/svg+xml")
        elif format == "markdown":
            return Response(content=render_to_markdown(artifact), media_type="text/markdown")
        else:
            return Response(
                content=json.dumps(artifact.model_dump(), indent=2, default=str),
                media_type="application/json",
            )
    except Exception as e:
        return Response(
            content=json.dumps({"ok": False, "error": str(e)}),
            media_type="application/json",
            status_code=500,
        )


@router.post("/{artifact_id}/close", response_model=ArtifactCloseResponse)
async def close_artifact_session(
    artifact_id: str, data: ArtifactCloseRequest
) -> ArtifactCloseResponse:
    """Close an interactive canvas session."""
    try:
        storage = get_storage()
        artifact = storage.get(artifact_id)
        if not artifact:
            return ArtifactCloseResponse(
                ok=False, error=f"Artifact not found: {artifact_id}"
            )

        # Update metadata to mark session as closed
        from datetime import datetime, timezone

        metadata_update = {
            "session_closed": True,
            "session_closed_at": datetime.now(timezone.utc).isoformat(),
        }
        if data.selection:
            metadata_update["last_selection"] = data.selection
        if data.cancelled:
            metadata_update["session_cancelled"] = True

        from .models import ArtifactUpdate

        storage.update(artifact_id, ArtifactUpdate(metadata=metadata_update))

        # Broadcast session closure for waiting agents
        await broadcast_artifact_session_closed(
            artifact_id=artifact_id,
            selection=data.selection,
            cancelled=data.cancelled,
        )
        return ArtifactCloseResponse(
            ok=True,
            artifact_id=artifact_id,
            closed=True,
            cancelled=data.cancelled,
            selection=data.selection,
        )
    except Exception as e:
        return ArtifactCloseResponse(ok=False, error=f"Failed to close session: {e}")


@router.get("/{artifact_id}/versions")
async def get_artifact_versions(artifact_id: str) -> Dict[str, Any]:
    """Get version history for an artifact."""
    try:
        storage = get_storage()
        artifact = storage.get(artifact_id)
        if not artifact:
            return {"ok": False, "error": f"Artifact not found: {artifact_id}"}

        versions = storage.get_versions(artifact_id)
        return {
            "ok": True,
            "artifact_id": artifact_id,
            "current_version": artifact.version,
            "versions": versions,
        }
    except Exception as e:
        return {"ok": False, "error": f"Failed to get versions: {e}"}


@router.get("/{artifact_id}/versions/{version}", response_model=ArtifactResponse)
async def get_artifact_version(artifact_id: str, version: int) -> ArtifactResponse:
    """Get a specific version of an artifact."""
    try:
        storage = get_storage()
        artifact = storage.get_version(artifact_id, version)
        if not artifact:
            return ArtifactResponse(
                ok=False, error=f"Version {version} not found for artifact: {artifact_id}"
            )
        return ArtifactResponse(ok=True, artifact=artifact)
    except Exception as e:
        return ArtifactResponse(ok=False, error=f"Failed to get version: {e}")


@router.get("/status", include_in_schema=False)
async def artifacts_status() -> Dict[str, Any]:
    """Get artifacts endpoint status."""
    try:
        storage = get_storage()
        _, total = storage.list(limit=1)
        return {
            "ok": True,
            "storage_path": str(storage.base_path),
            "total_artifacts": total,
            "canvas_types": list(CANVAS_SCENARIOS.keys()),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
