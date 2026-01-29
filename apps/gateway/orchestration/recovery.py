"""RecoveryManager - Task state management, rollback, and PAUSE/RESUME.

Provides:
- PAUSE/RESUME for tasks and individual subtasks
- Rollback to previous state (checkpoint-based)
- Error recovery with retry logic
- Graceful shutdown handling

Usage:
    manager = RecoveryManager()
    
    # Pause a task (stops new subtask assignments)
    manager.pause_task(task_id, reason="User requested pause")
    
    # Resume a paused task
    manager.resume_task(task_id)
    
    # Rollback a failed subtask
    manager.rollback_subtask(task_id, subtask_id)
    
    # Create checkpoint before risky operation
    checkpoint_id = manager.create_checkpoint(task_id)
    
    # Restore from checkpoint if needed
    manager.restore_checkpoint(task_id, checkpoint_id)
"""

from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from enum import Enum

from pydantic import BaseModel, Field

from .models import Task, TaskStatus, SubTask
from .storage import get_storage, TaskStorage


class PauseReason(str, Enum):
    """Reasons for pausing a task."""
    USER_REQUEST = "user_request"
    ERROR_THRESHOLD = "error_threshold"
    RATE_LIMIT = "rate_limit"
    MANUAL_REVIEW = "manual_review"
    DEPENDENCY_BLOCKED = "dependency_blocked"
    SYSTEM_MAINTENANCE = "system_maintenance"


class Checkpoint(BaseModel):
    """A saved state checkpoint for rollback."""
    checkpoint_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:16])
    task_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = "system"
    reason: str = ""
    task_snapshot: Dict[str, Any]  # Serialized Task
    agent_states: Dict[str, Any] = Field(default_factory=dict)  # agent_id -> state
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class PauseState(BaseModel):
    """State for a paused task."""
    task_id: str
    paused_at: datetime = Field(default_factory=datetime.utcnow)
    paused_by: str = "system"
    reason: PauseReason = PauseReason.USER_REQUEST
    message: str = ""
    affected_subtasks: List[str] = Field(default_factory=list)  # Subtask IDs that were in-progress
    resume_condition: Optional[str] = None  # Optional condition for auto-resume
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class RecoveryManager:
    """Manages task recovery, pause/resume, and checkpoints.
    
    Features:
    - Pause/Resume tasks (stops new assignments, can interrupt in-progress)
    - Checkpoints for rollback (save task state before risky operations)
    - Error recovery with configurable retry logic
    - Graceful shutdown (pause all, save state)
    """
    
    DEFAULT_CHECKPOINT_DIR = "ai/checkpoints"
    MAX_CHECKPOINTS_PER_TASK = 5
    MAX_RETRY_ATTEMPTS = 3
    
    def __init__(
        self,
        storage: Optional[TaskStorage] = None,
        checkpoint_dir: Optional[str] = None,
    ):
        """Initialize recovery manager.
        
        Args:
            storage: Task storage (uses singleton if not provided)
            checkpoint_dir: Directory for checkpoint files
        """
        self._storage = storage or get_storage()
        self._checkpoint_dir = Path(checkpoint_dir or self.DEFAULT_CHECKPOINT_DIR)
        self._checkpoint_dir.mkdir(parents=True, exist_ok=True)
        
        # In-memory tracking
        self._paused_tasks: Dict[str, PauseState] = {}
        self._retry_counts: Dict[str, int] = {}  # subtask_id -> retry count
        
        # Load existing pause states
        self._load_pause_states()
    
    # =========================================================================
    # PAUSE / RESUME
    # =========================================================================
    
    def pause_task(
        self,
        task_id: str,
        reason: PauseReason = PauseReason.USER_REQUEST,
        message: str = "",
        paused_by: str = "system",
    ) -> Tuple[bool, str]:
        """Pause a task and its subtasks.
        
        Pausing:
        - Prevents new subtask assignments
        - Marks in-progress subtasks as needing attention
        - Does NOT forcefully stop running agents
        
        Args:
            task_id: Task to pause
            reason: Why the task is being paused
            message: Human-readable message
            paused_by: Who initiated the pause
            
        Returns:
            Tuple of (success, message)
        """
        task = self._storage.get(task_id)
        if not task:
            return False, f"Task {task_id} not found"
        
        if task_id in self._paused_tasks:
            return False, f"Task {task_id} is already paused"
        
        if task.status in (TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.FAILED):
            return False, f"Cannot pause task in {task.status.value} state"
        
        # Find subtasks that are currently in-progress
        affected = [
            st.subtask_id for st in task.subtasks 
            if st.status == TaskStatus.IN_PROGRESS
        ]
        
        # Create pause state
        pause_state = PauseState(
            task_id=task_id,
            paused_by=paused_by,
            reason=reason,
            message=message,
            affected_subtasks=affected,
        )
        
        self._paused_tasks[task_id] = pause_state
        self._save_pause_states()
        
        # Update task metadata to indicate paused
        task.metadata["paused"] = True
        task.metadata["paused_at"] = datetime.utcnow().isoformat()
        task.metadata["pause_reason"] = reason.value
        self._storage.save(task)
        
        return True, f"Task {task_id} paused. {len(affected)} subtasks affected."
    
    def resume_task(
        self,
        task_id: str,
        resumed_by: str = "system",
    ) -> Tuple[bool, str]:
        """Resume a paused task.
        
        Args:
            task_id: Task to resume
            resumed_by: Who initiated the resume
            
        Returns:
            Tuple of (success, message)
        """
        if task_id not in self._paused_tasks:
            return False, f"Task {task_id} is not paused"
        
        task = self._storage.get(task_id)
        if not task:
            return False, f"Task {task_id} not found"
        
        pause_state = self._paused_tasks.pop(task_id)
        self._save_pause_states()
        
        # Clear pause metadata
        task.metadata.pop("paused", None)
        task.metadata.pop("paused_at", None)
        task.metadata.pop("pause_reason", None)
        task.metadata["resumed_at"] = datetime.utcnow().isoformat()
        task.metadata["resumed_by"] = resumed_by
        self._storage.save(task)
        
        affected_count = len(pause_state.affected_subtasks)
        return True, f"Task {task_id} resumed. {affected_count} subtasks can continue."
    
    def is_task_paused(self, task_id: str) -> bool:
        """Check if a task is paused."""
        return task_id in self._paused_tasks
    
    def get_pause_state(self, task_id: str) -> Optional[PauseState]:
        """Get pause state for a task."""
        return self._paused_tasks.get(task_id)
    
    def list_paused_tasks(self) -> List[PauseState]:
        """List all paused tasks."""
        return list(self._paused_tasks.values())
    
    def pause_all(
        self,
        reason: PauseReason = PauseReason.SYSTEM_MAINTENANCE,
        message: str = "System maintenance",
    ) -> int:
        """Pause all active tasks.
        
        Used for graceful shutdown or system maintenance.
        
        Returns:
            Number of tasks paused
        """
        count = 0
        active_tasks = self._storage.get_active_tasks()
        
        for task in active_tasks:
            success, _ = self.pause_task(
                task.task_id,
                reason=reason,
                message=message,
            )
            if success:
                count += 1
        
        return count
    
    def resume_all(self) -> int:
        """Resume all paused tasks.
        
        Returns:
            Number of tasks resumed
        """
        count = 0
        task_ids = list(self._paused_tasks.keys())
        
        for task_id in task_ids:
            success, _ = self.resume_task(task_id)
            if success:
                count += 1
        
        return count
    
    # =========================================================================
    # CHECKPOINTS / ROLLBACK
    # =========================================================================
    
    def create_checkpoint(
        self,
        task_id: str,
        reason: str = "",
        created_by: str = "system",
        include_agent_states: bool = True,
    ) -> Tuple[bool, str, Optional[str]]:
        """Create a checkpoint for a task.
        
        Checkpoints save the current state so it can be restored later.
        
        Args:
            task_id: Task to checkpoint
            reason: Why the checkpoint is being created
            created_by: Who initiated the checkpoint
            include_agent_states: Whether to include agent state files
            
        Returns:
            Tuple of (success, message, checkpoint_id)
        """
        task = self._storage.get(task_id)
        if not task:
            return False, f"Task {task_id} not found", None
        
        # Serialize task state
        task_snapshot = task.model_dump()
        
        # Collect agent states if requested
        agent_states = {}
        if include_agent_states:
            # Look for agent_state.json files
            state_dir = Path("ai")
            if state_dir.exists():
                for state_file in state_dir.glob("**/agent_state.json"):
                    try:
                        with open(state_file, "r", encoding="utf-8") as f:
                            agent_state = json.load(f)
                            if agent_state.get("current_task_id") == task_id:
                                agent_id = agent_state.get("agent_id", "unknown")
                                agent_states[agent_id] = agent_state
                    except (json.JSONDecodeError, IOError):
                        pass
        
        # Create checkpoint
        checkpoint = Checkpoint(
            task_id=task_id,
            created_by=created_by,
            reason=reason,
            task_snapshot=task_snapshot,
            agent_states=agent_states,
        )
        
        # Save checkpoint
        checkpoint_path = self._get_checkpoint_path(task_id, checkpoint.checkpoint_id)
        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(checkpoint_path, "w", encoding="utf-8") as f:
            json.dump(checkpoint.model_dump(), f, indent=2, default=str)
        
        # Cleanup old checkpoints
        self._cleanup_old_checkpoints(task_id)
        
        return True, f"Checkpoint created: {checkpoint.checkpoint_id}", checkpoint.checkpoint_id
    
    def list_checkpoints(self, task_id: str) -> List[Checkpoint]:
        """List all checkpoints for a task."""
        checkpoints = []
        task_dir = self._checkpoint_dir / task_id
        
        if not task_dir.exists():
            return []
        
        for cp_file in task_dir.glob("*.json"):
            try:
                with open(cp_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Parse datetime
                    if data.get("created_at"):
                        data["created_at"] = datetime.fromisoformat(data["created_at"])
                    checkpoints.append(Checkpoint(**data))
            except (json.JSONDecodeError, IOError):
                pass
        
        # Sort by created_at desc
        checkpoints.sort(key=lambda c: c.created_at, reverse=True)
        return checkpoints
    
    def restore_checkpoint(
        self,
        task_id: str,
        checkpoint_id: str,
        restore_agent_states: bool = True,
    ) -> Tuple[bool, str]:
        """Restore a task from a checkpoint.
        
        Args:
            task_id: Task to restore
            checkpoint_id: Checkpoint to restore from
            restore_agent_states: Whether to restore agent state files
            
        Returns:
            Tuple of (success, message)
        """
        checkpoint_path = self._get_checkpoint_path(task_id, checkpoint_id)
        
        if not checkpoint_path.exists():
            return False, f"Checkpoint {checkpoint_id} not found"
        
        try:
            with open(checkpoint_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Parse datetime fields in snapshot
            snapshot = data["task_snapshot"]
            for field in ["created_at", "started_at", "completed_at"]:
                if snapshot.get(field):
                    snapshot[field] = datetime.fromisoformat(snapshot[field])
            
            for st in snapshot.get("subtasks", []):
                for field in ["created_at", "started_at", "completed_at"]:
                    if st.get(field):
                        st[field] = datetime.fromisoformat(st[field])
            
            # Restore task
            restored_task = Task(**snapshot)
            self._storage.save(restored_task)
            
            # Restore agent states if requested
            restored_agents = 0
            if restore_agent_states and data.get("agent_states"):
                for agent_id, agent_state in data["agent_states"].items():
                    state_path = Path("ai/agent_state.json")  # Simplified - one state file
                    state_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(state_path, "w", encoding="utf-8") as f:
                        json.dump(agent_state, f, indent=2)
                    restored_agents += 1
            
            return True, f"Restored from checkpoint {checkpoint_id}. {restored_agents} agent states restored."
            
        except Exception as e:
            return False, f"Failed to restore checkpoint: {e}"
    
    def delete_checkpoint(self, task_id: str, checkpoint_id: str) -> bool:
        """Delete a specific checkpoint."""
        checkpoint_path = self._get_checkpoint_path(task_id, checkpoint_id)
        if checkpoint_path.exists():
            checkpoint_path.unlink()
            return True
        return False
    
    # =========================================================================
    # ERROR RECOVERY / RETRY
    # =========================================================================
    
    def should_retry(self, subtask_id: str) -> bool:
        """Check if a subtask should be retried.
        
        Returns:
            True if retry count is below threshold
        """
        return self._retry_counts.get(subtask_id, 0) < self.MAX_RETRY_ATTEMPTS
    
    def record_retry(self, subtask_id: str) -> int:
        """Record a retry attempt.
        
        Returns:
            Current retry count
        """
        self._retry_counts[subtask_id] = self._retry_counts.get(subtask_id, 0) + 1
        return self._retry_counts[subtask_id]
    
    def reset_retry_count(self, subtask_id: str) -> None:
        """Reset retry count for a subtask (e.g., after success)."""
        self._retry_counts.pop(subtask_id, None)
    
    def get_retry_count(self, subtask_id: str) -> int:
        """Get current retry count for a subtask."""
        return self._retry_counts.get(subtask_id, 0)
    
    # =========================================================================
    # RALPH WIGGUM: ITERATION ARCHIVE
    # =========================================================================
    
    def archive_iteration_history(
        self,
        task_id: str,
        subtask_id: str,
    ) -> Tuple[bool, str]:
        """Archive iteration history from a completed subtask.
        
        Moves iteration_history from the subtask to a checkpoint file,
        keeping tasks.json lean for active work.
        
        Called automatically when a subtask completes (DONE or exhausted budget).
        
        Args:
            task_id: Parent task ID
            subtask_id: Subtask whose history to archive
            
        Returns:
            Tuple of (success, message)
        """
        task = self._storage.get(task_id)
        if not task:
            return False, f"Task {task_id} not found"
        
        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                if not st.iteration_history:
                    return False, "No iteration history to archive"
                
                # Create archive file
                archive_dir = self._checkpoint_dir / task_id / "iterations"
                archive_dir.mkdir(parents=True, exist_ok=True)
                
                archive_path = archive_dir / f"{subtask_id}.json"
                
                archive_data = {
                    "subtask_id": subtask_id,
                    "title": st.title,
                    "final_status": st.status.value,
                    "total_iterations": st.current_iteration,
                    "max_iterations": st.max_iterations,
                    "complexity_score": st.complexity_score,
                    "context_tokens_total": st.context_tokens_total,
                    "last_promise": st.last_promise.value if st.last_promise else None,
                    "archived_at": datetime.utcnow().isoformat(),
                    "iteration_history": [
                        {
                            "iteration_num": rec.iteration_num,
                            "started_at": rec.started_at.isoformat() if rec.started_at else None,
                            "ended_at": rec.ended_at.isoformat() if rec.ended_at else None,
                            "duration_sec": rec.duration_sec,
                            "agent_id": rec.agent_id,
                            "context_tokens_used": rec.context_tokens_used,
                            "promise": rec.promise.value if rec.promise else None,
                            "promise_detail": rec.promise_detail,
                            "error": rec.error,
                            "approach_tried": rec.approach_tried,
                            "leader_hint": rec.leader_hint,
                        }
                        for rec in st.iteration_history
                    ],
                }
                
                with open(archive_path, "w", encoding="utf-8") as f:
                    json.dump(archive_data, f, indent=2)
                
                # Clear iteration history from active subtask (keep summary)
                iterations_count = len(st.iteration_history)
                st.iteration_history = []  # Clear to save space in tasks.json
                
                self._storage.save(task)
                
                return True, f"Archived {iterations_count} iterations to {archive_path}"
        
        return False, f"Subtask {subtask_id} not found"
    
    def get_iteration_archive(
        self,
        task_id: str,
        subtask_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Retrieve archived iteration history.
        
        Args:
            task_id: Parent task ID
            subtask_id: Subtask to retrieve
            
        Returns:
            Archived iteration data or None
        """
        archive_path = self._checkpoint_dir / task_id / "iterations" / f"{subtask_id}.json"
        
        if not archive_path.exists():
            return None
        
        try:
            with open(archive_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None
    
    def list_iteration_archives(self, task_id: str) -> List[Dict[str, Any]]:
        """List all archived iteration histories for a task.
        
        Args:
            task_id: Task to query
            
        Returns:
            List of archive summaries (without full history)
        """
        archive_dir = self._checkpoint_dir / task_id / "iterations"
        
        if not archive_dir.exists():
            return []
        
        archives = []
        for archive_file in archive_dir.glob("*.json"):
            try:
                with open(archive_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Return summary without full iteration_history
                    archives.append({
                        "subtask_id": data.get("subtask_id"),
                        "title": data.get("title"),
                        "final_status": data.get("final_status"),
                        "total_iterations": data.get("total_iterations"),
                        "max_iterations": data.get("max_iterations"),
                        "archived_at": data.get("archived_at"),
                    })
            except (json.JSONDecodeError, IOError):
                pass
        
        return archives
    
    def get_iteration_postmortem(self, task_id: str) -> Dict[str, Any]:
        """Generate a postmortem report of iteration patterns.
        
        Useful for learning from completed tasks - what approaches worked,
        what failed, how much context was used, etc.
        
        Args:
            task_id: Task to analyze
            
        Returns:
            Postmortem report dict
        """
        task = self._storage.get(task_id)
        archives = self.list_iteration_archives(task_id)
        
        report = {
            "task_id": task_id,
            "task_title": task.title if task else "Unknown",
            "total_subtasks": len(task.subtasks) if task else 0,
            "archived_subtasks": len(archives),
            "total_iterations_used": task.total_iterations_used if task else 0,
            "total_iteration_budget": task.total_iteration_budget if task else 0,
            "efficiency_pct": 0,
            "subtask_summaries": archives,
            "common_errors": [],
            "successful_approaches": [],
        }
        
        if task and task.total_iteration_budget > 0:
            report["efficiency_pct"] = round(
                (task.total_iterations_used / task.total_iteration_budget) * 100, 1
            )
        
        # Analyze patterns from archives
        all_errors = []
        all_approaches = []
        
        for archive_file in (self._checkpoint_dir / task_id / "iterations").glob("*.json"):
            try:
                with open(archive_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for rec in data.get("iteration_history", []):
                        if rec.get("error"):
                            all_errors.append(rec["error"])
                        if rec.get("approach_tried") and rec.get("promise") == "DONE":
                            all_approaches.append(rec["approach_tried"])
            except (json.JSONDecodeError, IOError):
                pass
        
        # Count common errors
        from collections import Counter
        error_counts = Counter(all_errors)
        report["common_errors"] = [
            {"error": err, "count": cnt}
            for err, cnt in error_counts.most_common(5)
        ]
        
        # Successful approaches
        report["successful_approaches"] = list(set(all_approaches))[:10]
        
        return report

    def rollback_subtask(
        self,
        task_id: str,
        subtask_id: str,
        reason: str = "Error recovery",
    ) -> Tuple[bool, str]:
        """Rollback a failed subtask to pending state.
        
        This allows the subtask to be re-claimed and retried.
        
        Args:
            task_id: Parent task ID
            subtask_id: Subtask to rollback
            reason: Why rolling back
            
        Returns:
            Tuple of (success, message)
        """
        task = self._storage.get(task_id)
        if not task:
            return False, f"Task {task_id} not found"
        
        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                if st.status == TaskStatus.COMPLETED:
                    return False, "Cannot rollback completed subtask"
                
                # Reset subtask state
                old_status = st.status
                st.status = TaskStatus.PENDING
                st.assigned_to = None
                st.started_at = None
                st.result = None
                
                # Track rollback in metadata
                if "rollbacks" not in task.metadata:
                    task.metadata["rollbacks"] = []
                task.metadata["rollbacks"].append({
                    "subtask_id": subtask_id,
                    "from_status": old_status.value,
                    "reason": reason,
                    "timestamp": datetime.utcnow().isoformat(),
                })
                
                self._storage.save(task)
                return True, f"Subtask {subtask_id} rolled back from {old_status.value} to pending"
        
        return False, f"Subtask {subtask_id} not found"
    
    # =========================================================================
    # GRACEFUL SHUTDOWN
    # =========================================================================
    
    def prepare_shutdown(self) -> Dict[str, Any]:
        """Prepare for graceful shutdown.
        
        - Pauses all active tasks
        - Creates checkpoints for in-progress work
        - Saves all state to disk
        
        Returns:
            Summary of shutdown preparation
        """
        summary = {
            "paused_tasks": 0,
            "checkpoints_created": 0,
            "errors": [],
        }
        
        # Pause all active tasks
        summary["paused_tasks"] = self.pause_all(
            reason=PauseReason.SYSTEM_MAINTENANCE,
            message="Graceful shutdown",
        )
        
        # Create checkpoints for active tasks
        active_tasks = self._storage.get_active_tasks()
        for task in active_tasks:
            success, _, _ = self.create_checkpoint(
                task.task_id,
                reason="Shutdown checkpoint",
            )
            if success:
                summary["checkpoints_created"] += 1
            else:
                summary["errors"].append(f"Failed to checkpoint {task.task_id}")
        
        # Save pause states
        self._save_pause_states()
        
        return summary
    
    def recover_from_shutdown(self) -> Dict[str, Any]:
        """Recover from a shutdown.
        
        - Loads pause states
        - Optionally resumes tasks that were paused for shutdown
        
        Returns:
            Summary of recovery
        """
        summary = {
            "paused_tasks_found": len(self._paused_tasks),
            "auto_resumed": 0,
        }
        
        # Auto-resume tasks that were paused for system maintenance
        for task_id, pause_state in list(self._paused_tasks.items()):
            if pause_state.reason == PauseReason.SYSTEM_MAINTENANCE:
                success, _ = self.resume_task(task_id, resumed_by="system_recovery")
                if success:
                    summary["auto_resumed"] += 1
        
        return summary
    
    # =========================================================================
    # INTERNAL HELPERS
    # =========================================================================
    
    def _get_checkpoint_path(self, task_id: str, checkpoint_id: str) -> Path:
        """Get path for a checkpoint file."""
        return self._checkpoint_dir / task_id / f"{checkpoint_id}.json"
    
    def _cleanup_old_checkpoints(self, task_id: str) -> int:
        """Remove old checkpoints beyond the max limit.
        
        Returns:
            Number of checkpoints removed
        """
        checkpoints = self.list_checkpoints(task_id)
        removed = 0
        
        if len(checkpoints) > self.MAX_CHECKPOINTS_PER_TASK:
            # Remove oldest checkpoints
            for cp in checkpoints[self.MAX_CHECKPOINTS_PER_TASK:]:
                self.delete_checkpoint(task_id, cp.checkpoint_id)
                removed += 1
        
        return removed
    
    def _save_pause_states(self) -> None:
        """Persist pause states to disk."""
        pause_file = self._checkpoint_dir / "pause_states.json"
        
        data = {
            task_id: ps.model_dump()
            for task_id, ps in self._paused_tasks.items()
        }
        
        with open(pause_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
    
    def _load_pause_states(self) -> None:
        """Load pause states from disk."""
        pause_file = self._checkpoint_dir / "pause_states.json"
        
        if not pause_file.exists():
            return
        
        try:
            with open(pause_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            for task_id, ps_data in data.items():
                if ps_data.get("paused_at"):
                    ps_data["paused_at"] = datetime.fromisoformat(ps_data["paused_at"])
                self._paused_tasks[task_id] = PauseState(**ps_data)
        except (json.JSONDecodeError, IOError):
            pass
    
    def get_stats(self) -> Dict[str, Any]:
        """Get recovery manager statistics."""
        return {
            "paused_tasks": len(self._paused_tasks),
            "retry_tracking": len(self._retry_counts),
            "checkpoint_dir": str(self._checkpoint_dir),
            "max_checkpoints_per_task": self.MAX_CHECKPOINTS_PER_TASK,
            "max_retry_attempts": self.MAX_RETRY_ATTEMPTS,
        }


# Singleton instance
_recovery_manager: Optional[RecoveryManager] = None


def get_recovery_manager() -> RecoveryManager:
    """Get the singleton recovery manager instance."""
    global _recovery_manager
    if _recovery_manager is None:
        _recovery_manager = RecoveryManager()
    return _recovery_manager
