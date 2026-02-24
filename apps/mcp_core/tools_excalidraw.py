"""Excalidraw diagramming tools — programmatic diagram creation.

Agents create architecture diagrams, flowcharts, and sequence diagrams
via simple JSON. Files are stored as .excalidraw format (viewable at excalidraw.com).

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
# Excalidraw Element Builders
# ============================================================================

# Default colors for diagram nodes
DEFAULT_COLORS = {
    "blue": "#a5d8ff",
    "green": "#b2f2bb",
    "red": "#ffc9c9",
    "yellow": "#ffec99",
    "purple": "#d0bfff",
    "orange": "#ffd8a8",
    "gray": "#dee2e6",
    "white": "#ffffff",
}


def _base_element(
    elem_type: str,
    x: float,
    y: float,
    w: float,
    h: float,
    **overrides: Any,
) -> Dict[str, Any]:
    """Create base Excalidraw element with all required fields."""
    elem = {
        "id": _make_id(),
        "type": elem_type,
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "angle": 0,
        "strokeColor": "#1e1e1e",
        "backgroundColor": "transparent",
        "fillStyle": "solid",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "groupIds": [],
        "frameId": None,
        "index": "a0",
        "roundness": {"type": 3},
        "seed": abs(hash(_make_id())) % (2**31),
        "version": 1,
        "versionNonce": abs(hash(_make_id())) % (2**31),
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
    label: str = "", color: str = "#a5d8ff",
) -> List[Dict[str, Any]]:
    """Create a rectangle (optionally with centered text label)."""
    elements = []
    rect = _base_element("rectangle", x, y, w, h, backgroundColor=color)
    elements.append(rect)

    if label:
        text = _make_text(x + w / 2, y + h / 2, label, container_id=rect["id"])
        rect["boundElements"] = [{"id": text["id"], "type": "text"}]
        elements.append(text)

    return elements


def _make_diamond(
    x: float, y: float, w: float = 160, h: float = 100,
    label: str = "", color: str = "#ffec99",
) -> List[Dict[str, Any]]:
    """Create a diamond shape (for flowchart decisions)."""
    elements = []
    diamond = _base_element("diamond", x, y, w, h, backgroundColor=color)
    elements.append(diamond)

    if label:
        text = _make_text(x + w / 2, y + h / 2, label, container_id=diamond["id"])
        diamond["boundElements"] = [{"id": text["id"], "type": "text"}]
        elements.append(text)

    return elements


def _make_ellipse(
    x: float, y: float, w: float = 160, h: float = 80,
    label: str = "", color: str = "#d0bfff",
) -> List[Dict[str, Any]]:
    """Create an ellipse."""
    elements = []
    ellipse = _base_element("ellipse", x, y, w, h, backgroundColor=color)
    elements.append(ellipse)

    if label:
        text = _make_text(x + w / 2, y + h / 2, label, container_id=ellipse["id"])
        ellipse["boundElements"] = [{"id": text["id"], "type": "text"}]
        elements.append(text)

    return elements


def _make_text(
    x: float, y: float, text: str,
    font_size: int = 16, container_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a text element. If container_id is set, it's bound to that container."""
    # Estimate text dimensions
    char_width = font_size * 0.6
    text_width = len(text) * char_width
    text_height = font_size * 1.4

    elem = _base_element(
        "text",
        x - text_width / 2,
        y - text_height / 2,
        text_width,
        text_height,
        text=text,
        fontSize=font_size,
        fontFamily=1,  # 1 = Virgil (hand-drawn), 3 = Cascadia
        textAlign="center",
        verticalAlign="middle",
        backgroundColor="transparent",
        strokeColor="#1e1e1e",
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
) -> List[Dict[str, Any]]:
    """Create an arrow (line with arrowhead). Optionally bound to start/end elements."""
    elements = []

    arrow = _base_element(
        "arrow",
        start_x, start_y,
        end_x - start_x, end_y - start_y,
        backgroundColor="transparent",
        fillStyle="solid",
        points=[[0, 0], [end_x - start_x, end_y - start_y]],
        startBinding={"elementId": start_id, "focus": 0, "gap": 5, "fixedPoint": None} if start_id else None,
        endBinding={"elementId": end_id, "focus": 0, "gap": 5, "fixedPoint": None} if end_id else None,
        startArrowhead=None,
        endArrowhead="arrow",
        roundness={"type": 2},
    )
    elements.append(arrow)

    if label:
        mid_x = start_x + (end_x - start_x) / 2
        mid_y = start_y + (end_y - start_y) / 2 - 20
        text = _make_text(mid_x, mid_y, label, font_size=14, container_id=arrow["id"])
        arrow["boundElements"] = [{"id": text["id"], "type": "text"}]
        elements.append(text)

    return elements


def _make_line(
    start_x: float, start_y: float,
    end_x: float, end_y: float,
) -> Dict[str, Any]:
    """Create a plain line (no arrowhead)."""
    return _base_element(
        "line",
        start_x, start_y,
        end_x - start_x, end_y - start_y,
        points=[[0, 0], [end_x - start_x, end_y - start_y]],
        startArrowhead=None,
        endArrowhead=None,
    )


# ============================================================================
# Layout Engines
# ============================================================================

def _resolve_color(color: Optional[str]) -> str:
    """Resolve color name to hex, or pass through hex values."""
    if not color:
        return "#a5d8ff"
    if color.startswith("#"):
        return color
    return DEFAULT_COLORS.get(color.lower(), "#a5d8ff")


def _layout_architecture(
    nodes: List[Dict[str, Any]],
    connections: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Layout nodes in a horizontal grid with connecting arrows.

    Nodes are placed in rows of up to 4, spaced evenly.
    Connections draw arrows between node centers.
    """
    elements = []
    node_map: Dict[str, Dict[str, Any]] = {}  # id -> {elem_id, cx, cy}

    # Layout params
    box_w, box_h = 200, 80
    gap_x, gap_y = 100, 120
    cols = min(4, max(1, len(nodes)))

    for i, node in enumerate(nodes):
        nid = node.get("id", f"node_{i}")
        label = node.get("label", nid)
        color = _resolve_color(node.get("color"))

        row, col = divmod(i, cols)
        x = col * (box_w + gap_x)
        y = row * (box_h + gap_y)

        elems = _make_rectangle(x, y, box_w, box_h, label=label, color=color)
        rect_id = elems[0]["id"]
        elements.extend(elems)

        node_map[nid] = {
            "elem_id": rect_id,
            "cx": x + box_w / 2,
            "cy": y + box_h / 2,
            "x": x, "y": y,
            "w": box_w, "h": box_h,
        }

    # Draw connections
    for conn in connections:
        from_id = conn.get("from", "")
        to_id = conn.get("to", "")
        label = conn.get("label", "")

        src = node_map.get(from_id)
        dst = node_map.get(to_id)
        if not src or not dst:
            continue

        # Calculate arrow start/end at box edges
        sx = src["x"] + src["w"]  # right edge
        sy = src["cy"]
        ex = dst["x"]  # left edge
        ey = dst["cy"]

        # If dst is below src (different row), go from bottom to top
        if dst["y"] > src["y"] + src["h"]:
            sx = src["cx"]
            sy = src["y"] + src["h"]
            ex = dst["cx"]
            ey = dst["y"]

        arrow_elems = _make_arrow(
            sx, sy, ex, ey,
            label=label,
            start_id=src["elem_id"],
            end_id=dst["elem_id"],
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

    return elements


def _layout_flowchart(
    nodes: List[Dict[str, Any]],
    connections: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Layout a vertical flowchart. Diamonds for 'decision' type nodes."""
    elements = []
    node_map: Dict[str, Dict[str, Any]] = {}

    gap_y = 120
    x_center = 200

    for i, node in enumerate(nodes):
        nid = node.get("id", f"node_{i}")
        label = node.get("label", nid)
        color = _resolve_color(node.get("color"))
        ntype = node.get("type", "process")

        y = i * gap_y

        if ntype == "decision":
            w, h = 180, 110
            x = x_center - w / 2
            elems = _make_diamond(x, y, w, h, label=label, color=color or "#ffec99")
        elif ntype == "start" or ntype == "end":
            w, h = 160, 80
            x = x_center - w / 2
            elems = _make_ellipse(x, y, w, h, label=label, color=color or "#b2f2bb")
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
    for conn in connections:
        from_id = conn.get("from", "")
        to_id = conn.get("to", "")
        label = conn.get("label", "")

        src = node_map.get(from_id)
        dst = node_map.get(to_id)
        if not src or not dst:
            continue

        sx = src["cx"]
        sy = src["y"] + src["h"]
        ex = dst["cx"]
        ey = dst["y"]

        arrow_elems = _make_arrow(
            sx, sy, ex, ey,
            label=label,
            start_id=src["elem_id"],
            end_id=dst["elem_id"],
        )

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
    lifeline_start_y = box_h + 20

    # Draw participant boxes
    for i, p in enumerate(participants):
        pid = p.get("id", f"p_{i}")
        label = p.get("label", pid)
        color = _resolve_color(p.get("color", "blue"))

        x = i * (box_w + gap_x)
        y = 0

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
            strokeColor="#868e96",
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
            "viewBackgroundColor": "#ffffff",
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
            "description": "Excalidraw diagramming tool — create architecture diagrams, flowcharts, and sequence diagrams",
            "actions": {
                "help": "Show this help",
                "create": "Create a new diagram. Params: name (required), diagram_type (architecture|flowchart|sequence|freeform), nodes, connections, elements, output_path",
                "read": "Read an existing diagram. Params: name (required)",
                "update": "Update an existing diagram. Params: name (required), add_elements, remove_ids, modify",
                "list": "List all diagrams in the output directory",
                "delete": "Delete a diagram. Params: name (required)",
            },
            "diagram_types": {
                "architecture": "Horizontal grid of boxes with connecting arrows. nodes=[{id, label, color}], connections=[{from, to, label}]",
                "flowchart": "Vertical flow with diamonds for decisions. nodes=[{id, label, type(process|decision|start|end), color}], connections=[{from, to, label}]",
                "sequence": "Participant lifelines with horizontal message arrows. Use 'nodes' as participants=[{id, label}], 'connections' as messages=[{from, to, label}]",
                "freeform": "Raw Excalidraw elements. Pass 'elements' list directly.",
            },
            "output_root": str(_get_output_root()),
            "colors": DEFAULT_COLORS,
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
    """Excalidraw diagramming — create architecture diagrams, flowcharts, sequences.

    Routed tool with actions: help, create, read, update, list, delete

    Args:
        action: Action to perform (required)
        name: Diagram name without extension (for create, read, update, delete)
        diagram_type: architecture | flowchart | sequence | freeform (for create)
        nodes: List of node definitions [{id, label, color, type}] (for create)
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
        description="Excalidraw diagramming — create architecture diagrams, flowcharts, and sequence diagrams. Actions: help, create, read, update, list, delete",
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
                    "description": "Node definitions: [{id, label, color, type}] (for create)",
                },
                "connections": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Connections: [{from, to, label}] (for create)",
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
