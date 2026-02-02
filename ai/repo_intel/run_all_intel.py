#!/usr/bin/env python3
"""
Kuroryuu Repo Intel - Full Suite Runner

Runs all repo_intel tools:
- repo_indexer: Symbol and API indexing
- todo_backlog: TODO/FIXME scanning
- depmap: Dependency analysis

Usage:
    python run_all_intel.py
    python run_all_intel.py --full
    python run_all_intel.py --only indexer
    python run_all_intel.py --only todo
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from repo_indexer import RepoIndexer, detect_project_root
from todo_backlog import build_backlog
from depmap import build_depmap


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Kuroryuu Repo Intel - Full Suite Runner"
    )
    parser.add_argument(
        "--project_root",
        type=Path,
        default=None,
        help="Path to Kuroryuu project root (auto-detected if omitted)",
    )
    parser.add_argument(
        "--reports_dir",
        type=Path,
        default=None,
        help="Path to output reports (default: <project_root>/Reports/RepoIntel)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Force full rebuild for indexer",
    )
    parser.add_argument(
        "--only",
        type=str,
        choices=["indexer", "todo", "depmap"],
        default=None,
        help="Run only a specific tool",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Verbose output",
    )
    args = parser.parse_args()

    # Auto-detect project root
    project_root = args.project_root
    if project_root is None:
        try:
            project_root = detect_project_root()
        except RuntimeError as e:
            print(f"ERROR: {e}")
            return 1

    reports_dir = args.reports_dir or project_root / "Reports" / "RepoIntel"

    print("=" * 60)
    print("KURORYUU REPO INTEL - FULL SUITE")
    print("=" * 60)
    print(f"Project root: {project_root}")
    print(f"Reports dir:  {reports_dir}")
    print()

    tools_to_run = []
    if args.only:
        tools_to_run = [args.only]
    else:
        tools_to_run = ["indexer", "todo", "depmap"]

    results = {}

    # Run indexer
    if "indexer" in tools_to_run:
        print("-" * 60)
        print("RUNNING: Symbol Indexer")
        print("-" * 60)
        try:
            indexer = RepoIndexer(
                project_root=project_root,
                reports_dir=reports_dir,
                full=args.full,
                verbose=args.verbose,
            )
            result = indexer.run()
            results["indexer"] = {"status": "success", **result}
        except Exception as e:
            print(f"ERROR: Indexer failed: {e}")
            results["indexer"] = {"status": "error", "error": str(e)}
        print()

    # Run TODO scanner
    if "todo" in tools_to_run:
        print("-" * 60)
        print("RUNNING: TODO Backlog Scanner")
        print("-" * 60)
        try:
            result = build_backlog(project_root, reports_dir, args.verbose)
            results["todo"] = {
                "status": "success",
                "total_matches": result.get("total_matches", 0),
            }
        except Exception as e:
            print(f"ERROR: TODO scanner failed: {e}")
            results["todo"] = {"status": "error", "error": str(e)}
        print()

    # Run dependency mapper
    if "depmap" in tools_to_run:
        print("-" * 60)
        print("RUNNING: Dependency Mapper")
        print("-" * 60)
        try:
            result = build_depmap(project_root, reports_dir, args.verbose)
            results["depmap"] = {
                "status": "success",
                "npm_deps": result["summary"]["unique_npm_deps"],
                "python_deps": result["summary"]["unique_python_deps"],
            }
        except Exception as e:
            print(f"ERROR: Dependency mapper failed: {e}")
            results["depmap"] = {"status": "error", "error": str(e)}
        print()

    # Final summary
    print("=" * 60)
    print("REPO INTEL COMPLETE")
    print("=" * 60)
    for tool, result in results.items():
        status = result.get("status", "unknown")
        if status == "success":
            print(f"  ✓ {tool}: {status}")
        else:
            print(f"  ✗ {tool}: {status} - {result.get('error', '')}")
    print()
    print(f"Reports written to: {reports_dir}")

    # Return 1 if any tool failed
    return 0 if all(r.get("status") == "success" for r in results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
