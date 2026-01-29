"""
Artifact storage layer - File-based with versioning.

Storage structure:
ai/artifacts/
├── index.json                    # Metadata index
├── {artifact_id}/
│   ├── content.json              # Current content
│   ├── meta.json                 # Metadata
│   └── versions/
│       ├── v1_{timestamp}.json
│       └── v2_{timestamp}.json
"""

from __future__ import annotations

import json
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .models import Artifact, ArtifactCreate, ArtifactUpdate, CANVAS_SCENARIOS


class ArtifactStorage:
    """File-based artifact storage with versioning."""

    def __init__(self, base_path: Optional[Path] = None):
        """Initialize storage.

        Args:
            base_path: Base path for artifacts. Defaults to ai/artifacts/.
        """
        if base_path is None:
            # Default to project_root/ai/artifacts/
            base_path = Path(__file__).parent.parent.parent.parent / "ai" / "artifacts"
        self.base_path = base_path
        self.index_path = self.base_path / "index.json"
        self._ensure_dir()

    def _ensure_dir(self) -> None:
        """Ensure artifacts directory exists."""
        self.base_path.mkdir(parents=True, exist_ok=True)
        if not self.index_path.exists():
            self.index_path.write_text("{}", encoding="utf-8")

    def _load_index(self) -> Dict[str, Any]:
        """Load artifact index."""
        self._ensure_dir()
        try:
            return json.loads(self.index_path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _save_index(self, index: Dict[str, Any]) -> None:
        """Save artifact index."""
        self._ensure_dir()
        self.index_path.write_text(
            json.dumps(index, indent=2, default=str), encoding="utf-8"
        )

    def _artifact_dir(self, artifact_id: str) -> Path:
        """Get directory for an artifact."""
        return self.base_path / artifact_id

    def _generate_id(self, canvas_type: str) -> str:
        """Generate unique artifact ID."""
        timestamp = int(time.time() * 1000)
        rand = uuid.uuid4().hex[:8]
        return f"{canvas_type}-{timestamp}-{rand}"

    def create(self, data: ArtifactCreate) -> Artifact:
        """Create a new artifact.

        Args:
            data: Artifact creation data.

        Returns:
            Created artifact.

        Raises:
            ValueError: If validation fails.
        """
        # Validate scenario
        valid_scenarios = CANVAS_SCENARIOS.get(data.type, ["display"])
        if data.scenario not in valid_scenarios:
            raise ValueError(
                f"Invalid scenario '{data.scenario}' for canvas type '{data.type}'. "
                f"Valid: {valid_scenarios}"
            )

        artifact_id = self._generate_id(data.type)
        now = datetime.now(timezone.utc)

        artifact = Artifact(
            id=artifact_id,
            type=data.type,
            scenario=data.scenario,
            title=data.title or f"Untitled {data.type.title()}",
            content=data.content or {},
            metadata=data.metadata or {},
            created_at=now,
            updated_at=now,
            version=1,
            created_by=data.created_by,
            session_id=data.session_id,
            run_id=data.run_id,
        )

        # Create artifact directory
        artifact_path = self._artifact_dir(artifact_id)
        artifact_path.mkdir(parents=True, exist_ok=True)

        # Save content
        content_file = artifact_path / "content.json"
        content_file.write_text(
            json.dumps(artifact.content, indent=2), encoding="utf-8"
        )

        # Save metadata (everything except content)
        meta_file = artifact_path / "meta.json"
        meta = artifact.model_dump(exclude={"content"})
        meta_file.write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")

        # Create versions directory and save initial version
        versions_dir = artifact_path / "versions"
        versions_dir.mkdir(exist_ok=True)
        version_file = versions_dir / f"v1_{int(time.time())}.json"
        version_file.write_text(
            json.dumps(artifact.model_dump(), indent=2, default=str), encoding="utf-8"
        )

        # Update index
        index = self._load_index()
        index[artifact_id] = {
            "id": artifact_id,
            "type": data.type,
            "title": artifact.title,
            "scenario": artifact.scenario,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "version": 1,
        }
        self._save_index(index)

        return artifact

    def get(self, artifact_id: str) -> Optional[Artifact]:
        """Get an artifact by ID.

        Args:
            artifact_id: Artifact ID.

        Returns:
            Artifact or None if not found.
        """
        artifact_path = self._artifact_dir(artifact_id)

        if not artifact_path.exists():
            return None

        meta_file = artifact_path / "meta.json"
        content_file = artifact_path / "content.json"

        if not meta_file.exists():
            return None

        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            content = {}
            if content_file.exists():
                content = json.loads(content_file.read_text(encoding="utf-8"))

            return Artifact(**{**meta, "content": content})
        except Exception:
            return None

    def update(self, artifact_id: str, data: ArtifactUpdate) -> Optional[Artifact]:
        """Update an artifact.

        Args:
            artifact_id: Artifact ID.
            data: Update data.

        Returns:
            Updated artifact or None if not found.

        Raises:
            ValueError: If validation fails.
        """
        artifact = self.get(artifact_id)
        if not artifact:
            return None

        artifact_path = self._artifact_dir(artifact_id)
        meta_file = artifact_path / "meta.json"
        content_file = artifact_path / "content.json"

        now = datetime.now(timezone.utc)
        new_version = artifact.version + 1

        # Update fields
        if data.title is not None:
            artifact.title = data.title

        if data.scenario is not None:
            valid_scenarios = CANVAS_SCENARIOS.get(artifact.type, ["display"])
            if data.scenario not in valid_scenarios:
                raise ValueError(
                    f"Invalid scenario '{data.scenario}' for canvas type '{artifact.type}'. "
                    f"Valid: {valid_scenarios}"
                )
            artifact.scenario = data.scenario

        if data.content is not None:
            artifact.content = data.content

        if data.metadata is not None:
            artifact.metadata = {**artifact.metadata, **data.metadata}

        artifact.updated_at = now
        artifact.version = new_version

        # Save updated content
        content_file.write_text(
            json.dumps(artifact.content, indent=2), encoding="utf-8"
        )

        # Save updated metadata
        meta = artifact.model_dump(exclude={"content"})
        meta_file.write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")

        # Save version
        versions_dir = artifact_path / "versions"
        versions_dir.mkdir(exist_ok=True)
        version_file = versions_dir / f"v{new_version}_{int(time.time())}.json"
        version_file.write_text(
            json.dumps(artifact.model_dump(), indent=2, default=str), encoding="utf-8"
        )

        # Update index
        index = self._load_index()
        if artifact_id in index:
            index[artifact_id]["updated_at"] = now.isoformat()
            index[artifact_id]["version"] = new_version
            if data.title is not None:
                index[artifact_id]["title"] = data.title
            if data.scenario is not None:
                index[artifact_id]["scenario"] = data.scenario
            self._save_index(index)

        return artifact

    def delete(self, artifact_id: str) -> bool:
        """Delete an artifact.

        Args:
            artifact_id: Artifact ID.

        Returns:
            True if deleted, False if not found.
        """
        artifact_path = self._artifact_dir(artifact_id)

        if not artifact_path.exists():
            return False

        # Remove from index
        index = self._load_index()
        if artifact_id in index:
            del index[artifact_id]
            self._save_index(index)

        # Delete files
        shutil.rmtree(artifact_path)
        return True

    def list(
        self,
        canvas_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[List[Artifact], int]:
        """List artifacts with optional filtering.

        Args:
            canvas_type: Filter by canvas type.
            limit: Max results to return.
            offset: Skip first N results.

        Returns:
            Tuple of (list of artifacts, total count).
        """
        index = self._load_index()
        entries = list(index.values())

        # Filter by type
        if canvas_type:
            entries = [e for e in entries if e.get("type") == canvas_type]

        total = len(entries)

        # Sort by updated_at descending
        entries.sort(key=lambda e: e.get("updated_at", ""), reverse=True)

        # Apply pagination
        entries = entries[offset : offset + limit]

        # Load full artifacts
        artifacts = []
        for entry in entries:
            artifact = self.get(entry["id"])
            if artifact:
                artifacts.append(artifact)

        return artifacts, total

    def get_versions(self, artifact_id: str) -> List[Dict[str, Any]]:
        """Get version history for an artifact.

        Args:
            artifact_id: Artifact ID.

        Returns:
            List of version metadata.
        """
        artifact_path = self._artifact_dir(artifact_id)
        versions_dir = artifact_path / "versions"

        if not versions_dir.exists():
            return []

        versions = []
        for f in sorted(versions_dir.iterdir(), reverse=True):
            if f.suffix == ".json":
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    versions.append(
                        {
                            "version": data.get("version", 0),
                            "updated_at": data.get("updated_at"),
                            "file": f.name,
                        }
                    )
                except Exception:
                    pass

        return versions

    def get_version(self, artifact_id: str, version: int) -> Optional[Artifact]:
        """Get a specific version of an artifact.

        Args:
            artifact_id: Artifact ID.
            version: Version number.

        Returns:
            Artifact at that version or None.
        """
        artifact_path = self._artifact_dir(artifact_id)
        versions_dir = artifact_path / "versions"

        if not versions_dir.exists():
            return None

        # Find version file
        for f in versions_dir.iterdir():
            if f.name.startswith(f"v{version}_"):
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    return Artifact(**data)
                except Exception:
                    return None

        return None


# Global storage instance
_storage: Optional[ArtifactStorage] = None


def get_storage() -> ArtifactStorage:
    """Get the global artifact storage instance."""
    global _storage
    if _storage is None:
        _storage = ArtifactStorage()
    return _storage
