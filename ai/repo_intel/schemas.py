"""
Kuroryuu Repo Intel - Output schemas and constants

Adapted from SOTS repo_index for TypeScript/Python web app stack.
"""
from __future__ import annotations

SCHEMA_VERSION = 1

OUTPUT_FILES = {
    "symbol_map": "symbol_map.json",
    "public_api_map": "public_api_map.json",
    "module_graph": "module_graph.json",
    "dependency_map": "dependency_map.json",
    "file_manifest": "file_manifest.json",
    "hook_usage": "hook_usage.json",
    "route_map": "route_map.json",
    "component_tree": "component_tree.json",
    "report": "repo_intel_report.txt",
    "worklog": "repo_intel_worklog.md",
}

REPORT_FILE = OUTPUT_FILES["report"]
WORKLOG_FILE = OUTPUT_FILES["worklog"]

# File extensions to scan
TS_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
PY_EXTS = {".py"}
CONFIG_EXTS = {".json", ".yaml", ".yml", ".toml", ".ini", ".env"}
DOC_EXTS = {".md", ".txt", ".rst"}
ALL_SCAN_EXTS = TS_EXTS | PY_EXTS | CONFIG_EXTS | DOC_EXTS

# Directories to skip
SKIP_DIRS = {
    "node_modules",
    "__pycache__",
    ".git",
    ".vscode",
    ".idea",
    "dist",
    "build",
    ".next",
    "coverage",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "venv",
    ".venv",
    "env",
    "_DEAD",
    "out",  # Electron build output
    "assets",  # Usually bundled/static files
}

# Symbol kinds
SYMBOL_KINDS = {
    # TypeScript/React
    "function",
    "class",
    "interface",
    "type",
    "enum",
    "const",
    "component",
    "hook",
    "context",
    # Python
    "py_function",
    "py_class",
    "py_decorator",
    "py_endpoint",
    "py_model",
}
