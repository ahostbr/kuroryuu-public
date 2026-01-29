"""Leader Orchestrator - Task breakdown and assignment coordination.

M4 Multi-Agent Message Bus implementation.

The leader is responsible for:
1. Breaking down high-level tasks into subtasks
2. Assigning subtasks to available workers
3. Tracking progress and aggregating results
4. Handling failures and reassignments
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .models import (
    Task,
    TaskStatus,
    SubTask,
    ComplexityLevel,
    PromiseType,
)
from .storage import TaskStorage, get_storage
from .specialists import detect_specialists_for_task
from .todo_md import TodoMdParser, TodoItem, TaskState

logger = logging.getLogger(__name__)

# ============================================================================
# Phase 4: Collective Intelligence Integration
# ============================================================================

def _get_ai_dir() -> Path:
    """Get AI dir from env or derive from __file__."""
    env_dir = os.environ.get("KURORYUU_HOOKS_DIR")
    if env_dir:
        return Path(env_dir)
    # __file__ is apps/gateway/orchestration/leader.py -> go up 3 levels + ai
    return Path(__file__).resolve().parent.parent.parent.parent / "ai"

# Path to collective patterns (same as k_collective tool)
AI_DIR = _get_ai_dir()
PATTERNS_PATH = AI_DIR / "collective" / "patterns.jsonl"


def query_collective_patterns(task_description: str, limit: int = 5) -> Optional[str]:
    """Query collective patterns relevant to a task.

    Directly reads patterns.jsonl to avoid circular HTTP dependencies.
    Returns formatted context string or None.
    """
    if not PATTERNS_PATH.exists():
        return None

    try:
        patterns = []
        with open(PATTERNS_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        patterns.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass

        if not patterns:
            return None

        # Simple keyword matching for relevance
        query_lower = task_description.lower()
        scored = []

        for pattern in patterns:
            score = 0
            task_type = pattern.get("task_type", "").lower()
            approach = pattern.get("approach", "").lower()

            for word in query_lower.split():
                if len(word) > 2:
                    if word in task_type:
                        score += 3
                    if word in approach:
                        score += 1

            if score > 0:
                scored.append((score, pattern))

        if not scored:
            return None

        # Sort by score
        scored.sort(key=lambda x: -x[0])

        # Separate successes and failures
        successes = [p for s, p in scored if p.get("type") == "success"][:limit]
        failures = [p for s, p in scored if p.get("type") == "failure"][:limit // 2]

        if not successes and not failures:
            return None

        # Format as context
        lines = ["## Past Learnings (Collective Intelligence)\n"]

        if successes:
            lines.append("### What worked:")
            for p in successes[:3]:
                lines.append(f"- **{p['task_type']}**: {p['approach']}")
                if p.get("evidence"):
                    lines.append(f"  - Evidence: {p['evidence']}")

        if failures:
            lines.append("\n### What to avoid:")
            for p in failures[:2]:
                lines.append(f"- **{p['task_type']}**: {p['approach']}")
                if p.get("reason"):
                    lines.append(f"  - Reason: {p['reason']}")

        return "\n".join(lines)

    except Exception as e:
        logger.warning(f"Error querying collective patterns: {e}")
        return None


def record_collective_pattern(
    pattern_type: str,  # "success" or "failure"
    task_type: str,
    approach: str,
    detail: str = "",  # evidence for success, reason for failure
    agent_id: str = "",
) -> bool:
    """Record a pattern to the collective.

    Called after task completion to learn from outcomes.
    """
    try:
        # Ensure directory exists
        PATTERNS_PATH.parent.mkdir(parents=True, exist_ok=True)

        pattern = {
            "type": pattern_type,
            "task_type": task_type[:100],
            "approach": approach[:500],
            "agent_id": agent_id[:50] if agent_id else "",
            "timestamp": datetime.utcnow().isoformat(),
        }

        if pattern_type == "success":
            pattern["evidence"] = detail[:500] if detail else ""
        else:
            pattern["reason"] = detail[:500] if detail else ""

        with open(PATTERNS_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(pattern) + "\n")

        logger.info(f"Recorded {pattern_type} pattern for {task_type}")
        return True

    except Exception as e:
        logger.error(f"Error recording collective pattern: {e}")
        return False


class LeaderOrchestrator:
    """Orchestrates task breakdown and worker assignment.
    
    Workflow:
    1. User submits task → create_task()
    2. Leader breaks down → breakdown_task()
    3. Workers poll → assign_subtask() (via WorkerOrchestrator)
    4. Workers report → receive_result()
    5. All done → finalize_task()
    """
    
    def __init__(
        self,
        leader_id: str,
        storage: Optional[TaskStorage] = None,
    ):
        """Initialize leader orchestrator.

        Args:
            leader_id: Agent ID of the leader
            storage: Storage backend (uses singleton if not provided)
        """
        self.leader_id = leader_id
        self._storage = storage or get_storage()

    def _load_prompt_file(self, prompt_ref: str) -> Optional[str]:
        """Load prompt content from ai/prompts/{prompt_ref}.md

        Args:
            prompt_ref: Reference to prompt file (without .md extension)

        Returns:
            Prompt content if file exists, None otherwise
        """
        # Construct path relative to project root
        prompt_path = Path("ai/prompts") / f"{prompt_ref}.md"

        try:
            if prompt_path.exists():
                return prompt_path.read_text(encoding="utf-8")
            else:
                logger.warning(f"Prompt file not found: {prompt_path}")
                return None
        except Exception as e:
            logger.error(f"Error reading prompt file {prompt_path}: {e}")
            return None
    
    def create_task(
        self,
        title: str,
        description: str,
        priority: int = 5,
        metadata: Optional[dict] = None,
    ) -> Tuple[Task, str]:
        """Create a new task for orchestration.
        
        Args:
            title: Task title
            description: Detailed description
            priority: 1-10 (higher = more important)
            metadata: Additional metadata
            
        Returns:
            Tuple of (Task, message)
        """
        task = Task.create(
            title=title,
            description=description,
            priority=priority,
            metadata=metadata,
        )

        # Phase 3: Auto-detect specialist triggers
        triggered_specialists = detect_specialists_for_task(title, description)
        if triggered_specialists:
            task.metadata = task.metadata or {}
            task.metadata["triggered_specialists"] = triggered_specialists
            specialist_names = [s["name"] for s in triggered_specialists]
            logger.info(f"Task {task.task_id} triggered specialists: {specialist_names}")

        self._storage.save(task)

        # Build response message
        message = f"Task {task.task_id} created, ready for breakdown"
        if triggered_specialists:
            names = ", ".join(s["name"] for s in triggered_specialists)
            message += f". Specialists triggered: {names}"

        return task, message
    
    def breakdown_task(
        self,
        task_id: str,
        subtasks: List[dict],
        breakdown_prompt: Optional[str] = None,
        complexity_override: Optional[int] = None,
    ) -> Tuple[bool, str, Optional[Task]]:
        """Break down a task into subtasks.
        
        This is typically called after the leader LLM analyzes the task
        and determines what subtasks are needed.
        
        Ralph Wiggum: Sets complexity score and iteration budgets for each subtask.
        Complexity can be specified per-subtask or defaulted from task-level.
        
        Args:
            task_id: Task to break down
            subtasks: List of {title, description, complexity_score?} dicts
            breakdown_prompt: The prompt used to generate breakdown
            complexity_override: Optional task-level complexity override (1-10)
            
        Returns:
            Tuple of (success, message, updated_task)
        """
        task = self._storage.get(task_id)
        
        if not task:
            return False, f"Task {task_id} not found", None
        
        if task.status not in (TaskStatus.PENDING, TaskStatus.BREAKING_DOWN):
            return False, f"Task already {task.status.value}", None
        
        # Update task state
        task.status = TaskStatus.BREAKING_DOWN
        task.leader_id = self.leader_id
        task.breakdown_prompt = breakdown_prompt
        task.started_at = datetime.utcnow()
        
        # Set task-level complexity
        if complexity_override:
            task.complexity_score = max(1, min(10, complexity_override))
        
        # Add subtasks with Ralph Wiggum iteration budgets
        for st_data in subtasks:
            subtask = task.add_subtask(
                title=st_data.get("title", "Untitled"),
                description=st_data.get("description", ""),
            )

            # Inject prompt content if prompt_ref is provided
            prompt_ref = st_data.get("prompt_ref")
            if prompt_ref:
                prompt_content = self._load_prompt_file(prompt_ref)
                if prompt_content:
                    # Inject prompt into subtask description
                    subtask.description = f"{subtask.description}\n\n## Prompt Context\n\n{prompt_content}"
                    subtask.prompt_ref = prompt_ref
                    logger.info(f"Injected prompt '{prompt_ref}' into subtask '{subtask.title}'")

            # Phase 4: Inject collective intelligence patterns
            collective_context = query_collective_patterns(
                f"{subtask.title} {subtask.description}"
            )
            if collective_context:
                subtask.description = f"{subtask.description}\n\n{collective_context}"
                logger.info(f"Injected collective patterns into subtask '{subtask.title}'")

            # Set complexity - use per-subtask if provided, else task-level
            complexity = st_data.get("complexity_score", task.complexity_score)
            subtask.complexity_score = max(1, min(10, complexity))

            # Calculate max iterations based on complexity
            subtask.max_iterations = SubTask.calculate_max_iterations(subtask.complexity_score)

            # Optional context budget override
            if "context_budget_tokens" in st_data:
                subtask.context_budget_tokens = st_data["context_budget_tokens"]
        
        # Calculate total iteration budget for task
        task.total_iteration_budget = sum(st.max_iterations for st in task.subtasks)
        
        # Move to assigned state (ready for workers)
        task.status = TaskStatus.ASSIGNED
        
        self._storage.save(task)
        
        budget_info = f"Total iteration budget: {task.total_iteration_budget}"
        return True, f"Task broken into {len(subtasks)} subtasks. {budget_info}", task
    
    def get_pending_tasks(self) -> List[Task]:
        """Get tasks waiting for breakdown."""
        return self._storage.get_pending_tasks()
    
    def get_task_status(self, task_id: str) -> Optional[Task]:
        """Get detailed task status."""
        return self._storage.get(task_id)
    
    def receive_result(
        self,
        task_id: str,
        subtask_id: str,
        agent_id: str,
        success: bool,
        result: str = "",
        error: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Receive result from a worker.
        
        Args:
            task_id: Parent task ID
            subtask_id: Subtask that was completed
            agent_id: Worker who completed it
            success: Whether it succeeded
            result: Result content
            error: Error message if failed
            
        Returns:
            Tuple of (success, message)
        """
        task = self._storage.get(task_id)
        
        if not task:
            return False, f"Task {task_id} not found"
        
        # Find the subtask
        subtask = None
        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                subtask = st
                break
        
        if not subtask:
            return False, f"Subtask {subtask_id} not found"
        
        if subtask.assigned_to != agent_id:
            return False, f"Subtask not assigned to {agent_id}"
        
        # Update subtask
        subtask.completed_at = datetime.utcnow()
        if success:
            subtask.status = TaskStatus.COMPLETED
            subtask.result = result
        else:
            subtask.status = TaskStatus.FAILED
            subtask.result = error or result
        
        # Update parent task status
        task.update_status_from_subtasks()

        self._storage.save(task)

        # Phase 4: Record pattern to collective intelligence
        try:
            if success:
                record_collective_pattern(
                    pattern_type="success",
                    task_type=subtask.title,
                    approach=result[:200] if result else "Completed successfully",
                    detail=f"Completed by {agent_id}",
                    agent_id=agent_id,
                )
            else:
                record_collective_pattern(
                    pattern_type="failure",
                    task_type=subtask.title,
                    approach=f"Attempted: {subtask.description[:100]}",
                    detail=error or result or "Unknown failure",
                    agent_id=agent_id,
                )
        except Exception as e:
            logger.warning(f"Failed to record collective pattern: {e}")

        status_msg = "completed" if success else "failed"
        return True, f"Subtask {subtask_id} marked {status_msg}"
    
    def reassign_failed_subtask(
        self,
        task_id: str,
        subtask_id: str,
    ) -> Tuple[bool, str]:
        """Reset a failed subtask for reassignment.
        
        Args:
            task_id: Parent task ID
            subtask_id: Subtask to reassign
            
        Returns:
            Tuple of (success, message)
        """
        task = self._storage.get(task_id)
        
        if not task:
            return False, f"Task {task_id} not found"
        
        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                if st.status not in (TaskStatus.FAILED, TaskStatus.ASSIGNED):
                    return False, f"Cannot reassign subtask in {st.status.value} state"
                
                st.status = TaskStatus.PENDING
                st.assigned_to = None
                st.result = None
                st.started_at = None
                st.completed_at = None
                
                # Update task status back to assigned
                if task.status == TaskStatus.FAILED:
                    task.status = TaskStatus.ASSIGNED
                    task.error = None
                    task.completed_at = None
                
                self._storage.save(task)
                return True, f"Subtask {subtask_id} reset for reassignment"
        
        return False, f"Subtask {subtask_id} not found"
    
    def cancel_task(self, task_id: str, reason: str = "") -> Tuple[bool, str]:
        """Cancel a task and all its subtasks.
        
        Args:
            task_id: Task to cancel
            reason: Cancellation reason
            
        Returns:
            Tuple of (success, message)
        """
        task = self._storage.get(task_id)
        
        if not task:
            return False, f"Task {task_id} not found"
        
        if task.status in (TaskStatus.COMPLETED, TaskStatus.CANCELLED):
            return False, f"Task already {task.status.value}"
        
        task.status = TaskStatus.CANCELLED
        task.error = reason or "Cancelled by leader"
        task.completed_at = datetime.utcnow()
        
        for st in task.subtasks:
            if st.status not in (TaskStatus.COMPLETED, TaskStatus.FAILED):
                st.status = TaskStatus.CANCELLED
        
        self._storage.save(task)
        return True, f"Task {task_id} cancelled"
    
    def finalize_task(self, task_id: str, final_result: str = "") -> Tuple[bool, str]:
        """Finalize a completed task with aggregated result.
        
        Args:
            task_id: Task to finalize
            final_result: Leader's aggregated summary
            
        Returns:
            Tuple of (success, message)
        """
        task = self._storage.get(task_id)
        
        if not task:
            return False, f"Task {task_id} not found"
        
        if not task.all_subtasks_done():
            return False, "Not all subtasks completed"
        
        task.final_result = final_result
        if task.status != TaskStatus.FAILED:
            task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.utcnow()
        
        self._storage.save(task)
        return True, f"Task {task_id} finalized"
    
    def get_stats(self) -> dict:
        """Get orchestration statistics."""
        return self._storage.stats()

    # =========================================================================
    # TODO.MD INTEGRATION - Source of truth for tasks
    # =========================================================================

    def get_next_backlog_task(self) -> Optional[TodoItem]:
        """Get the next pending task from todo.md Backlog.

        This is the preferred method for Leaders to pick up new tasks.
        Tasks should be read from todo.md, not from ai/tasks.json.

        Returns:
            The next TodoItem from Backlog, or None if empty
        """
        parser = TodoMdParser()
        return parser.get_next_backlog_task()

    def move_task_to_active(self, task_id: str) -> bool:
        """Move a task from Backlog to Active section in todo.md.

        Call this when assigning a task to a worker.

        Args:
            task_id: Task ID like "T500"

        Returns:
            True if task was moved successfully
        """
        parser = TodoMdParser()
        return parser.move_task_to_active(task_id)

    def get_todo_md_tasks(self) -> dict:
        """Get all tasks from todo.md organized by section.

        Returns:
            Dict mapping section name to list of TodoItems
        """
        parser = TodoMdParser()
        return parser.read_all()
    
    # =========================================================================
    # RALPH WIGGUM: ITERATION MANAGEMENT
    # =========================================================================
    
    def inject_hint(
        self,
        task_id: str,
        subtask_id: str,
        hint: str,
    ) -> Tuple[bool, str]:
        """Inject a hint for a stuck worker.
        
        Called when a subtask has failed multiple iterations and needs guidance.
        The hint will be included in the worker's next iteration context.
        
        Args:
            task_id: Parent task ID
            subtask_id: Subtask to hint
            hint: Guidance for the worker
            
        Returns:
            Tuple of (success, message)
        """
        task = self._storage.get(task_id)
        
        if not task:
            return False, f"Task {task_id} not found"
        
        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                st.leader_hint = hint
                st.escalation_level = max(st.escalation_level, 1)  # At least hinted
                
                self._storage.save(task)
                return True, f"Hint injected for subtask {subtask_id}"
        
        return False, f"Subtask {subtask_id} not found"
    
    def adjust_iteration_budget(
        self,
        task_id: str,
        subtask_id: str,
        new_max: Optional[int] = None,
        delta: int = 0,
    ) -> Tuple[bool, str]:
        """Adjust iteration budget for a subtask.
        
        Can be used to:
        - Increase budget if task is making progress but needs more iterations
        - Decrease budget if context usage is high
        
        Args:
            task_id: Parent task ID
            subtask_id: Subtask to adjust
            new_max: Set absolute new max (if provided)
            delta: Add/subtract from current max (if new_max not provided)
            
        Returns:
            Tuple of (success, message)
        """
        task = self._storage.get(task_id)
        
        if not task:
            return False, f"Task {task_id} not found"
        
        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                old_max = st.max_iterations
                
                if new_max is not None:
                    st.max_iterations = max(1, new_max)
                else:
                    st.max_iterations = max(1, st.max_iterations + delta)
                
                # Update task total budget
                task.total_iteration_budget += (st.max_iterations - old_max)
                
                self._storage.save(task)
                return True, f"Budget adjusted: {old_max} → {st.max_iterations}"
        
        return False, f"Subtask {subtask_id} not found"
    
    def get_stuck_subtasks(self, task_id: str) -> List[dict]:
        """Get subtasks that are stuck and need attention.
        
        Returns subtasks where:
        - Multiple failed iterations
        - High context usage
        - STUCK or BLOCKED promises
        
        Args:
            task_id: Task to check
            
        Returns:
            List of stuck subtask info dicts
        """
        task = self._storage.get(task_id)
        
        if not task:
            return []
        
        stuck = []
        for st in task.subtasks:
            if st.status in (TaskStatus.COMPLETED, TaskStatus.CANCELLED):
                continue
            
            issues = []
            
            # Check iteration usage
            used_pct = (st.current_iteration / st.max_iterations * 100) if st.max_iterations else 0
            if used_pct >= 50:
                issues.append(f"iterations: {st.current_iteration}/{st.max_iterations} ({used_pct:.0f}%)")
            
            # Check context usage
            if st.should_alert_context():
                issues.append(f"context: {st.get_context_usage_pct():.0f}%")
            
            # Check promises
            if st.last_promise in (PromiseType.STUCK, PromiseType.BLOCKED):
                issues.append(f"promise: {st.last_promise.value} - {st.last_promise_detail}")
            
            # Check escalation level
            if st.escalation_level >= 2:
                issues.append(f"escalation_level: {st.escalation_level}")
            
            if issues:
                stuck.append({
                    "subtask_id": st.subtask_id,
                    "title": st.title,
                    "status": st.status.value,
                    "issues": issues,
                    "iterations_used": st.current_iteration,
                    "iterations_max": st.max_iterations,
                    "last_hint": st.leader_hint,
                    "escalation_level": st.escalation_level,
                })
        
        return stuck
