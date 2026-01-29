"""Orchestration Models - Task and coordination data structures.

M4 Multi-Agent Message Bus implementation.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# =============================================================================
# RALPH WIGGUM ITERATION TYPES
# =============================================================================

class ComplexityLevel(str, Enum):
    """Task complexity levels for iteration budget calculation."""
    SIMPLE = "simple"       # 1-3: max 5 iterations
    MEDIUM = "medium"       # 4-6: max 10 iterations
    COMPLEX = "complex"     # 7-10: max 20-30 iterations


class PromiseType(str, Enum):
    """Completion promise signals from workers."""
    DONE = "DONE"           # Task completed successfully
    BLOCKED = "BLOCKED"     # Needs external input/resource
    STUCK = "STUCK"         # Can't proceed, needs reassignment/escalation
    PROGRESS = "PROGRESS"   # Partial progress (with percentage)


class IterationRecord(BaseModel):
    """Record of a single iteration attempt."""
    iteration_num: int
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    duration_sec: Optional[float] = None
    agent_id: str
    context_tokens_used: int = 0
    promise: Optional[PromiseType] = None
    promise_detail: str = ""  # e.g., "80" for PROGRESS:80, "missing API key" for BLOCKED:reason
    error: Optional[str] = None
    approach_tried: str = ""  # What the worker attempted (for dedup)
    leader_hint: str = ""     # Hint injected by leader for this iteration
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class TaskStatus(str, Enum):
    """Task lifecycle status."""
    PENDING = "pending"           # Created, not assigned
    BREAKING_DOWN = "breaking_down"  # Leader analyzing task
    ASSIGNED = "assigned"         # Sent to worker
    IN_PROGRESS = "in_progress"   # Worker actively working
    COMPLETED = "completed"       # Successfully done
    FAILED = "failed"             # Error occurred
    CANCELLED = "cancelled"       # Manually cancelled


class SubTask(BaseModel):
    """A sub-task broken down from main task.
    
    Ralph Wiggum Iteration Fields:
    - complexity_score: Leader-assigned complexity (1-10)
    - max_iterations: Max attempts before escalation
    - current_iteration: Current attempt number
    - iteration_history: Record of all attempts
    - context_budget_tokens: Max context tokens per iteration
    - context_tokens_total: Cumulative context used
    - completion_promise: Expected promise signal from worker
    - leader_hint: Guidance for next iteration
    
    Formula Fields:
    - needs: List of subtask_ids that must complete before this can start
    - blocked_by: Currently blocking subtask_ids (auto-computed from needs)
    - prompt_ref: Reference to ai/prompts/{name}.md for worker
    - formula_step_id: Original step ID if from formula
    - input_artifacts: Files from prior steps
    - output_artifact: File this step produces
    """
    subtask_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:16])
    title: str
    description: str
    assigned_to: Optional[str] = None  # Agent ID
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # --- Formula Dependency Fields ---
    needs: List[str] = Field(default_factory=list)          # SubTask IDs that must complete first
    blocked_by: List[str] = Field(default_factory=list)     # Currently blocking IDs (updated at runtime)
    prompt_ref: Optional[str] = None                         # ai/prompts/{prompt_ref}.md
    formula_step_id: Optional[str] = None                   # Original step ID from formula
    input_artifacts: List[str] = Field(default_factory=list)  # Files from prior steps
    output_artifact: Optional[str] = None                    # File this step produces
    artifact_content: Optional[str] = None                   # Stored artifact content

    # --- Planning & Metadata Fields ---
    plan_file: Optional[str] = None                          # Path to implementation plan (e.g., ai/plans/feature-name.md)
    metadata: Optional[Dict[str, Any]] = None                # Arbitrary metadata for extensibility

    # --- Ralph Wiggum Iteration Fields ---
    complexity_score: int = Field(default=5, ge=1, le=10)  # 1=trivial, 10=very complex
    max_iterations: int = Field(default=5, ge=1, le=50)    # Leader sets based on complexity
    current_iteration: int = 0                              # Current attempt number
    iteration_history: List[IterationRecord] = Field(default_factory=list)
    
    # Context tracking (workers are stateless, leader manages budget)
    context_budget_tokens: int = Field(default=100000)     # Max tokens per iteration
    context_tokens_total: int = 0                          # Cumulative context used
    context_threshold_pct: int = Field(default=80)         # Alert leader at this %
    
    # Completion promise protocol
    completion_promise: str = "DONE"                        # Expected signal
    last_promise: Optional[PromiseType] = None             # Most recent promise
    last_promise_detail: str = ""                          # Detail from last promise
    
    # Leader guidance for stuck workers
    leader_hint: str = ""                                   # Injected hint for next iteration
    escalation_level: int = 0                              # 0=normal, 1=hinted, 2=reassigned, 3=human
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}
    
    def get_iteration_budget_remaining(self) -> int:
        """Get remaining iterations before escalation."""
        return max(0, self.max_iterations - self.current_iteration)
    
    def get_context_usage_pct(self) -> float:
        """Get context usage as percentage."""
        if self.context_budget_tokens == 0:
            return 100.0
        return (self.context_tokens_total / self.context_budget_tokens) * 100
    
    def should_alert_context(self) -> bool:
        """Check if context usage exceeds threshold."""
        return self.get_context_usage_pct() >= self.context_threshold_pct
    
    @staticmethod
    def calculate_max_iterations(complexity_score: int) -> int:
        """Calculate max iterations based on complexity score.
        
        Simple (1-3): 5 iterations
        Medium (4-6): 10 iterations
        Complex (7-10): 20-30 iterations (scales with score)
        """
        if complexity_score <= 3:
            return 5
        elif complexity_score <= 6:
            return 10
        else:
            # Scale from 20 to 30 for scores 7-10
            return 20 + (complexity_score - 7) * 3  # 20, 23, 26, 30


class Task(BaseModel):
    """A high-level task to be orchestrated.
    
    Tasks flow:
    1. User submits task → PENDING
    2. Leader breaks down → BREAKING_DOWN → creates SubTasks
    3. SubTasks assigned to workers → ASSIGNED
    4. Workers execute → IN_PROGRESS
    5. All subtasks done → COMPLETED
    
    Formula Tasks:
    - Created via "Cook Formula" with pre-defined subtasks
    - SubTasks have `needs` dependencies (DAG execution)
    - formula_id tracks source formula
    - formula_vars stores user-provided variable values
    
    Ralph Wiggum Additions:
    - Complexity-based iteration budgets
    - Total iteration tracking across subtasks
    - Batch mode support (overnight runs)
    """
    task_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    title: str
    description: str
    submitted_by: str = "user"  # 'user' or agent_id
    status: TaskStatus = TaskStatus.PENDING
    priority: int = Field(default=5, ge=1, le=10)  # 1=low, 10=critical
    
    # Breakdown
    subtasks: List[SubTask] = Field(default_factory=list)
    breakdown_prompt: Optional[str] = None  # Prompt used to break down
    
    # Assignment
    leader_id: Optional[str] = None  # Who broke it down
    
    # Timing
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Results
    final_result: Optional[str] = None
    error: Optional[str] = None
    
    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # --- Formula Fields ---
    formula_id: Optional[str] = None                        # Source formula if cooked
    formula_vars: Dict[str, Any] = Field(default_factory=dict)  # User-provided variable values
    
    # --- Ralph Wiggum Task-Level Fields ---
    complexity_score: int = Field(default=5, ge=1, le=10)  # Overall task complexity
    total_iteration_budget: int = Field(default=50)        # Max iterations across all subtasks
    total_iterations_used: int = 0                         # Sum of subtask iterations
    
    # Batch mode (overnight runs)
    batch_id: Optional[str] = None                         # If part of a batch
    is_batch_priority: bool = False                        # Send notification if stuck (vs park)
    overnight_mode: bool = False                           # Running unattended
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}
    
    @classmethod
    def create(
        cls,
        title: str,
        description: str,
        submitted_by: str = "user",
        priority: int = 5,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "Task":
        """Factory method to create a new task."""
        return cls(
            title=title,
            description=description,
            submitted_by=submitted_by,
            priority=priority,
            metadata=metadata or {},
        )
    
    def add_subtask(
        self,
        title: str,
        description: str,
    ) -> SubTask:
        """Add a subtask."""
        subtask = SubTask(title=title, description=description)
        self.subtasks.append(subtask)
        return subtask
    
    def get_pending_subtasks(self) -> List[SubTask]:
        """Get subtasks ready for assignment (PENDING and not blocked)."""
        return [
            st for st in self.subtasks 
            if st.status == TaskStatus.PENDING and not st.blocked_by
        ]
    
    def get_blocked_subtasks(self) -> List[SubTask]:
        """Get subtasks blocked by dependencies."""
        return [st for st in self.subtasks if st.blocked_by]
    
    def unblock_dependents(self, completed_subtask_id: str) -> List[SubTask]:
        """Unblock subtasks that were waiting on the completed subtask.
        
        Called when a subtask completes. Removes completed_subtask_id from
        blocked_by lists and returns newly-unblocked subtasks.
        """
        unblocked = []
        for st in self.subtasks:
            if completed_subtask_id in st.blocked_by:
                st.blocked_by.remove(completed_subtask_id)
                if not st.blocked_by and st.status == TaskStatus.PENDING:
                    unblocked.append(st)
        return unblocked
    
    def get_active_subtasks(self) -> List[SubTask]:
        """Get subtasks in progress."""
        return [st for st in self.subtasks if st.status in (TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS)]
    
    def all_subtasks_done(self) -> bool:
        """Check if all subtasks completed or failed."""
        if not self.subtasks:
            return False
        return all(
            st.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED)
            for st in self.subtasks
        )
    
    def update_status_from_subtasks(self) -> None:
        """Update task status based on subtask states."""
        if not self.subtasks:
            return
        
        if self.all_subtasks_done():
            failed = [st for st in self.subtasks if st.status == TaskStatus.FAILED]
            if failed:
                self.status = TaskStatus.FAILED
                self.error = f"{len(failed)} subtask(s) failed"
            else:
                self.status = TaskStatus.COMPLETED
            self.completed_at = datetime.utcnow()
        elif any(st.status in (TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS) for st in self.subtasks):
            self.status = TaskStatus.IN_PROGRESS


class TaskBreakdown(BaseModel):
    """Request to break down a task into subtasks."""
    task_id: str
    subtasks: List[Dict[str, str]]  # [{title, description}, ...]


# --- Request/Response Models ---

class CreateTaskRequest(BaseModel):
    """Request to create a new task."""
    title: str = Field(..., min_length=1, max_length=500)
    description: str = Field(default="", max_length=10000)
    priority: int = Field(default=5, ge=1, le=10)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class CreateTaskResponse(BaseModel):
    """Response after creating a task."""
    ok: bool
    task_id: str
    message: str


class BreakdownRequest(BaseModel):
    """Request for leader to break down a task."""
    task_id: str
    subtasks: List[Dict[str, str]]  # [{title, description}, ...]


class BreakdownResponse(BaseModel):
    """Response after task breakdown."""
    ok: bool
    task_id: str
    subtask_count: int
    message: str


class WorkerPollRequest(BaseModel):
    """Worker polling for work."""
    agent_id: str
    capabilities: List[str] = Field(default_factory=list)
    max_tasks: int = Field(default=1, ge=1, le=5)


class WorkerPollResponse(BaseModel):
    """Response to worker poll."""
    ok: bool
    assignments: List[Dict[str, Any]] = Field(default_factory=list)
    message: str


class TaskResultRequest(BaseModel):
    """Worker reporting subtask result.
    
    Ralph Wiggum additions:
    - context_tokens_used: How many tokens worker consumed
    - promise: Completion signal (DONE, BLOCKED, STUCK, PROGRESS)
    - promise_detail: Extra info (e.g., "80" for PROGRESS, "missing key" for BLOCKED)
    - approach_tried: What approach worker attempted (for dedup on retry)
    """
    agent_id: str
    task_id: str
    subtask_id: str
    success: bool
    result: str = ""
    error: Optional[str] = None
    
    # Ralph Wiggum iteration reporting
    context_tokens_used: int = 0                           # Tokens consumed this iteration
    promise: Optional[PromiseType] = None                  # Completion signal
    promise_detail: str = ""                               # Detail for BLOCKED/STUCK/PROGRESS
    approach_tried: str = ""                               # What was attempted


class TaskResultResponse(BaseModel):
    """Response after result submission.
    
    Ralph Wiggum additions:
    - iteration_num: Which iteration this was
    - iterations_remaining: Budget left
    - context_alert: True if context usage high
    - next_action: What happens next (retry, hint, escalate)
    """
    ok: bool
    message: str
    
    # Ralph Wiggum feedback to worker
    iteration_num: int = 0
    iterations_remaining: int = 0
    context_alert: bool = False        # True if context > 80% threshold
    next_action: str = ""              # "retry", "hint_injected", "reassigning", "escalate_human"


class TaskStatusResponse(BaseModel):
    """Detailed task status."""
    ok: bool
    task: Optional[Task] = None
    message: str


class TaskListResponse(BaseModel):
    """List of tasks."""
    ok: bool
    tasks: List[Task] = Field(default_factory=list)
    total: int = 0


# =============================================================================
# RALPH WIGGUM BATCH MODE MODELS
# =============================================================================

class BatchStatus(str, Enum):
    """Batch job status."""
    PENDING = "pending"         # Waiting to start
    RUNNING = "running"         # Actively processing tasks
    PAUSED = "paused"           # Manually paused
    COMPLETED = "completed"     # All tasks done
    PARTIAL = "partial"         # Some tasks need human input
    FAILED = "failed"           # Critical failure


class BatchTask(BaseModel):
    """Reference to a task in a batch."""
    task_id: str
    title: str
    status: TaskStatus = TaskStatus.PENDING
    needs_human: bool = False
    human_reason: str = ""


class Batch(BaseModel):
    """A batch of tasks for overnight/unattended execution.
    
    Batch mode allows queuing multiple tasks with:
    - Total iteration budget across all tasks
    - Optional deadline (stop at time X)
    - Morning report generation
    - Park-and-continue for human-needed tasks
    """
    batch_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str = ""
    status: BatchStatus = BatchStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Tasks in this batch
    tasks: List[BatchTask] = Field(default_factory=list)
    
    # Budget
    total_iteration_budget: int = Field(default=100)
    iterations_used: int = 0
    
    # Timing
    deadline: Optional[datetime] = None  # Stop at this time
    
    # Results summary (for morning report)
    tasks_completed: int = 0
    tasks_failed: int = 0
    tasks_needs_human: int = 0
    
    # Notification settings
    notify_on_complete: bool = True
    notify_on_human_needed: bool = True  # For priority tasks
    notification_email: str = ""
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}
    
    def get_morning_report(self) -> str:
        """Generate morning report summary."""
        total = len(self.tasks)
        lines = [
            f"# Batch Report: {self.name or self.batch_id}",
            f"",
            f"**Status:** {self.status.value}",
            f"**Duration:** {self._format_duration()}",
            f"**Iterations:** {self.iterations_used}/{self.total_iteration_budget}",
            f"",
            f"## Summary",
            f"- ✅ Completed: {self.tasks_completed}/{total}",
            f"- ❌ Failed: {self.tasks_failed}/{total}",
            f"- 👤 Needs Human: {self.tasks_needs_human}/{total}",
            f"",
        ]
        
        if self.tasks_needs_human > 0:
            lines.append("## Tasks Needing Human Input")
            for t in self.tasks:
                if t.needs_human:
                    lines.append(f"- **{t.title}**: {t.human_reason}")
        
        return "\n".join(lines)
    
    def _format_duration(self) -> str:
        if not self.started_at:
            return "Not started"
        end = self.completed_at or datetime.utcnow()
        delta = end - self.started_at
        hours = delta.seconds // 3600
        minutes = (delta.seconds % 3600) // 60
        return f"{hours}h {minutes}m"


class CreateBatchRequest(BaseModel):
    """Request to create a batch of tasks."""
    name: str = ""
    tasks: List[CreateTaskRequest] = Field(default_factory=list)
    total_iteration_budget: int = Field(default=100, ge=10, le=1000)
    deadline_hours: Optional[float] = None  # Hours from now
    notify_email: str = ""


class CreateBatchResponse(BaseModel):
    """Response after creating a batch."""
    ok: bool
    batch_id: str
    task_count: int
    message: str


class BatchStatusResponse(BaseModel):
    """Batch status with morning report."""
    ok: bool
    batch: Optional[Batch] = None
    morning_report: str = ""
    message: str


# =============================================================================
# FORMULA SYSTEM - TOML WORKFLOW DEFINITIONS
# =============================================================================

class FormulaVarType(str, Enum):
    """Variable types for formula inputs."""
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    CHOICE = "choice"
    FILE_PATH = "file_path"


class FormulaVar(BaseModel):
    """A variable in a formula that user fills in before cooking.
    
    Example TOML:
    [vars]
    feature_name = { type = "string", required = true, prompt = "Feature name?" }
    complexity = { type = "choice", options = ["simple", "medium", "complex"] }
    """
    name: str
    var_type: FormulaVarType = FormulaVarType.STRING
    required: bool = True
    default: Optional[Any] = None  # Can be string, bool, int, etc.
    prompt: str = ""  # Question to ask user
    options: List[str] = Field(default_factory=list)  # For choice type
    description: str = ""


class FormulaStep(BaseModel):
    """A step in a formula workflow.
    
    Steps become SubTasks when the formula is cooked.
    The `needs` field creates dependency chains (blocked until prereqs complete).
    
    Example TOML:
    [[steps]]
    id = "plan_feature"
    name = "Plan Implementation"
    prompt_ref = "plan-feature"  # Maps to ai/prompts/plan-feature.md
    needs = ["create_prd"]       # Blocked until create_prd completes
    output_artifact = "plan.md"
    """
    id: str  # Unique within formula
    name: str
    description: str = ""
    
    # Prompt reference - maps to ai/prompts/{prompt_ref}.md
    prompt_ref: Optional[str] = None
    inline_prompt: str = ""  # Alternative: inline prompt text
    
    # Dependencies - step IDs that must complete first
    needs: List[str] = Field(default_factory=list)
    
    # Artifacts
    input_artifacts: List[str] = Field(default_factory=list)  # Files from prior steps
    output_artifact: Optional[str] = None  # File this step produces
    
    # Execution options
    parallel: bool = False  # Can spawn multiple workers
    complexity_hint: int = Field(default=5, ge=1, le=10)  # Suggested complexity
    optional: bool = False  # Can be skipped
    
    # Variable interpolation - which vars this step uses
    uses_vars: List[str] = Field(default_factory=list)


class Formula(BaseModel):
    """A reusable workflow template.
    
    Formulas are stored as TOML files in ai/formulas/ and can be:
    - Browsed in the UI
    - Edited with the Formula Editor
    - "Cooked" to create a Task with pre-configured SubTasks
    
    Example TOML:
    [formula]
    name = "Hackathon PRD Flow"
    description = "Full product spec to working feature"
    version = "1.0"
    tags = ["prd", "feature"]
    
    [vars]
    feature_name = { type = "string", required = true }
    
    [[steps]]
    id = "create_prd"
    ...
    """
    formula_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str
    description: str = ""
    version: str = "1.0"
    author: str = "kuroryuu"
    tags: List[str] = Field(default_factory=list)
    
    # Variables user fills in
    variables: List[FormulaVar] = Field(default_factory=list)
    
    # Workflow steps
    steps: List[FormulaStep] = Field(default_factory=list)
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    file_path: Optional[str] = None  # Path to TOML file
    is_builtin: bool = False  # True for shipped formulas
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}
    
    def get_step_by_id(self, step_id: str) -> Optional[FormulaStep]:
        """Get a step by its ID."""
        for step in self.steps:
            if step.id == step_id:
                return step
        return None
    
    def get_root_steps(self) -> List[FormulaStep]:
        """Get steps with no dependencies (entry points)."""
        return [s for s in self.steps if not s.needs]
    
    def get_dependent_steps(self, step_id: str) -> List[FormulaStep]:
        """Get steps that depend on the given step."""
        return [s for s in self.steps if step_id in s.needs]
    
    def validate_dag(self) -> List[str]:
        """Validate that steps form a valid DAG (no cycles).
        
        Returns list of errors, empty if valid.
        """
        errors = []
        step_ids = {s.id for s in self.steps}
        
        # Check all needs references exist
        for step in self.steps:
            for need in step.needs:
                if need not in step_ids:
                    errors.append(f"Step '{step.id}' needs unknown step '{need}'")
        
        # Check for cycles using DFS
        visited = set()
        rec_stack = set()
        
        def has_cycle(step_id: str) -> bool:
            visited.add(step_id)
            rec_stack.add(step_id)
            
            step = self.get_step_by_id(step_id)
            if step:
                for dep in self.get_dependent_steps(step_id):
                    if dep.id not in visited:
                        if has_cycle(dep.id):
                            return True
                    elif dep.id in rec_stack:
                        return True
            
            rec_stack.remove(step_id)
            return False
        
        for step in self.steps:
            if step.id not in visited:
                if has_cycle(step.id):
                    errors.append(f"Cycle detected involving step '{step.id}'")
                    break
        
        return errors


class ApplyFormulaRequest(BaseModel):
    """Request to apply a formula.

    Applying adds tasks to ai/todo.md based on the formula steps.
    """
    formula_id: str
    variables: Dict[str, Any] = Field(default_factory=dict)  # User-provided var values
    priority: int = Field(default=5, ge=1, le=10)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ApplyFormulaResponse(BaseModel):
    """Response after applying a formula.

    Returns task_ids as a list of task IDs that were added to ai/todo.md
    Backlog section.
    """
    ok: bool
    task_ids: List[str] = Field(default_factory=list)  # List of task IDs added to todo.md
    task_count: int = 0  # Number of tasks added
    message: str
    # Legacy fields for backwards compatibility
    task_id: str = ""  # Deprecated: first task ID or empty
    subtask_count: int = 0  # Deprecated: same as task_count


# Aliases for backwards compatibility
CookFormulaRequest = ApplyFormulaRequest
CookFormulaResponse = ApplyFormulaResponse


class FormulaListResponse(BaseModel):
    """List of available formulas."""
    ok: bool
    formulas: List[Formula] = Field(default_factory=list)
    total: int = 0


class FormulaDetailResponse(BaseModel):
    """Detailed formula info."""
    ok: bool
    formula: Optional[Formula] = None
    message: str