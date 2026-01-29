"""
Screenshot Evidence Reference Generator

Creates compact text references to screenshot evidence instead of embedding full images.
Used in leader hints and dashboards to maintain context budget.

Part of Phase 0 Tier 1.2 - Audit Trail Framework (Task 3)
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class ScreenshotReferenceGenerator:
    """Generate compact references to screenshot evidence."""

    def create_screenshot_reference(
        self, task_id: str, escalation_id: str, evidence: Dict[str, Any]
    ) -> str:
        """
        Create compact text reference to screenshot (not embedding image).

        Args:
            task_id: Task ID (e.g., "T042")
            escalation_id: Escalation event ID
            evidence: Evidence pack data containing promise, classification, etc.

        Returns:
            Compact reference string suitable for embedding in prompts
            Examples:
            - "[T042_esc001: code_issue in TerminalGrid.tsx (ImportError visible)]"
            - "[T042_esc001: ui_issue - Button not visible at (320, 180)]"
            - "[T042_esc001: unknown error - See ai/evidence/T042/escalation_001/]"
        """

        ref_id = f"{task_id}_esc{escalation_id}"

        # Extract classification and error info
        classification = evidence.get("metadata", {}).get("classification", {})
        error_type = classification.get("type", "unknown")
        confidence = classification.get("confidence", 0.0)

        promise = evidence.get("evidence", {}).get("promise", "UNKNOWN")
        detail = evidence.get("evidence", {}).get("promise_detail", "")

        # Build reference based on error type
        if error_type == "code_issue":
            # For code issues: include filename and brief error
            filename = "unknown"
            line_number = ""

            # Try to extract filename and line from detail
            if ":" in detail:
                parts = detail.split(":")
                if "." in parts[0]:
                    filename = parts[0].split("/")[-1]  # Get just filename, not full path
                if len(parts) > 1 and parts[1].isdigit():
                    line_number = f":{parts[1]}"

            # Truncate error message
            error_snippet = detail[:45] if detail else promise
            ref = f"[{ref_id}: code_issue in {filename}{line_number} ({error_snippet})]"

        elif error_type == "ui_issue":
            # For UI issues: include key clues about visibility/positioning
            error_snippet = detail[:60] if detail else promise
            ref = f"[{ref_id}: ui_issue - {error_snippet}]"

        else:
            # For unknown: point to evidence directory
            ref = f"[{ref_id}: unknown - See ai/evidence/{task_id}/escalation_{escalation_id}/]"

        # Add confidence warning if low
        if confidence < 0.7 and confidence > 0:
            ref += f" (confidence: {confidence:.0%})"

        return ref

    def create_short_reference(self, task_id: str, escalation_id: str, error_type: str) -> str:
        """
        Create ultra-short reference for dashboards.

        Args:
            task_id: Task ID
            escalation_id: Escalation ID
            error_type: Error type (code_issue, ui_issue, unknown)

        Returns:
            Short reference (e.g., "T042_esc001: code_issue")
        """
        return f"{task_id}_esc{escalation_id}: {error_type}"


# Global instance
_generator = None


def get_reference_generator() -> ScreenshotReferenceGenerator:
    """Get or create global reference generator."""
    global _generator
    if _generator is None:
        _generator = ScreenshotReferenceGenerator()
    return _generator


def create_screenshot_reference(task_id: str, escalation_id: str, evidence: Dict[str, Any]) -> str:
    """
    Create evidence reference (convenience function).

    Args:
        task_id: Task ID
        escalation_id: Escalation event ID
        evidence: Evidence pack data

    Returns:
        Reference string
    """
    generator = get_reference_generator()
    return generator.create_screenshot_reference(task_id, escalation_id, evidence)


def create_short_reference(task_id: str, escalation_id: str, error_type: str) -> str:
    """
    Create short reference (convenience function).

    Args:
        task_id: Task ID
        escalation_id: Escalation ID
        error_type: Error type

    Returns:
        Short reference
    """
    generator = get_reference_generator()
    return generator.create_short_reference(task_id, escalation_id, error_type)
