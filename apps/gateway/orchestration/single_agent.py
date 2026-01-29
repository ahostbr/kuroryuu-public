"""SingleAgentMode - Disk-based state management for context-limited agents.

This module enables models like Devstral (with limited context windows) to 
execute multi-step tasks by persisting state to disk and "rebooting" with
fresh context between subtasks.

Key concepts:
- Agent State: JSON file tracking current task, progress, and context summary
- Context Reboot: Agent exits after each subtask, loads state on restart
- Progress Summarization: Compresses work done into concise summary for next iteration

Usage:
    executor = SingleAgentExecutor("devstral_worker_1")
    
    # Execute one subtask (typically called in a loop by orchestrator)
    result = await executor.execute_one_subtask()
    
    # Result indicates if more work remains
    if result["status"] == "subtask_complete":
        # Loop continues, agent will reboot with fresh context
        pass
    elif result["status"] == "task_complete":
        # All subtasks done
        pass
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .models import Task, SubTask, TaskStatus
from .storage import get_storage
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


class AgentState(BaseModel):
    """Persistent state for a single agent across context reboots.
    
    Stored in ai/agent_state.json (or custom path).
    """
    # Agent identity
    agent_id: str
    agent_role: str = "coder"  # planner, coder, reviewer, tester
    
    # Current work
    current_task_id: Optional[str] = None
    current_subtask_id: Optional[str] = None
    subtask_index: int = 0
    total_subtasks: int = 0
    
    # Progress tracking
    completed_subtasks: List[str] = Field(default_factory=list)
    failed_subtasks: List[str] = Field(default_factory=list)
    
    # Context management (key for context-limited models)
    context_summary: str = ""  # Compressed summary of work done so far
    next_action: str = ""  # What to do next (helps agent focus)
    
    # File tracking
    files_touched: List[str] = Field(default_factory=list)
    files_created: List[str] = Field(default_factory=list)
    
    # Recovery
    last_checkpoint: datetime = Field(default_factory=datetime.utcnow)
    reboot_count: int = 0
    errors: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class SingleAgentExecutor:
    """Executes subtasks with disk-based state for context-limited agents.
    
    This class manages the "reboot loop" pattern:
    1. Load state from disk
    2. Get next subtask
    3. Execute with fresh context + state summary
    4. Save result + update state
    5. Exit (agent "reboots" with fresh context)
    6. Next iteration loads state and continues
    
    Benefits:
    - Works with any context window size
    - Progress survives crashes
    - Summary keeps relevant context without filling window
    - Each subtask gets maximum context for its work
    """
    
    DEFAULT_STATE_FILE = "ai/agent_state.json"

    def __init__(
        self,
        agent_id: str,
        state_file: Optional[str] = None,
        project_root: Optional[str] = None,
    ):
        """Initialize executor.

        Args:
            agent_id: Unique identifier for this agent
            state_file: Path to state JSON (default: ai/agent_state.json)
            project_root: Root directory for relative paths
        """
        self.agent_id = agent_id
        self._project_root = Path(project_root) if project_root else Path.cwd()
        self._state_path = self._project_root / (state_file or self.DEFAULT_STATE_FILE)
        self._storage = get_storage()
        self._state: Optional[AgentState] = None
    
    @property
    def state(self) -> AgentState:
        """Get current state, loading from disk if needed."""
        if self._state is None:
            self._state = self.load_state()
        return self._state
    
    def load_state(self) -> AgentState:
        """Load agent state from disk, or create new if not exists."""
        if self._state_path.exists():
            try:
                with open(self._state_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                # Parse datetime fields
                for field in ["last_checkpoint", "created_at", "updated_at"]:
                    if data.get(field):
                        data[field] = datetime.fromisoformat(data[field])
                
                return AgentState(**data)
            except (json.JSONDecodeError, Exception) as e:
                # Corrupted state, create fresh
                logger.warning(f"[SingleAgent] Could not load state: {e}")
        
        # Create new state
        return AgentState(agent_id=self.agent_id)
    
    def save_state(self) -> None:
        """Persist state to disk."""
        self.state.updated_at = datetime.utcnow()
        
        # Ensure directory exists
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        
        def serialize(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            return str(obj)
        
        with open(self._state_path, "w", encoding="utf-8") as f:
            json.dump(self.state.model_dump(), f, indent=2, default=serialize)
    
    def get_next_subtask(self) -> Optional[tuple[Task, SubTask]]:
        """Get the next subtask to execute.
        
        Returns:
            Tuple of (Task, SubTask) or None if no work available
        """
        # If we have a current task, continue with it
        if self.state.current_task_id:
            task = self._storage.get(self.state.current_task_id)
            if task:
                # Find next pending subtask
                for st in task.subtasks:
                    if st.subtask_id not in self.state.completed_subtasks:
                        if st.status in (TaskStatus.PENDING, TaskStatus.ASSIGNED):
                            return (task, st)
                
                # All subtasks done for this task
                self.state.current_task_id = None
                self.state.current_subtask_id = None
        
        # Poll for new work
        available = self._storage.get_available_subtasks(limit=1)
        if available:
            return available[0]
        
        return None
    
    def build_context_prompt(self, subtask: SubTask) -> str:
        """Build the context prompt for executing a subtask.
        
        This prompt provides the agent with:
        - Summary of work done so far
        - Current subtask details
        - Files touched
        - Next action hint
        
        Designed to be concise to maximize available context for actual work.
        """
        lines = [
            "# Agent State Summary",
            "",
            f"**Task Progress:** {self.state.subtask_index}/{self.state.total_subtasks} subtasks completed",
            f"**Reboot Count:** {self.state.reboot_count} (each subtask runs with fresh context)",
            "",
        ]
        
        if self.state.context_summary:
            lines.extend([
                "## Work Done So Far",
                self.state.context_summary,
                "",
            ])
        
        if self.state.files_touched:
            lines.extend([
                "## Files Touched",
                "- " + "\n- ".join(self.state.files_touched[-10:]),  # Last 10 files
                "",
            ])
        
        lines.extend([
            "## Current Subtask",
            f"**ID:** {subtask.subtask_id}",
            f"**Title:** {subtask.title}",
            f"**Description:** {subtask.description}",
            "",
        ])
        
        if self.state.next_action:
            lines.extend([
                "## Suggested Next Action",
                self.state.next_action,
                "",
            ])
        
        lines.extend([
            "---",
            "Execute this subtask. When done, report your result.",
            "Your context will be cleared after this subtask (fresh start for next one).",
        ])
        
        return "\n".join(lines)
    
    async def execute_one_subtask(
        self,
        agent_callback: Optional[callable] = None,
    ) -> Dict[str, Any]:
        """Execute a single subtask and update state.
        
        This is the main entry point. Typical usage in a loop:
        
            while True:
                result = await executor.execute_one_subtask(run_agent)
                if result["status"] == "task_complete":
                    break
                if result["status"] == "error":
                    handle_error(result)
                    break
                # Otherwise, continue loop (agent "reboots")
        
        Args:
            agent_callback: Async function to run the agent
                           Signature: async (prompt, subtask) -> result_str
        
        Returns:
            Dict with status and details:
            - status: "subtask_complete" | "task_complete" | "no_work" | "error"
            - subtask_id: ID of completed subtask
            - next_subtask: Next subtask if available
            - error: Error message if failed
        """
        # Increment reboot count
        self.state.reboot_count += 1
        self.state.last_checkpoint = datetime.utcnow()
        
        # Get next work
        work = self.get_next_subtask()
        if not work:
            self.save_state()
            return {
                "status": "no_work",
                "message": "No subtasks available",
                "reboot_count": self.state.reboot_count,
            }
        
        task, subtask = work
        
        # Update state
        self.state.current_task_id = task.task_id
        self.state.current_subtask_id = subtask.subtask_id
        self.state.total_subtasks = len(task.subtasks)
        
        # Build context prompt
        context_prompt = self.build_context_prompt(subtask)
        
        try:
            # Execute via callback if provided
            if agent_callback:
                result = await agent_callback(context_prompt, subtask)
            else:
                # Placeholder - in production, this would call the LLM
                result = f"Simulated execution of subtask: {subtask.title}"
            
            # Mark subtask complete
            self._complete_subtask(task, subtask, result)
            
            # Update progress summary
            self._update_context_summary(subtask, result)
            
            # Append to progress log
            # Check if task is complete
            remaining = [
                st for st in task.subtasks 
                if st.subtask_id not in self.state.completed_subtasks
            ]
            
            self.save_state()
            
            if not remaining:
                return {
                    "status": "task_complete",
                    "task_id": task.task_id,
                    "subtask_id": subtask.subtask_id,
                    "result": result,
                    "total_subtasks": len(task.subtasks),
                    "reboot_count": self.state.reboot_count,
                }
            
            return {
                "status": "subtask_complete",
                "task_id": task.task_id,
                "subtask_id": subtask.subtask_id,
                "result": result,
                "remaining": len(remaining),
                "next_subtask": remaining[0].model_dump() if remaining else None,
                "reboot_count": self.state.reboot_count,
            }
            
        except Exception as e:
            # Record error
            self.state.errors.append({
                "subtask_id": subtask.subtask_id,
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            })
            self.state.failed_subtasks.append(subtask.subtask_id)
            self.save_state()
            
            return {
                "status": "error",
                "task_id": task.task_id,
                "subtask_id": subtask.subtask_id,
                "error": str(e),
                "reboot_count": self.state.reboot_count,
            }
    
    def _complete_subtask(
        self,
        task: Task,
        subtask: SubTask,
        result: str,
    ) -> None:
        """Mark a subtask as complete in storage."""
        subtask.status = TaskStatus.COMPLETED
        subtask.result = result
        subtask.completed_at = datetime.utcnow()
        
        # Update state
        self.state.completed_subtasks.append(subtask.subtask_id)
        self.state.subtask_index += 1
        
        # Check if all subtasks complete
        all_done = all(
            st.status == TaskStatus.COMPLETED 
            for st in task.subtasks
        )
        
        if all_done:
            task.status = TaskStatus.COMPLETED
            task.completed_at = datetime.utcnow()
        
        self._storage.save(task)
    
    def _update_context_summary(
        self,
        subtask: SubTask,
        result: str,
    ) -> None:
        """Update the context summary after completing a subtask.
        
        This is crucial for context-limited models - we compress the work
        done into a concise summary that fits in the next context window.
        """
        # Build incremental summary
        summary_lines = []
        
        if self.state.context_summary:
            summary_lines.append(self.state.context_summary)
        
        # Add new completion
        summary_lines.append(
            f"- ✅ {subtask.title}: {self._truncate(result, 100)}"
        )
        
        # Keep summary under ~500 chars to leave room for work
        full_summary = "\n".join(summary_lines)
        if len(full_summary) > 500:
            # Compress older entries
            lines = full_summary.split("\n")
            if len(lines) > 5:
                # Keep first line (overall context) + last 4 completions
                compressed = [lines[0], "...(earlier work omitted)..."] + lines[-4:]
                full_summary = "\n".join(compressed)
        
        self.state.context_summary = full_summary
        
        # Set next action hint
        next_work = self.get_next_subtask()
        if next_work:
            _, next_st = next_work
            self.state.next_action = f"Next: {next_st.title}"
        else:
            self.state.next_action = "All subtasks complete - finalize task"
    
    def _truncate(self, text: str, max_len: int) -> str:
        """Truncate text with ellipsis."""
        if len(text) <= max_len:
            return text
        return text[:max_len - 3] + "..."
    
    def reset_state(self) -> None:
        """Reset agent state (for testing or fresh start)."""
        self._state = AgentState(agent_id=self.agent_id)
        self.save_state()
    
    def get_status(self) -> Dict[str, Any]:
        """Get current agent status summary."""
        return {
            "agent_id": self.agent_id,
            "current_task_id": self.state.current_task_id,
            "subtask_index": self.state.subtask_index,
            "total_subtasks": self.state.total_subtasks,
            "completed_count": len(self.state.completed_subtasks),
            "failed_count": len(self.state.failed_subtasks),
            "reboot_count": self.state.reboot_count,
            "last_checkpoint": self.state.last_checkpoint.isoformat(),
            "context_summary_length": len(self.state.context_summary),
        }
    
    def assign_task(
        self,
        task_id: str,
        reset_progress: bool = True,
    ) -> bool:
        """Manually assign a task to this agent.
        
        Args:
            task_id: Task to assign
            reset_progress: Whether to reset completed subtasks
            
        Returns:
            True if assigned successfully
        """
        task = self._storage.get(task_id)
        if not task:
            return False
        
        self.state.current_task_id = task_id
        self.state.total_subtasks = len(task.subtasks)
        
        if reset_progress:
            self.state.completed_subtasks = []
            self.state.failed_subtasks = []
            self.state.subtask_index = 0
            self.state.context_summary = ""
            self.state.reboot_count = 0
        
        self.save_state()
        return True


# Factory function for router integration
def create_single_agent_executor(
    agent_id: str,
    project_root: Optional[str] = None,
) -> SingleAgentExecutor:
    """Create a SingleAgentExecutor instance.
    
    This is the primary factory function used by the router.
    
    Args:
        agent_id: Unique agent identifier
        project_root: Root directory for state files
        
    Returns:
        Configured SingleAgentExecutor
    """
    return SingleAgentExecutor(
        agent_id=agent_id,
        project_root=project_root,
    )
