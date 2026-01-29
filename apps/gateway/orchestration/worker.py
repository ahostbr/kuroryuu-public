"""Worker Orchestrator - Polling and execution coordination.

M4 Multi-Agent Message Bus implementation.

Workers are responsible for:
1. Polling for available subtasks
2. Claiming and executing work
3. Reporting results back
4. Handling timeouts gracefully
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Tuple

from .models import (
    Task,
    TaskStatus,
    SubTask,
    IterationRecord,
    PromiseType,
)
from .storage import TaskStorage, get_storage
from .todo_md import TodoMdParser
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class WorkerConfig:
    """Configuration for a worker."""
    agent_id: str
    capabilities: List[str] = None
    max_concurrent: int = 1
    poll_interval: float = 2.0  # seconds
    
    def __post_init__(self):
        if self.capabilities is None:
            self.capabilities = []


class WorkerOrchestrator:
    """Orchestrates work polling and result reporting for workers.
    
    Workflow:
    1. Worker calls poll() to get available subtasks
    2. Worker claims a subtask via claim_subtask()
    3. Worker executes the work
    4. Worker reports via report_result()
    """
    
    def __init__(
        self,
        config: WorkerConfig,
        storage: Optional[TaskStorage] = None,
    ):
        """Initialize worker orchestrator.
        
        Args:
            config: Worker configuration
            storage: Storage backend (uses singleton if not provided)
        """
        self.config = config
        self._storage = storage or get_storage()
        self._current_subtask: Optional[str] = None
        self._current_task: Optional[str] = None
    
    @property
    def agent_id(self) -> str:
        """Get agent ID."""
        return self.config.agent_id
    
    def poll(self, max_tasks: int = 1) -> List[Tuple[Task, SubTask]]:
        """Poll for available subtasks.
        
        Returns subtasks that:
        - Are in PENDING status
        - Are not assigned to anyone
        - Match worker capabilities (if specified)
        
        Args:
            max_tasks: Maximum subtasks to return
            
        Returns:
            List of (Task, SubTask) tuples
        """
        available = self._storage.get_available_subtasks(limit=max_tasks * 2)
        
        # Filter by capabilities if specified
        if self.config.capabilities:
            filtered = []
            for task, subtask in available:
                # Check if task metadata has required capability
                required_caps = task.metadata.get("required_capabilities", [])
                if not required_caps or any(c in self.config.capabilities for c in required_caps):
                    filtered.append((task, subtask))
            available = filtered
        
        return available[:max_tasks]
    
    def claim_subtask(
        self,
        task_id: str,
        subtask_id: str,
    ) -> Tuple[bool, str, Optional[SubTask]]:
        """Claim a subtask for execution.
        
        Args:
            task_id: Parent task ID
            subtask_id: Subtask to claim
            
        Returns:
            Tuple of (success, message, subtask_if_success)
        """
        task = self._storage.get(task_id)
        
        if not task:
            return False, f"Task {task_id} not found", None
        
        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                if st.status != TaskStatus.PENDING:
                    return False, f"Subtask already {st.status.value}", None
                
                if st.assigned_to is not None:
                    return False, f"Subtask already assigned to {st.assigned_to}", None
                
                # Claim it
                st.assigned_to = self.agent_id
                st.status = TaskStatus.ASSIGNED
                st.started_at = datetime.utcnow()
                
                # Update task status
                if task.status == TaskStatus.ASSIGNED:
                    task.status = TaskStatus.IN_PROGRESS
                
                self._storage.save(task)
                
                # Track current work
                self._current_task = task_id
                self._current_subtask = subtask_id
                
                return True, f"Subtask claimed by {self.agent_id}", st
        
        return False, f"Subtask {subtask_id} not found", None
    
    def start_work(self, task_id: str, subtask_id: str) -> Tuple[bool, str, Optional[dict]]:
        """Mark subtask as actively being worked on and build execution context.

        Builds rich context for the worker including:
        - Subtask description (with any injected prompt content)
        - Prompt reference (if available)
        - Plan file reference (if available)
        - Metadata (if available)

        Args:
            task_id: Parent task ID
            subtask_id: Subtask to start

        Returns:
            Tuple of (success, message, context_dict)
            context_dict contains: description, prompt_ref, plan_file, metadata
        """
        task = self._storage.get(task_id)

        if not task:
            return False, f"Task {task_id} not found", None

        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                if st.assigned_to != self.agent_id:
                    return False, f"Subtask not assigned to {self.agent_id}", None

                if st.status != TaskStatus.ASSIGNED:
                    return False, f"Subtask in unexpected state: {st.status.value}", None

                st.status = TaskStatus.IN_PROGRESS
                self._storage.save(task)

                # Build execution context for worker
                context = {
                    "description": st.description,
                    "prompt_ref": st.prompt_ref,
                    "plan_file": st.plan_file,
                    "metadata": st.metadata,
                }

                return True, "Work started", context

        return False, f"Subtask {subtask_id} not found", None
    
    def report_result(
        self,
        task_id: str,
        subtask_id: str,
        success: bool,
        result: str = "",
        error: Optional[str] = None,
        context_tokens_used: int = 0,
        promise: Optional[PromiseType] = None,
        promise_detail: str = "",
        approach_tried: str = "",
    ) -> Tuple[bool, str, dict]:
        """Report completion of a subtask iteration.
        
        Ralph Wiggum iteration tracking:
        - Records each iteration attempt with context usage
        - Tracks completion promises (DONE, BLOCKED, STUCK, PROGRESS)
        - Returns iteration feedback (remaining budget, context alert, next action)
        
        Args:
            task_id: Parent task ID
            subtask_id: Completed subtask
            success: Whether work succeeded
            result: Result content or error message
            error: Explicit error message
            context_tokens_used: Tokens consumed this iteration
            promise: Completion signal (DONE, BLOCKED, STUCK, PROGRESS)
            promise_detail: Detail for promise (e.g., "80" for PROGRESS)
            approach_tried: What approach was attempted (for dedup)
            
        Returns:
            Tuple of (success, message, iteration_feedback)
            iteration_feedback: {iteration_num, iterations_remaining, context_alert, next_action}
        """
        task = self._storage.get(task_id)
        
        if not task:
            return False, f"Task {task_id} not found", {}
        
        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                if st.assigned_to != self.agent_id:
                    return False, f"Subtask not assigned to {self.agent_id}", {}
                
                # --- Ralph Wiggum: Record iteration ---
                st.current_iteration += 1
                iteration_record = IterationRecord(
                    iteration_num=st.current_iteration,
                    agent_id=self.agent_id,
                    context_tokens_used=context_tokens_used,
                    promise=promise,
                    promise_detail=promise_detail,
                    error=error,
                    approach_tried=approach_tried,
                    leader_hint=st.leader_hint,  # Record what hint was active
                    ended_at=datetime.utcnow(),
                )
                if st.iteration_history:
                    # Calculate duration from last iteration
                    iteration_record.duration_sec = (
                        iteration_record.ended_at - st.iteration_history[-1].ended_at
                    ).total_seconds() if st.iteration_history[-1].ended_at else None
                st.iteration_history.append(iteration_record)
                
                # Update context tracking
                st.context_tokens_total += context_tokens_used
                st.last_promise = promise
                st.last_promise_detail = promise_detail
                
                # Update task-level iteration counter
                task.total_iterations_used += 1
                
                # Determine next action based on promise and iteration state
                context_alert = st.should_alert_context()
                iterations_remaining = st.get_iteration_budget_remaining()
                next_action = self._determine_next_action(st, success, promise)

                # --- Phase 0 Tier 1.2: AUTO-CAPTURE EVIDENCE (Hook 3: Context Pressure) ---
                # When context budget exceeds 80%, capture state for audit trail
                if context_alert:
                    try:
                        from ..utils.evidence_pack import save_escalation_evidence

                        context_pct = (st.context_tokens_total / st.context_budget_tokens * 100) if st.context_budget_tokens > 0 else 0
                        save_escalation_evidence(
                            task_id=task.task_id,
                            subtask_id=subtask_id,
                            event_type="context_pressure",
                            iteration=st.current_iteration,
                            additional_data={
                                "escalation_level": st.escalation_level,
                                "context_tokens_total": st.context_tokens_total,
                                "context_budget_tokens": st.context_budget_tokens,
                                "context_usage_pct": context_pct,
                                "worker_id": st.assigned_to,
                            },
                        )
                    except Exception as e:
                        logger.warning(f"[WARNING] Failed to generate context pressure evidence: {e}")
                
                # Build feedback
                iteration_feedback = {
                    "iteration_num": st.current_iteration,
                    "iterations_remaining": iterations_remaining,
                    "context_alert": context_alert,
                    "next_action": next_action,
                }
                
                # Handle final completion
                if success and promise == PromiseType.DONE:
                    st.completed_at = datetime.utcnow()
                    st.status = TaskStatus.COMPLETED
                    st.result = result
                    st.leader_hint = ""  # Clear hint on success
                    
                    # --- Formula dependency: Unblock waiting subtasks ---
                    unblocked = task.unblock_dependents(subtask_id)
                    if unblocked:
                        iteration_feedback["unblocked_count"] = len(unblocked)
                        iteration_feedback["unblocked_subtasks"] = [s.subtask_id for s in unblocked]
                        
                elif not success or promise in (PromiseType.STUCK, PromiseType.BLOCKED):
                    # Not complete - check if should retry or escalate
                    if iterations_remaining <= 0:
                        st.status = TaskStatus.FAILED
                        st.result = error or result or f"Exhausted {st.max_iterations} iterations"
                        st.completed_at = datetime.utcnow()

                        # --- Phase 0 Tier 1.2: AUTO-CAPTURE EVIDENCE (Hook 5: Budget Exhaustion) ---
                        # When iteration budget exhausted, generate postmortem evidence pack
                        try:
                            from ..utils.evidence_pack import save_escalation_evidence

                            save_escalation_evidence(
                                task_id=task.task_id,
                                subtask_id=subtask_id,
                                event_type="budget_exhaustion",
                                promise=promise.value if promise else None,
                                promise_detail=error or "Budget exhausted",
                                iteration=st.current_iteration,
                                additional_data={
                                    "escalation_level": st.escalation_level,
                                    "max_iterations": st.max_iterations,
                                    "iterations_used": st.current_iteration,
                                    "context_total": st.context_tokens_total,
                                    "worker_id": st.assigned_to,
                                    "final_status": "FAILED",
                                },
                            )
                        except Exception as e:
                            logger.warning(f"[WARNING] Failed to generate budget exhaustion evidence: {e}")
                    else:
                        # Stay in progress for retry
                        st.status = TaskStatus.IN_PROGRESS
                        # Release assignment so worker can reclaim with fresh context
                        st.assigned_to = None
                else:
                    # PROGRESS or other - stay in progress
                    st.status = TaskStatus.IN_PROGRESS
                    if promise == PromiseType.PROGRESS:
                        st.result = f"Progress: {promise_detail}%"
                
                # Update parent task
                task.update_status_from_subtasks()
                
                self._storage.save(task)
                
                # Clear current work
                self._current_task = None
                self._current_subtask = None
                
                status_msg = f"Iteration {st.current_iteration}/{st.max_iterations}"
                if success and promise == PromiseType.DONE:
                    status_msg += " - COMPLETED"
                elif st.status == TaskStatus.FAILED:
                    status_msg += " - FAILED (budget exhausted)"
                else:
                    status_msg += f" - {next_action}"
                
                return True, status_msg, iteration_feedback
        
        return False, f"Subtask {subtask_id} not found", {}
    
    def _determine_next_action(
        self,
        subtask: SubTask,
        success: bool,
        promise: Optional[PromiseType],
    ) -> str:
        """Determine next action based on iteration state.
        
        Graduated escalation:
        - Iterations 1-N: Normal retry
        - After N failures: Leader injects hint (escalation_level=1)
        - After 2N failures: Reassign to different worker (escalation_level=2)
        - At max: Escalate to human (escalation_level=3)
        """
        if success and promise == PromiseType.DONE:
            return "complete"
        
        remaining = subtask.get_iteration_budget_remaining()
        
        if remaining <= 0:
            return "escalate_human"
        
        # Check for stuck pattern (same error repeated)
        if promise == PromiseType.STUCK:
            old_level = subtask.escalation_level
            subtask.escalation_level = min(subtask.escalation_level + 1, 3)

            # --- Phase 0 Tier 1.2: AUTO-CAPTURE EVIDENCE (Hook 4: Escalation Level Bump) ---
            # When STUCK promise triggers escalation level increase, capture state
            if subtask.escalation_level > old_level:
                try:
                    from ..utils.evidence_pack import save_escalation_evidence

                    save_escalation_evidence(
                        task_id=subtask.task_id,
                        subtask_id=subtask.subtask_id,
                        event_type="escalation_bump",
                        promise="STUCK",
                        promise_detail=subtask.last_promise_detail or "Worker stuck pattern detected",
                        iteration=subtask.current_iteration,
                        additional_data={
                            "escalation_from_level": old_level,
                            "escalation_to_level": subtask.escalation_level,
                            "worker_id": subtask.assigned_to,
                        },
                    )
                except Exception as e:
                    logger.warning(f"[WARNING] Failed to generate escalation bump evidence: {e}")
        
        if subtask.escalation_level == 0:
            return "retry"
        elif subtask.escalation_level == 1:
            return "hint_injected"
        elif subtask.escalation_level == 2:
            return "reassigning"
        else:
            return "escalate_human"
    
    def release_subtask(
        self,
        task_id: str,
        subtask_id: str,
        reason: str = "",
    ) -> Tuple[bool, str]:
        """Release a claimed subtask back to pending.
        
        Use when worker cannot complete work (timeout, error, etc).
        
        Args:
            task_id: Parent task ID
            subtask_id: Subtask to release
            reason: Why releasing
            
        Returns:
            Tuple of (success, message)
        """
        task = self._storage.get(task_id)
        
        if not task:
            return False, f"Task {task_id} not found"
        
        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                if st.assigned_to != self.agent_id:
                    return False, f"Subtask not assigned to {self.agent_id}"
                
                st.status = TaskStatus.PENDING
                st.assigned_to = None
                st.started_at = None
                
                self._storage.save(task)
                
                # Clear current work
                self._current_task = None
                self._current_subtask = None
                
                return True, f"Subtask released: {reason or 'no reason'}"
        
        return False, f"Subtask {subtask_id} not found"
    
    def get_current_work(self) -> Optional[Tuple[str, str]]:
        """Get currently assigned work.
        
        Returns:
            Tuple of (task_id, subtask_id) or None
        """
        if self._current_task and self._current_subtask:
            return (self._current_task, self._current_subtask)
        return None
    
    def get_my_subtasks(self) -> List[Tuple[Task, SubTask]]:
        """Get all subtasks assigned to this worker.

        Returns:
            List of (Task, SubTask) tuples
        """
        results = []

        for task in self._storage.get_active_tasks():
            for st in task.subtasks:
                if st.assigned_to == self.agent_id:
                    results.append((task, st))

        return results

    # =========================================================================
    # TODO.MD INTEGRATION - Source of truth for tasks
    # =========================================================================

    def mark_task_done_in_todo(
        self,
        task_id: str,
        result_note: str = "",
    ) -> bool:
        """Mark a task as done in todo.md.

        This is the preferred method for Workers to mark task completion.
        Call this AFTER completing the work to update the source of truth.

        Args:
            task_id: Task ID like "T500"
            result_note: Optional note about the result

        Returns:
            True if task was marked as done
        """
        parser = TodoMdParser()
        success = parser.mark_task_done(task_id, result_note)
        if success:
            logger.info(f"Worker {self.agent_id} marked {task_id} as done in todo.md")
        else:
            logger.warning(f"Worker {self.agent_id} failed to mark {task_id} as done")
        return success

    def mark_task_in_progress_in_todo(self, task_id: str) -> bool:
        """Mark a task as in progress in todo.md (change checkbox to [~]).

        Call this when starting work on a task.

        Args:
            task_id: Task ID like "T500"

        Returns:
            True if task was updated
        """
        parser = TodoMdParser()
        return parser.mark_task_in_progress(task_id)

    def update_task_status_in_todo(self, task_id: str, status: str) -> bool:
        """Update a task's status tag in todo.md.

        Args:
            task_id: Task ID like "T500"
            status: Status tag like "IN_PROGRESS", "BLOCKED"

        Returns:
            True if task was updated
        """
        parser = TodoMdParser()
        return parser.update_task_status(task_id, status)


def poll_for_work(
    agent_id: str,
    capabilities: Optional[List[str]] = None,
    max_tasks: int = 1,
) -> List[dict]:
    """Convenience function to poll for available work.
    
    Used by the router endpoint.
    
    Args:
        agent_id: Worker agent ID
        capabilities: Worker capabilities
        max_tasks: Max subtasks to return
        
    Returns:
        List of assignment dicts with task/subtask info
    """
    config = WorkerConfig(
        agent_id=agent_id,
        capabilities=capabilities or [],
    )
    worker = WorkerOrchestrator(config)
    
    available = worker.poll(max_tasks)
    
    assignments = []
    for task, subtask in available:
        assignments.append({
            "task_id": task.task_id,
            "task_title": task.title,
            "task_priority": task.priority,
            "subtask_id": subtask.subtask_id,
            "subtask_title": subtask.title,
            "subtask_description": subtask.description,
        })
    
    return assignments
