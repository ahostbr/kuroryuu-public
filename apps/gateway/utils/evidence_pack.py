"""
Evidence Pack Generation Utility

Generates and stores evidence packs for leader interventions.
Part of Phase 0 Tier 1.2 - Audit Trail Framework
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional
import uuid


class EvidencePackGenerator:
    """Generate and store evidence packs for escalation events."""

    EVIDENCE_ROOT = Path(__file__).parent.parent.parent / "evidence"

    def __init__(self):
        self.EVIDENCE_ROOT.mkdir(parents=True, exist_ok=True)

    def generate_escalation_id(self) -> str:
        """Generate unique escalation ID."""
        return f"{int(datetime.utcnow().timestamp() * 1000):x}"[:12]

    def create_evidence_directory(self, task_id: str, escalation_id: str) -> Path:
        """Create directory structure for evidence pack."""
        evidence_dir = self.EVIDENCE_ROOT / task_id / f"escalation_{escalation_id}"
        evidence_dir.mkdir(parents=True, exist_ok=True)
        return evidence_dir

    def save_evidence_pack(
        self,
        task_id: str,
        subtask_id: str,
        escalation_id: str,
        event_type: str,
        promise: Optional[str] = None,
        promise_detail: Optional[str] = None,
        iteration: int = 0,
        screenshot_path: Optional[str] = None,
        pty_snapshot: Optional[str] = None,
        classification: Optional[Dict[str, Any]] = None,
        reference: Optional[str] = None,
        additional_data: Optional[Dict[str, Any]] = None,
        auto_classify: bool = True,
    ) -> Dict[str, Any]:
        """
        Save an evidence pack for escalation event.

        Args:
            task_id: Task ID (e.g., "T042")
            subtask_id: Subtask ID
            escalation_id: Escalation event ID
            event_type: Type of escalation (promise_detection|silent_worker|context_pressure|escalation_bump|budget_exhaustion)
            promise: Promise type (STUCK, BLOCKED, etc.)
            promise_detail: Error message or details
            iteration: Current iteration number
            screenshot_path: Path to screenshot if captured
            pty_snapshot: PTY output at capture time
            classification: Classification result from classifier (optional, added later)
            reference: Evidence reference string (optional, added later)
            additional_data: Additional metadata

        Returns:
            Evidence pack dict
        """

        evidence_dir = self.create_evidence_directory(task_id, escalation_id)

        # Auto-classify error if not provided and we have promise_detail
        if auto_classify and not classification and promise_detail:
            try:
                from .screenshot_classifier import classify_error

                classification = classify_error(promise_detail, screenshot_path)
            except Exception as e:
                pass  # Silently skip classification if error

        # Auto-generate reference if classification exists
        if not reference and classification:
            try:
                from .screenshot_ref import create_screenshot_reference as gen_ref

                reference = gen_ref(task_id, escalation_id, {"evidence": {"promise": promise, "promise_detail": promise_detail}, "metadata": {"classification": classification}})
            except Exception as e:
                pass  # Silently skip reference generation if error

        evidence_pack = {
            "version": 1,
            "task_id": task_id,
            "subtask_id": subtask_id,
            "escalation_id": escalation_id,
            "triggered_at": datetime.utcnow().isoformat() + "Z",
            "escalation_level": additional_data.get("escalation_level", 1) if additional_data else 1,
            "event_type": event_type,
            "evidence": {
                "promise": promise,
                "promise_detail": promise_detail,
                "iteration": iteration,
                "screenshot_path": screenshot_path,
                "pty_snapshot": pty_snapshot,
            },
            "metadata": {
                "worker_id": additional_data.get("worker_id") if additional_data else None,
                "session_id": additional_data.get("session_id") if additional_data else None,
                "classification": classification or None,
                "reference": reference or None,
            },
        }

        # Add any additional fields
        if additional_data:
            for key, value in additional_data.items():
                if key not in ("worker_id", "session_id", "escalation_level"):
                    evidence_pack["evidence"][key] = value

        # Save evidence pack JSON
        pack_path = evidence_dir / "evidence.json"
        pack_path.write_text(json.dumps(evidence_pack, indent=2))

        # Update or create index
        self._update_index(task_id, escalation_id, evidence_pack)

        return evidence_pack

    def _update_index(self, task_id: str, escalation_id: str, evidence_pack: Dict[str, Any]) -> None:
        """Update the evidence index (JSONL format)."""
        index_path = self.EVIDENCE_ROOT / "index.jsonl"

        index_entry = {
            "ref_id": f"{task_id}_esc{escalation_id}",
            "task_id": task_id,
            "escalation_id": escalation_id,
            "timestamp": evidence_pack["triggered_at"],
            "event_type": evidence_pack["event_type"],
            "promise": evidence_pack["evidence"].get("promise"),
            "screenshot": evidence_pack["evidence"].get("screenshot_path"),
            "classification": evidence_pack["metadata"].get("classification"),
        }

        # Append to index
        with open(index_path, "a") as f:
            f.write(json.dumps(index_entry) + "\n")


# Global instance
_generator = None


def get_evidence_generator() -> EvidencePackGenerator:
    """Get or create global evidence pack generator."""
    global _generator
    if _generator is None:
        _generator = EvidencePackGenerator()
    return _generator


def save_escalation_evidence(
    task_id: str,
    subtask_id: str,
    event_type: str,
    promise: Optional[str] = None,
    promise_detail: Optional[str] = None,
    iteration: int = 0,
    screenshot_path: Optional[str] = None,
    pty_snapshot: Optional[str] = None,
    additional_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Convenience function to save escalation evidence.

    Used by hook points to auto-generate evidence packs.
    """
    generator = get_evidence_generator()
    escalation_id = generator.generate_escalation_id()

    return generator.save_evidence_pack(
        task_id=task_id,
        subtask_id=subtask_id,
        escalation_id=escalation_id,
        event_type=event_type,
        promise=promise,
        promise_detail=promise_detail,
        iteration=iteration,
        screenshot_path=screenshot_path,
        pty_snapshot=pty_snapshot,
        additional_data=additional_data,
    )
