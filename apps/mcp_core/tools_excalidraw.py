"""Excalidraw diagramming tools — programmatic diagram creation.

Agents create architecture diagrams, flowcharts, and sequence diagrams
via simple JSON. Files are stored as .excalidraw format (viewable at excalidraw.com).

Dark theme, section-based layouts, Excalifont. Compatible with excalidraw.com.
Quality conventions from axton-obsidian-visual-skills (skills.sh #1).

Output: tools/excalidraw/output/
Routed tool: k_excalidraw(action, ...)
Actions: help, create, read, update, list, delete
"""

from __future__ import annotations

import json
import math
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from .paths import get_project_root
except ImportError:
    from paths import get_project_root


# ============================================================================
# Configuration
# ============================================================================

def _get_output_root() -> Path:
    """Get excalidraw output directory."""
    default = get_project_root() / "tools" / "excalidraw" / "output"
    return Path(os.environ.get("KURORYUU_EXCALIDRAW_OUTPUT", str(default))).resolve()


def _make_id() -> str:
    """Generate a unique element ID (Excalidraw uses short alphanumeric IDs)."""
    return uuid.uuid4().hex[:20]


# ============================================================================
# Color Palettes (dark theme)
# ============================================================================

# Fill colors for shapes on dark background
DARK_COLORS = {
    "blue": "#1e3a5f",
    "green": "#1a3a2a",
    "red": "#3a1a1a",
    "yellow": "#3a3a1a",
    "purple": "#2a1a3a",
    "orange": "#3a2a1a",
    "gray": "#2a2a2e",
    "teal": "#1a2a2a",
    "dark": "#1a1a2e",
    "white": "#ffffff",
}

# Bright accent colors for headers, highlights, annotations
ACCENT_COLORS = {
    "green": "#4ade80",
    "red": "#f87171",
    "cyan": "#67e8f9",
    "yellow": "#fbbf24",
    "magenta": "#f472b6",
    "purple": "#a78bfa",
    "orange": "#fb923c",
    "white": "#e0e0e0",
    "muted": "#6b7280",
}

# Layout constraints (from axton's skill — battle-tested values)
CANVAS_WIDTH = 1200
CANVAS_HEIGHT = 800
MIN_SHAPE_W = 120
MIN_SHAPE_H = 60
MIN_SPACING = 25
CANVAS_PADDING = 60

# Font size minimums
FONT_TITLE = 24
FONT_SUBTITLE = 20
FONT_BODY = 16
FONT_ANNOTATION = 14

# Text width estimation
CHAR_WIDTH_FACTOR = 0.5
CJK_WIDTH_FACTOR = 1.0

# Default dark theme colors
_DEFAULT_STROKE = "#e0e0e0"
_DEFAULT_BG = "#191919"
_DEFAULT_TEXT = "#e0e0e0"
_DEFAULT_FILL = "#1e3a5f"


# ============================================================================
# Excalidraw Element Builders
# ============================================================================

def _estimate_text_width(text: str, font_size: int) -> float:
    """Estimate text width accounting for CJK characters."""
    width = 0.0
    for ch in text:
        if ord(ch) > 0x2E80:
            width += font_size * CJK_WIDTH_FACTOR
        else:
            width += font_size * CHAR_WIDTH_FACTOR
    return width


def _base_element(
    elem_type: str,
    x: float,
    y: float,
    w: float,
    h: float,
    **overrides: Any,
) -> Dict[str, Any]:
    """Create base Excalidraw element with all required fields.

    Compatibility: omits frameId, index, versionNonce per excalidraw.com requirements.
    """
    elem = {
        "id": _make_id(),
        "type": elem_type,
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "angle": 0,
        "strokeColor": _DEFAULT_STROKE,
        "backgroundColor": "transparent",
        "fillStyle": "solid",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "groupIds": [],
        "roundness": {"type": 3},
        "seed": abs(hash(_make_id())) % (2**31),
        "version": 1,
        "isDeleted": False,
        "boundElements": None,
        "updated": 1,
        "link": None,
        "locked": False,
    }
    elem.update(overrides)
    return elem


def _make_rectangle(
    x: float, y: float, w: float = 200, h: float = 80,
    label: str = "", color: str = _DEFAULT_FILL,
    stroke_color: str = _DEFAULT_STROKE,
    stroke_style: str = "solid",
    text_color: str = _DEFAULT_TEXT,
    font_family: int = 5,
    opacity: int = 100,
) -> List[Dict[str, Any]]:
    """Create a rectangle (optionally with centered text label)."""
    w = max(w, MIN_SHAPE_W)
    h = max(h, MIN_SHAPE_H)
    elements = []
    rect = _base_element(
        "rectangle", x, y, w, h,
        backgroundColor=color,
        strokeColor=stroke_color,
        strokeStyle=stroke_style,
        opacity=opacity,
    )
    elements.append(rect)

    if label:
        text = _make_text(
            x + w / 2, y + h / 2, label,
            container_id=rect["id"],
            color=text_color,
            font_family=font_family,
        )
        rect["boundElements"] = [{"id": text["id"], "type": "text"}]
        elements.append(text)

    return elements


def _make_diamond(
    x: float, y: float, w: float = 160, h: float = 100,
    label: str = "", color: str = "#3a3a1a",
    stroke_color: str = _DEFAULT_STROKE,
    stroke_style: str = "solid",
    text_color: str = _DEFAULT_TEXT,
    font_family: int = 5,
) -> List[Dict[str, Any]]:
    """Create a diamond shape (for flowchart decisions)."""
    w = max(w, MIN_SHAPE_W)
    h = max(h, MIN_SHAPE_H)
    elements = []
    diamond = _base_element(
        "diamond", x, y, w, h,
        backgroundColor=color,
        strokeColor=stroke_color,
        strokeStyle=stroke_style,
    )
    elements.append(diamond)

    if label:
        text = _make_text(
            x + w / 2, y + h / 2, label,
            container_id=diamond["id"],
            color=text_color,
            font_family=font_family,
        )
        diamond["boundElements"] = [{"id": text["id"], "type": "text"}]
        elements.append(text)

    return elements


def _make_ellipse(
    x: float, y: float, w: float = 160, h: float = 80,
    label: str = "", color: str = "#2a1a3a",
    stroke_color: str = _DEFAULT_STROKE,
    stroke_style: str = "solid",
    text_color: str = _DEFAULT_TEXT,
    font_family: int = 5,
) -> List[Dict[str, Any]]:
    """Create an ellipse."""
    w = max(w, MIN_SHAPE_W)
    h = max(h, MIN_SHAPE_H)
    elements = []
    ellipse = _base_element(
        "ellipse", x, y, w, h,
        backgroundColor=color,
        strokeColor=stroke_color,
        strokeStyle=stroke_style,
    )
    elements.append(ellipse)

    if label:
        text = _make_text(
            x + w / 2, y + h / 2, label,
            container_id=ellipse["id"],
            color=text_color,
            font_family=font_family,
        )
        ellipse["boundElements"] = [{"id": text["id"], "type": "text"}]
        elements.append(text)

    return elements


def _make_text(
    x: float, y: float, text: str,
    font_size: int = FONT_BODY, container_id: Optional[str] = None,
    text_align: str = "center",
    font_family: int = 5,
    color: str = _DEFAULT_TEXT,
) -> Dict[str, Any]:
    """Create a text element. If container_id is set, it's bound to that container.

    font_family: 1=Virgil, 3=Cascadia, 5=Excalifont (default, hand-drawn)
    """
    text_width = _estimate_text_width(text, font_size)
    lines = text.split("\n")
    text_height = font_size * 1.25 * len(lines)

    elem = _base_element(
        "text",
        x - text_width / 2,
        y - text_height / 2,
        text_width,
        text_height,
        text=text,
        fontSize=font_size,
        fontFamily=font_family,
        textAlign=text_align,
        verticalAlign="middle",
        backgroundColor="transparent",
        strokeColor=color,
        roundness=None,
        containerId=container_id,
        originalText=text,
        autoResize=True,
        lineHeight=1.25,
    )
    return elem


def _make_arrow(
    start_x: float, start_y: float,
    end_x: float, end_y: float,
    label: str = "",
    start_id: Optional[str] = None,
    end_id: Optional[str] = None,
    stroke_color: str = _DEFAULT_STROKE,
    stroke_style: str = "solid",
    stroke_width: int = 2,
    start_arrowhead: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Create an arrow (line with arrowhead). Optionally bound to start/end elements."""
    elements = []

    arrow = _base_element(
        "arrow",
        start_x, start_y,
        end_x - start_x, end_y - start_y,
        backgroundColor="transparent",
        fillStyle="solid",
        strokeColor=stroke_color,
        strokeStyle=stroke_style,
        strokeWidth=stroke_width,
        points=[[0, 0], [end_x - start_x, end_y - start_y]],
        startBinding={"elementId": start_id, "focus": 0, "gap": 5, "fixedPoint": None} if start_id else None,
        endBinding={"elementId": end_id, "focus": 0, "gap": 5, "fixedPoint": None} if end_id else None,
        startArrowhead=start_arrowhead,
        endArrowhead="arrow",
        roundness={"type": 2},
    )
    elements.append(arrow)

    if label:
        mid_x = start_x + (end_x - start_x) / 2
        mid_y = start_y + (end_y - start_y) / 2 - 20
        text = _make_text(mid_x, mid_y, label, font_size=FONT_ANNOTATION, container_id=arrow["id"])
        arrow["boundElements"] = [{"id": text["id"], "type": "text"}]
        elements.append(text)

    return elements


def _make_line(
    start_x: float, start_y: float,
    end_x: float, end_y: float,
    stroke_color: str = _DEFAULT_STROKE,
    stroke_style: str = "solid",
    stroke_width: int = 2,
) -> Dict[str, Any]:
    """Create a plain line (no arrowhead)."""
    return _base_element(
        "line",
        start_x, start_y,
        end_x - start_x, end_y - start_y,
        points=[[0, 0], [end_x - start_x, end_y - start_y]],
        strokeColor=stroke_color,
        strokeStyle=stroke_style,
        strokeWidth=stroke_width,
        startArrowhead=None,
        endArrowhead=None,
    )


# ============================================================================
# New Element Builders (sections, headers, body text, bullets, flow chains)
# ============================================================================

def _make_section(
    x: float, y: float, w: float, h: float,
    title: str = "",
    title_color: str = ACCENT_COLORS["cyan"],
    description: str = "",
    bg_color: str = DARK_COLORS["dark"],
    opacity: int = 40,
) -> List[Dict[str, Any]]:
    """Create a section zone — dashed rect with title, underline, optional description.

    Returns list of elements: [bg_rect, title_text, underline, description_text]
    """
    elements = []

    # Background rectangle (dashed, low opacity)
    bg = _base_element(
        "rectangle", x, y, w, h,
        backgroundColor=bg_color,
        strokeColor=_DEFAULT_STROKE,
        strokeStyle="dashed",
        strokeWidth=1,
        opacity=opacity,
    )
    elements.append(bg)

    inner_x = x + MIN_SPACING
    inner_y = y + MIN_SPACING

    if title:
        # Title text (freestanding, colored)
        title_w = _estimate_text_width(title, FONT_TITLE)
        title_h = FONT_TITLE * 1.25
        title_elem = _base_element(
            "text",
            inner_x, inner_y,
            title_w, title_h,
            text=title,
            fontSize=FONT_TITLE,
            fontFamily=5,
            textAlign="left",
            verticalAlign="top",
            backgroundColor="transparent",
            strokeColor=title_color,
            roundness=None,
            containerId=None,
            originalText=title,
            autoResize=True,
            lineHeight=1.25,
        )
        elements.append(title_elem)

        # Colored underline
        underline_y = inner_y + title_h + 4
        underline = _make_line(
            inner_x, underline_y,
            inner_x + min(title_w + 20, w - 2 * MIN_SPACING), underline_y,
            stroke_color=title_color,
            stroke_width=2,
        )
        elements.append(underline)

        if description:
            desc_y = underline_y + 10
            desc_w = _estimate_text_width(description, FONT_ANNOTATION)
            desc_h = FONT_ANNOTATION * 1.25
            desc_elem = _base_element(
                "text",
                inner_x, desc_y,
                desc_w, desc_h,
                text=description,
                fontSize=FONT_ANNOTATION,
                fontFamily=5,
                textAlign="left",
                verticalAlign="top",
                backgroundColor="transparent",
                strokeColor=ACCENT_COLORS["muted"],
                roundness=None,
                containerId=None,
                originalText=description,
                autoResize=True,
                lineHeight=1.25,
            )
            elements.append(desc_elem)

    return elements


def _make_header(
    x: float, y: float, text: str,
    color: str = ACCENT_COLORS["cyan"],
    font_size: int = FONT_TITLE,
    underline: bool = True,
) -> List[Dict[str, Any]]:
    """Create a freestanding header with optional underline."""
    elements = []
    text_w = _estimate_text_width(text, font_size)
    text_h = font_size * 1.25

    header = _base_element(
        "text",
        x, y, text_w, text_h,
        text=text,
        fontSize=font_size,
        fontFamily=5,
        textAlign="left",
        verticalAlign="top",
        backgroundColor="transparent",
        strokeColor=color,
        roundness=None,
        containerId=None,
        originalText=text,
        autoResize=True,
        lineHeight=1.25,
    )
    elements.append(header)

    if underline:
        ul_y = y + text_h + 4
        ul = _make_line(x, ul_y, x + text_w + 20, ul_y, stroke_color=color, stroke_width=2)
        elements.append(ul)

    return elements


def _make_body_text(
    x: float, y: float, text: str,
    color: str = _DEFAULT_TEXT,
    font_size: int = FONT_BODY,
    max_width: float = 400,
) -> Dict[str, Any]:
    """Create multi-line body text, word-wrapped to max_width."""
    words = text.split()
    lines = []
    current_line = ""
    for word in words:
        test = f"{current_line} {word}".strip()
        if _estimate_text_width(test, font_size) > max_width and current_line:
            lines.append(current_line)
            current_line = word
        else:
            current_line = test
    if current_line:
        lines.append(current_line)

    wrapped = "\n".join(lines)
    text_w = max(_estimate_text_width(line, font_size) for line in lines) if lines else 0
    text_h = font_size * 1.25 * len(lines)

    return _base_element(
        "text",
        x, y, text_w, text_h,
        text=wrapped,
        fontSize=font_size,
        fontFamily=5,
        textAlign="left",
        verticalAlign="top",
        backgroundColor="transparent",
        strokeColor=color,
        roundness=None,
        containerId=None,
        originalText=wrapped,
        autoResize=True,
        lineHeight=1.25,
    )


def _make_bullet_list(
    x: float, y: float,
    items: List[str],
    bullet_color: str = ACCENT_COLORS["cyan"],
    text_color: str = _DEFAULT_TEXT,
    font_size: int = FONT_BODY,
) -> Dict[str, Any]:
    """Render a bullet list as a single text element with bullet characters."""
    bulleted = "\n".join(f"\u2022 {item}" for item in items)
    max_w = max(_estimate_text_width(f"\u2022 {item}", font_size) for item in items) if items else 0
    text_h = font_size * 1.25 * len(items)

    return _base_element(
        "text",
        x, y, max_w, text_h,
        text=bulleted,
        fontSize=font_size,
        fontFamily=5,
        textAlign="left",
        verticalAlign="top",
        backgroundColor="transparent",
        strokeColor=text_color,
        roundness=None,
        containerId=None,
        originalText=bulleted,
        autoResize=True,
        lineHeight=1.25,
    )


def _make_flow_chain(
    x: float, y: float,
    steps: List[Dict[str, Any]],
    direction: str = "horizontal",
    gap: int = 60,
    arrow_style: str = "solid",
) -> List[Dict[str, Any]]:
    """Create a linear sequence of shapes connected by arrows.

    steps: [{label, shape, color, width, height}]
    direction: "horizontal" | "vertical"
    """
    elements = []
    prev_info = None

    for i, step in enumerate(steps):
        label = step.get("label", f"Step {i + 1}")
        shape = step.get("shape", "rectangle")
        color = _resolve_color(step.get("color", "blue"))
        w = max(step.get("width", 160), MIN_SHAPE_W)
        h = max(step.get("height", 70), MIN_SHAPE_H)

        if direction == "horizontal":
            sx = x + i * (w + gap)
            sy = y
        else:
            sx = x
            sy = y + i * (h + gap)

        if shape == "ellipse":
            elems = _make_ellipse(sx, sy, w, h, label=label, color=color)
        elif shape == "diamond":
            elems = _make_diamond(sx, sy, w, h, label=label, color=color)
        else:
            elems = _make_rectangle(sx, sy, w, h, label=label, color=color)

        elements.extend(elems)

        cur_info = {"id": elems[0]["id"], "x": sx, "y": sy, "w": w, "h": h}

        if prev_info:
            if direction == "horizontal":
                ax = prev_info["x"] + prev_info["w"]
                ay = prev_info["y"] + prev_info["h"] / 2
                bx = cur_info["x"]
                by = cur_info["y"] + cur_info["h"] / 2
            else:
                ax = prev_info["x"] + prev_info["w"] / 2
                ay = prev_info["y"] + prev_info["h"]
                bx = cur_info["x"] + cur_info["w"] / 2
                by = cur_info["y"]

            arrow_elems = _make_arrow(
                ax, ay, bx, by,
                start_id=prev_info["id"],
                end_id=cur_info["id"],
                stroke_style=arrow_style,
            )

            # Update boundElements
            for elem in elements:
                if elem["id"] == prev_info["id"]:
                    if elem.get("boundElements") is None:
                        elem["boundElements"] = []
                    elem["boundElements"].append({"id": arrow_elems[0]["id"], "type": "arrow"})
                if elem["id"] == cur_info["id"]:
                    if elem.get("boundElements") is None:
                        elem["boundElements"] = []
                    elem["boundElements"].append({"id": arrow_elems[0]["id"], "type": "arrow"})

            elements.extend(arrow_elems)

        prev_info = cur_info

    return elements


def _make_annotation(
    x: float, y: float, text: str,
    color: str = ACCENT_COLORS["muted"],
    font_size: int = FONT_ANNOTATION,
) -> Dict[str, Any]:
    """Small muted text annotation — floating label near shapes."""
    text_w = _estimate_text_width(text, font_size)
    text_h = font_size * 1.25

    return _base_element(
        "text",
        x, y, text_w, text_h,
        text=text,
        fontSize=font_size,
        fontFamily=5,
        textAlign="left",
        verticalAlign="top",
        backgroundColor="transparent",
        strokeColor=color,
        roundness=None,
        containerId=None,
        originalText=text,
        autoResize=True,
        lineHeight=1.25,
    )


# ============================================================================
# Layout Engines
# ============================================================================

def _resolve_color(color: Optional[str]) -> str:
    """Resolve color name to hex, or pass through hex values."""
    if not color:
        return _DEFAULT_FILL
    if color.startswith("#"):
        return color
    return DARK_COLORS.get(color.lower(), _DEFAULT_FILL)


def _resolve_accent(color: Optional[str]) -> str:
    """Resolve accent color name to hex."""
    if not color:
        return ACCENT_COLORS["cyan"]
    if color.startswith("#"):
        return color
    return ACCENT_COLORS.get(color.lower(), ACCENT_COLORS["cyan"])


def _layout_architecture(
    nodes: List[Dict[str, Any]],
    connections: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Layout architecture diagram. Supports two modes:

    1. Section-based: If any node has type="section", uses section layout with
       vertical stacking, child nodes in 2-col mini-grids inside sections.
    2. Flat grid: Classic 4-column grid layout (dark theme + Excalifont).
    """
    has_sections = any(n.get("type") == "section" for n in nodes)

    if has_sections:
        return _layout_architecture_sections(nodes, connections)
    return _layout_architecture_grid(nodes, connections)


def _layout_architecture_grid(
    nodes: List[Dict[str, Any]],
    connections: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Flat grid layout — dark theme upgrade of original layout."""
    elements = []
    node_map: Dict[str, Dict[str, Any]] = {}

    box_w, box_h = 200, 80
    gap_x, gap_y = 100, 120
    cols = min(4, max(1, len(nodes)))

    for i, node in enumerate(nodes):
        nid = node.get("id", f"node_{i}")
        label = node.get("label", nid)
        color = _resolve_color(node.get("color"))
        shape = node.get("shape", "rectangle")
        text_color = node.get("text_color", _DEFAULT_TEXT)
        stroke_style = node.get("stroke_style", "solid")
        node_w = max(node.get("width", box_w), MIN_SHAPE_W)
        node_h = max(node.get("height", box_h), MIN_SHAPE_H)

        row, col = divmod(i, cols)
        x = CANVAS_PADDING + col * (box_w + gap_x)
        y = CANVAS_PADDING + row * (box_h + gap_y)

        if shape == "ellipse":
            elems = _make_ellipse(x, y, node_w, node_h, label=label, color=color,
                                  text_color=text_color, stroke_style=stroke_style)
        elif shape == "diamond":
            elems = _make_diamond(x, y, node_w, node_h, label=label, color=color,
                                  text_color=text_color, stroke_style=stroke_style)
        else:
            elems = _make_rectangle(x, y, node_w, node_h, label=label, color=color,
                                    text_color=text_color, stroke_style=stroke_style)

        rect_id = elems[0]["id"]
        elements.extend(elems)

        node_map[nid] = {
            "elem_id": rect_id,
            "cx": x + node_w / 2,
            "cy": y + node_h / 2,
            "x": x, "y": y,
            "w": node_w, "h": node_h,
        }

    # Draw connections
    _draw_connections(elements, node_map, connections)

    return elements


def _layout_architecture_sections(
    nodes: List[Dict[str, Any]],
    connections: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Section-based layout — sections stacked vertically, child nodes in 2-col mini-grids."""
    elements = []
    node_map: Dict[str, Dict[str, Any]] = {}

    # Separate sections from regular nodes
    sections = [n for n in nodes if n.get("type") == "section"]
    regular_nodes = {n["id"]: n for n in nodes if n.get("type") != "section"}

    # Also collect standalone special elements
    standalone_headers = [n for n in nodes if n.get("type") == "header"]
    standalone_bullets = [n for n in nodes if n.get("type") == "bullets"]
    standalone_annotations = [n for n in nodes if n.get("type") == "annotation"]

    # Track nodes that belong to sections
    assigned_nodes = set()
    for sec in sections:
        for nid in sec.get("nodes", []):
            assigned_nodes.add(nid)

    # Unassigned regular nodes (not in any section)
    unassigned = [n for n in nodes
                  if n.get("type") not in ("section", "header", "bullets", "annotation")
                  and n.get("id") not in assigned_nodes]

    # Layout params for sections
    section_x = CANVAS_PADDING
    section_y = CANVAS_PADDING
    section_gap = MIN_SPACING * 2
    child_box_w = 180
    child_box_h = 70
    child_gap_x = MIN_SPACING * 2
    child_gap_y = MIN_SPACING * 2
    child_cols = 2

    # Render standalone headers first
    for hdr in standalone_headers:
        hdr_elems = _make_header(
            section_x, section_y, hdr.get("text", ""),
            color=_resolve_accent(hdr.get("color")),
            font_size=hdr.get("font_size", FONT_TITLE),
        )
        elements.extend(hdr_elems)
        section_y += FONT_TITLE * 1.25 + 20 + section_gap

    # Render each section
    for sec in sections:
        sec_title = sec.get("title", "")
        sec_title_color = _resolve_accent(sec.get("title_color", "cyan"))
        sec_desc = sec.get("description", "")
        sec_bg = _resolve_color(sec.get("bg_color", "dark"))
        child_ids = sec.get("nodes", [])

        # Calculate section height based on child count
        child_count = len(child_ids)
        child_rows = math.ceil(child_count / child_cols) if child_count > 0 else 0

        # Header area height: title + underline + optional description
        header_height = MIN_SPACING + FONT_TITLE * 1.25 + 10
        if sec_desc:
            header_height += FONT_ANNOTATION * 1.25 + 10

        child_area_height = child_rows * (child_box_h + child_gap_y) if child_rows > 0 else 0
        section_h = header_height + child_area_height + MIN_SPACING * 2
        section_w = CANVAS_WIDTH - 2 * CANVAS_PADDING

        # Create section zone
        sec_elems = _make_section(
            section_x, section_y, section_w, section_h,
            title=sec_title,
            title_color=sec_title_color,
            description=sec_desc,
            bg_color=sec_bg,
        )
        elements.extend(sec_elems)

        # Place child nodes inside section
        child_start_x = section_x + MIN_SPACING * 2
        child_start_y = section_y + header_height

        for ci, cid in enumerate(child_ids):
            cnode = regular_nodes.get(cid)
            if not cnode:
                continue

            crow, ccol = divmod(ci, child_cols)
            cx = child_start_x + ccol * (child_box_w + child_gap_x)
            cy = child_start_y + crow * (child_box_h + child_gap_y)

            clabel = cnode.get("label", cid)
            ccolor = _resolve_color(cnode.get("color"))
            cshape = cnode.get("shape", "rectangle")
            ctext_color = cnode.get("text_color", _DEFAULT_TEXT)
            cstroke_style = cnode.get("stroke_style", "solid")
            cw = max(cnode.get("width", child_box_w), MIN_SHAPE_W)
            ch = max(cnode.get("height", child_box_h), MIN_SHAPE_H)

            if cshape == "ellipse":
                celems = _make_ellipse(cx, cy, cw, ch, label=clabel, color=ccolor,
                                       text_color=ctext_color, stroke_style=cstroke_style)
            elif cshape == "diamond":
                celems = _make_diamond(cx, cy, cw, ch, label=clabel, color=ccolor,
                                       text_color=ctext_color, stroke_style=cstroke_style)
            else:
                celems = _make_rectangle(cx, cy, cw, ch, label=clabel, color=ccolor,
                                         text_color=ctext_color, stroke_style=cstroke_style)

            elements.extend(celems)
            node_map[cid] = {
                "elem_id": celems[0]["id"],
                "cx": cx + cw / 2,
                "cy": cy + ch / 2,
                "x": cx, "y": cy,
                "w": cw, "h": ch,
            }

        section_y += section_h + section_gap

    # Render unassigned nodes as flat grid below sections
    if unassigned:
        section_y += MIN_SPACING
        cols = min(4, max(1, len(unassigned)))
        for i, node in enumerate(unassigned):
            nid = node.get("id", f"unassigned_{i}")
            label = node.get("label", nid)
            color = _resolve_color(node.get("color"))
            shape = node.get("shape", "rectangle")
            text_color = node.get("text_color", _DEFAULT_TEXT)
            nw = max(node.get("width", 180), MIN_SHAPE_W)
            nh = max(node.get("height", 70), MIN_SHAPE_H)

            row, col = divmod(i, cols)
            x = CANVAS_PADDING + col * (nw + MIN_SPACING * 2)
            y = section_y + row * (nh + MIN_SPACING * 2)

            if shape == "ellipse":
                elems = _make_ellipse(x, y, nw, nh, label=label, color=color, text_color=text_color)
            elif shape == "diamond":
                elems = _make_diamond(x, y, nw, nh, label=label, color=color, text_color=text_color)
            else:
                elems = _make_rectangle(x, y, nw, nh, label=label, color=color, text_color=text_color)

            elements.extend(elems)
            node_map[nid] = {
                "elem_id": elems[0]["id"],
                "cx": x + nw / 2,
                "cy": y + nh / 2,
                "x": x, "y": y,
                "w": nw, "h": nh,
            }

    # Render standalone bullet lists
    for bl in standalone_bullets:
        bullet_y = section_y + MIN_SPACING
        bullet_elem = _make_bullet_list(
            CANVAS_PADDING, bullet_y,
            bl.get("items", []),
            bullet_color=_resolve_accent(bl.get("bullet_color", "cyan")),
            text_color=bl.get("text_color", _DEFAULT_TEXT),
        )
        elements.append(bullet_elem)
        section_y = bullet_y + FONT_BODY * 1.25 * len(bl.get("items", [])) + MIN_SPACING

    # Render standalone annotations
    for ann in standalone_annotations:
        ann_elem = _make_annotation(
            ann.get("x", CANVAS_PADDING),
            ann.get("y", section_y),
            ann.get("text", ""),
            color=_resolve_accent(ann.get("color", "muted")),
        )
        elements.append(ann_elem)

    # Draw connections
    _draw_connections(elements, node_map, connections)

    return elements


def _draw_connections(
    elements: List[Dict[str, Any]],
    node_map: Dict[str, Dict[str, Any]],
    connections: List[Dict[str, Any]],
) -> None:
    """Draw arrows between nodes, updating boundElements on both ends."""
    for conn in connections:
        from_id = conn.get("from", "")
        to_id = conn.get("to", "")
        label = conn.get("label", "")

        src = node_map.get(from_id)
        dst = node_map.get(to_id)
        if not src or not dst:
            continue

        conn_stroke = conn.get("stroke_color", _DEFAULT_STROKE)
        conn_style = conn.get("stroke_style", "solid")
        conn_width = conn.get("stroke_width", 2)

        # Smart edge routing
        sx, sy, ex, ey = _route_arrow(src, dst)

        arrow_elems = _make_arrow(
            sx, sy, ex, ey,
            label=label,
            start_id=src["elem_id"],
            end_id=dst["elem_id"],
            stroke_color=conn_stroke,
            stroke_style=conn_style,
            stroke_width=conn_width,
        )

        # Update bound elements on source and destination
        for elem in elements:
            if elem["id"] == src["elem_id"]:
                if elem.get("boundElements") is None:
                    elem["boundElements"] = []
                elem["boundElements"].append({"id": arrow_elems[0]["id"], "type": "arrow"})
            if elem["id"] == dst["elem_id"]:
                if elem.get("boundElements") is None:
                    elem["boundElements"] = []
                elem["boundElements"].append({"id": arrow_elems[0]["id"], "type": "arrow"})

        elements.extend(arrow_elems)


def _route_arrow(src: Dict[str, Any], dst: Dict[str, Any]) -> tuple:
    """Smart edge routing — pick the best edge pair for arrow start/end."""
    # Determine relative position
    dx = dst["cx"] - src["cx"]
    dy = dst["cy"] - src["cy"]

    if abs(dx) > abs(dy):
        # Horizontal dominant
        if dx > 0:
            sx = src["x"] + src["w"]  # right edge
            ex = dst["x"]             # left edge
        else:
            sx = src["x"]             # left edge
            ex = dst["x"] + dst["w"]  # right edge
        sy = src["cy"]
        ey = dst["cy"]
    else:
        # Vertical dominant
        if dy > 0:
            sy = src["y"] + src["h"]  # bottom edge
            ey = dst["y"]             # top edge
        else:
            sy = src["y"]             # top edge
            ey = dst["y"] + dst["h"]  # bottom edge
        sx = src["cx"]
        ex = dst["cx"]

    return sx, sy, ex, ey


def _layout_flowchart(
    nodes: List[Dict[str, Any]],
    connections: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Layout a vertical flowchart. Diamonds for 'decision' type nodes."""
    elements = []
    node_map: Dict[str, Dict[str, Any]] = {}

    gap_y = 120
    x_center = CANVAS_PADDING + 200

    for i, node in enumerate(nodes):
        nid = node.get("id", f"node_{i}")
        label = node.get("label", nid)
        color = _resolve_color(node.get("color"))
        ntype = node.get("type", "process")

        y = CANVAS_PADDING + i * gap_y

        if ntype == "decision":
            w, h = 180, 110
            x = x_center - w / 2
            elems = _make_diamond(x, y, w, h, label=label, color=color or DARK_COLORS["yellow"])
        elif ntype in ("start", "end"):
            w, h = 160, 80
            x = x_center - w / 2
            elems = _make_ellipse(x, y, w, h, label=label, color=color or DARK_COLORS["green"])
        else:
            w, h = 200, 80
            x = x_center - w / 2
            elems = _make_rectangle(x, y, w, h, label=label, color=color)

        elem_id = elems[0]["id"]
        elements.extend(elems)

        node_map[nid] = {
            "elem_id": elem_id,
            "cx": x_center,
            "cy": y + h / 2,
            "x": x, "y": y,
            "w": w, "h": h,
        }

    # Connections
    _draw_connections(elements, node_map, connections)

    return elements


def _layout_sequence(
    participants: List[Dict[str, Any]],
    messages: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Layout a sequence diagram with participant lifelines and horizontal arrows.

    participants: [{"id": "client", "label": "Client"}, ...]
    messages: [{"from": "client", "to": "server", "label": "GET /api"}, ...]
    """
    elements = []
    participant_map: Dict[str, Dict[str, Any]] = {}

    box_w, box_h = 160, 60
    gap_x = 120
    msg_gap_y = 60
    lifeline_start_y = CANVAS_PADDING + box_h + 20

    # Draw participant boxes
    for i, p in enumerate(participants):
        pid = p.get("id", f"p_{i}")
        label = p.get("label", pid)
        color = _resolve_color(p.get("color", "blue"))

        x = CANVAS_PADDING + i * (box_w + gap_x)
        y = CANVAS_PADDING

        elems = _make_rectangle(x, y, box_w, box_h, label=label, color=color)
        elements.extend(elems)

        cx = x + box_w / 2
        participant_map[pid] = {"cx": cx, "x": x}

        # Draw lifeline (dashed vertical line)
        lifeline_end_y = lifeline_start_y + (len(messages) + 1) * msg_gap_y
        line = _base_element(
            "line", cx, lifeline_start_y, 0, lifeline_end_y - lifeline_start_y,
            points=[[0, 0], [0, lifeline_end_y - lifeline_start_y]],
            strokeStyle="dashed",
            strokeWidth=1,
            strokeColor=ACCENT_COLORS["muted"],
        )
        elements.append(line)

    # Draw messages as horizontal arrows
    for i, msg in enumerate(messages):
        from_id = msg.get("from", "")
        to_id = msg.get("to", "")
        label = msg.get("label", "")

        src = participant_map.get(from_id)
        dst = participant_map.get(to_id)
        if not src or not dst:
            continue

        y = lifeline_start_y + (i + 1) * msg_gap_y

        arrow_elems = _make_arrow(
            src["cx"], y, dst["cx"], y,
            label=label,
        )
        elements.extend(arrow_elems)

    return elements


# ============================================================================
# Excalidraw Document
# ============================================================================

def _excalidraw_document(elements: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Wrap elements in a valid Excalidraw document structure."""
    return {
        "type": "excalidraw",
        "version": 2,
        "source": "kuroryuu-mcp",
        "elements": elements,
        "appState": {
            "gridSize": 20,
            "gridStep": 5,
            "gridModeEnabled": False,
            "viewBackgroundColor": _DEFAULT_BG,
        },
        "files": {},
    }


# ============================================================================
# Action Implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_excalidraw."""
    return {
        "ok": True,
        "data": {
            "tool": "k_excalidraw",
            "description": "Excalidraw diagramming — dark theme, section-based layouts, Excalifont",
            "actions": {
                "help": "Show this help",
                "create": "Create a new diagram. Params: name (required), diagram_type (architecture|flowchart|sequence|freeform), nodes, connections, elements, output_path",
                "read": "Read an existing diagram. Params: name (required)",
                "update": "Update an existing diagram. Params: name (required), add_elements, remove_ids, modify",
                "list": "List all diagrams in the output directory",
                "delete": "Delete a diagram. Params: name (required)",
            },
            "diagram_types": {
                "architecture": "Section-based or grid layout. nodes=[{id, label, color, shape, type}], connections=[{from, to, label}]. Section nodes: {type='section', title, title_color, description, bg_color, nodes=[child_ids]}",
                "flowchart": "Vertical flow with diamonds for decisions. nodes=[{id, label, type(process|decision|start|end), color}], connections=[{from, to, label}]",
                "sequence": "Participant lifelines with horizontal message arrows. Use 'nodes' as participants=[{id, label}], 'connections' as messages=[{from, to, label}]",
                "freeform": "Raw Excalidraw elements. Pass 'elements' list directly.",
            },
            "node_properties": {
                "id": "Unique identifier (required)",
                "label": "Display text",
                "color": "Fill color name or hex (dark palette: blue, green, red, yellow, purple, orange, gray, teal, dark)",
                "shape": "rectangle (default) | ellipse | diamond",
                "stroke_style": "solid (default) | dashed | dotted",
                "text_color": "Label text color (default #e0e0e0)",
                "width": "Override width (min 120)",
                "height": "Override height (min 60)",
            },
            "section_properties": {
                "type": "Must be 'section'",
                "title": "Section header text",
                "title_color": "Accent color for title (cyan, green, red, yellow, magenta, purple, orange)",
                "description": "Optional subtitle text",
                "bg_color": "Section background fill",
                "nodes": "List of child node IDs to place inside this section",
            },
            "output_root": str(_get_output_root()),
            "fill_colors": DARK_COLORS,
            "accent_colors": ACCENT_COLORS,
            "theme": "dark (#191919 background, #e0e0e0 strokes, Excalifont)",
        },
        "error": None,
    }


def _action_create(
    name: str = "",
    diagram_type: str = "architecture",
    nodes: Optional[List[Dict[str, Any]]] = None,
    connections: Optional[List[Dict[str, Any]]] = None,
    elements: Optional[List[Dict[str, Any]]] = None,
    output_path: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Create a new Excalidraw diagram."""
    if not name:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "name is required",
            "details": {},
        }

    try:
        # Determine output location
        if output_path:
            out_dir = Path(output_path).resolve()
        else:
            out_dir = _get_output_root()

        out_dir.mkdir(parents=True, exist_ok=True)

        # Sanitize filename
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
        file_path = out_dir / f"{safe_name}.excalidraw"

        # Generate elements based on diagram type
        dtype = (diagram_type or "architecture").strip().lower()
        nodes = nodes or []
        connections = connections or []

        if dtype == "architecture":
            diagram_elements = _layout_architecture(nodes, connections)
        elif dtype == "flowchart":
            diagram_elements = _layout_flowchart(nodes, connections)
        elif dtype == "sequence":
            diagram_elements = _layout_sequence(nodes, connections)
        elif dtype == "freeform":
            diagram_elements = elements or []
        else:
            return {
                "ok": False,
                "error_code": "INVALID_TYPE",
                "message": f"Unknown diagram_type: {dtype}. Use: architecture, flowchart, sequence, freeform",
                "details": {"diagram_type": dtype},
            }

        # Build document
        doc = _excalidraw_document(diagram_elements)

        # Write atomically
        with file_path.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
            f.write("\n")

        return {
            "ok": True,
            "path": str(file_path),
            "name": safe_name,
            "diagram_type": dtype,
            "element_count": len(diagram_elements),
            "message": f"Created {dtype} diagram: {safe_name}.excalidraw",
        }

    except Exception as e:
        return {
            "ok": False,
            "error_code": "CREATE_FAILED",
            "message": str(e),
            "details": {},
        }


def _action_read(
    name: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Read an existing Excalidraw diagram."""
    if not name:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "name is required",
            "details": {},
        }

    try:
        out_dir = _get_output_root()

        # Try exact name, then with extension
        safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in name)
        file_path = out_dir / safe_name
        if not file_path.exists():
            file_path = out_dir / f"{safe_name}.excalidraw"
        if not file_path.exists():
            # Search for partial match
            matches = list(out_dir.glob(f"*{safe_name}*.excalidraw"))
            if matches:
                file_path = matches[0]
            else:
                return {
                    "ok": False,
                    "error_code": "NOT_FOUND",
                    "message": f"Diagram not found: {name}",
                    "details": {"searched": str(out_dir)},
                }

        with file_path.open("r", encoding="utf-8") as f:
            doc = json.load(f)

        return {
            "ok": True,
            "path": str(file_path),
            "name": file_path.stem,
            "document": doc,
            "element_count": len(doc.get("elements", [])),
        }

    except json.JSONDecodeError as e:
        return {
            "ok": False,
            "error_code": "PARSE_ERROR",
            "message": f"Invalid JSON in diagram file: {e}",
            "details": {},
        }
    except Exception as e:
        return {
            "ok": False,
            "error_code": "READ_FAILED",
            "message": str(e),
            "details": {},
        }


def _action_update(
    name: str = "",
    add_elements: Optional[List[Dict[str, Any]]] = None,
    remove_ids: Optional[List[str]] = None,
    modify: Optional[List[Dict[str, Any]]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Update an existing Excalidraw diagram.

    add_elements: List of raw Excalidraw elements to add
    remove_ids: List of element IDs to remove
    modify: List of {id, ...fields} to update on existing elements
    """
    if not name:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "name is required",
            "details": {},
        }

    try:
        # Read existing
        read_result = _action_read(name=name)
        if not read_result.get("ok"):
            return read_result

        doc = read_result["document"]
        file_path = Path(read_result["path"])
        elems = doc.get("elements", [])

        changes = {"added": 0, "removed": 0, "modified": 0}

        # Remove elements
        if remove_ids:
            before = len(elems)
            remove_set = set(remove_ids)
            elems = [e for e in elems if e.get("id") not in remove_set]
            changes["removed"] = before - len(elems)

        # Modify elements
        if modify:
            elem_by_id = {e["id"]: e for e in elems}
            for mod in modify:
                eid = mod.get("id")
                if eid and eid in elem_by_id:
                    elem_by_id[eid].update({k: v for k, v in mod.items() if k != "id"})
                    changes["modified"] += 1
            elems = list(elem_by_id.values())

        # Add elements
        if add_elements:
            for elem in add_elements:
                if "id" not in elem:
                    elem["id"] = _make_id()
                elems.append(elem)
            changes["added"] = len(add_elements)

        # Write back
        doc["elements"] = elems
        with file_path.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
            f.write("\n")

        return {
            "ok": True,
            "path": str(file_path),
            "name": file_path.stem,
            "element_count": len(elems),
            "changes": changes,
            "message": f"Updated diagram: added={changes['added']}, removed={changes['removed']}, modified={changes['modified']}",
        }

    except Exception as e:
        return {
            "ok": False,
            "error_code": "UPDATE_FAILED",
            "message": str(e),
            "details": {},
        }


def _action_list(**kwargs: Any) -> Dict[str, Any]:
    """List all Excalidraw diagrams in the output directory."""
    try:
        out_dir = _get_output_root()
        out_dir.mkdir(parents=True, exist_ok=True)

        files = sorted(out_dir.glob("*.excalidraw"), key=lambda p: p.stat().st_mtime, reverse=True)

        diagrams = []
        for f in files:
            try:
                with f.open("r", encoding="utf-8") as fh:
                    doc = json.load(fh)
                elem_count = len(doc.get("elements", []))
            except Exception:
                elem_count = -1

            diagrams.append({
                "name": f.stem,
                "path": str(f),
                "size_bytes": f.stat().st_size,
                "element_count": elem_count,
                "modified": f.stat().st_mtime,
            })

        return {
            "ok": True,
            "count": len(diagrams),
            "diagrams": diagrams,
            "output_root": str(out_dir),
        }

    except Exception as e:
        return {
            "ok": False,
            "error_code": "LIST_FAILED",
            "message": str(e),
            "details": {},
        }


def _action_delete(
    name: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Delete an Excalidraw diagram."""
    if not name:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "name is required",
            "details": {},
        }

    try:
        out_dir = _get_output_root()
        safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in name)
        file_path = out_dir / safe_name
        if not file_path.exists():
            file_path = out_dir / f"{safe_name}.excalidraw"

        if not file_path.exists():
            return {
                "ok": False,
                "error_code": "NOT_FOUND",
                "message": f"Diagram not found: {name}",
                "details": {"searched": str(out_dir)},
            }

        file_path.unlink()

        return {
            "ok": True,
            "name": safe_name,
            "path": str(file_path),
            "message": f"Deleted diagram: {file_path.name}",
        }

    except Exception as e:
        return {
            "ok": False,
            "error_code": "DELETE_FAILED",
            "message": str(e),
            "details": {},
        }


# ============================================================================
# Routed Tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "create": _action_create,
    "read": _action_read,
    "update": _action_update,
    "list": _action_list,
    "delete": _action_delete,
}


def k_excalidraw(
    action: str,
    name: str = "",
    diagram_type: str = "architecture",
    nodes: Optional[List[Dict[str, Any]]] = None,
    connections: Optional[List[Dict[str, Any]]] = None,
    elements: Optional[List[Dict[str, Any]]] = None,
    output_path: str = "",
    add_elements: Optional[List[Dict[str, Any]]] = None,
    remove_ids: Optional[List[str]] = None,
    modify: Optional[List[Dict[str, Any]]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Excalidraw diagramming — dark theme, section-based architecture, Excalifont.

    Routed tool with actions: help, create, read, update, list, delete

    Args:
        action: Action to perform (required)
        name: Diagram name without extension (for create, read, update, delete)
        diagram_type: architecture | flowchart | sequence | freeform (for create)
        nodes: List of node definitions [{id, label, color, type, shape}] (for create)
        connections: List of connections [{from, to, label}] (for create)
        elements: Raw Excalidraw elements (for create freeform)
        output_path: Override output directory (for create)
        add_elements: Elements to add (for update)
        remove_ids: Element IDs to remove (for update)
        modify: Element modifications [{id, ...fields}] (for update)

    Returns:
        {ok, ...} response dict
    """
    act = (action or "").strip().lower()

    if not act:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "action is required. Use action='help' for available actions.",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    handler = ACTION_HANDLERS.get(act)
    if not handler:
        return {
            "ok": False,
            "error_code": "UNKNOWN_ACTION",
            "message": f"Unknown action: {act}",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    return handler(
        name=name,
        diagram_type=diagram_type,
        nodes=nodes,
        connections=connections,
        elements=elements,
        output_path=output_path,
        add_elements=add_elements,
        remove_ids=remove_ids,
        modify=modify,
        **kwargs,
    )


# ============================================================================
# Tool Registration
# ============================================================================

def register_excalidraw_tools(registry: "ToolRegistry") -> None:
    """Register k_excalidraw routed tool with the registry."""

    registry.register(
        name="k_excalidraw",
        description="Excalidraw diagramming — dark theme, section-based architecture, flowcharts, sequence diagrams. Actions: help, create, read, update, list, delete",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "create", "read", "update", "list", "delete"],
                    "description": "Action to perform",
                },
                "name": {
                    "type": "string",
                    "description": "Diagram name without extension (for create, read, update, delete)",
                },
                "diagram_type": {
                    "type": "string",
                    "enum": ["architecture", "flowchart", "sequence", "freeform"],
                    "default": "architecture",
                    "description": "Diagram layout type (for create)",
                },
                "nodes": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Node definitions: [{id, label, color, shape, type, stroke_style, text_color, width, height}]. Section nodes: {type='section', title, title_color, description, bg_color, nodes=[child_ids]}",
                },
                "connections": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Connections: [{from, to, label, stroke_color, stroke_style, stroke_width}]",
                },
                "elements": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Raw Excalidraw elements (for create freeform)",
                },
                "output_path": {
                    "type": "string",
                    "description": "Override output directory path (for create)",
                },
                "add_elements": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Elements to add (for update)",
                },
                "remove_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Element IDs to remove (for update)",
                },
                "modify": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Element modifications: [{id, ...fields}] (for update)",
                },
            },
            "required": ["action"],
        },
        handler=k_excalidraw,
    )
