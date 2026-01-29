"""
Silent Worker Monitoring

Detects workers that have been silent for 5+ minutes and triggers Level 1 OBSERVE escalation.
Part of Phase 0 Tier 1.2 - Audit Trail Framework

This is a background task that should be run periodically (e.g., every 30-60 seconds).
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class SilentWorkerMonitor:
    """Monitor for workers that have been silent for extended periods."""

    SILENCE_THRESHOLD_SECONDS = 300  # 5 minutes
    CHECK_INTERVAL_SECONDS = 30  # Check every 30 seconds

    def __init__(self, storage=None):
        """
        Initialize silent worker monitor.

        Args:
            storage: Storage instance for accessing tasks
        """
        self.storage = storage
        self.last_heartbeat_cache = {}  # Track last known heartbeat per subtask

    def get_task_manager(self):
        """Get task manager from storage."""
        if self.storage is None:
            from .task_manager import TaskManager

            self.storage = TaskManager()
        return self.storage

    async def monitor_silently(self):
        """
        Background monitoring loop for silent workers.

        This should be run as a background task in the gateway.
        """
        while True:
            try:
                silent_subtasks = self.detect_silent_workers()
                if silent_subtasks:
                    await self.process_silent_workers(silent_subtasks)
            except Exception as e:
                logger.error(f"Error in silent worker monitoring: {e}")

            # Wait before next check
            await asyncio.sleep(self.CHECK_INTERVAL_SECONDS)

    def detect_silent_workers(self) -> List[Dict[str, Any]]:
        """
        Detect workers that have been silent for 5+ minutes.

        Returns:
            List of silent subtask records
        """
        silent_subtasks = []

        try:
            storage = self.get_task_manager()
            tasks = storage.get_all_active_tasks()

            now = datetime.utcnow()

            for task in tasks:
                for subtask in task.subtasks:
                    # Only check subtasks that are in progress and assigned
                    if subtask.status.value != "in_progress" or not subtask.assigned_to:
                        continue

                    # Get last heartbeat time
                    last_heartbeat = subtask.updated_at or subtask.created_at

                    if not last_heartbeat:
                        continue

                    silence_duration = now - last_heartbeat
                    silence_seconds = silence_duration.total_seconds()

                    # Check if silent beyond threshold
                    if silence_seconds > self.SILENCE_THRESHOLD_SECONDS:
                        silent_subtasks.append(
                            {
                                "task_id": task.task_id,
                                "subtask_id": subtask.subtask_id,
                                "assigned_to": subtask.assigned_to,
                                "silence_duration_sec": int(silence_seconds),
                                "last_heartbeat": last_heartbeat.isoformat(),
                                "current_iteration": subtask.current_iteration,
                                "escalation_level": subtask.escalation_level,
                            }
                        )

        except Exception as e:
            logger.error(f"Error detecting silent workers: {e}")

        return silent_subtasks

    async def process_silent_workers(self, silent_subtasks: List[Dict[str, Any]]):
        """
        Process detected silent workers by generating evidence packs.

        Args:
            silent_subtasks: List of silent subtask records
        """
        from ..utils.evidence_pack import save_escalation_evidence

        for subtask in silent_subtasks:
            try:
                save_escalation_evidence(
                    task_id=subtask["task_id"],
                    subtask_id=subtask["subtask_id"],
                    event_type="silent_worker",
                    iteration=subtask["current_iteration"],
                    additional_data={
                        "escalation_level": 1,  # Level 1 OBSERVE
                        "silence_duration_sec": subtask["silence_duration_sec"],
                        "last_heartbeat": subtask["last_heartbeat"],
                        "worker_id": subtask["assigned_to"],
                    },
                )
                logger.info(
                    f"Silent worker detected: {subtask['task_id']}/{subtask['subtask_id']} "
                    f"({subtask['silence_duration_sec']}s silent)"
                )

            except Exception as e:
                logger.error(f"Error processing silent worker {subtask['subtask_id']}: {e}")


# Global monitor instance
_monitor = None


def get_silent_worker_monitor(storage=None) -> SilentWorkerMonitor:
    """Get or create global silent worker monitor."""
    global _monitor
    if _monitor is None:
        _monitor = SilentWorkerMonitor(storage=storage)
    return _monitor


async def start_background_monitoring(storage=None):
    """
    Start the background silent worker monitoring task.

    This should be called once when the gateway starts.

    Args:
        storage: Storage instance for accessing tasks
    """
    monitor = get_silent_worker_monitor(storage=storage)
    logger.info("Starting silent worker monitoring task...")
    await monitor.monitor_silently()
