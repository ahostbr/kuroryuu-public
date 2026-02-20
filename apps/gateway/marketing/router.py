"""Marketing Router - FastAPI endpoints for Marketing module.

Endpoints:
- POST /v1/marketing/config         - Inject API keys (called by Desktop after startup)
- POST /v1/marketing/research       - Research engine (Perplexity replacement)
- POST /v1/marketing/scrape         - Web scraper (Firecrawl replacement)
- GET  /v1/marketing/tools/status   - Tool installation status
- GET  /v1/marketing/assets         - List generated assets
- GET  /v1/marketing/assets/{id}    - Serve asset file
- DELETE /v1/marketing/assets/{id}  - Delete asset
- POST /v1/marketing/generate/image - SSE image generation
- POST /v1/marketing/generate/voiceover - SSE voiceover generation
- POST /v1/marketing/generate/music - SSE music generation
- GET  /v1/marketing/events         - SSE live event bus (agent → GUI sync)
- GET  /v1/marketing/skills         - List marketing skills
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, FileResponse

from .models import (
    ResearchRequest,
    ResearchResponse,
    ScrapeRequest,
    ScrapeResponse,
    ImageGenRequest,
    VoiceoverRequest,
    MusicRequest,
    ToolStatusResponse,
    AssetsResponse,
    AssetInfo,
    SkillInfo,
)

from .research_engine import research
from .web_scraper import scrape
from .image_service import generate_image
from .video_service import generate_voiceover, generate_music
from .tool_manager import (
    get_tool_status,
    list_assets,
    get_asset_path,
    delete_asset,
    list_skills,
)

_event_subscribers: list[asyncio.Queue] = []


async def _broadcast(event: dict) -> None:
    """Push a completed artifact event to all active /events subscribers."""
    dead = []
    for q in _event_subscribers:
        try:
            q.put_nowait(json.dumps(event))
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        _event_subscribers.remove(q)


logger = logging.getLogger("marketing.router")

router = APIRouter(prefix="/v1/marketing", tags=["marketing"])


# ---------------------------------------------------------------------------
# Config / API Key Injection (called by Desktop after Gateway startup)
# ---------------------------------------------------------------------------

# Allowed env vars that can be set via this endpoint
_ALLOWED_KEYS = {"ELEVENLABS_API_KEY", "GOOGLE_AI_API_KEY", "ANTHROPIC_API_KEY", "KURORYUU_LLM_BACKENDS"}


@router.post("/config")
async def config_endpoint(body: dict[str, Any]) -> dict[str, Any]:
    """Inject API keys from Desktop's token store into Gateway env.

    Called by Desktop after Gateway health check passes.
    Only whitelisted key names are accepted.

    Body: { "keys": { "ELEVENLABS_API_KEY": "...", "GOOGLE_AI_API_KEY": "..." } }
    """
    keys = body.get("keys", {})
    injected = []
    for name, value in keys.items():
        if name in _ALLOWED_KEYS and isinstance(value, str) and value:
            os.environ[name] = value
            injected.append(name)
            logger.info(f"Injected API key: {name}")

    return {"ok": True, "injected": injected}


# ---------------------------------------------------------------------------
# Research Engine
# ---------------------------------------------------------------------------

@router.post("/research", response_model=ResearchResponse)
async def research_endpoint(request: ResearchRequest) -> ResearchResponse:
    """Execute research query via DuckDuckGo + LLM synthesis.

    Replaces Perplexity with local web search + Gateway LLM.

    Args:
        request: ResearchRequest with query, mode, model, provider

    Returns:
        ResearchResponse with synthesized content and citations
    """
    try:
        result = await research(
            query=request.query,
            mode=request.mode,
            model=request.model,
            provider=request.provider,
        )
        asyncio.create_task(_broadcast({"tool": "research", "type": "complete", **result.model_dump()}))
        return result
    except Exception as e:
        logger.error(f"Research failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Web Scraper
# ---------------------------------------------------------------------------

@router.post("/scrape", response_model=ScrapeResponse)
async def scrape_endpoint(request: ScrapeRequest) -> ScrapeResponse:
    """Scrape web page content via Playwright.

    Replaces Firecrawl with local browser automation.

    Args:
        request: ScrapeRequest with url, mode, model, provider

    Returns:
        ScrapeResponse with scraped content
    """
    try:
        result = await scrape(
            url=request.url,
            mode=request.mode,
            model=request.model,
            provider=request.provider,
        )
        asyncio.create_task(_broadcast({"tool": "scrape", "type": "complete", **result.model_dump()}))
        return result
    except Exception as e:
        logger.error(f"Scraping failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Tool Management
# ---------------------------------------------------------------------------

@router.get("/tools/status", response_model=ToolStatusResponse)
async def tools_status_endpoint() -> ToolStatusResponse:
    """Get installation status for all marketing tools.

    Returns:
        ToolStatusResponse with tool info
    """
    return get_tool_status()


# ---------------------------------------------------------------------------
# Asset Management
# ---------------------------------------------------------------------------

@router.get("/assets", response_model=AssetsResponse)
async def list_assets_endpoint() -> AssetsResponse:
    """List all generated assets.

    Returns:
        AssetsResponse with asset info
    """
    assets = list_assets()
    return AssetsResponse(assets=[AssetInfo(**a) for a in assets])


@router.get("/assets/{asset_id}")
async def get_asset_endpoint(asset_id: str) -> FileResponse:
    """Serve an asset file.

    Args:
        asset_id: Asset filename

    Returns:
        FileResponse with asset file
    """
    asset_path = get_asset_path(asset_id)
    if not asset_path:
        raise HTTPException(status_code=404, detail="Asset not found")

    return FileResponse(asset_path)


@router.delete("/assets/{asset_id}")
async def delete_asset_endpoint(asset_id: str) -> dict[str, Any]:
    """Delete an asset file.

    Args:
        asset_id: Asset filename

    Returns:
        Success message
    """
    success = delete_asset(asset_id)
    if not success:
        raise HTTPException(status_code=404, detail="Asset not found")

    return {"status": "deleted", "asset_id": asset_id}


# ---------------------------------------------------------------------------
# Image Generation
# ---------------------------------------------------------------------------

@router.post("/generate/image")
async def generate_image_endpoint(request: ImageGenRequest) -> StreamingResponse:
    """Generate image via google-image-gen-api-starter.

    SSE event stream with progress and completion events.

    Args:
        request: ImageGenRequest with prompt, style, aspect_ratio

    Returns:
        StreamingResponse with SSE events
    """
    async def event_generator():
        async for event_json in generate_image(
            prompt=request.prompt,
            style=request.style,
            aspect_ratio=request.aspect_ratio,
        ):
            yield f"data: {event_json}\n\n"
            event = json.loads(event_json)
            asyncio.create_task(_broadcast({"tool": "image", **event}))

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Voiceover Generation
# ---------------------------------------------------------------------------

@router.post("/generate/voiceover")
async def generate_voiceover_endpoint(request: VoiceoverRequest) -> StreamingResponse:
    """Generate voiceover via ElevenLabs (via video toolkit).

    SSE event stream with progress and completion events.

    Args:
        request: VoiceoverRequest with text, voice_id

    Returns:
        StreamingResponse with SSE events
    """
    async def event_generator():
        async for event_json in generate_voiceover(
            text=request.text,
            voice_id=request.voice_id,
        ):
            yield f"data: {event_json}\n\n"
            event = json.loads(event_json)
            asyncio.create_task(_broadcast({"tool": "voiceover", **event}))

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Music Generation
# ---------------------------------------------------------------------------

@router.post("/generate/music")
async def generate_music_endpoint(request: MusicRequest) -> StreamingResponse:
    """Generate music via video toolkit.

    SSE event stream with progress and completion events.

    Args:
        request: MusicRequest with prompt, duration

    Returns:
        StreamingResponse with SSE events
    """
    async def event_generator():
        async for event_json in generate_music(
            prompt=request.prompt,
            duration=request.duration,
        ):
            yield f"data: {event_json}\n\n"
            event = json.loads(event_json)
            asyncio.create_task(_broadcast({"tool": "music", **event}))

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Live Event Stream (for agent → GUI synchronization)
# ---------------------------------------------------------------------------

@router.get("/events")
async def events_stream() -> StreamingResponse:
    """Persistent SSE stream. Broadcasts completed artifact events from any caller.

    Allows the Desktop GUI panels to react to agent-initiated Gateway calls.
    Events: {type: "complete", tool: "image"|"voiceover"|"music"|"research"|"scrape", ...}
    """
    q: asyncio.Queue = asyncio.Queue(maxsize=50)
    _event_subscribers.append(q)

    async def generator():
        try:
            yield 'data: {"type":"connected"}\n\n'
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            if q in _event_subscribers:
                _event_subscribers.remove(q)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Skills Discovery
# ---------------------------------------------------------------------------

@router.get("/skills", response_model=list[SkillInfo])
async def list_skills_endpoint() -> list[SkillInfo]:
    """List all marketing skills.

    Returns:
        List of SkillInfo objects
    """
    return list_skills()
