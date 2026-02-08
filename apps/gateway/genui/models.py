"""Pydantic models for the GenUI pipeline.

Defines A2UIComponent, DashboardState, GenUIRequest, and supporting models
used across content analysis, layout selection, and component generation.
"""

from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# A2UI Component
# ---------------------------------------------------------------------------

class A2UIComponent(BaseModel):
    """A2UI protocol component specification."""

    type: str = Field(
        description="A2UI component type (e.g. 'a2ui.StatCard')"
    )
    id: str = Field(description="Unique component identifier")
    props: dict[str, Any] = Field(default_factory=dict)
    children: list[str] | dict[str, list[str]] | None = None
    zone: str | None = None
    layout: dict[str, str] | None = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if not v.startswith("a2ui."):
            raise ValueError(f"Component type must start with 'a2ui.', got: {v}")
        return v

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Component ID cannot be empty")
        return v.strip()


# ---------------------------------------------------------------------------
# Content Analysis
# ---------------------------------------------------------------------------

class ContentAnalysis(BaseModel):
    """Result of markdown content analysis."""

    title: str = ""
    document_type: str = "article"
    sections: list[str] = Field(default_factory=list)
    links: list[str] = Field(default_factory=list)
    youtube_links: list[str] = Field(default_factory=list)
    github_links: list[str] = Field(default_factory=list)
    code_blocks: list[dict[str, str]] = Field(default_factory=list)
    tables: list[dict[str, Any]] = Field(default_factory=list)
    entities: dict[str, list[str]] = Field(default_factory=dict)
    confidence: float = 0.5
    reasoning: str = ""


# ---------------------------------------------------------------------------
# Layout Decision
# ---------------------------------------------------------------------------

class LayoutDecision(BaseModel):
    """Layout selection result."""

    layout_type: str = "summary_layout"
    confidence: float = 0.6
    reasoning: str = ""
    alternative_layouts: list[str] = Field(default_factory=list)
    component_suggestions: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Dashboard State (SSE snapshot payload)
# ---------------------------------------------------------------------------

class DashboardState(BaseModel):
    """Full dashboard state streamed via SSE snapshots."""

    markdown_content: str = ""
    document_title: str = ""
    document_type: str = ""
    content_analysis: dict[str, Any] = Field(default_factory=dict)
    layout_type: str = ""
    components: list[dict[str, Any]] = Field(default_factory=list)
    status: str = "idle"
    progress: int = 0
    current_step: str = ""
    activity_log: list[dict[str, Any]] = Field(default_factory=list)
    error_message: str | None = None


# ---------------------------------------------------------------------------
# Request / Response
# ---------------------------------------------------------------------------

class GenUIRequest(BaseModel):
    """Request body for /v1/genui/generate and /v1/genui/analyze."""

    markdown: str = Field(..., min_length=1, description="Markdown content to process")
    layout_override: str | None = Field(None, description="Force a specific layout type")
    model: str | None = Field(None, description="LLM model ID to use (from domain config)")
    provider: str | None = Field(None, description="LLM provider to use (from domain config)")


class ComponentListResponse(BaseModel):
    """Response for /v1/genui/components."""

    components: list[str]
    count: int


class LayoutListResponse(BaseModel):
    """Response for /v1/genui/layouts."""

    layouts: list[dict[str, str]]
    count: int


# ---------------------------------------------------------------------------
# Valid component types (all 59)
# ---------------------------------------------------------------------------

VALID_COMPONENT_TYPES: set[str] = {
    # Data & Statistics
    "a2ui.StatCard", "a2ui.MetricRow", "a2ui.ProgressRing",
    "a2ui.ComparisonBar", "a2ui.DataTable", "a2ui.MiniChart",
    # Summary & Overview
    "a2ui.TLDR", "a2ui.KeyTakeaways", "a2ui.ExecutiveSummary",
    "a2ui.TableOfContents",
    # Instructional
    "a2ui.StepCard", "a2ui.CodeBlock", "a2ui.CalloutCard",
    "a2ui.CommandCard",
    # Lists & Rankings
    "a2ui.RankedItem", "a2ui.ChecklistItem", "a2ui.ProConItem",
    "a2ui.BulletPoint",
    # Resources & Links
    "a2ui.LinkCard", "a2ui.ToolCard", "a2ui.BookCard", "a2ui.RepoCard",
    # People & Entities
    "a2ui.ProfileCard", "a2ui.CompanyCard", "a2ui.QuoteCard",
    "a2ui.ExpertTip",
    # News & Trends
    "a2ui.HeadlineCard", "a2ui.TrendIndicator", "a2ui.TimelineEvent",
    "a2ui.NewsTicker",
    # Media
    "a2ui.VideoCard", "a2ui.ImageCard", "a2ui.PlaylistCard",
    "a2ui.PodcastCard",
    # Comparison
    "a2ui.ComparisonTable", "a2ui.VsCard", "a2ui.FeatureMatrix",
    "a2ui.PricingTable",
    # Layout
    "a2ui.Section", "a2ui.Grid", "a2ui.Columns", "a2ui.Tabs",
    "a2ui.Accordion",
    # Tags & Categories
    "a2ui.TagCloud", "a2ui.CategoryBadge", "a2ui.DifficultyBadge",
    "a2ui.Tag", "a2ui.Badge", "a2ui.CategoryTag",
    "a2ui.StatusIndicator", "a2ui.PriorityBadge",
    # Extra layout (reference had these)
    "a2ui.Carousel", "a2ui.Sidebar",
    # Extra tags
    "a2ui.TagGroup",
}


# Case-insensitive canonical mapping for LLM output normalization
COMPONENT_TYPE_CANONICAL: dict[str, str] = {
    name.replace("a2ui.", "").lower(): name.replace("a2ui.", "")
    for name in VALID_COMPONENT_TYPES
}
