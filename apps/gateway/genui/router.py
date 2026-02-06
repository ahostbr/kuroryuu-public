"""GenUI Router - FastAPI endpoints for A2UI generation pipeline.

Endpoints:
- POST /v1/genui/generate  - SSE stream: full pipeline (analyze -> layout -> generate)
- POST /v1/genui/analyze   - Content analysis only
- GET  /v1/genui/components - List registered A2UI component types
- GET  /v1/genui/layouts    - List available layout types

All SSE events reuse AG-UI event types from apps/gateway/agui/events.py.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..agui.events import (
    emit_run_started,
    emit_run_finished,
    emit_run_error,
    emit_step_started,
    emit_step_finished,
    emit_state_snapshot,
    emit_state_delta,
)
from ..llm import get_healthy_backend, LLMConfig, LLMMessage, StreamEvent

from .models import (
    GenUIRequest,
    ComponentListResponse,
    LayoutListResponse,
    VALID_COMPONENT_TYPES,
    DashboardState,
)
from .content_analyzer import analyze_content, parse_markdown, classify_heuristic, extract_entities
from .layout_selector import select_layout, LAYOUT_MAPPINGS
from .component_generator import generate_components

logger = logging.getLogger("genui.router")

router = APIRouter(prefix="/v1/genui", tags=["genui"])


# ---------------------------------------------------------------------------
# LLM call wrapper using Gateway backends
# ---------------------------------------------------------------------------

async def _gateway_llm_call(
    prompt: str,
    system_prompt: str = "",
    max_tokens: int = 4000,
    temperature: float = 0.7,
) -> str:
    """Call LLM via Gateway's healthy backend with fallback chain."""
    backend = await get_healthy_backend()

    messages: list[LLMMessage] = []
    if system_prompt:
        messages.append(LLMMessage(role="system", content=system_prompt))
    messages.append(LLMMessage(role="user", content=prompt))

    config = LLMConfig(
        model="",  # Backend uses its own configured model
        temperature=temperature,
        max_tokens=max_tokens,
    )

    # Collect streaming response into full text
    chunks: list[str] = []
    async for event in backend.stream_chat(messages, config):
        if event.type == "delta" and event.text:
            chunks.append(event.text)
        elif event.type == "error":
            raise RuntimeError(f"LLM error: {event.error_message}")

    return "".join(chunks)


# ---------------------------------------------------------------------------
# SSE Generator
# ---------------------------------------------------------------------------

async def _generate_sse(markdown: str, layout_override: str | None = None) -> AsyncGenerator[str, None]:
    """Full 3-stage pipeline as SSE event stream."""
    thread_id = f"genui-{uuid.uuid4().hex[:8]}"
    run_id = f"run-{uuid.uuid4().hex[:8]}"

    # --- RUN_STARTED ---
    yield emit_run_started(thread_id, run_id).to_sse()

    state = DashboardState(
        markdown_content=markdown[:500],  # Truncate for state snapshot
        status="analyzing",
        progress=0,
        current_step="content_analysis",
    )

    try:
        # ===== Stage 1: Content Analysis =====
        yield emit_step_started("content_analysis").to_sse()
        yield emit_state_snapshot({"status": "analyzing", "progress": 10, "current_step": "content_analysis"}).to_sse()

        analysis = await analyze_content(markdown, llm_call=_gateway_llm_call)
        analysis_dict = analysis.model_dump()

        # Merge parsed data
        parsed = parse_markdown(markdown)
        full_analysis = {
            **analysis_dict,
            "sections": parsed.get("sections", []),
            "code_blocks": parsed.get("code_blocks", []),
            "tables": parsed.get("tables", []),
            "links": parsed.get("all_links", []),
            "youtube_links": parsed.get("youtube_links", []),
            "github_links": parsed.get("github_links", []),
        }

        yield emit_state_snapshot({
            "status": "analyzing",
            "progress": 40,
            "current_step": "content_analysis",
            "document_title": analysis.title,
            "document_type": analysis.document_type,
            "content_analysis": {
                "title": analysis.title,
                "document_type": analysis.document_type,
                "sections": len(analysis.sections),
                "code_blocks": len(analysis.code_blocks),
                "entities": analysis.entities,
            },
        }).to_sse()

        yield emit_step_finished("content_analysis").to_sse()

        # ===== Stage 2: Layout Selection =====
        yield emit_step_started("layout_selection").to_sse()

        layout = await select_layout(analysis, llm_call=_gateway_llm_call)

        # Apply override if provided
        if layout_override:
            layout.layout_type = layout_override
            layout.reasoning = f"User override: {layout_override}"

        layout_dict = layout.model_dump()

        yield emit_state_snapshot({
            "status": "generating",
            "progress": 50,
            "current_step": "layout_selection",
            "layout_type": layout.layout_type,
        }).to_sse()

        yield emit_step_finished("layout_selection").to_sse()

        # ===== Stage 3: Component Generation =====
        yield emit_step_started("component_generation").to_sse()

        component_count = 0
        async for component in generate_components(
            markdown, full_analysis, layout_dict, _gateway_llm_call,
        ):
            component_count += 1

            # Emit each component as a STATE_DELTA (add to components array)
            yield emit_state_delta([{
                "op": "add",
                "path": "/components/-",
                "value": component.model_dump(),
            }]).to_sse()

            # Progress updates during generation
            progress = min(50 + int((component_count / max(component_count + 2, 1)) * 45), 95)
            yield emit_state_snapshot({
                "status": "generating",
                "progress": progress,
                "current_step": "component_generation",
            }).to_sse()

        # Final complete state
        yield emit_state_snapshot({
            "status": "complete",
            "progress": 100,
            "current_step": "",
            "document_title": analysis.title,
            "document_type": analysis.document_type,
            "layout_type": layout.layout_type,
        }).to_sse()

        yield emit_step_finished("component_generation").to_sse()

        # --- RUN_FINISHED ---
        yield emit_run_finished(
            thread_id, run_id,
            result={"components_generated": component_count, "layout_type": layout.layout_type},
        ).to_sse()

    except Exception as e:
        logger.error("GenUI pipeline error: %s", e, exc_info=True)

        yield emit_state_snapshot({
            "status": "error",
            "progress": 0,
            "error_message": str(e),
        }).to_sse()

        yield emit_run_error(message=str(e)).to_sse()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/generate")
async def generate_dashboard(request: GenUIRequest):
    """SSE stream: full GenUI pipeline (analyze -> layout -> generate).

    Streams AG-UI events:
    - RUN_STARTED, STEP_STARTED/FINISHED for each stage
    - STATE_SNAPSHOT for progress updates
    - STATE_DELTA for each generated component
    - RUN_FINISHED or RUN_ERROR
    """
    return StreamingResponse(
        _generate_sse(request.markdown, request.layout_override),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/analyze")
async def analyze_content_endpoint(request: GenUIRequest):
    """Content analysis only (no component generation).

    Returns document classification, entities, and structural analysis.
    """
    try:
        analysis = await analyze_content(request.markdown, llm_call=_gateway_llm_call)
        parsed = parse_markdown(request.markdown)

        return {
            "title": analysis.title,
            "document_type": analysis.document_type,
            "confidence": analysis.confidence,
            "reasoning": analysis.reasoning,
            "sections": analysis.sections,
            "entities": analysis.entities,
            "stats": {
                "code_blocks": len(analysis.code_blocks),
                "tables": len(analysis.tables),
                "links": len(analysis.links),
                "youtube_links": len(analysis.youtube_links),
                "github_links": len(analysis.github_links),
            },
        }
    except Exception as e:
        logger.error("Content analysis error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/components")
async def list_components():
    """List all registered A2UI component types."""
    sorted_types = sorted(VALID_COMPONENT_TYPES)
    return ComponentListResponse(
        components=sorted_types,
        count=len(sorted_types),
    )


@router.get("/layouts")
async def list_layouts():
    """List available layout types with descriptions."""
    layouts = [
        {"type": "instructional_layout", "description": "Tutorials, code guides, step-by-step instructions"},
        {"type": "data_layout", "description": "Research, statistics, tables, comparisons"},
        {"type": "news_layout", "description": "Articles, blog posts, news stories"},
        {"type": "list_layout", "description": "Guides, checklists, resource collections"},
        {"type": "summary_layout", "description": "Notes, quick references, TL;DR content"},
        {"type": "reference_layout", "description": "API docs, technical specs, documentation"},
        {"type": "media_layout", "description": "Visual content, video tutorials, multimedia"},
    ]
    return LayoutListResponse(layouts=layouts, count=len(layouts))
