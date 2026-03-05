"""
Project Registry — maps project IDs to filesystem paths.

Stores registry at ~/.kuroryuu/projects/registry.json.
Each project has:
  - id: unique string identifier
  - name: human-readable name
  - root: absolute path to project directory
  - harness: absolute path to external harness directory
  - stack: detected technology stack (optional)
  - created: ISO timestamp
  - last_accessed: ISO timestamp
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def _default_registry_path() -> Path:
    home = Path.home()
    return home / ".kuroryuu" / "projects" / "registry.json"


def _default_harness_root() -> Path:
    return Path.home() / ".kuroryuu" / "projects"


class ProjectRegistry:
    def __init__(
        self,
        registry_path: Optional[Path] = None,
        harness_root: Optional[Path] = None,
    ):
        self._path = registry_path or _default_registry_path()
        self._harness_root = harness_root or _default_harness_root()
        self._projects: Dict[str, Dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            with open(self._path, encoding="utf-8") as f:
                self._projects = json.load(f)

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self._projects, f, indent=2)
        tmp.replace(self._path)

    def register(
        self,
        project_id: str,
        root: Path,
        name: Optional[str] = None,
        stack: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        root = Path(root).resolve()
        harness = self._harness_root / project_id

        existing = self._projects.get(project_id)
        project = {
            "id": project_id,
            "name": name or (existing or {}).get("name") or root.name,
            "root": str(root),
            "harness": str(harness),
            "stack": stack or (existing or {}).get("stack") or {},
            "created": (existing or {}).get("created") or now,
            "last_accessed": now,
        }
        self._projects[project_id] = project
        self._save()
        return {"ok": True, "project": project}

    def list_projects(self) -> List[Dict[str, Any]]:
        return list(self._projects.values())

    def get(self, project_id: str) -> Optional[Dict[str, Any]]:
        project = self._projects.get(project_id)
        if project:
            project["last_accessed"] = datetime.now(timezone.utc).isoformat()
            self._save()
        return project

    def remove(self, project_id: str) -> bool:
        if project_id in self._projects:
            del self._projects[project_id]
            self._save()
            return True
        return False

    def resolve_from_path(self, path: Path) -> Optional[Dict[str, Any]]:
        """Resolve a project from a filesystem path (CWD or subdirectory)."""
        path = Path(path).resolve()
        for project in self._projects.values():
            project_root = Path(project["root"]).resolve()
            try:
                path.relative_to(project_root)
                project["last_accessed"] = datetime.now(timezone.utc).isoformat()
                self._save()
                return project
            except ValueError:
                continue
        return None
