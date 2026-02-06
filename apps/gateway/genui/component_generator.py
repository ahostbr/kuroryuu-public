"""Component Generator - LLM-powered A2UI component generation.

Ported from second-brain-research-dashboard agent/llm_orchestrator.py +
agent/a2ui_generator.py. Uses Gateway LLM backends instead of OpenRouter.

This module:
1. Calls LLM to select component specs from content analysis
2. Builds validated A2UIComponent instances from specs
3. Applies layout width hints and semantic zones
4. Yields components one at a time for SSE streaming
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any, AsyncGenerator

from .models import A2UIComponent, ContentAnalysis, LayoutDecision, VALID_COMPONENT_TYPES, COMPONENT_TYPE_CANONICAL
from .zones import get_zone, get_width
from .prompts import format_component_selection_prompt, validate_component_variety

logger = logging.getLogger("genui.component_generator")


# ---------------------------------------------------------------------------
# ID generation
# ---------------------------------------------------------------------------

_id_counter = 0


def _generate_id(component_type: str) -> str:
    """Generate a unique component ID (kebab-case)."""
    global _id_counter
    _id_counter += 1
    if component_type.startswith("a2ui."):
        name = component_type[5:]
        kebab = "".join(["-" + c.lower() if c.isupper() else c for c in name]).lstrip("-")
        return f"{kebab}-{_id_counter}"
    return f"component-{uuid.uuid4().hex[:8]}"


def _reset_id_counter():
    global _id_counter
    _id_counter = 0


# ---------------------------------------------------------------------------
# URL validation
# ---------------------------------------------------------------------------

def _is_valid_url(url: str) -> bool:
    if not url or not url.strip():
        return False
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        return False
    for pattern in ["://localhost", "://127.0.0.1", "://0.0.0.0", "://[::1]"]:
        if pattern in url.lower():
            return False
    return len(url) >= 12


# ---------------------------------------------------------------------------
# Component factory
# ---------------------------------------------------------------------------

def _make_component(
    comp_type: str,
    props: dict[str, Any],
    zone: str | None = None,
    width: str | None = None,
) -> A2UIComponent:
    """Create a validated A2UIComponent."""
    full_type = comp_type if comp_type.startswith("a2ui.") else f"a2ui.{comp_type}"
    cid = _generate_id(full_type)
    comp = A2UIComponent(type=full_type, id=cid, props=props)
    comp.zone = get_zone(full_type, zone)
    comp.layout = {"width": get_width(full_type, width)}
    return comp


# ---------------------------------------------------------------------------
# JSON extraction with truncation recovery
# ---------------------------------------------------------------------------

def _extract_json(response: str) -> dict:
    """Extract JSON from LLM response, recovering from truncation."""
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
    if m:
        text = m.group(1).strip()
    else:
        m = re.search(r"\{[\s\S]*\}", response)
        text = m.group(0) if m else response

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to recover truncated components
        recovered = _recover_truncated(text)
        if recovered:
            return {"components": recovered}
        return {}


def _recover_truncated(json_str: str) -> list[dict]:
    """Recover complete component objects from truncated JSON."""
    m = re.search(r'"components"\s*:\s*\[', json_str)
    if not m:
        return []

    pos = m.end()
    components = []

    while pos < len(json_str):
        while pos < len(json_str) and json_str[pos] in " \t\n\r,":
            pos += 1
        if pos >= len(json_str) or json_str[pos] != "{":
            break

        depth = 0
        start = pos
        in_string = False
        escape = False

        for i in range(start, len(json_str)):
            c = json_str[i]
            if escape:
                escape = False
                continue
            if c == "\\" and in_string:
                escape = True
                continue
            if c == '"' and not escape:
                in_string = not in_string
                continue
            if in_string:
                continue
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    try:
                        obj = json.loads(json_str[start:i + 1])
                        components.append(obj)
                    except json.JSONDecodeError:
                        pass
                    pos = i + 1
                    break
        else:
            break

    return components


# ---------------------------------------------------------------------------
# LLM component selection
# ---------------------------------------------------------------------------

async def _select_components_with_llm(
    content_analysis: dict,
    layout_decision: dict,
    markdown_content: str,
    llm_call,
) -> list[dict]:
    """Call LLM to generate component specifications."""
    system_prompt = (
        "You are an expert A2UI component architect. Generate diverse dashboard components.\n"
        "CRITICAL: Return valid JSON with a 'components' array.\n"
        "Each component needs: component_type, priority, zone, and props with REAL data from the document.\n"
        "RULES:\n"
        "1. SHORT docs (<500 words): 5-8 components MAX. Do NOT over-generate.\n"
        "2. Use 4+ different component types. No single type >40%.\n"
        "3. Never 3+ consecutive same type.\n"
        "4. EVERY prop must contain real content from the document. Never use empty or placeholder values.\n"
        "5. For TableOfContents, every item MUST have a 'title' string.\n"
        "6. Only use LinkCard/ToolCard/RepoCard if the document contains valid https:// URLs."
    )

    prompt = format_component_selection_prompt(content_analysis, layout_decision)

    # Append document content for the LLM
    content_limit = 30000
    doc = markdown_content[:content_limit] + "\n\n[... truncated ...]" if len(markdown_content) > content_limit else markdown_content
    prompt += f"\n\n## Actual Document Content\n\n{doc}\n\nGenerate components covering ALL sections. Return JSON with 'components' array."

    logger.info("Selecting components (prompt: %d chars)", len(prompt))
    response = await llm_call(prompt, system_prompt, max_tokens=16000, temperature=0.4)
    logger.info("Component response received (%d chars)", len(response))

    result = _extract_json(response)
    components = result.get("components", [])

    if not components:
        raise ValueError(f"LLM returned no components. Response length: {len(response)}")

    variety = validate_component_variety(components)
    logger.info(
        "Components: %d, unique types: %d, valid: %s",
        len(components), variety["unique_types_count"], variety["valid"],
    )
    for v in variety.get("violations", []):
        logger.warning("Variety: %s", v)

    return components


# ---------------------------------------------------------------------------
# Component building (spec -> A2UIComponent)
# ---------------------------------------------------------------------------

def _build_component(spec: dict, content_analysis: dict) -> A2UIComponent | None:
    """Build an A2UIComponent from a spec dict. Returns None on failure."""
    raw_type = spec.get("component_type", "").strip()
    props = spec.get("props", {})

    # Normalize type
    canonical = COMPONENT_TYPE_CANONICAL.get(raw_type.lower())
    component_type = canonical if canonical else raw_type

    # Get explicit zone/width from spec
    explicit_zone = spec.get("zone")
    explicit_width = props.get("width_hint") or spec.get("width_hint")

    try:
        comp = _build_by_type(component_type, props, content_analysis)
        if comp is None:
            return None

        # Apply zone and layout
        comp.zone = get_zone(comp.type, explicit_zone)
        comp.layout = {"width": get_width(comp.type, explicit_width)}
        return comp

    except Exception as e:
        logger.error("Failed to build %s: %s", component_type, e)
        return None


def _build_by_type(
    component_type: str,
    props: dict[str, Any],
    content_analysis: dict,
) -> A2UIComponent | None:
    """Map component type to builder logic."""

    # --- Summary ---
    if component_type == "TLDR":
        content = props.get("content", "Summary of the document")
        if len(content) > 300:
            content = content[:297] + "..."
        return _make_component("TLDR", {"content": content, "max_length": props.get("max_length", 200)})

    if component_type == "KeyTakeaways":
        items = props.get("items", ["Key takeaway 1", "Key takeaway 2"])
        return _make_component("KeyTakeaways", {"items": (items or ["Key takeaway"])[:5]})

    if component_type == "ExecutiveSummary":
        return _make_component("ExecutiveSummary", {
            "title": props.get("title", "Executive Summary"),
            "summary": props.get("summary", props.get("content", "Summary")),
            "key_metrics": props.get("key_metrics", props.get("metrics")),
            "recommendations": _ensure_list(props.get("recommendations", props.get("highlights"))),
        })

    if component_type == "TableOfContents":
        items = props.get("items", [])
        if not items:
            sections = content_analysis.get("sections", [])
            items = [{"title": s, "anchor": f"#{s.lower().replace(' ', '-')}"} for s in sections[:8]]
        # Ensure every item has a title
        validated = []
        for item in items:
            if isinstance(item, str):
                validated.append({"title": item, "anchor": f"#{item.lower().replace(' ', '-')}"})
            elif isinstance(item, dict):
                title = item.get("title") or item.get("label") or item.get("name") or item.get("text") or item.get("anchor", "").lstrip("#").replace("-", " ").title()
                if title:
                    item["title"] = title
                    validated.append(item)
        return _make_component("TableOfContents", {"items": validated}) if validated else None

    # --- Data & Statistics ---
    if component_type == "StatCard":
        title = props.get("label", props.get("title", ""))
        value = str(props.get("value", ""))
        # Skip StatCards with no meaningful data
        if not title or not value or value in ("N/A", "0", ""):
            return None
        trend = props.get("trend", "neutral")
        return _make_component("StatCard", {
            "title": title,
            "value": value,
            "unit": props.get("unit"),
            "trend": trend,
            "trendValue": props.get("trendValue", props.get("change_value")),
            "highlight": props.get("highlight", False),
        })

    if component_type == "TrendIndicator":
        return _make_component("TrendIndicator", {
            "label": props.get("label", props.get("metric", "Metric")),
            "value": _parse_numeric(props.get("value"), 0),
            "trend": props.get("direction", props.get("trend", "stable")),
            "change": _parse_numeric(props.get("change", props.get("trendValue")), 0),
            "unit": props.get("unit", ""),
        })

    if component_type == "MetricRow":
        metrics = props.get("metrics", [])
        if metrics and isinstance(metrics, list):
            return _make_component("MetricRow", {
                "label": props.get("title", props.get("label", "")),
                "metrics": [
                    {"label": m.get("label", "Metric"), "value": m.get("value", "N/A"), "unit": m.get("unit", "")}
                    for m in metrics if isinstance(m, dict)
                ],
            })
        return _make_component("MetricRow", {
            "label": props.get("label", props.get("title", "Metric")),
            "value": props.get("value", "N/A"),
            "unit": props.get("unit", ""),
        })

    if component_type == "ProgressRing":
        return _make_component("ProgressRing", {
            "label": props.get("label", "Progress"),
            "value": _parse_numeric(props.get("value"), 0),
            "max": _parse_numeric(props.get("max"), 100),
        })

    if component_type == "ComparisonBar":
        items = props.get("items", [])
        if not items:
            return None
        return _make_component("ComparisonBar", {
            "label": props.get("title", props.get("label", "Comparison")),
            "items": items,
            "max_value": props.get("max_value", props.get("maxValue")),
        })

    if component_type == "DataTable":
        headers = props.get("headers", ["Column 1", "Column 2"])
        rows = props.get("rows", [["Data 1", "Data 2"]])
        if not headers or not rows:
            return None
        return _make_component("DataTable", {"headers": headers, "rows": rows})

    if component_type == "MiniChart":
        return _make_component("MiniChart", {
            "label": props.get("label", "Chart"),
            "data": props.get("data", []),
            "type": props.get("chartType", props.get("type", "line")),
        })

    # --- Instructional ---
    if component_type == "CodeBlock":
        code = props.get("code", "")
        if not code or not code.strip():
            return None
        return _make_component("CodeBlock", {
            "code": code,
            "language": props.get("language", "text"),
        })

    if component_type == "StepCard":
        return _make_component("StepCard", {
            "step_number": props.get("step_number", props.get("number", 1)),
            "title": props.get("title", "Step"),
            "description": props.get("description", "Step description"),
        })

    if component_type == "CalloutCard":
        return _make_component("CalloutCard", {
            "type": props.get("type", "info"),
            "title": props.get("title", "Note"),
            "content": props.get("content", "Important information"),
        })

    if component_type == "CommandCard":
        return _make_component("CommandCard", {
            "command": props.get("command", "echo hello"),
            "description": props.get("description", ""),
            "platform": props.get("platform", "bash"),
        })

    # --- Lists ---
    if component_type == "RankedItem":
        return _make_component("RankedItem", {
            "rank": props.get("rank", 1),
            "label": props.get("title", props.get("label", "Item")),
            "value": props.get("description", props.get("value", "")),
            "badge": props.get("badge"),
            "score": props.get("score"),
        })

    if component_type == "ChecklistItem":
        return _make_component("ChecklistItem", {
            "text": props.get("text", "Checklist item"),
            "completed": props.get("completed", False),
        })

    if component_type == "ProConItem":
        item_type = props.get("type", "info").lower()
        items = props.get("items", [])
        if items and isinstance(items, list):
            is_pro = item_type in ("pro", "pros")
            is_con = item_type in ("con", "cons")
            if is_pro or is_con:
                return _make_component("ProConItem", {
                    "type": "pro" if is_pro else "con",
                    "label": items[0] if items else "Item",
                })
        if item_type in ("pro", "con"):
            return _make_component("ProConItem", {
                "type": item_type,
                "label": props.get("label", props.get("text", "Item")),
                "description": props.get("description"),
            })
        return None

    if component_type == "BulletPoint":
        return _make_component("BulletPoint", {"text": props.get("text", "Bullet point")})

    # --- Resources ---
    if component_type == "LinkCard":
        url = props.get("url", "")
        if not _is_valid_url(url):
            return None
        return _make_component("LinkCard", {
            "url": url,
            "title": props.get("title", "Resource"),
        })

    if component_type == "ToolCard":
        url = props.get("url", "")
        if not _is_valid_url(url):
            return None
        return _make_component("ToolCard", {
            "name": props.get("name", props.get("title", "Tool")),
            "description": props.get("description", ""),
            "url": url,
            "category": props.get("category"),
        })

    if component_type == "BookCard":
        return _make_component("BookCard", {
            "title": props.get("title", "Book"),
            "author": props.get("author", "Unknown"),
            "year": props.get("year"),
            "url": props.get("url"),
            "description": props.get("description"),
        })

    if component_type == "RepoCard":
        return _make_component("RepoCard", {
            "name": props.get("name", "Repository"),
            "owner": props.get("owner"),
            "repo_url": props.get("repo_url", props.get("url", "https://github.com")),
        })

    # --- People ---
    if component_type == "ProfileCard":
        return _make_component("ProfileCard", {
            "name": props.get("name", "Person"),
            "title": props.get("title", props.get("role", "")),
            "bio": props.get("bio", props.get("description", "")),
            "imageUrl": props.get("imageUrl", props.get("avatar")),
            "links": props.get("links", []),
        })

    if component_type == "CompanyCard":
        return _make_component("CompanyCard", {
            "name": props.get("name", "Company"),
            "description": props.get("description", ""),
            "industry": props.get("industry"),
            "website": props.get("website", props.get("url")),
        })

    if component_type == "QuoteCard":
        return _make_component("QuoteCard", {
            "text": props.get("quote", props.get("text", "Quote text")),
            "author": props.get("author", "Unknown"),
            "source": props.get("source"),
        })

    if component_type == "ExpertTip":
        content = props.get("tip", props.get("content", "Expert tip"))
        title = props.get("title", "Expert Tip")
        if title == "Expert Tip" and content and len(content) > 50:
            title = content[:47] + "..."
        return _make_component("ExpertTip", {
            "title": title,
            "content": content,
            "expert_name": props.get("expert", props.get("author", props.get("expert_name"))),
            "difficulty": props.get("difficulty"),
            "category": props.get("category"),
        })

    # --- News ---
    if component_type == "HeadlineCard":
        return _make_component("HeadlineCard", {
            "title": props.get("headline", props.get("title", "Headline")),
            "summary": props.get("subheadline", props.get("subtitle", props.get("summary", ""))),
            "source": props.get("source", "Source"),
            "published_at": props.get("timestamp", props.get("published_at", "")),
            "sentiment": props.get("sentiment", "neutral"),
        })

    if component_type == "TimelineEvent":
        event_type = props.get("event_type", props.get("eventType", "announcement"))
        if event_type not in {"article", "announcement", "milestone", "update"}:
            event_type = "announcement"
        return _make_component("TimelineEvent", {
            "title": props.get("title", "Event"),
            "timestamp": props.get("timestamp", props.get("date", "")),
            "content": props.get("content", props.get("description", "")),
            "event_type": event_type,
        })

    if component_type == "NewsTicker":
        return _make_component("NewsTicker", {
            "items": props.get("items", []),
        })

    # --- Media ---
    if component_type == "VideoCard":
        url = props.get("video_url", props.get("url", ""))
        if not url:
            return None
        return _make_component("VideoCard", {
            "video_url": url,
            "title": props.get("title", "Video"),
            "description": props.get("description", ""),
        })

    if component_type == "ImageCard":
        return _make_component("ImageCard", {
            "url": props.get("url", props.get("src", "")),
            "alt": props.get("alt", props.get("title", "")),
            "caption": props.get("caption", ""),
        })

    if component_type == "PlaylistCard":
        return _make_component("PlaylistCard", {
            "title": props.get("title", "Playlist"),
            "items": props.get("items", []),
        })

    if component_type == "PodcastCard":
        return _make_component("PodcastCard", {
            "title": props.get("title", "Podcast"),
            "host": props.get("host", ""),
            "url": props.get("url", ""),
        })

    # --- Comparison ---
    if component_type == "ComparisonTable":
        items = props.get("items", [])
        features = props.get("features", [])
        if not items or not features:
            return None
        return _make_component("ComparisonTable", {"items": items, "features": features})

    if component_type == "VsCard":
        return _make_component("VsCard", {
            "left": props.get("left", {}),
            "right": props.get("right", {}),
            "title": props.get("title", "Comparison"),
        })

    if component_type == "FeatureMatrix":
        return _make_component("FeatureMatrix", {
            "features": props.get("features", []),
            "products": props.get("products", []),
        })

    if component_type == "PricingTable":
        return _make_component("PricingTable", {
            "tiers": props.get("tiers", []),
        })

    # --- Layout ---
    if component_type == "Section":
        title = props.get("title", "Section")
        children = props.get("children", ["placeholder"])
        return _make_component("Section", {"title": title, "children": children})

    if component_type == "Accordion":
        title = props.get("title", "Details")
        sections = props.get("sections", props.get("items", []))
        if sections:
            formatted = []
            for sec in sections[:10]:
                if isinstance(sec, dict):
                    formatted.append(f"**{sec.get('title', 'Section')}**: {sec.get('content', '')}")
                else:
                    formatted.append(str(sec))
            return _make_component("CalloutCard", {
                "type": "info",
                "title": title,
                "content": "\n\n".join(formatted),
            })
        return None

    # --- Tags ---
    if component_type in ("TagCloud", "TagGroup"):
        tags = props.get("tags", props.get("items", []))
        if tags:
            tag_items = []
            for t in tags[:20]:
                if isinstance(t, str):
                    tag_items.append({"name": t, "count": 1})
                elif isinstance(t, dict):
                    tag_items.append({"name": t.get("label", t.get("name", str(t))), "count": t.get("count", 1)})
            return _make_component("TagCloud", {"tags": tag_items})
        return None

    if component_type == "CategoryBadge":
        return _make_component("CategoryBadge", {
            "category": props.get("category", props.get("label", "Category")),
            "color": props.get("color"),
            "size": props.get("size", "md"),
        })

    if component_type == "DifficultyBadge":
        return _make_component("DifficultyBadge", {
            "level": props.get("level", props.get("difficulty", "intermediate")),
        })

    if component_type == "StatusIndicator":
        return _make_component("StatusIndicator", {
            "status": props.get("status", "pending"),
            "label": props.get("label"),
            "pulse": props.get("pulse", False),
        })

    if component_type == "PriorityBadge":
        return _make_component("PriorityBadge", {
            "priority": props.get("priority", props.get("level", "medium")),
        })

    if component_type in ("Badge", "Tag", "CategoryTag"):
        return _make_component(component_type, {
            "label": props.get("label", component_type),
            "type": props.get("type", "default"),
            "count": props.get("count"),
        })

    # --- Fallback ---
    logger.warning("Unknown type '%s', using CalloutCard fallback", component_type)
    return _make_component("CalloutCard", {
        "type": "info",
        "title": component_type,
        "content": json.dumps(props, indent=2)[:200] if props else "Component data",
    })


# ---------------------------------------------------------------------------
# Batch expansion (ProConItem with multiple items)
# ---------------------------------------------------------------------------

def _expand_specs(specs: list[dict]) -> list[dict]:
    """Expand batched specs (e.g. ProConItem with items array)."""
    expanded = []
    for spec in specs:
        ct = spec.get("component_type", "")
        props = spec.get("props", {})

        if ct == "ProConItem":
            items = props.get("items", [])
            item_type = props.get("type", "").lower()
            if items and isinstance(items, list) and len(items) > 1:
                is_pro = item_type in ("pro", "pros")
                is_con = item_type in ("con", "cons")
                if is_pro or is_con:
                    for item in items:
                        expanded.append({
                            "component_type": "ProConItem",
                            "priority": spec.get("priority", "medium"),
                            "zone": spec.get("zone"),
                            "props": {"type": "pro" if is_pro else "con", "label": item},
                        })
                    continue

        expanded.append(spec)
    return expanded


# ---------------------------------------------------------------------------
# Public API - orchestration
# ---------------------------------------------------------------------------

async def generate_components(
    markdown_content: str,
    content_analysis: dict,
    layout_decision: dict,
    llm_call,
) -> AsyncGenerator[A2UIComponent, None]:
    """Generate A2UI components via LLM and yield them one at a time.

    Args:
        markdown_content: Raw markdown.
        content_analysis: Full analysis dict (parsed + LLM merged).
        layout_decision: Layout selection dict.
        llm_call: Async callable(prompt, system, **kw) -> str.

    Yields:
        A2UIComponent instances.
    """
    _reset_id_counter()

    # Step 1: LLM selects component specs
    specs = await _select_components_with_llm(
        content_analysis, layout_decision, markdown_content, llm_call,
    )

    # Step 2: Expand batched specs
    expanded = _expand_specs(specs)
    logger.info("Building %d components (expanded from %d specs)", len(expanded), len(specs))

    # Step 3: Build and yield
    built = 0
    types_used: set[str] = set()

    for spec in expanded:
        comp = _build_component(spec, content_analysis)
        if comp:
            built += 1
            types_used.add(comp.type)
            yield comp

    logger.info("Generated %d components with %d unique types", built, len(types_used))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_numeric(val: Any, default: float = 0) -> float:
    if val is None:
        return default
    try:
        s = str(val).replace(",", "").replace("%", "").replace("+", "").strip()
        return float(s) if s else default
    except (ValueError, TypeError):
        return default


def _ensure_list(val: Any) -> list | None:
    if val is None:
        return None
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        return [val]
    return None
