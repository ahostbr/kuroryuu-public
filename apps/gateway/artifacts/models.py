"""
Pydantic models for Canvas Artifacts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# Canvas types and their valid scenarios
CANVAS_TYPES = Literal["document", "diagram", "chart", "calendar", "seatmap", "code"]

CANVAS_SCENARIOS = {
    "document": ["display", "edit", "diff", "email-preview"],
    "diagram": ["display", "edit"],
    "chart": ["display"],
    "calendar": ["display", "meeting-picker"],
    "seatmap": ["display", "picker"],
    "code": ["display", "edit", "diff"],
}


class Artifact(BaseModel):
    """Full artifact data model."""

    id: str = Field(..., description="Unique artifact identifier")
    type: CANVAS_TYPES = Field(..., description="Canvas type")
    scenario: str = Field(default="display", description="Interaction scenario")
    title: str = Field(..., description="Artifact title")
    content: Dict[str, Any] = Field(default_factory=dict, description="Type-specific content")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    version: int = Field(default=1, description="Version number")
    created_by: Optional[str] = Field(default=None, description="Agent ID that created this")
    session_id: Optional[str] = Field(default=None, description="Session ID")
    run_id: Optional[str] = Field(default=None, description="Run ID for stateless architecture")


class ArtifactCreate(BaseModel):
    """Request to create an artifact."""

    type: CANVAS_TYPES = Field(default="document", description="Canvas type")
    scenario: str = Field(default="display", description="Interaction scenario")
    title: str = Field(default="", description="Artifact title")
    content: Dict[str, Any] = Field(default_factory=dict, description="Type-specific content")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    created_by: Optional[str] = Field(default=None, description="Agent ID")
    session_id: Optional[str] = Field(default=None, description="Session ID")
    run_id: Optional[str] = Field(default=None, description="Run ID")


class ArtifactUpdate(BaseModel):
    """Request to update an artifact."""

    title: Optional[str] = Field(default=None, description="New title")
    scenario: Optional[str] = Field(default=None, description="New scenario")
    content: Optional[Dict[str, Any]] = Field(default=None, description="New content")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Metadata updates (merged)")


class ArtifactResponse(BaseModel):
    """Response containing a single artifact."""

    ok: bool = True
    artifact: Optional[Artifact] = None
    error: Optional[str] = None


class ArtifactListResponse(BaseModel):
    """Response containing list of artifacts."""

    ok: bool = True
    artifacts: List[Artifact] = Field(default_factory=list)
    count: int = 0
    total: int = 0
    error: Optional[str] = None


class ArtifactRenderResponse(BaseModel):
    """Response containing rendered artifact."""

    ok: bool = True
    artifact_id: str = ""
    format: str = "json"
    rendered: str = ""
    error: Optional[str] = None


class ArtifactExportResponse(BaseModel):
    """Response after exporting artifact."""

    ok: bool = True
    artifact_id: str = ""
    format: str = "json"
    output_path: str = ""
    error: Optional[str] = None


class ArtifactCloseRequest(BaseModel):
    """Request to close an interactive session."""

    selection: Optional[Dict[str, Any]] = Field(default=None, description="User selection data")
    cancelled: bool = Field(default=False, description="Whether session was cancelled")


class ArtifactCloseResponse(BaseModel):
    """Response after closing session."""

    ok: bool = True
    artifact_id: str = ""
    closed: bool = True
    cancelled: bool = False
    selection: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# Type-specific content schemas for documentation
CONTENT_SCHEMAS = {
    "document": {
        "markdown": "str - Markdown content",
        "text": "str - Plain text fallback",
        "diff": "dict - {old: str, new: str} for diff view",
        "email": "dict - {from, to, cc, bcc, subject, body} for email preview",
    },
    "diagram": {
        "nodes": "list[dict] - ReactFlow node objects with id, position, data",
        "edges": "list[dict] - ReactFlow edge objects with id, source, target",
        "viewport": "dict - {x, y, zoom} for initial viewport",
    },
    "chart": {
        "type": "str - chart type (line, bar, pie, scatter, etc.)",
        "data": "list[dict] - Data points",
        "options": "dict - Chart.js/D3 options",
    },
    "calendar": {
        "events": "list[dict] - {id, title, startTime, endTime, color, allDay}",
        "currentDate": "str - ISO date for initial view",
        "view": "str - day, week, month",
    },
    "seatmap": {
        "rows": "int - Number of rows",
        "cols": "int - Number of columns",
        "seats": "list[dict] - {row, col, status, label}",
        "selected": "list[str] - Selected seat IDs",
    },
    "code": {
        "code": "str - Source code",
        "language": "str - Language for syntax highlighting",
        "diff": "dict - {old: str, new: str} for diff view",
        "highlights": "list[dict] - {start, end, color} line highlights",
    },
}
