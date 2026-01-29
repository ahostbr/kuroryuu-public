"""Harness Store - Prompt file operations.

Provides safe file operations for the agent harness prompt system.

Environment:
- KURORYUU_HARNESS_DIR: Path to ai/ folder (default: auto-detected from script location)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional

# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

def _get_harness_dir() -> Path:
    """Get harness dir from env or derive from __file__."""
    env_dir = os.environ.get("KURORYUU_HARNESS_DIR")
    if env_dir:
        return Path(env_dir)
    # __file__ is apps/gateway/harness/harness_store.py -> go up 3 levels + ai
    return Path(__file__).resolve().parent.parent.parent.parent / "ai"

HARNESS_DIR = _get_harness_dir()


# ═══════════════════════════════════════════════════════════════════════════════
# Harness Store
# ═══════════════════════════════════════════════════════════════════════════════

class HarnessStore:
    """Read/write harness prompt files."""

    def __init__(self, harness_dir: Path = HARNESS_DIR):
        self.harness_dir = harness_dir
        self.prompts_dir = harness_dir / "prompts"

    def load_prompt(self, name: str) -> Optional[str]:
        """Load a prompt file by name (without .md extension)."""
        prompt_path = self.prompts_dir / f"{name}.md"
        if prompt_path.exists():
            return prompt_path.read_text(encoding="utf-8")
        return None

    def list_prompts(self) -> List[str]:
        """List available prompt names."""
        if not self.prompts_dir.exists():
            return []
        return [p.stem for p in self.prompts_dir.glob("*.md") if p.stem != "README"]


# ═══════════════════════════════════════════════════════════════════════════════
# Global Instance
# ═══════════════════════════════════════════════════════════════════════════════

_store: Optional[HarnessStore] = None


def get_harness_store() -> HarnessStore:
    """Get the global harness store instance."""
    global _store
    if _store is None:
        _store = HarnessStore()
    return _store
