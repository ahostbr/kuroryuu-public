"""
Screenshot Capture Helper

Wraps k_capture tool for evidence pack generation.
Part of Phase 0 Tier 1.2 - Audit Trail Framework
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any
import subprocess

logger = logging.getLogger(__name__)


def _get_project_root() -> Path:
    """Get project root from env or derive from __file__."""
    env_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if env_root:
        return Path(env_root)
    # __file__ is apps/gateway/utils/screenshot_capture.py -> go up 3 levels
    return Path(__file__).resolve().parent.parent.parent.parent


class ScreenshotCaptureHelper:
    """Helper for capturing screenshots for evidence packs."""

    def __init__(self):
        self.capture_root = _get_project_root() / "ai" / "capture" / "output" / "VisualDigest" / "latest"

    def capture_screenshot(self, output_path: str) -> Optional[str]:
        """
        Capture a single screenshot for evidence.

        Args:
            output_path: Where to save the screenshot (full path)

        Returns:
            Path to captured screenshot, or None if capture failed
        """
        try:
            # Use k_capture tool via MCP to take a screenshot
            # This is a placeholder - actual implementation depends on how MCP tools are called
            # For now, we'll use the tool indirectly

            output_dir = Path(output_path).parent
            output_dir.mkdir(parents=True, exist_ok=True)

            # Copy latest screenshot from capture location
            latest_jpg = self.capture_root / "latest.jpg"
            if latest_jpg.exists():
                import shutil

                shutil.copy2(latest_jpg, output_path)
                logger.info(f"Screenshot captured to {output_path}")
                return output_path
            else:
                logger.warning(f"Latest screenshot not found at {latest_jpg}")
                return None

        except Exception as e:
            logger.error(f"Screenshot capture failed: {e}")
            return None

    def get_latest_screenshot(self) -> Optional[str]:
        """Get path to latest captured screenshot."""
        latest_jpg = self.capture_root / "latest.jpg"
        if latest_jpg.exists():
            return str(latest_jpg)
        return None

    def get_manifest(self) -> Optional[Dict[str, Any]]:
        """Get manifest metadata from latest capture."""
        manifest_path = self.capture_root / "manifest.json"
        if manifest_path.exists():
            try:
                return json.loads(manifest_path.read_text())
            except Exception as e:
                logger.error(f"Failed to read manifest: {e}")
        return None


# Global instance
_helper = None


def get_screenshot_helper() -> ScreenshotCaptureHelper:
    """Get or create global screenshot capture helper."""
    global _helper
    if _helper is None:
        _helper = ScreenshotCaptureHelper()
    return _helper


def capture_evidence_screenshot(evidence_dir: str) -> Optional[str]:
    """
    Capture a screenshot for evidence pack.

    Args:
        evidence_dir: Directory where evidence pack is stored

    Returns:
        Path to screenshot file, or None if failed
    """
    helper = get_screenshot_helper()
    output_path = str(Path(evidence_dir) / "screenshot.png")
    return helper.capture_screenshot(output_path)
