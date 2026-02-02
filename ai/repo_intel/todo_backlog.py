"""
Kuroryuu Repo Intel - TODO/FIXME Backlog Scanner

Scans the codebase for TODO, FIXME, @Ryan, and similar markers.
Produces a backlog report by app/module.
"""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Set

from schemas import ALL_SCAN_EXTS, SKIP_DIRS

# Patterns to search for
TODO_PATTERNS = [
    "TODO",
    "FIXME",
    "HACK",
    "XXX",
    "BUG",
    "@Ryan",
    "@Buddy",
    "@AI",
    "NOTE:",
    "WARN:",
]


def scan_file(path: Path) -> List[Dict[str, object]]:
    """Scan a file for TODO-like patterns."""
    matches = []
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as f:
            for lineno, line in enumerate(f, 1):
                for pattern in TODO_PATTERNS:
                    if pattern in line:
                        matches.append({
                            "line": lineno,
                            "pattern": pattern,
                            "text": line.strip()[:200],  # Limit length
                        })
                        break  # Only match once per line
    except Exception:
        pass
    return matches


def collect_files(root: Path) -> List[Path]:
    """Collect all scannable files."""
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            p = Path(dirpath) / name
            if p.suffix.lower() in ALL_SCAN_EXTS:
                files.append(p)
    return files


def extract_app_module(rel_path: str) -> tuple[str, str]:
    """Extract app and module from path."""
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
        app = "ai"
        idx = parts.index("ai")
        if idx + 1 < len(parts):
            module = parts[idx + 1]
    return app, module


def build_backlog(
    project_root: Path,
    reports_dir: Optional[Path] = None,
    verbose: bool = False,
) -> Dict[str, object]:
    """
    Build TODO backlog for the project.
    
    Returns summary dict and writes JSON to reports_dir.
    """
    project_root = Path(project_root).resolve()
    reports_dir = reports_dir or project_root / "Reports" / "RepoIntel"
    reports_dir.mkdir(parents=True, exist_ok=True)

    print(f"[todo_backlog] Scanning {project_root}")
    
    files = collect_files(project_root)
    print(f"[todo_backlog] Found {len(files)} files to scan")

    backlog: Dict[str, Dict[str, List[Dict]]] = {}
    by_pattern: Dict[str, int] = {}
    total_matches = 0

    for path in files:
        try:
            rel = path.resolve().relative_to(project_root).as_posix()
        except ValueError:
            rel = path.as_posix()
        
        matches = scan_file(path)
        if not matches:
            continue
        
        total_matches += len(matches)
        app, module = extract_app_module(rel)
        key = app or "root"
        
        if key not in backlog:
            backlog[key] = {}
        backlog[key][rel] = matches
        
        for m in matches:
            pattern = m.get("pattern", "OTHER")
            by_pattern[pattern] = by_pattern.get(pattern, 0) + 1

    # Build output
    output = {
        "schema_version": 1,
        "generated_at": dt.datetime.now().isoformat(),
        "project_root": str(project_root),
        "total_files_scanned": len(files),
        "total_matches": total_matches,
        "by_pattern": by_pattern,
        "by_app": {
            app: sum(len(files_dict[f]) for f in files_dict)
            for app, files_dict in backlog.items()
        },
        "backlog": backlog,
    }

    # Write JSON
    out_path = reports_dir / "todo_backlog.json"
    out_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"[todo_backlog] Wrote {out_path}")

    # Print summary
    print()
    print("=" * 50)
    print("TODO BACKLOG SUMMARY")
    print("=" * 50)
    print(f"Files scanned: {len(files)}")
    print(f"Total matches: {total_matches}")
    print()
    print("By Pattern:")
    for pattern, count in sorted(by_pattern.items(), key=lambda x: -x[1]):
        print(f"  {pattern}: {count}")
    print()
    print("By App:")
    for app, count in sorted(output["by_app"].items(), key=lambda x: -x[1]):
        file_count = len(backlog.get(app, {}))
        print(f"  {app}: {count} items in {file_count} files")

    return output


def main() -> int:
    """CLI entry point."""
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Kuroryuu TODO/FIXME backlog scanner")
    parser.add_argument(
        "--project_root",
        type=Path,
        default=None,
        help="Project root (auto-detected if omitted)",
    )
    parser.add_argument(
        "--reports_dir",
        type=Path,
        default=None,
        help="Output directory for reports",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Verbose output",
    )
    args = parser.parse_args()

    project_root = args.project_root
    if project_root is None:
        # Auto-detect
        start = Path(__file__).resolve()
        for parent in [start] + list(start.parents):
            if (parent / "KURORYUU_BOOTSTRAP.md").exists():
                project_root = parent
                break
        if project_root is None:
            print("ERROR: Could not auto-detect project root")
            return 1

    build_backlog(project_root, args.reports_dir, args.verbose)
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
