"""
Kuroryuu Repo Intel - Dependency Map

Analyzes package.json and requirements.txt files to build a dependency graph.
Shows inter-app dependencies and external package versions.
"""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from schemas import SKIP_DIRS


def find_package_jsons(root: Path) -> List[Path]:
    """Find all package.json files."""
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name == "package.json":
                results.append(Path(dirpath) / name)
    return results


def find_requirements_txts(root: Path) -> List[Path]:
    """Find all requirements.txt files."""
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name == "requirements.txt":
                results.append(Path(dirpath) / name)
    return results


def parse_package_json(path: Path) -> Dict[str, Any]:
    """Parse a package.json file."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {
            "name": data.get("name", path.parent.name),
            "version": data.get("version", "0.0.0"),
            "dependencies": data.get("dependencies", {}),
            "devDependencies": data.get("devDependencies", {}),
            "peerDependencies": data.get("peerDependencies", {}),
            "scripts": list(data.get("scripts", {}).keys()),
        }
    except Exception as e:
        return {"error": str(e)}


def parse_requirements_txt(path: Path) -> Dict[str, Any]:
    """Parse a requirements.txt file."""
    deps = {}
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("-"):
                continue
            # Parse package==version or package>=version etc
            for sep in ["==", ">=", "<=", ">", "<", "~="]:
                if sep in line:
                    name, version = line.split(sep, 1)
                    deps[name.strip()] = version.strip()
                    break
            else:
                deps[line] = "*"
    except Exception as e:
        return {"error": str(e)}
    return {"dependencies": deps}


def extract_app_name(path: Path, project_root: Path) -> str:
    """Extract app name from path."""
    try:
        rel = path.relative_to(project_root)
        parts = rel.parts
        if "apps" in parts:
            idx = parts.index("apps")
            if idx + 1 < len(parts):
                return parts[idx + 1]
        return parts[0] if parts else "root"
    except ValueError:
        return "unknown"


def build_depmap(
    project_root: Path,
    reports_dir: Optional[Path] = None,
    verbose: bool = False,
) -> Dict[str, Any]:
    """
    Build dependency map for the project.
    """
    project_root = Path(project_root).resolve()
    reports_dir = reports_dir or project_root / "Reports" / "RepoIntel"
    reports_dir.mkdir(parents=True, exist_ok=True)

    print(f"[depmap] Scanning {project_root}")

    # Collect package.json files
    npm_packages = {}
    for pkg_path in find_package_jsons(project_root):
        app_name = extract_app_name(pkg_path, project_root)
        rel_path = pkg_path.relative_to(project_root).as_posix()
        parsed = parse_package_json(pkg_path)
        npm_packages[rel_path] = {
            "app": app_name,
            "path": rel_path,
            **parsed,
        }

    # Collect requirements.txt files
    python_packages = {}
    for req_path in find_requirements_txts(project_root):
        app_name = extract_app_name(req_path, project_root)
        rel_path = req_path.relative_to(project_root).as_posix()
        parsed = parse_requirements_txt(req_path)
        python_packages[rel_path] = {
            "app": app_name,
            "path": rel_path,
            **parsed,
        }

    # Aggregate all dependencies
    all_npm_deps: Dict[str, List[str]] = {}  # dep -> [apps using it]
    all_python_deps: Dict[str, List[str]] = {}

    for path, info in npm_packages.items():
        app = info.get("app", "unknown")
        for dep in info.get("dependencies", {}).keys():
            all_npm_deps.setdefault(dep, []).append(app)
        for dep in info.get("devDependencies", {}).keys():
            all_npm_deps.setdefault(dep, []).append(f"{app} (dev)")

    for path, info in python_packages.items():
        app = info.get("app", "unknown")
        for dep in info.get("dependencies", {}).keys():
            all_python_deps.setdefault(dep, []).append(app)

    # Build output
    output = {
        "schema_version": 1,
        "generated_at": dt.datetime.now().isoformat(),
        "project_root": str(project_root),
        "npm_packages": npm_packages,
        "python_packages": python_packages,
        "npm_dependency_usage": {
            dep: {"count": len(apps), "apps": apps}
            for dep, apps in sorted(all_npm_deps.items())
        },
        "python_dependency_usage": {
            dep: {"count": len(apps), "apps": apps}
            for dep, apps in sorted(all_python_deps.items())
        },
        "summary": {
            "npm_package_count": len(npm_packages),
            "python_package_count": len(python_packages),
            "unique_npm_deps": len(all_npm_deps),
            "unique_python_deps": len(all_python_deps),
        },
    }

    # Write JSON
    out_path = reports_dir / "dependency_map.json"
    out_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"[depmap] Wrote {out_path}")

    # Print summary
    print()
    print("=" * 50)
    print("DEPENDENCY MAP SUMMARY")
    print("=" * 50)
    print(f"NPM package.json files: {len(npm_packages)}")
    print(f"Python requirements.txt files: {len(python_packages)}")
    print(f"Unique NPM dependencies: {len(all_npm_deps)}")
    print(f"Unique Python dependencies: {len(all_python_deps)}")
    print()
    
    # Top dependencies
    print("Top NPM Dependencies (by usage):")
    sorted_npm = sorted(all_npm_deps.items(), key=lambda x: -len(x[1]))[:10]
    for dep, apps in sorted_npm:
        print(f"  {dep}: {len(apps)} apps")

    print()
    print("Top Python Dependencies (by usage):")
    sorted_py = sorted(all_python_deps.items(), key=lambda x: -len(x[1]))[:10]
    for dep, apps in sorted_py:
        print(f"  {dep}: {len(apps)} apps")

    return output


def main() -> int:
    """CLI entry point."""
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Kuroryuu dependency map analyzer")
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
        start = Path(__file__).resolve()
        for parent in [start] + list(start.parents):
            if (parent / "KURORYUU_BOOTSTRAP.md").exists():
                project_root = parent
                break
        if project_root is None:
            print("ERROR: Could not auto-detect project root")
            return 1

    build_depmap(project_root, args.reports_dir, args.verbose)
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
