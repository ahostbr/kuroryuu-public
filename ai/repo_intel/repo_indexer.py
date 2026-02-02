"""
Kuroryuu Repo Intel - Repository Indexer

Builds a cacheable index of:
- TypeScript/React components, hooks, types, functions
- Python classes, functions, FastAPI endpoints
- Import/export dependencies
- Module graph
- API surface

Outputs JSON indices to Reports/RepoIntel/ for RAG and symbol lookups.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from schemas import (
    ALL_SCAN_EXTS,
    CONFIG_EXTS,
    DOC_EXTS,
    OUTPUT_FILES,
    PY_EXTS,
    REPORT_FILE,
    SCHEMA_VERSION,
    SKIP_DIRS,
    TS_EXTS,
    WORKLOG_FILE,
)

CACHE_VERSION = 1
CACHE_FILE = "repo_intel_cache.json"

# --------------------------------------------------------------------------
# TypeScript/React regex patterns
# --------------------------------------------------------------------------
RE_TS_FUNCTION = re.compile(
    r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)",
    re.MULTILINE,
)
RE_TS_CONST_FN = re.compile(
    r"^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w+)?\s*=>",
    re.MULTILINE,
)
RE_TS_CLASS = re.compile(
    r"^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)",
    re.MULTILINE,
)
RE_TS_INTERFACE = re.compile(
    r"^(?:export\s+)?interface\s+(\w+)",
    re.MULTILINE,
)
RE_TS_TYPE = re.compile(
    r"^(?:export\s+)?type\s+(\w+)\s*=",
    re.MULTILINE,
)
RE_TS_ENUM = re.compile(
    r"^(?:export\s+)?(?:const\s+)?enum\s+(\w+)",
    re.MULTILINE,
)
RE_TS_CONST = re.compile(
    r"^(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?!.*=>)",
    re.MULTILINE,
)
# React component (function starting with uppercase)
RE_TS_COMPONENT = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Z]\w+)\s*\(",
    re.MULTILINE,
)
RE_TS_CONST_COMPONENT = re.compile(
    r"^(?:export\s+)?const\s+([A-Z]\w+)\s*(?::\s*React\.FC[^=]*)?=",
    re.MULTILINE,
)
# React hooks (use* pattern)
RE_TS_HOOK = re.compile(
    r"^(?:export\s+)?(?:const\s+)?(use[A-Z]\w*)\s*=",
    re.MULTILINE,
)
RE_TS_HOOK_FN = re.compile(
    r"^(?:export\s+)?function\s+(use[A-Z]\w*)\s*\(",
    re.MULTILINE,
)
# Import statements
RE_TS_IMPORT = re.compile(
    r"^import\s+(?:{[^}]+}|[\w,\s*]+)\s+from\s+['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)
RE_TS_IMPORT_DYNAMIC = re.compile(
    r"import\(['\"]([^'\"]+)['\"]\)",
)
# Export statements
RE_TS_EXPORT_FROM = re.compile(
    r"^export\s+(?:\*|{[^}]+})\s+from\s+['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)
RE_TS_EXPORT_DEFAULT = re.compile(
    r"^export\s+default\s+(?:function\s+)?(\w+)",
    re.MULTILINE,
)

# --------------------------------------------------------------------------
# Python regex patterns
# --------------------------------------------------------------------------
RE_PY_FUNCTION = re.compile(
    r"^(?:async\s+)?def\s+(\w+)\s*\(",
    re.MULTILINE,
)
RE_PY_CLASS = re.compile(
    r"^class\s+(\w+)(?:\([^)]*\))?:",
    re.MULTILINE,
)
RE_PY_DECORATOR = re.compile(
    r"^@(\w+(?:\.\w+)*)",
    re.MULTILINE,
)
RE_PY_IMPORT = re.compile(
    r"^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))",
    re.MULTILINE,
)
# FastAPI endpoints
RE_PY_ENDPOINT = re.compile(
    r"^@(?:router|app)\.(?:get|post|put|delete|patch|options|head)\s*\(\s*['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)
# Pydantic models
RE_PY_MODEL = re.compile(
    r"^class\s+(\w+)\s*\(\s*(?:BaseModel|BaseSettings)",
    re.MULTILINE,
)


def _sha1_file(path: Path) -> str:
    """Compute SHA1 hash of file contents."""
    h = hashlib.sha1()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def detect_project_root(start: Optional[Path] = None) -> Path:
    """Auto-detect Kuroryuu project root by looking for KURORYUU_BOOTSTRAP.md."""
    if start is None:
        start = Path(__file__).resolve()
    path = start if start.is_dir() else start.parent
    for parent in [path] + list(path.parents):
        if (parent / "KURORYUU_BOOTSTRAP.md").exists():
            return parent
        if (parent / "apps").is_dir() and (parent / "ai").is_dir():
            return parent
    raise RuntimeError("Could not auto-detect project root. Use --project_root.")


class RepoIndexer:
    """
    Indexes a Kuroryuu-style TypeScript/Python repository.
    
    Produces:
    - symbol_map.json: All symbols (functions, classes, components, hooks)
    - public_api_map.json: Exported API surface
    - module_graph.json: Import/export dependency graph
    - dependency_map.json: Package dependencies
    - hook_usage.json: React hook usage across components
    - route_map.json: FastAPI routes
    - component_tree.json: React component hierarchy
    - file_manifest.json: All scanned files with metadata
    """

    def __init__(
        self,
        project_root: Path,
        apps_dir: Optional[Path] = None,
        reports_dir: Optional[Path] = None,
        changed_only: bool = True,
        full: bool = False,
        app_filter: str = "",
        verbose: bool = False,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.apps_dir = Path(apps_dir).resolve() if apps_dir else self.project_root / "apps"
        self.reports_dir = (
            Path(reports_dir).resolve()
            if reports_dir
            else self.project_root / "Reports" / "RepoIntel"
        )
        self.tool_root = Path(__file__).resolve().parent
        self.cache_dir = self.tool_root / "_cache"
        self.logs_dir = self.tool_root / "_logs"
        self.cache_path = self.cache_dir / CACHE_FILE
        self.changed_only = bool(changed_only) and not full
        self.full = bool(full)
        self.app_filter = (app_filter or "").strip()
        self.verbose = bool(verbose)
        self._log_lines: List[str] = []

    def log(self, msg: str) -> None:
        """Log a message to console and internal buffer."""
        line = f"[repo_intel] {msg}"
        print(line)
        ts = dt.datetime.now().isoformat(timespec="seconds")
        self._log_lines.append(f"{ts} {msg}")

    def _flush_log(self) -> None:
        """Flush log lines to file."""
        if not self._log_lines:
            return
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        log_path = self.logs_dir / "repo_intel_run.log"
        with log_path.open("a", encoding="utf-8") as fh:
            for line in self._log_lines:
                fh.write(line + "\n")
        self._log_lines.clear()

    def _ensure_dirs(self) -> None:
        """Create required directories."""
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)

    def _load_cache(self) -> Dict[str, Any]:
        """Load cache from disk."""
        if not self.cache_path.exists():
            return {}
        try:
            data = json.loads(self.cache_path.read_text(encoding="utf-8"))
        except Exception:
            return {}
        if data.get("version") != CACHE_VERSION:
            return {}
        return data

    def _save_cache(self, cache: Dict[str, Any]) -> None:
        """Save cache to disk."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(
            json.dumps(cache, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def _rel_path(self, path: Path) -> str:
        """Get path relative to project root."""
        try:
            return path.resolve().relative_to(self.project_root).as_posix()
        except ValueError:
            return path.as_posix()

    def _category_for_path(self, path: Path) -> str:
        """Categorize file by extension."""
        ext = path.suffix.lower()
        if ext in {".ts", ".tsx"}:
            return "typescript"
        if ext in {".js", ".jsx", ".mjs", ".cjs"}:
            return "javascript"
        if ext == ".py":
            return "python"
        if ext in {".json", ".yaml", ".yml", ".toml"}:
            return "config"
        if ext in {".md", ".txt", ".rst"}:
            return "docs"
        return "other"

    def _collect_apps(self) -> List[Tuple[str, Path]]:
        """Collect app directories to scan."""
        apps: List[Tuple[str, Path]] = []
        if not self.apps_dir.is_dir():
            return apps
        patterns = [p.strip() for p in self.app_filter.split(",") if p.strip()]
        for child in sorted(self.apps_dir.iterdir(), key=lambda p: p.name.lower()):
            if not child.is_dir():
                continue
            name = child.name
            if patterns:
                if not any(name == pat or name.startswith(pat) for pat in patterns):
                    continue
            apps.append((name, child))
        return apps

    def _collect_files(self) -> List[Path]:
        """Collect all files to scan."""
        files: List[Path] = []

        def walk_dir(root: Path) -> None:
            for dirpath, dirnames, filenames in os.walk(root):
                # Skip unwanted directories
                dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
                for name in filenames:
                    path = Path(dirpath) / name
                    if path.suffix.lower() in ALL_SCAN_EXTS:
                        files.append(path)

        # Scan apps directory
        for app_name, app_dir in self._collect_apps():
            walk_dir(app_dir)

        # Scan ai directory
        ai_dir = self.project_root / "ai"
        if ai_dir.is_dir():
            walk_dir(ai_dir)

        # Scan root config files
        for item in self.project_root.iterdir():
            if item.is_file() and item.suffix.lower() in ALL_SCAN_EXTS:
                files.append(item)

        # Scan Docs directory
        docs_dir = self.project_root / "Docs"
        if docs_dir.is_dir():
            walk_dir(docs_dir)

        return files

    def _build_manifest(
        self,
        files: List[Path],
        cache_manifest: Dict[str, Dict[str, Any]],
    ) -> Tuple[Dict[str, Dict[str, Any]], List[str], int]:
        """Build file manifest with change detection."""
        manifest: Dict[str, Dict[str, Any]] = {}
        changed: List[str] = []
        cache_hits = 0

        for path in files:
            rel = self._rel_path(path)
            try:
                stat = path.stat()
            except OSError:
                continue
            size = int(stat.st_size)
            mtime = int(stat.st_mtime)
            category = self._category_for_path(path)

            cached = cache_manifest.get(rel)
            if self.changed_only and cached:
                if cached.get("size") == size and cached.get("mtime") == mtime:
                    manifest[rel] = cached
                    cache_hits += 1
                    continue

            sha1 = _sha1_file(path)
            record = {
                "path": rel,
                "size": size,
                "mtime": mtime,
                "sha1": sha1,
                "category": category,
            }
            manifest[rel] = record
            changed.append(rel)

        return manifest, changed, cache_hits

    def _read_text(self, path: Path) -> str:
        """Read file text with fallback encoding."""
        try:
            return path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return path.read_text(encoding="utf-8", errors="ignore")

    def _extract_app_module(self, rel_path: str) -> Tuple[str, str]:
        """Extract app and module from relative path."""
        parts = Path(rel_path).parts
        app = ""
        module = ""
        if "apps" in parts:
            idx = parts.index("apps")
            if idx + 1 < len(parts):
                app = parts[idx + 1]
            if idx + 2 < len(parts):
                module = parts[idx + 2]
        elif "ai" in parts:
            idx = parts.index("ai")
            app = "ai"
            if idx + 1 < len(parts):
                module = parts[idx + 1]
        return app, module

    # --------------------------------------------------------------------------
    # TypeScript/React parsing
    # --------------------------------------------------------------------------
    def _parse_typescript_file(
        self,
        rel_path: str,
        text: str,
        app: str,
        module: str,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, List[Dict[str, Any]]], List[str], List[str]]:
        """Parse a TypeScript/React file for symbols and dependencies."""
        symbols: List[Dict[str, Any]] = []
        api: Dict[str, List[Dict[str, Any]]] = {
            "components": [],
            "hooks": [],
            "functions": [],
            "types": [],
            "exports": [],
        }
        imports: List[str] = []
        exports: List[str] = []

        # Extract imports
        for m in RE_TS_IMPORT.finditer(text):
            imports.append(m.group(1))
        for m in RE_TS_IMPORT_DYNAMIC.finditer(text):
            imports.append(m.group(1))

        # Extract exports
        for m in RE_TS_EXPORT_FROM.finditer(text):
            exports.append(m.group(1))

        def add_symbol(kind: str, name: str, match: re.Match, exported: bool = False) -> None:
            line_num = text[:match.start()].count("\n") + 1
            sym = {
                "kind": kind,
                "name": name,
                "app": app,
                "module": module,
                "file": rel_path,
                "line": line_num,
                "exported": exported or "export" in match.group(0).lower(),
            }
            symbols.append(sym)
            return sym

        # Components (uppercase function/const)
        for m in RE_TS_COMPONENT.finditer(text):
            name = m.group(1)
            sym = add_symbol("component", name, m, True)
            api["components"].append({"name": name, "file": rel_path})

        for m in RE_TS_CONST_COMPONENT.finditer(text):
            name = m.group(1)
            # Avoid duplicates
            if not any(s["name"] == name and s["kind"] == "component" for s in symbols):
                sym = add_symbol("component", name, m)
                api["components"].append({"name": name, "file": rel_path})

        # Hooks (use* pattern)
        for m in RE_TS_HOOK.finditer(text):
            name = m.group(1)
            sym = add_symbol("hook", name, m)
            api["hooks"].append({"name": name, "file": rel_path})

        for m in RE_TS_HOOK_FN.finditer(text):
            name = m.group(1)
            if not any(s["name"] == name and s["kind"] == "hook" for s in symbols):
                sym = add_symbol("hook", name, m)
                api["hooks"].append({"name": name, "file": rel_path})

        # Regular functions (skip if already captured as component/hook)
        for m in RE_TS_FUNCTION.finditer(text):
            name = m.group(1)
            if name[0].isupper():  # Skip - already captured as component
                continue
            if name.startswith("use") and name[3:4].isupper():  # Skip hooks
                continue
            add_symbol("function", name, m)
            api["functions"].append({"name": name, "file": rel_path})

        for m in RE_TS_CONST_FN.finditer(text):
            name = m.group(1)
            if name[0].isupper() or (name.startswith("use") and name[3:4].isupper()):
                continue
            if not any(s["name"] == name for s in symbols):
                add_symbol("function", name, m)

        # Classes
        for m in RE_TS_CLASS.finditer(text):
            add_symbol("class", m.group(1), m)

        # Interfaces
        for m in RE_TS_INTERFACE.finditer(text):
            name = m.group(1)
            add_symbol("interface", name, m)
            api["types"].append({"kind": "interface", "name": name, "file": rel_path})

        # Types
        for m in RE_TS_TYPE.finditer(text):
            name = m.group(1)
            add_symbol("type", name, m)
            api["types"].append({"kind": "type", "name": name, "file": rel_path})

        # Enums
        for m in RE_TS_ENUM.finditer(text):
            name = m.group(1)
            add_symbol("enum", name, m)
            api["types"].append({"kind": "enum", "name": name, "file": rel_path})

        # Default exports
        for m in RE_TS_EXPORT_DEFAULT.finditer(text):
            name = m.group(1)
            api["exports"].append({"name": name, "file": rel_path, "default": True})

        return symbols, api, imports, exports

    # --------------------------------------------------------------------------
    # Python parsing
    # --------------------------------------------------------------------------
    def _parse_python_file(
        self,
        rel_path: str,
        text: str,
        app: str,
        module: str,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, List[Dict[str, Any]]], List[str]]:
        """Parse a Python file for symbols and dependencies."""
        symbols: List[Dict[str, Any]] = []
        api: Dict[str, List[Dict[str, Any]]] = {
            "endpoints": [],
            "models": [],
            "functions": [],
            "classes": [],
        }
        imports: List[str] = []

        # Extract imports
        for m in RE_PY_IMPORT.finditer(text):
            imp = m.group(1) or m.group(2)
            if imp:
                imports.append(imp)

        def add_symbol(kind: str, name: str, match: re.Match) -> Dict[str, Any]:
            line_num = text[:match.start()].count("\n") + 1
            sym = {
                "kind": kind,
                "name": name,
                "app": app,
                "module": module,
                "file": rel_path,
                "line": line_num,
            }
            symbols.append(sym)
            return sym

        # FastAPI endpoints
        for m in RE_PY_ENDPOINT.finditer(text):
            route = m.group(1)
            # Find the function name after the decorator
            remaining = text[m.end():]
            func_match = RE_PY_FUNCTION.search(remaining)
            if func_match:
                func_name = func_match.group(1)
                line_num = text[:m.start()].count("\n") + 1
                api["endpoints"].append({
                    "route": route,
                    "function": func_name,
                    "file": rel_path,
                    "line": line_num,
                })

        # Pydantic models
        for m in RE_PY_MODEL.finditer(text):
            name = m.group(1)
            sym = add_symbol("py_model", name, m)
            api["models"].append({"name": name, "file": rel_path})

        # Classes (skip Pydantic models already captured)
        for m in RE_PY_CLASS.finditer(text):
            name = m.group(1)
            if not any(s["name"] == name for s in symbols):
                add_symbol("py_class", name, m)
                api["classes"].append({"name": name, "file": rel_path})

        # Functions (skip endpoint handlers already captured)
        for m in RE_PY_FUNCTION.finditer(text):
            name = m.group(1)
            if name.startswith("_"):  # Skip private functions
                continue
            # Check if this is an endpoint handler
            is_endpoint = any(
                ep["function"] == name and ep["file"] == rel_path
                for ep in api["endpoints"]
            )
            if not is_endpoint:
                add_symbol("py_function", name, m)
                api["functions"].append({"name": name, "file": rel_path})

        return symbols, api, imports

    # --------------------------------------------------------------------------
    # Main indexing
    # --------------------------------------------------------------------------
    def run(self) -> Dict[str, Any]:
        """Run the indexer and produce all outputs."""
        start_time = dt.datetime.now()
        self._ensure_dirs()
        self.log(f"Starting repo_intel indexer")
        self.log(f"Project root: {self.project_root}")
        self.log(f"Reports dir: {self.reports_dir}")
        self.log(f"Mode: {'full rebuild' if self.full else 'incremental'}")

        # Load cache
        cache = self._load_cache()
        cache_manifest = cache.get("manifest", {})

        # Collect files
        files = self._collect_files()
        self.log(f"Found {len(files)} files to scan")

        # Build manifest with change detection
        manifest, changed, cache_hits = self._build_manifest(files, cache_manifest)
        self.log(f"Changed files: {len(changed)}, cache hits: {cache_hits}")

        # Parse files
        all_symbols: List[Dict[str, Any]] = []
        all_ts_api: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        all_py_api: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        module_imports: Dict[str, List[str]] = {}
        module_exports: Dict[str, List[str]] = {}

        files_to_parse = [
            p for p in files
            if self.full or self._rel_path(p) in changed
        ]
        self.log(f"Parsing {len(files_to_parse)} files...")

        for path in files_to_parse:
            rel = self._rel_path(path)
            app, module = self._extract_app_module(rel)
            category = self._category_for_path(path)

            try:
                text = self._read_text(path)
            except Exception as e:
                if self.verbose:
                    self.log(f"Error reading {rel}: {e}")
                continue

            if category == "typescript":
                symbols, api, imports, exports = self._parse_typescript_file(
                    rel, text, app, module
                )
                all_symbols.extend(symbols)
                for key, items in api.items():
                    all_ts_api[key].extend(items)
                module_imports[rel] = imports
                module_exports[rel] = exports

            elif category == "javascript":
                # Use same parser for JS
                symbols, api, imports, exports = self._parse_typescript_file(
                    rel, text, app, module
                )
                all_symbols.extend(symbols)
                for key, items in api.items():
                    all_ts_api[key].extend(items)
                module_imports[rel] = imports
                module_exports[rel] = exports

            elif category == "python":
                symbols, api, imports = self._parse_python_file(
                    rel, text, app, module
                )
                all_symbols.extend(symbols)
                for key, items in api.items():
                    all_py_api[key].extend(items)
                module_imports[rel] = imports

        self.log(f"Found {len(all_symbols)} symbols")

        # Build output structures
        symbol_map = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": dt.datetime.now().isoformat(),
            "total_symbols": len(all_symbols),
            "symbols": all_symbols,
        }

        public_api_map = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": dt.datetime.now().isoformat(),
            "typescript": dict(all_ts_api),
            "python": dict(all_py_api),
        }

        module_graph = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": dt.datetime.now().isoformat(),
            "imports": module_imports,
            "exports": module_exports,
        }

        file_manifest_out = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": dt.datetime.now().isoformat(),
            "total_files": len(manifest),
            "files": manifest,
        }

        # Hook usage analysis
        hook_usage = self._analyze_hook_usage(all_symbols, all_ts_api)

        # Route map
        route_map = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": dt.datetime.now().isoformat(),
            "endpoints": all_py_api.get("endpoints", []),
        }

        # Component tree (simplified)
        component_tree = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": dt.datetime.now().isoformat(),
            "components": all_ts_api.get("components", []),
        }

        # Write outputs
        outputs = {
            "symbol_map": symbol_map,
            "public_api_map": public_api_map,
            "module_graph": module_graph,
            "file_manifest": file_manifest_out,
            "hook_usage": hook_usage,
            "route_map": route_map,
            "component_tree": component_tree,
        }

        for key, data in outputs.items():
            filename = OUTPUT_FILES.get(key, f"{key}.json")
            out_path = self.reports_dir / filename
            out_path.write_text(
                json.dumps(data, indent=2, sort_keys=True),
                encoding="utf-8",
            )
            self.log(f"Wrote {out_path.name}")

        # Write report
        report = self._generate_report(
            manifest, all_symbols, all_ts_api, all_py_api, start_time
        )
        report_path = self.reports_dir / REPORT_FILE
        report_path.write_text(report, encoding="utf-8")
        self.log(f"Wrote {report_path.name}")

        # Update cache
        cache = {
            "version": CACHE_VERSION,
            "manifest": manifest,
        }
        self._save_cache(cache)

        # Flush logs
        self._flush_log()

        elapsed = (dt.datetime.now() - start_time).total_seconds()
        self.log(f"Indexing complete in {elapsed:.2f}s")

        return {
            "status": "success",
            "files_scanned": len(manifest),
            "symbols_found": len(all_symbols),
            "reports_dir": str(self.reports_dir),
            "elapsed_seconds": elapsed,
        }

    def _analyze_hook_usage(
        self,
        symbols: List[Dict[str, Any]],
        ts_api: Dict[str, List[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        """Analyze React hook usage across components."""
        hooks = [s for s in symbols if s["kind"] == "hook"]
        components = [s for s in symbols if s["kind"] == "component"]

        return {
            "schema_version": SCHEMA_VERSION,
            "generated_at": dt.datetime.now().isoformat(),
            "total_hooks": len(hooks),
            "total_components": len(components),
            "hooks": [{"name": h["name"], "file": h["file"]} for h in hooks],
            "by_app": self._group_by_app(hooks),
        }

    def _group_by_app(self, items: List[Dict[str, Any]]) -> Dict[str, int]:
        """Group items by app."""
        counts: Dict[str, int] = defaultdict(int)
        for item in items:
            app = item.get("app", "unknown")
            counts[app] += 1
        return dict(counts)

    def _generate_report(
        self,
        manifest: Dict[str, Dict[str, Any]],
        symbols: List[Dict[str, Any]],
        ts_api: Dict[str, List[Dict[str, Any]]],
        py_api: Dict[str, List[Dict[str, Any]]],
        start_time: dt.datetime,
    ) -> str:
        """Generate human-readable report."""
        lines = [
            "=" * 70,
            "KURORYUU REPO INTEL REPORT",
            "=" * 70,
            f"Generated: {dt.datetime.now().isoformat()}",
            f"Project Root: {self.project_root}",
            "",
            "FILE SUMMARY",
            "-" * 40,
        ]

        # Count files by category
        by_category: Dict[str, int] = defaultdict(int)
        for info in manifest.values():
            by_category[info["category"]] += 1
        for cat, count in sorted(by_category.items()):
            lines.append(f"  {cat}: {count}")
        lines.append(f"  TOTAL: {len(manifest)}")

        lines.extend([
            "",
            "SYMBOL SUMMARY",
            "-" * 40,
        ])

        # Count symbols by kind
        by_kind: Dict[str, int] = defaultdict(int)
        for sym in symbols:
            by_kind[sym["kind"]] += 1
        for kind, count in sorted(by_kind.items()):
            lines.append(f"  {kind}: {count}")
        lines.append(f"  TOTAL: {len(symbols)}")

        # TypeScript API
        lines.extend([
            "",
            "TYPESCRIPT/REACT API",
            "-" * 40,
        ])
        for key, items in sorted(ts_api.items()):
            lines.append(f"  {key}: {len(items)}")

        # Python API
        lines.extend([
            "",
            "PYTHON API",
            "-" * 40,
        ])
        for key, items in sorted(py_api.items()):
            lines.append(f"  {key}: {len(items)}")

        elapsed = (dt.datetime.now() - start_time).total_seconds()
        lines.extend([
            "",
            "=" * 70,
            f"Completed in {elapsed:.2f}s",
        ])

        return "\n".join(lines)
