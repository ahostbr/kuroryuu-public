"""Schema Generator - Validates and generates JSON Schema from Python tool definitions.

Usage:
    python -m apps.gateway.llm.schemas.schema_generator validate
    python -m apps.gateway.llm.schemas.schema_generator generate
    python -m apps.gateway.llm.schemas.schema_generator diff
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

SCHEMA_DIR = Path(__file__).parent
SCHEMA_FILE = SCHEMA_DIR / "kuroryuu_tools_schema.json"


def load_static_schema() -> Dict[str, Any]:
    """Load the static JSON schema file."""
    if not SCHEMA_FILE.exists():
        return {"tools": []}
    return json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))


def get_mcp_tool_schemas() -> List[Dict[str, Any]]:
    """Extract tool schemas from MCP tool registrations.

    This dynamically loads the tool definitions from the MCP core.
    """
    tools = []

    try:
        # Import the MCP tool registry
        from apps.mcp_core.server import mcp_app

        # Get registered tools
        for tool in mcp_app.list_tools():
            tools.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.inputSchema,
                },
            })
    except ImportError as e:
        print(f"Warning: Could not import MCP tools: {e}", file=sys.stderr)

    return tools


def validate_schema() -> List[str]:
    """Compare static schema to MCP tool registrations.

    Returns list of discrepancies found.
    """
    issues = []

    static_schema = load_static_schema()
    static_tools = {
        t["function"]["name"]: t
        for t in static_schema.get("tools", [])
    }

    mcp_tools = get_mcp_tool_schemas()
    mcp_tool_map = {
        t["function"]["name"]: t
        for t in mcp_tools
    }

    # Check for missing tools in static schema
    for name in mcp_tool_map:
        if name not in static_tools:
            issues.append(f"MISSING: Tool '{name}' exists in MCP but not in static schema")

    # Check for extra tools in static schema
    for name in static_tools:
        if name not in mcp_tool_map:
            issues.append(f"EXTRA: Tool '{name}' in static schema but not in MCP")

    # Check for parameter mismatches
    for name in static_tools:
        if name in mcp_tool_map:
            static_params = static_tools[name]["function"].get("parameters", {})
            mcp_params = mcp_tool_map[name]["function"].get("parameters", {})

            # Compare properties
            static_props = set(static_params.get("properties", {}).keys())
            mcp_props = set(mcp_params.get("properties", {}).keys())

            missing = mcp_props - static_props
            extra = static_props - mcp_props

            if missing:
                issues.append(f"PARAMS: Tool '{name}' missing params: {missing}")
            if extra:
                issues.append(f"PARAMS: Tool '{name}' has extra params: {extra}")

            # Compare actions (for routed tools)
            static_actions = _get_actions(static_params)
            mcp_actions = _get_actions(mcp_params)

            if static_actions != mcp_actions:
                issues.append(
                    f"ACTIONS: Tool '{name}' actions differ: "
                    f"static={static_actions}, mcp={mcp_actions}"
                )

    return issues


def _get_actions(params: Dict[str, Any]) -> Optional[Set[str]]:
    """Extract action enum values from tool parameters."""
    action_prop = params.get("properties", {}).get("action", {})
    if "enum" in action_prop:
        return set(action_prop["enum"])
    return None


def generate_schema() -> Dict[str, Any]:
    """Generate JSON schema from MCP tool definitions."""
    mcp_tools = get_mcp_tool_schemas()

    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://kuroryuu.dev/schemas/devstral-tools-v1.json",
        "title": "Kuroryuu MCP Tools for Devstral",
        "description": "Auto-generated from MCP tool registrations",
        "$defs": {
            "FilePath": {
                "type": "string",
                "description": "Path relative to project root",
            },
            "SessionId": {
                "type": "string",
                "description": "Session identifier",
            },
            "FolderEnum": {
                "type": "string",
                "enum": ["new", "cur", "done", "dead"],
            },
            "RiskLevel": {
                "type": "string",
                "enum": ["low", "medium", "high", "critical"],
            },
            "ToolResponse": {
                "type": "object",
                "properties": {
                    "ok": {"type": "boolean"},
                    "error": {"type": "string"},
                },
                "required": ["ok"],
            },
        },
        "tools": mcp_tools,
    }


def diff_schemas() -> Dict[str, Any]:
    """Show differences between static and MCP schemas."""
    static_schema = load_static_schema()
    generated = generate_schema()

    return {
        "static_tool_count": len(static_schema.get("tools", [])),
        "mcp_tool_count": len(generated.get("tools", [])),
        "issues": validate_schema(),
    }


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: python -m apps.gateway.llm.schemas.schema_generator <command>")
        print("Commands: validate, generate, diff")
        sys.exit(1)

    command = sys.argv[1]

    if command == "validate":
        issues = validate_schema()
        if issues:
            print("Validation issues found:")
            for issue in issues:
                print(f"  - {issue}")
            sys.exit(1)
        else:
            print("Schema is valid - matches MCP tool definitions")
            sys.exit(0)

    elif command == "generate":
        schema = generate_schema()
        print(json.dumps(schema, indent=2))

    elif command == "diff":
        result = diff_schemas()
        print(json.dumps(result, indent=2))

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
