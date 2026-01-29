"""Orchestration Router - FastAPI endpoints for task orchestration.

M4 Multi-Agent Message Bus implementation.

## IMPORTANT: Task Source of Truth

**ai/todo.md is THE source of truth for tasks.**

Tasks should be managed via:
- Formulas to add tasks to ai/todo.md
- k_inbox for leader-worker coordination
- todo.md integration methods in leader.py/worker.py

## REMOVED ENDPOINTS (Phase 4 Cleanup)

The following deprecated endpoints have been REMOVED:
- Task CRUD: POST/GET /tasks, GET /tasks/{id}, POST /tasks/{id}/breakdown
- Worker polling: POST /poll, /claim, /start, /result, /release, /reassign
- Stats: GET /stats (use /v1/system/stats instead)

## ACTIVE ENDPOINTS

Formulas:
- GET /v1/orchestration/formulas - List formulas
- GET /v1/orchestration/formulas/{id} - Get formula details
- POST /v1/orchestration/formulas/{id}/apply - Apply formula to todo.md

Recovery:
- POST /v1/orchestration/recovery/* - Pause/resume/checkpoint operations

Single-Agent Mode:
- GET/POST /v1/orchestration/single-agent/* - Context-limited agent support

Batch Mode:
- POST /v1/orchestration/batch - Create batch
- GET /v1/orchestration/batch/{id} - Get batch status

Legacy (kept for compatibility):
- POST /v1/orchestration/cancel - Cancel task
- POST /v1/orchestration/finalize - Finalize completed task
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .models import (
    TaskStatus,
    TaskResultResponse,
    PromiseType,
    Batch,
    BatchStatus,
    CreateBatchRequest,
    CreateBatchResponse,
    BatchStatusResponse,
)
from .leader import LeaderOrchestrator
# NOTE: get_storage is still used by batch endpoints - technical debt to refactor to todo.md
from .storage import get_storage
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


router = APIRouter(prefix="/v1/orchestration", tags=["orchestration"])


# --- Task Management ---
# NOTE: Task CRUD endpoints (POST /tasks, GET /tasks, GET /tasks/{id}, POST /tasks/{id}/breakdown)
# have been REMOVED. Use formulas to add tasks to ai/todo.md instead.

# --- Worker Operations ---
# NOTE: Worker polling endpoints (POST /poll, /claim, /start, /result, /release, /reassign)
# have been REMOVED. Workers should receive tasks via k_inbox from leader.
# Leader reads ai/todo.md and assigns tasks to workers via inbox coordination.


class CancelRequest(BaseModel):
    """Request to cancel a task."""
    leader_id: str
    task_id: str
    reason: str = ""


@router.post("/cancel", response_model=TaskResultResponse)
async def cancel_task(request: CancelRequest):
    """Cancel a task and all its subtasks."""
    leader = LeaderOrchestrator(leader_id=request.leader_id)
    
    success, message = leader.cancel_task(
        task_id=request.task_id,
        reason=request.reason,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return TaskResultResponse(ok=True, message=message)


class FinalizeRequest(BaseModel):
    """Request to finalize a task."""
    leader_id: str
    task_id: str
    final_result: str = ""


@router.post("/finalize", response_model=TaskResultResponse)
async def finalize_task(request: FinalizeRequest):
    """Finalize a completed task with aggregated result."""
    leader = LeaderOrchestrator(leader_id=request.leader_id)
    
    success, message = leader.finalize_task(
        task_id=request.task_id,
        final_result=request.final_result,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return TaskResultResponse(ok=True, message=message)


# --- Statistics ---
# NOTE: GET /stats has been REMOVED (was in-memory only).
# Use /v1/system/stats (unified stats endpoint) instead.
# A redirect will be added after Phase 5 creates the unified endpoint.


# --- SingleAgentMode Endpoints ---

from .single_agent import SingleAgentExecutor, create_single_agent_executor

# Cache of active single-agent executors
_single_agent_executors: dict[str, SingleAgentExecutor] = {}


def get_executor(agent_id: str, project_root: Optional[str] = None) -> SingleAgentExecutor:
    """Get or create a SingleAgentExecutor for an agent."""
    key = f"{agent_id}:{project_root or 'default'}"
    if key not in _single_agent_executors:
        _single_agent_executors[key] = create_single_agent_executor(agent_id, project_root)
    return _single_agent_executors[key]


class SingleAgentStatusResponse(BaseModel):
    """Response for single agent status."""
    ok: bool = True
    agent_id: str
    current_task_id: Optional[str] = None
    subtask_index: int = 0
    total_subtasks: int = 0
    completed_count: int = 0
    failed_count: int = 0
    reboot_count: int = 0
    last_checkpoint: str = ""
    context_summary_length: int = 0


class SingleAgentAssignRequest(BaseModel):
    """Request to assign a task to single agent."""
    agent_id: str
    task_id: str
    project_root: Optional[str] = None
    reset_progress: bool = True


class SingleAgentExecuteRequest(BaseModel):
    """Request to execute one subtask."""
    agent_id: str
    project_root: Optional[str] = None


class SingleAgentExecuteResponse(BaseModel):
    """Response from single subtask execution."""
    ok: bool = True
    status: str  # subtask_complete, task_complete, no_work, error
    task_id: Optional[str] = None
    subtask_id: Optional[str] = None
    result: Optional[str] = None
    remaining: Optional[int] = None
    reboot_count: int = 0
    error: Optional[str] = None
    message: Optional[str] = None


@router.get("/single-agent/{agent_id}/status", response_model=SingleAgentStatusResponse)
async def get_single_agent_status(
    agent_id: str,
    project_root: Optional[str] = Query(None, description="Project root directory"),
):
    """Get status of a single agent executor.
    
    Returns current task progress, reboot count, and context summary info.
    """
    executor = get_executor(agent_id, project_root)
    status = executor.get_status()
    return SingleAgentStatusResponse(
        ok=True,
        agent_id=status["agent_id"],
        current_task_id=status["current_task_id"],
        subtask_index=status["subtask_index"],
        total_subtasks=status["total_subtasks"],
        completed_count=status["completed_count"],
        failed_count=status["failed_count"],
        reboot_count=status["reboot_count"],
        last_checkpoint=status["last_checkpoint"],
        context_summary_length=status["context_summary_length"],
    )


@router.post("/single-agent/assign", response_model=TaskResultResponse)
async def assign_task_to_single_agent(request: SingleAgentAssignRequest):
    """Assign a task to a single agent executor.
    
    The agent will work through subtasks one at a time, saving state
    to disk between each "reboot".
    """
    executor = get_executor(request.agent_id, request.project_root)
    
    success = executor.assign_task(
        task_id=request.task_id,
        reset_progress=request.reset_progress,
    )
    
    if not success:
        raise HTTPException(status_code=404, detail=f"Task {request.task_id} not found")
    
    return TaskResultResponse(
        ok=True,
        message=f"Task {request.task_id} assigned to agent {request.agent_id}",
    )


@router.post("/single-agent/execute", response_model=SingleAgentExecuteResponse)
async def execute_single_subtask(request: SingleAgentExecuteRequest):
    """Execute one subtask for a single agent.
    
    This is the main entry point for the SingleAgentMode loop:
    1. Agent calls this endpoint
    2. Executor loads state, gets next subtask
    3. Returns context prompt and subtask details
    4. Agent executes, calls result endpoint
    5. Agent "reboots" (clears context)
    6. Loop back to step 1
    
    Note: This endpoint returns immediately with subtask to execute.
    The actual execution happens client-side, then result is reported
    via the normal /result endpoint.
    """
    executor = get_executor(request.agent_id, request.project_root)
    
    # Get next work (don't execute, just return what to do)
    work = executor.get_next_subtask()
    
    if not work:
        return SingleAgentExecuteResponse(
            ok=True,
            status="no_work",
            message="No subtasks available",
            reboot_count=executor.state.reboot_count,
        )
    
    task, subtask = work
    
    # Update state
    executor.state.current_task_id = task.task_id
    executor.state.current_subtask_id = subtask.subtask_id
    executor.state.total_subtasks = len(task.subtasks)
    executor.state.reboot_count += 1
    executor.save_state()
    
    # Build context prompt
    context_prompt = executor.build_context_prompt(subtask)
    
    return SingleAgentExecuteResponse(
        ok=True,
        status="ready",
        task_id=task.task_id,
        subtask_id=subtask.subtask_id,
        result=context_prompt,  # Use result field for context prompt
        remaining=len([st for st in task.subtasks if st.subtask_id not in executor.state.completed_subtasks]),
        reboot_count=executor.state.reboot_count,
        message=f"Execute subtask: {subtask.title}",
    )


@router.post("/single-agent/reset")
async def reset_single_agent(
    agent_id: str = Query(..., description="Agent ID to reset"),
    project_root: Optional[str] = Query(None, description="Project root directory"),
):
    """Reset a single agent's state.
    
    Use this to start fresh or recover from errors.
    """
    executor = get_executor(agent_id, project_root)
    executor.reset_state()
    
    return {
        "ok": True,
        "message": f"Agent {agent_id} state reset",
    }


@router.get("/single-agent/{agent_id}/context")
async def get_single_agent_context(
    agent_id: str,
    project_root: Optional[str] = Query(None, description="Project root directory"),
):
    """Get the context summary for a single agent.
    
    Returns the compressed summary of work done so far,
    useful for debugging or display.
    """
    executor = get_executor(agent_id, project_root)
    
    return {
        "ok": True,
        "agent_id": agent_id,
        "context_summary": executor.state.context_summary,
        "next_action": executor.state.next_action,
        "files_touched": executor.state.files_touched,
        "completed_subtasks": executor.state.completed_subtasks,
    }


# --- Recovery Manager Endpoints ---

from .recovery import (
    RecoveryManager, 
    PauseReason, 
    PauseState, 
    Checkpoint,
    get_recovery_manager,
)


class PauseTaskRequest(BaseModel):
    """Request to pause a task."""
    task_id: str
    reason: str = "user_request"
    message: str = ""
    paused_by: str = "user"


class ResumeTaskRequest(BaseModel):
    """Request to resume a task."""
    task_id: str
    resumed_by: str = "user"


class CreateCheckpointRequest(BaseModel):
    """Request to create a checkpoint."""
    task_id: str
    reason: str = ""
    created_by: str = "user"
    include_agent_states: bool = True


class RestoreCheckpointRequest(BaseModel):
    """Request to restore from checkpoint."""
    task_id: str
    checkpoint_id: str
    restore_agent_states: bool = True


class RollbackSubtaskRequest(BaseModel):
    """Request to rollback a subtask."""
    task_id: str
    subtask_id: str
    reason: str = "Manual rollback"


@router.post("/recovery/pause")
async def pause_task(request: PauseTaskRequest):
    """Pause a task.
    
    Pausing prevents new subtask assignments and marks in-progress 
    subtasks as needing attention. Does not forcefully stop agents.
    """
    manager = get_recovery_manager()
    
    try:
        reason = PauseReason(request.reason)
    except ValueError:
        reason = PauseReason.USER_REQUEST
    
    success, message = manager.pause_task(
        task_id=request.task_id,
        reason=reason,
        message=request.message,
        paused_by=request.paused_by,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"ok": True, "message": message}


@router.post("/recovery/resume")
async def resume_task(request: ResumeTaskRequest):
    """Resume a paused task."""
    manager = get_recovery_manager()
    
    success, message = manager.resume_task(
        task_id=request.task_id,
        resumed_by=request.resumed_by,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"ok": True, "message": message}


@router.get("/recovery/paused")
async def list_paused_tasks():
    """List all paused tasks."""
    manager = get_recovery_manager()
    paused = manager.list_paused_tasks()
    
    return {
        "ok": True,
        "paused_tasks": [
            {
                "task_id": ps.task_id,
                "paused_at": ps.paused_at.isoformat(),
                "paused_by": ps.paused_by,
                "reason": ps.reason.value,
                "message": ps.message,
                "affected_subtasks": ps.affected_subtasks,
            }
            for ps in paused
        ],
    }


@router.get("/recovery/task/{task_id}/is-paused")
async def is_task_paused(task_id: str):
    """Check if a specific task is paused."""
    manager = get_recovery_manager()
    paused = manager.is_task_paused(task_id)
    pause_state = manager.get_pause_state(task_id)
    
    return {
        "ok": True,
        "task_id": task_id,
        "is_paused": paused,
        "pause_info": {
            "paused_at": pause_state.paused_at.isoformat(),
            "reason": pause_state.reason.value,
            "message": pause_state.message,
        } if pause_state else None,
    }


@router.post("/recovery/pause-all")
async def pause_all_tasks(
    reason: str = Query("system_maintenance", description="Pause reason"),
    message: str = Query("", description="Pause message"),
):
    """Pause all active tasks.
    
    Used for system maintenance or graceful shutdown.
    """
    manager = get_recovery_manager()
    
    try:
        pause_reason = PauseReason(reason)
    except ValueError:
        pause_reason = PauseReason.SYSTEM_MAINTENANCE
    
    count = manager.pause_all(reason=pause_reason, message=message)
    
    return {"ok": True, "paused_count": count}


@router.post("/recovery/resume-all")
async def resume_all_tasks():
    """Resume all paused tasks."""
    manager = get_recovery_manager()
    count = manager.resume_all()
    
    return {"ok": True, "resumed_count": count}


@router.post("/recovery/checkpoint")
async def create_checkpoint(request: CreateCheckpointRequest):
    """Create a checkpoint for a task.
    
    Checkpoints save task state for potential rollback.
    """
    manager = get_recovery_manager()
    
    success, message, checkpoint_id = manager.create_checkpoint(
        task_id=request.task_id,
        reason=request.reason,
        created_by=request.created_by,
        include_agent_states=request.include_agent_states,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"ok": True, "message": message, "checkpoint_id": checkpoint_id}


@router.get("/recovery/checkpoints/{task_id}")
async def list_checkpoints(task_id: str):
    """List all checkpoints for a task."""
    manager = get_recovery_manager()
    checkpoints = manager.list_checkpoints(task_id)
    
    return {
        "ok": True,
        "task_id": task_id,
        "checkpoints": [
            {
                "checkpoint_id": cp.checkpoint_id,
                "created_at": cp.created_at.isoformat(),
                "created_by": cp.created_by,
                "reason": cp.reason,
                "has_agent_states": bool(cp.agent_states),
            }
            for cp in checkpoints
        ],
    }


@router.post("/recovery/restore")
async def restore_checkpoint(request: RestoreCheckpointRequest):
    """Restore a task from a checkpoint."""
    manager = get_recovery_manager()
    
    success, message = manager.restore_checkpoint(
        task_id=request.task_id,
        checkpoint_id=request.checkpoint_id,
        restore_agent_states=request.restore_agent_states,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"ok": True, "message": message}


@router.delete("/recovery/checkpoint/{task_id}/{checkpoint_id}")
async def delete_checkpoint(task_id: str, checkpoint_id: str):
    """Delete a specific checkpoint."""
    manager = get_recovery_manager()
    deleted = manager.delete_checkpoint(task_id, checkpoint_id)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    
    return {"ok": True, "message": f"Checkpoint {checkpoint_id} deleted"}


@router.post("/recovery/rollback")
async def rollback_subtask(request: RollbackSubtaskRequest):
    """Rollback a failed subtask to pending state.
    
    This allows the subtask to be re-claimed and retried.
    """
    manager = get_recovery_manager()
    
    success, message = manager.rollback_subtask(
        task_id=request.task_id,
        subtask_id=request.subtask_id,
        reason=request.reason,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"ok": True, "message": message}


@router.get("/recovery/retry/{subtask_id}")
async def get_retry_info(subtask_id: str):
    """Get retry information for a subtask."""
    manager = get_recovery_manager()
    
    return {
        "ok": True,
        "subtask_id": subtask_id,
        "retry_count": manager.get_retry_count(subtask_id),
        "should_retry": manager.should_retry(subtask_id),
        "max_retries": manager.MAX_RETRY_ATTEMPTS,
    }


@router.post("/recovery/shutdown")
async def prepare_shutdown():
    """Prepare for graceful shutdown.
    
    Pauses all tasks, creates checkpoints, saves state.
    """
    manager = get_recovery_manager()
    summary = manager.prepare_shutdown()
    
    return {"ok": True, **summary}


@router.post("/recovery/startup")
async def recover_from_shutdown():
    """Recover from a shutdown.
    
    Loads pause states and optionally resumes maintenance-paused tasks.
    """
    manager = get_recovery_manager()
    summary = manager.recover_from_shutdown()
    
    return {"ok": True, **summary}


@router.get("/recovery/stats")
async def get_recovery_stats():
    """Get recovery manager statistics."""
    manager = get_recovery_manager()
    return {"ok": True, **manager.get_stats()}


# =============================================================================
# RALPH WIGGUM BATCH MODE ENDPOINTS
# =============================================================================

# In-memory batch storage (will be moved to file storage later)
_batches: dict[str, Batch] = {}


@router.post("/batch", response_model=CreateBatchResponse)
async def create_batch(request: CreateBatchRequest):
    """Create a batch of tasks for overnight/unattended execution.
    
    Ralph Wiggum batch mode:
    - Queue multiple tasks with shared iteration budget
    - Optional deadline (stop at time X)
    - Park tasks needing human input, continue others
    - Generate morning report on completion
    """
    from datetime import timedelta
    
    batch = Batch(
        name=request.name or f"Batch-{len(_batches) + 1}",
        total_iteration_budget=request.total_iteration_budget,
        notification_email=request.notify_email,
    )
    
    # Set deadline if provided
    if request.deadline_hours:
        batch.deadline = datetime.utcnow() + timedelta(hours=request.deadline_hours)
    
    # Create tasks for this batch
    leader = LeaderOrchestrator(leader_id="batch_system")
    
    for task_req in request.tasks:
        task, _ = leader.create_task(
            title=task_req.title,
            description=task_req.description,
            priority=task_req.priority,
            metadata={
                **task_req.metadata,
                "batch_id": batch.batch_id,
            },
        )
        task.batch_id = batch.batch_id
        task.overnight_mode = True
        get_storage().save(task)
        
        from .models import BatchTask
        batch.tasks.append(BatchTask(
            task_id=task.task_id,
            title=task.title,
            status=task.status,
        ))
    
    _batches[batch.batch_id] = batch
    
    return CreateBatchResponse(
        ok=True,
        batch_id=batch.batch_id,
        task_count=len(batch.tasks),
        message=f"Created batch with {len(batch.tasks)} tasks, budget: {batch.total_iteration_budget} iterations",
    )


@router.get("/batch/{batch_id}", response_model=BatchStatusResponse)
async def get_batch_status(batch_id: str):
    """Get batch status and morning report."""
    batch = _batches.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    
    # Update batch status from tasks
    storage = get_storage()
    batch.tasks_completed = 0
    batch.tasks_failed = 0
    batch.tasks_needs_human = 0
    
    for bt in batch.tasks:
        task = storage.get(bt.task_id)
        if task:
            bt.status = task.status
            if task.status == TaskStatus.COMPLETED:
                batch.tasks_completed += 1
            elif task.status == TaskStatus.FAILED:
                batch.tasks_failed += 1
            # Check for human-needed
            for st in task.subtasks:
                if st.escalation_level >= 3 or st.last_promise == PromiseType.BLOCKED:
                    bt.needs_human = True
                    bt.human_reason = st.last_promise_detail or "Escalated to human"
                    batch.tasks_needs_human += 1
                    break
    
    # Update batch status
    if all(bt.status in (TaskStatus.COMPLETED, TaskStatus.FAILED) for bt in batch.tasks):
        batch.status = BatchStatus.COMPLETED if batch.tasks_failed == 0 else BatchStatus.PARTIAL
        batch.completed_at = datetime.utcnow()
    elif batch.tasks_needs_human > 0:
        batch.status = BatchStatus.PARTIAL
    
    return BatchStatusResponse(
        ok=True,
        batch=batch,
        morning_report=batch.get_morning_report(),
        message=f"Batch {batch.status.value}: {batch.tasks_completed}/{len(batch.tasks)} completed",
    )


@router.get("/batch", response_model=dict)
async def list_batches(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(20, ge=1, le=100),
):
    """List all batches."""
    batches = list(_batches.values())
    
    if status:
        try:
            batch_status = BatchStatus(status)
            batches = [b for b in batches if b.status == batch_status]
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    
    # Sort by created_at descending
    batches.sort(key=lambda b: b.created_at, reverse=True)
    batches = batches[:limit]
    
    return {
        "ok": True,
        "batches": [
            {
                "batch_id": b.batch_id,
                "name": b.name,
                "status": b.status.value,
                "task_count": len(b.tasks),
                "completed": b.tasks_completed,
                "failed": b.tasks_failed,
                "needs_human": b.tasks_needs_human,
                "created_at": b.created_at.isoformat(),
            }
            for b in batches
        ],
        "total": len(batches),
    }


@router.post("/batch/{batch_id}/start")
async def start_batch(batch_id: str):
    """Start processing a batch."""
    batch = _batches.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    
    if batch.status != BatchStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Batch is {batch.status.value}, not pending")
    
    batch.status = BatchStatus.RUNNING
    batch.started_at = datetime.utcnow()
    
    return {"ok": True, "batch_id": batch_id, "message": "Batch started"}


@router.post("/batch/{batch_id}/pause")
async def pause_batch(batch_id: str):
    """Pause a running batch."""
    batch = _batches.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    
    if batch.status != BatchStatus.RUNNING:
        raise HTTPException(status_code=400, detail=f"Batch is {batch.status.value}, not running")
    
    batch.status = BatchStatus.PAUSED
    
    return {"ok": True, "batch_id": batch_id, "message": "Batch paused"}


@router.post("/batch/{batch_id}/resume")
async def resume_batch(batch_id: str):
    """Resume a paused batch."""
    batch = _batches.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    
    if batch.status != BatchStatus.PAUSED:
        raise HTTPException(status_code=400, detail=f"Batch is {batch.status.value}, not paused")
    
    batch.status = BatchStatus.RUNNING
    
    return {"ok": True, "batch_id": batch_id, "message": "Batch resumed"}


# =============================================================================
# FORMULA ENDPOINTS
# =============================================================================

from .models import (
    Formula,
    FormulaVar,
    FormulaStep,
    ApplyFormulaRequest,
    ApplyFormulaResponse,
    FormulaListResponse,
    FormulaDetailResponse,
)
from .formulas import FormulaService

# Initialize formula service
_formula_service: Optional[FormulaService] = None

def get_formula_service() -> FormulaService:
    """Get or create formula service singleton."""
    global _formula_service
    if _formula_service is None:
        _formula_service = FormulaService()
    return _formula_service


@router.get("/formulas", response_model=FormulaListResponse)
async def list_formulas():
    """List all available formulas.
    
    Returns both built-in formulas and custom user-created ones.
    """
    service = get_formula_service()
    formulas = service.list_formulas()
    
    return FormulaListResponse(
        ok=True,
        formulas=formulas,
        total=len(formulas),
    )


@router.get("/formulas/{formula_id}", response_model=FormulaDetailResponse)
async def get_formula(formula_id: str):
    """Get detailed formula information by ID."""
    service = get_formula_service()
    formula = service.get_formula(formula_id)
    
    if not formula:
        raise HTTPException(status_code=404, detail=f"Formula {formula_id} not found")
    
    return FormulaDetailResponse(
        ok=True,
        formula=formula,
        message="Formula found",
    )


class CreateFormulaRequest(BaseModel):
    """Request to create a new formula."""
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    tags: List[str] = Field(default_factory=list)
    variables: List[dict] = Field(default_factory=list)
    steps: List[dict] = Field(default_factory=list)


@router.post("/formulas")
async def create_formula(request: CreateFormulaRequest):
    """Create a new custom formula.
    
    The formula will be saved as a TOML file in ai/formulas/custom/
    """
    service = get_formula_service()
    
    # Parse variables
    variables = []
    for v in request.variables:
        variables.append(FormulaVar(
            name=v.get("name", ""),
            var_type=v.get("type", "string"),
            required=v.get("required", True),
            default=v.get("default"),
            prompt=v.get("prompt", ""),
            options=v.get("options", []),
            description=v.get("description", ""),
        ))
    
    # Parse steps
    steps = []
    for s in request.steps:
        steps.append(FormulaStep(
            id=s.get("id", ""),
            name=s.get("name", ""),
            description=s.get("description", ""),
            prompt_ref=s.get("prompt_ref"),
            inline_prompt=s.get("inline_prompt", ""),
            needs=s.get("needs", []),
            input_artifacts=s.get("input_artifacts", []),
            output_artifact=s.get("output_artifact"),
            parallel=s.get("parallel", False),
            complexity_hint=s.get("complexity_hint", 5),
            optional=s.get("optional", False),
            uses_vars=s.get("uses_vars", []),
        ))
    
    # Create formula
    formula = Formula(
        name=request.name,
        description=request.description,
        tags=request.tags,
        variables=variables,
        steps=steps,
        is_builtin=False,
    )
    
    # Validate
    errors = service.validate_formula(formula)
    if errors:
        raise HTTPException(status_code=400, detail=f"Validation errors: {'; '.join(errors)}")
    
    # Save
    path = service.save_formula(formula)
    
    return {
        "ok": True,
        "formula_id": formula.formula_id,
        "file_path": str(path),
        "message": "Formula created",
    }


@router.put("/formulas/{formula_id}")
async def update_formula(formula_id: str, request: CreateFormulaRequest):
    """Update an existing formula.
    
    Note: Built-in formulas cannot be modified directly.
    """
    service = get_formula_service()
    
    # Get existing
    existing = service.get_formula(formula_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Formula {formula_id} not found")
    
    if existing.is_builtin:
        raise HTTPException(status_code=403, detail="Cannot modify built-in formulas. Clone it instead.")
    
    # Parse and update
    variables = []
    for v in request.variables:
        variables.append(FormulaVar(
            name=v.get("name", ""),
            var_type=v.get("type", "string"),
            required=v.get("required", True),
            default=v.get("default"),
            prompt=v.get("prompt", ""),
            options=v.get("options", []),
            description=v.get("description", ""),
        ))
    
    steps = []
    for s in request.steps:
        steps.append(FormulaStep(
            id=s.get("id", ""),
            name=s.get("name", ""),
            description=s.get("description", ""),
            prompt_ref=s.get("prompt_ref"),
            inline_prompt=s.get("inline_prompt", ""),
            needs=s.get("needs", []),
            input_artifacts=s.get("input_artifacts", []),
            output_artifact=s.get("output_artifact"),
            parallel=s.get("parallel", False),
            complexity_hint=s.get("complexity_hint", 5),
            optional=s.get("optional", False),
            uses_vars=s.get("uses_vars", []),
        ))
    
    # Update formula
    existing.name = request.name
    existing.description = request.description
    existing.tags = request.tags
    existing.variables = variables
    existing.steps = steps
    existing.updated_at = datetime.utcnow()
    
    # Validate
    errors = service.validate_formula(existing)
    if errors:
        raise HTTPException(status_code=400, detail=f"Validation errors: {'; '.join(errors)}")
    
    # Save
    path = service.save_formula(existing)
    
    return {
        "ok": True,
        "formula_id": formula_id,
        "file_path": str(path),
        "message": "Formula updated",
    }


@router.delete("/formulas/{formula_id}")
async def delete_formula(formula_id: str):
    """Delete a custom formula.
    
    Note: Built-in formulas cannot be deleted.
    """
    service = get_formula_service()
    
    # Get existing
    existing = service.get_formula(formula_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Formula {formula_id} not found")
    
    if existing.is_builtin:
        raise HTTPException(status_code=403, detail="Cannot delete built-in formulas")
    
    # Delete
    success = service.delete_formula(formula_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete formula")
    
    return {"ok": True, "formula_id": formula_id, "message": "Formula deleted"}


@router.post("/formulas/{formula_id}/apply", response_model=ApplyFormulaResponse)
async def apply_formula(formula_id: str, request: ApplyFormulaRequest):
    """Apply a formula by adding tasks to ai/todo.md.

    This is the main entry point for using formulas:
    1. User provides variable values
    2. System appends tasks to ai/todo.md Backlog section
    3. Tasks are listed in dependency order (implicit ordering)
    4. Leaders/Workers pick up tasks from todo.md
    """
    service = get_formula_service()

    # Validate formula ID matches
    if request.formula_id != formula_id:
        raise HTTPException(status_code=400, detail="Formula ID mismatch")

    try:
        # Apply the formula by appending to todo.md
        task_ids = service.apply_formula_to_todo(
            formula_id=formula_id,
            variables=request.variables,
        )

        return ApplyFormulaResponse(
            ok=True,
            task_ids=task_ids,
            task_count=len(task_ids),
            message=f"Added {len(task_ids)} tasks to Backlog: {', '.join(task_ids)}",
            # Legacy fields for backwards compatibility
            task_id=task_ids[0] if task_ids else "",
            subtask_count=len(task_ids),
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error applying formula: {e}")


@router.post("/formulas/{formula_id}/clone")
async def clone_formula(formula_id: str, new_name: Optional[str] = None):
    """Clone a formula (including built-in ones).
    
    Creates a copy in ai/formulas/custom/ that can be modified.
    """
    service = get_formula_service()
    
    # Get original
    original = service.get_formula(formula_id)
    if not original:
        raise HTTPException(status_code=404, detail=f"Formula {formula_id} not found")
    
    # Create clone
    clone = Formula(
        name=new_name or f"{original.name} (Copy)",
        description=original.description,
        version="1.0",
        author="user",
        tags=original.tags.copy(),
        variables=[v.copy() for v in original.variables],
        steps=[s.copy() for s in original.steps],
        is_builtin=False,
    )
    
    # Save
    path = service.save_formula(clone)
    
    return {
        "ok": True,
        "original_id": formula_id,
        "clone_id": clone.formula_id,
        "file_path": str(path),
        "message": "Formula cloned",
    }


@router.post("/formulas/{formula_id}/validate")
async def validate_formula(formula_id: str):
    """Validate a formula for errors.
    
    Checks:
    - DAG validity (no cycles)
    - Prompt references exist
    - Variable definitions are valid
    """
    service = get_formula_service()
    
    formula = service.get_formula(formula_id)
    if not formula:
        raise HTTPException(status_code=404, detail=f"Formula {formula_id} not found")
    
    errors = service.validate_formula(formula)
    
    return {
        "ok": len(errors) == 0,
        "formula_id": formula_id,
        "errors": errors,
        "message": "Valid" if not errors else f"{len(errors)} error(s) found",
    }
