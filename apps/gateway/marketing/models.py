"""Pydantic models for the Marketing module.

Defines request/response models for research, web scraping, asset generation,
tool management, and skill discovery.
"""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Research Engine
# ---------------------------------------------------------------------------

class Citation(BaseModel):
    """Web search result citation."""

    index: int = Field(description="Citation number [1], [2], etc.")
    url: str = Field(description="Source URL")
    title: str = Field(description="Page title")
    snippet: str = Field(description="Excerpt from page")


class ResearchRequest(BaseModel):
    """Request for research engine."""

    query: str = Field(..., min_length=1, description="Research query")
    mode: str = Field(
        default="quick",
        description="Research mode: quick (3 sources, fast model), deep (10 sources, capable model), reason (5 sources, step-by-step)"
    )
    model: str | None = Field(None, description="LLM model ID override")
    provider: str | None = Field(None, description="LLM provider override")


class ResearchResponse(BaseModel):
    """Response from research engine."""

    content: str = Field(description="Synthesized research content with inline citations")
    citations: list[Citation] = Field(default_factory=list, description="List of sources cited")
    model_used: str = Field(description="LLM model that generated the response")
    mode: str = Field(description="Research mode used")
    query: str = Field(description="Original query")
    timestamp: str = Field(description="ISO 8601 timestamp")


# ---------------------------------------------------------------------------
# Web Scraper
# ---------------------------------------------------------------------------

class ScrapeRequest(BaseModel):
    """Request for web scraper."""

    url: str = Field(..., description="URL to scrape")
    mode: str = Field(
        default="markdown",
        description="Scrape mode: markdown (clean text), screenshot (full-page PNG), extract (structured data via LLM)"
    )
    model: str | None = Field(None, description="LLM model for extract mode")
    provider: str | None = Field(None, description="LLM provider for extract mode")


class ScrapeResponse(BaseModel):
    """Response from web scraper."""

    content: str = Field(description="Scraped content (markdown, JSON, or image path)")
    title: str = Field(description="Page title")
    url: str = Field(description="Source URL")
    word_count: int = Field(description="Word count (markdown/extract mode)")
    extracted_at: str = Field(description="ISO 8601 timestamp")
    mode: str = Field(description="Scrape mode used")


# ---------------------------------------------------------------------------
# Asset Generation
# ---------------------------------------------------------------------------

class ImageGenRequest(BaseModel):
    """Request for image generation."""

    prompt: str = Field(..., min_length=1, description="Image generation prompt")
    style: str = Field(default="photorealistic", description="Visual style preset")
    aspect_ratio: str = Field(default="16:9", description="Aspect ratio (16:9, 1:1, 9:16)")


class VoiceoverRequest(BaseModel):
    """Request for voiceover generation."""

    text: str = Field(..., min_length=1, description="Text to synthesize")
    voice_id: str = Field(default="default", description="Voice ID from ElevenLabs")


class MusicRequest(BaseModel):
    """Request for music generation."""

    prompt: str = Field(..., min_length=1, description="Music generation prompt")
    duration: int = Field(default=30, description="Duration in seconds", ge=5, le=180)


class VideoRequest(BaseModel):
    """Request for video rendering."""

    template: str = Field(default="default", description="Remotion template name")
    props: dict[str, Any] = Field(default_factory=dict, description="Template props (voiceover, music, images, etc.)")


# ---------------------------------------------------------------------------
# Tool Management
# ---------------------------------------------------------------------------

class ToolInfo(BaseModel):
    """Information about a marketing tool."""

    id: str = Field(description="Tool identifier")
    name: str = Field(description="Human-readable name")
    description: str = Field(description="Tool description")
    installed: bool = Field(description="Whether tool is cloned and available")
    path: str | None = Field(None, description="Absolute path to tool directory")
    version: str | None = Field(None, description="Tool version (if available)")
    repo_url: str = Field(description="GitHub repository URL")
    optional: bool = Field(description="Whether tool is optional")


class ToolStatusResponse(BaseModel):
    """Response for tool status check."""

    tools: list[ToolInfo] = Field(description="List of marketing tools")


# ---------------------------------------------------------------------------
# Asset Management
# ---------------------------------------------------------------------------

class AssetInfo(BaseModel):
    """Information about a generated asset."""

    id: str = Field(description="Asset ID (filename)")
    type: str = Field(description="Asset type: image, audio, video")
    name: str = Field(description="Human-readable name")
    path: str = Field(description="Absolute path to asset file")
    createdAt: str = Field(description="ISO 8601 timestamp")
    size: int = Field(description="File size in bytes")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Asset metadata (prompt, style, etc.)")


class AssetsResponse(BaseModel):
    """Response for assets list."""

    assets: list[AssetInfo] = Field(description="List of generated assets")


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

class SkillInfo(BaseModel):
    """Information about a marketing skill."""

    id: str = Field(description="Skill identifier (filename without extension)")
    name: str = Field(description="Skill name")
    description: str = Field(description="Skill description")
    path: str = Field(description="Absolute path to skill file")
    phase: str = Field(description="Marketing phase (research, content, production, distribution)")
