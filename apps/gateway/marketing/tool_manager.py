"""Tool Manager - Marketing Tool Installation and Health Checks.

Manages the status of cloned marketing tools:
- google-image-gen-api-starter
- claude-code-video-toolkit

Checks installation status, provides health checks, and lists available skills.
"""

from __future__ import annotations

import logging
import pathlib
import json
from typing import Any

from .models import ToolInfo, ToolStatusResponse, SkillInfo

logger = logging.getLogger("marketing.tools")

# Resolve paths
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[3]
TOOLS_DIR = PROJECT_ROOT / "tools" / "marketing"
SKILLS_DIR = PROJECT_ROOT / "ai" / "skills" / "marketing"
OUTPUT_DIR = TOOLS_DIR / "output"


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

TOOL_REGISTRY = [
    {
        "id": "google-image-gen",
        "name": "Google Image Generation",
        "description": "Image generation via Google's Imagen API",
        "repo_url": "https://github.com/google/imagen-research/tree/main/google-image-gen-api-starter",
        "path": "google-image-gen-api-starter",
        "entry_point": "generate.py",
        "optional": False,
    },
    {
        "id": "video-toolkit",
        "name": "Claude Code Video Toolkit",
        "description": "Voiceover (ElevenLabs), music, and video rendering (Remotion)",
        "repo_url": "https://github.com/anthropics/claude-code-video-toolkit",
        "path": "claude-code-video-toolkit",
        "entry_point": None,  # Multiple entry points
        "optional": False,
    },
]


# ---------------------------------------------------------------------------
# Tool status
# ---------------------------------------------------------------------------

def get_tool_status() -> ToolStatusResponse:
    """Get installation status for all marketing tools.

    Returns:
        ToolStatusResponse with tool info
    """
    tools = []

    for tool_def in TOOL_REGISTRY:
        tool_path = TOOLS_DIR / tool_def["path"]
        installed = tool_path.exists()

        # Try to get version if installed
        version = None
        if installed:
            version = _get_tool_version(tool_path)

        tools.append(ToolInfo(
            id=tool_def["id"],
            name=tool_def["name"],
            description=tool_def["description"],
            installed=installed,
            path=str(tool_path) if installed else None,
            version=version,
            repo_url=tool_def["repo_url"],
            optional=tool_def["optional"],
        ))

    return ToolStatusResponse(tools=tools)


def _get_tool_version(tool_path: pathlib.Path) -> str | None:
    """Try to get tool version from package.json or similar."""
    # Check package.json (for Node.js tools)
    package_json = tool_path / "package.json"
    if package_json.exists():
        try:
            with open(package_json) as f:
                data = json.load(f)
                return data.get("version")
        except Exception:
            pass

    # Check pyproject.toml (for Python tools)
    pyproject = tool_path / "pyproject.toml"
    if pyproject.exists():
        try:
            with open(pyproject) as f:
                content = f.read()
                # Simple regex to extract version
                import re
                match = re.search(r'version\s*=\s*"([^"]+)"', content)
                if match:
                    return match.group(1)
        except Exception:
            pass

    # Check setup.py (for Python tools)
    setup_py = tool_path / "setup.py"
    if setup_py.exists():
        try:
            with open(setup_py) as f:
                content = f.read()
                import re
                match = re.search(r'version\s*=\s*["\']([^"\']+)["\']', content)
                if match:
                    return match.group(1)
        except Exception:
            pass

    return None


# ---------------------------------------------------------------------------
# Asset management
# ---------------------------------------------------------------------------

def list_assets() -> list[dict[str, Any]]:
    """List all generated assets in OUTPUT_DIR.

    Returns:
        List of asset info dicts
    """
    if not OUTPUT_DIR.exists():
        return []

    assets = []

    for file_path in OUTPUT_DIR.iterdir():
        if not file_path.is_file():
            continue

        # Skip hidden files and temp files
        if file_path.name.startswith(".") or file_path.name.endswith(".json"):
            continue

        # Determine asset type from extension
        ext = file_path.suffix.lower()
        if ext in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
            asset_type = "image"
        elif ext in {".mp3", ".wav", ".m4a", ".ogg"}:
            asset_type = "audio"
        elif ext in {".mp4", ".mov", ".avi", ".webm"}:
            asset_type = "video"
        else:
            asset_type = "unknown"

        # Get file stats
        stat = file_path.stat()

        # Try to load metadata from companion JSON file
        metadata = {}
        metadata_path = OUTPUT_DIR / f"{file_path.stem}_metadata.json"
        if metadata_path.exists():
            try:
                with open(metadata_path) as f:
                    metadata = json.load(f)
            except Exception:
                pass

        assets.append({
            "id": file_path.name,
            "type": asset_type,
            "name": file_path.stem,
            "path": str(file_path),
            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            "size": stat.st_size,
            "metadata": metadata,
        })

    # Sort by creation time (newest first)
    assets.sort(key=lambda a: a["created_at"], reverse=True)

    return assets


def get_asset_path(asset_id: str) -> pathlib.Path | None:
    """Get absolute path to an asset file.

    Args:
        asset_id: Asset filename

    Returns:
        Path to asset file, or None if not found
    """
    asset_path = OUTPUT_DIR / asset_id

    # Security check: ensure path is within OUTPUT_DIR
    try:
        asset_path = asset_path.resolve()
        if not str(asset_path).startswith(str(OUTPUT_DIR.resolve())):
            logger.warning(f"Path traversal attempt: {asset_id}")
            return None
    except Exception:
        return None

    if not asset_path.exists():
        return None

    return asset_path


def delete_asset(asset_id: str) -> bool:
    """Delete an asset file.

    Args:
        asset_id: Asset filename

    Returns:
        True if deleted, False if not found
    """
    asset_path = get_asset_path(asset_id)
    if not asset_path:
        return False

    try:
        asset_path.unlink()

        # Also delete metadata file if exists
        metadata_path = OUTPUT_DIR / f"{asset_path.stem}_metadata.json"
        metadata_path.unlink(missing_ok=True)

        logger.info(f"Deleted asset: {asset_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete asset {asset_id}: {e}")
        return False


# ---------------------------------------------------------------------------
# Skill discovery
# ---------------------------------------------------------------------------

def list_skills() -> list[SkillInfo]:
    """List all marketing skills in ai/skills/marketing/.

    Returns:
        List of SkillInfo objects
    """
    if not SKILLS_DIR.exists():
        return []

    skills = []

    for skill_file in SKILLS_DIR.glob("*.md"):
        skill_id = skill_file.stem

        # Read skill file to extract metadata
        try:
            with open(skill_file) as f:
                content = f.read()

            # Extract name from first heading
            import re
            name_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
            name = name_match.group(1) if name_match else skill_id

            # Extract description from first paragraph
            desc_match = re.search(r'^(?!#)(.+)$', content, re.MULTILINE)
            description = desc_match.group(1).strip() if desc_match else ""

            # Determine phase from filename or content
            phase = "unknown"
            if "research" in skill_id.lower():
                phase = "research"
            elif "content" in skill_id.lower():
                phase = "content"
            elif any(kw in skill_id.lower() for kw in ["video", "image", "audio", "music"]):
                phase = "production"
            elif any(kw in skill_id.lower() for kw in ["publish", "distribute", "post"]):
                phase = "distribution"

            skills.append(SkillInfo(
                id=skill_id,
                name=name,
                description=description,
                path=str(skill_file),
                phase=phase,
            ))

        except Exception as e:
            logger.warning(f"Failed to parse skill {skill_file}: {e}")
            continue

    # Sort by phase then name
    phase_order = {"research": 0, "content": 1, "production": 2, "distribution": 3, "unknown": 4}
    skills.sort(key=lambda s: (phase_order.get(s.phase, 99), s.name))

    return skills


# Import datetime for list_assets
from datetime import datetime
