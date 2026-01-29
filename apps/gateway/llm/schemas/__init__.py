"""Kuroryuu LLM Schemas - JSON Schema definitions for tool calling.

Provides:
- Master JSON Schema for all 8 MCP tools
- Devstral-specific Jinja template
- Schema loading and validation utilities
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

SCHEMA_DIR = Path(__file__).parent


def load_schema() -> Dict[str, Any]:
    """Load the master Kuroryuu tools JSON Schema."""
    schema_path = SCHEMA_DIR / "kuroryuu_tools_schema.json"
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema not found: {schema_path}")
    return json.loads(schema_path.read_text(encoding="utf-8"))


def get_devstral_tools() -> List[Dict[str, Any]]:
    """Get tools in Devstral/OpenAI-compatible format.

    Returns list of tool definitions ready for API payload:
    [
        {
            "type": "function",
            "function": {
                "name": "k_session",
                "description": "...",
                "parameters": {...}
            }
        },
        ...
    ]
    """
    schema = load_schema()
    return schema.get("tools", [])


def get_tool_by_name(name: str) -> Optional[Dict[str, Any]]:
    """Get a specific tool definition by name."""
    for tool in get_devstral_tools():
        if tool.get("function", {}).get("name") == name:
            return tool
    return None


def load_jinja_template() -> str:
    """Load the Devstral Jinja template."""
    template_path = SCHEMA_DIR / "devstral_template.jinja2"
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")
    return template_path.read_text(encoding="utf-8")


__all__ = [
    "load_schema",
    "get_devstral_tools",
    "get_tool_by_name",
    "load_jinja_template",
    "SCHEMA_DIR",
]
