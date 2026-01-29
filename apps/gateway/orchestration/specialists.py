"""Specialist Agent Trigger System

Phase 3: Auto-triggers specialized agents based on task keywords.

Specialists are invoked automatically when task titles/descriptions
contain certain keywords. They run in parallel with workers and
provide focused analysis/generation.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)

# Path to specialists index
SPECIALISTS_INDEX = Path("ai/prompt_packs/specialists/index.json")


class SpecialistTrigger:
    """Detects and triggers specialist agents based on keywords."""

    def __init__(self):
        self._index: Optional[Dict[str, Any]] = None
        self._triggers: Dict[str, Dict[str, Any]] = {}
        self._load_index()

    def _load_index(self) -> None:
        """Load specialist index from file."""
        try:
            if SPECIALISTS_INDEX.exists():
                with open(SPECIALISTS_INDEX, "r", encoding="utf-8") as f:
                    self._index = json.load(f)
                    self._triggers = self._index.get("triggers", {})
                    logger.info(f"Loaded {len(self._triggers)} specialist triggers")
            else:
                logger.warning(f"Specialists index not found: {SPECIALISTS_INDEX}")
        except Exception as e:
            logger.error(f"Error loading specialists index: {e}")
            self._index = None
            self._triggers = {}

    def detect_specialists(
        self,
        title: str,
        description: str,
        file_paths: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Detect which specialists should be triggered for a task.

        Args:
            title: Task title
            description: Task description
            file_paths: Optional list of file paths involved

        Returns:
            List of specialist configs that should be triggered
        """
        if not self._triggers:
            return []

        text = f"{title} {description}".lower()
        triggered = []

        for specialist_id, trigger_config in self._triggers.items():
            if self._should_trigger(text, file_paths, trigger_config):
                # Get full specialist config
                pack = self._get_pack(specialist_id)
                if pack:
                    triggered.append({
                        "id": specialist_id,
                        "name": pack.get("name", specialist_id),
                        "file": pack.get("file"),
                        "priority": trigger_config.get("priority", "medium"),
                        "auto_invoke": trigger_config.get("auto_invoke", True),
                    })

        # Sort by priority
        priority_order = {"high": 0, "medium": 1, "low": 2}
        triggered.sort(key=lambda x: priority_order.get(x["priority"], 1))

        return triggered

    def _should_trigger(
        self,
        text: str,
        file_paths: Optional[List[str]],
        trigger_config: Dict[str, Any],
    ) -> bool:
        """Check if a specialist should be triggered.

        Args:
            text: Combined title + description text (lowercased)
            file_paths: List of file paths involved
            trigger_config: Trigger configuration

        Returns:
            True if specialist should be triggered
        """
        # Check keywords
        keywords = trigger_config.get("keywords", [])
        for keyword in keywords:
            if keyword.lower() in text:
                return True

        # Check file patterns (if file paths provided)
        if file_paths:
            import fnmatch
            patterns = trigger_config.get("file_patterns", [])
            for path in file_paths:
                for pattern in patterns:
                    if fnmatch.fnmatch(path, pattern):
                        return True

        return False

    def _get_pack(self, specialist_id: str) -> Optional[Dict[str, Any]]:
        """Get full pack configuration for a specialist."""
        if not self._index:
            return None

        for pack in self._index.get("packs", []):
            if pack.get("id") == specialist_id:
                return pack

        return None

    def get_specialist_prompt(self, specialist_id: str) -> Optional[str]:
        """Load the prompt file for a specialist.

        Args:
            specialist_id: Specialist ID

        Returns:
            Prompt content if found, None otherwise
        """
        pack = self._get_pack(specialist_id)
        if not pack:
            return None

        prompt_file = pack.get("file")
        if not prompt_file:
            return None

        prompt_path = Path("ai/prompt_packs/specialists") / prompt_file
        try:
            if prompt_path.exists():
                return prompt_path.read_text(encoding="utf-8")
        except Exception as e:
            logger.error(f"Error reading specialist prompt {prompt_path}: {e}")

        return None

    def get_tool_profile(self, specialist_id: str) -> Optional[Dict[str, Any]]:
        """Get the tool profile for a specialist.

        Args:
            specialist_id: Specialist ID

        Returns:
            Tool profile config if found, None otherwise
        """
        if not self._index:
            return None

        pack = self._get_pack(specialist_id)
        if not pack:
            return None

        profile_name = pack.get("tool_profile")
        if not profile_name:
            return None

        profiles = self._index.get("tool_profiles", {})
        return profiles.get(profile_name)


# Singleton instance
_specialist_trigger: Optional[SpecialistTrigger] = None


def get_specialist_trigger() -> SpecialistTrigger:
    """Get the global specialist trigger instance."""
    global _specialist_trigger
    if _specialist_trigger is None:
        _specialist_trigger = SpecialistTrigger()
    return _specialist_trigger


def detect_specialists_for_task(
    title: str,
    description: str,
    file_paths: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Convenience function to detect specialists for a task.

    Args:
        title: Task title
        description: Task description
        file_paths: Optional list of file paths involved

    Returns:
        List of specialist configs that should be triggered
    """
    return get_specialist_trigger().detect_specialists(title, description, file_paths)
