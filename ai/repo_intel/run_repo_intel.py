#!/usr/bin/env python3
"""
Kuroryuu Repo Intel - CLI Runner

Usage:
    python run_repo_intel.py
    python run_repo_intel.py --full
    python run_repo_intel.py --app web
    python run_repo_intel.py --verbose

Arguments:
    --project_root  Path to Kuroryuu project root (auto-detected if omitted)
    --apps_dir      Path to apps directory (default: <project_root>/apps)
    --reports_dir   Path to output reports (default: <project_root>/Reports/RepoIntel)
    --app           Filter to specific app(s), comma-separated
    --full          Force full rebuild, ignore cache
    --verbose       Print verbose output
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add parent to path for local imports
sys.path.insert(0, str(Path(__file__).parent))

from repo_indexer import RepoIndexer, detect_project_root


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Kuroryuu Repo Intel - Index TypeScript/Python codebase"
    )
    parser.add_argument(
        "--project_root",
        type=Path,
        default=None,
        help="Path to Kuroryuu project root (auto-detected if omitted)",
    )
    parser.add_argument(
        "--apps_dir",
        type=Path,
        default=None,
        help="Path to apps directory (default: <project_root>/apps)",
    )
    parser.add_argument(
        "--reports_dir",
        type=Path,
        default=None,
        help="Path to output reports (default: <project_root>/Reports/RepoIntel)",
    )
    parser.add_argument(
        "--app",
        type=str,
        default="",
        help="Filter to specific app(s), comma-separated (e.g., 'web,gateway')",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Force full rebuild, ignore cache",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print verbose output",
    )

    args = parser.parse_args()

    # Auto-detect project root if not specified
    project_root = args.project_root
    if project_root is None:
        try:
            project_root = detect_project_root()
        except RuntimeError as e:
            print(f"ERROR: {e}")
            return 1

    print(f"[repo_intel] Project root: {project_root}")

    # Create indexer
    indexer = RepoIndexer(
        project_root=project_root,
        apps_dir=args.apps_dir,
        reports_dir=args.reports_dir,
        changed_only=not args.full,
        full=args.full,
        app_filter=args.app,
        verbose=args.verbose,
    )

    # Run indexer
    try:
        result = indexer.run()
    except Exception as e:
        print(f"ERROR: Indexing failed: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1

    # Print summary
    print()
    print("=" * 50)
    print("REPO INTEL COMPLETE")
    print("=" * 50)
    print(f"Files scanned:  {result['files_scanned']}")
    print(f"Symbols found:  {result['symbols_found']}")
    print(f"Reports dir:    {result['reports_dir']}")
    print(f"Elapsed time:   {result['elapsed_seconds']:.2f}s")

    return 0


if __name__ == "__main__":
    sys.exit(main())
