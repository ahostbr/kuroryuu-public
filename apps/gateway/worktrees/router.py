"""
Git Worktree API Router

Provides REST endpoints for worktree management.

WORKTREE-TASK LINKING (Opt-In):
Worktrees can optionally be linked to tasks in todo.md. This is user-controlled:
- User provides task_id when creating worktree (validated against todo.md)
- User explicitly calls sync endpoints to update task status
- GUI should provide checkboxes for "mark task in-progress" / "mark task done"
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
from dataclasses import asdict

from .manager import get_worktree_manager
from .models import MergeMode, CreateWorktreeRequest
from ..orchestration.todo_md import TodoMdParser
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


router = APIRouter(prefix="/v1/worktrees", tags=["worktrees"])


# ============================================================================
# Request/Response Models
# ============================================================================

class WorktreeResponse(BaseModel):
    id: str
    type: str
    branch_name: str
    path: str
    status: str
    spec_name: Optional[str] = None
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    last_activity: Optional[int] = None
    ahead_behind: Optional[dict] = None
    is_dirty: bool = False
    uncommitted_changes: int = 0


class CreateWorktreeRequestModel(BaseModel):
    branch_name: str
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    spec_name: Optional[str] = None
    base_branch: str = "main"


class MergeWorktreeRequestModel(BaseModel):
    mode: str = "full"
    target_branch: str = "main"


class ResolveConflictRequestModel(BaseModel):
    file_path: str
    resolution: Literal["ours", "theirs"]


class MergeResultResponse(BaseModel):
    success: bool
    merged_files: list[str] = []
    conflicts: list[dict] = []
    error: Optional[str] = None


class MessageResponse(BaseModel):
    success: bool
    message: str


class SyncTaskStatusRequest(BaseModel):
    """Request to sync worktree status with linked task in todo.md."""
    action: Literal["in_progress", "done"]
    result_note: Optional[str] = None  # Optional note when marking done


# ============================================================================
# Helper Functions
# ============================================================================

def _validate_task_id(task_id: str) -> bool:
    """Validate that task_id exists in todo.md.

    Returns True if task exists, False otherwise.
    """
    parser = TodoMdParser()
    all_tasks = parser.read_all()

    for section_tasks in all_tasks.values():
        for task in section_tasks:
            if task.task_id == task_id:
                return True
    return False


def _get_task_title(task_id: str) -> Optional[str]:
    """Get task title from todo.md by task_id."""
    parser = TodoMdParser()
    all_tasks = parser.read_all()

    for section_tasks in all_tasks.values():
        for task in section_tasks:
            if task.task_id == task_id:
                return task.title
    return None


# ============================================================================
# Endpoints
# ============================================================================

@router.get("", response_model=list[WorktreeResponse])
async def list_worktrees(refresh: bool = False):
    """
    List all worktrees in the repository.
    
    Query params:
    - refresh: Force refresh from git (bypass cache)
    """
    manager = get_worktree_manager()
    worktrees = manager.list_worktrees(force_refresh=refresh)
    
    result = []
    for wt in worktrees:
        wt_dict = {
            "id": wt.id,
            "type": wt.type.value,
            "branch_name": wt.branch_name,
            "path": wt.path,
            "status": wt.status.value,
            "spec_name": wt.spec_name,
            "task_id": wt.task_id,
            "task_title": wt.task_title,
            "last_activity": wt.last_activity,
            "ahead_behind": asdict(wt.ahead_behind) if wt.ahead_behind else None,
            "is_dirty": wt.is_dirty,
            "uncommitted_changes": wt.uncommitted_changes,
        }
        result.append(WorktreeResponse(**wt_dict))
    
    return result


@router.get("/{worktree_id}", response_model=WorktreeResponse)
async def get_worktree(worktree_id: str):
    """Get details of a specific worktree"""
    manager = get_worktree_manager()
    wt = manager.get_worktree(worktree_id)
    
    if not wt:
        raise HTTPException(status_code=404, detail=f"Worktree not found: {worktree_id}")
    
    wt_dict = {
        "id": wt.id,
        "type": wt.type.value,
        "branch_name": wt.branch_name,
        "path": wt.path,
        "status": wt.status.value,
        "spec_name": wt.spec_name,
        "task_id": wt.task_id,
        "task_title": wt.task_title,
        "last_activity": wt.last_activity,
        "ahead_behind": asdict(wt.ahead_behind) if wt.ahead_behind else None,
        "is_dirty": wt.is_dirty,
        "uncommitted_changes": wt.uncommitted_changes,
    }
    
    return WorktreeResponse(**wt_dict)


@router.post("", response_model=WorktreeResponse)
async def create_worktree(request: CreateWorktreeRequestModel):
    """
    Create a new worktree for a task.

    This creates a new branch and worktree directory under .worktrees/

    OPT-IN TASK LINKING:
    - If task_id is provided, it is validated against todo.md
    - If task_id doesn't exist in todo.md, creation fails with 404
    - Task title is auto-populated from todo.md if not provided
    - Use POST /{worktree_id}/sync-task-status to update task status
    """
    manager = get_worktree_manager()

    # Validate task_id if provided (opt-in linking)
    task_title = request.task_title
    if request.task_id:
        if not _validate_task_id(request.task_id):
            raise HTTPException(
                status_code=404,
                detail=f"Task {request.task_id} not found in todo.md. "
                       f"Add the task first or create worktree without task_id."
            )
        # Auto-populate task title from todo.md if not provided
        if not task_title:
            task_title = _get_task_title(request.task_id)
            logger.info(f"Auto-populated task title from todo.md: {task_title}")

    create_req = CreateWorktreeRequest(
        branch_name=request.branch_name,
        task_id=request.task_id,
        task_title=task_title,
        spec_name=request.spec_name,
        base_branch=request.base_branch,
    )

    success, result = manager.create_worktree(create_req)

    if not success:
        raise HTTPException(status_code=400, detail=result)
    
    wt = result
    wt_dict = {
        "id": wt.id,
        "type": wt.type.value,
        "branch_name": wt.branch_name,
        "path": wt.path,
        "status": wt.status.value,
        "spec_name": wt.spec_name,
        "task_id": wt.task_id,
        "task_title": wt.task_title,
        "last_activity": wt.last_activity,
        "ahead_behind": asdict(wt.ahead_behind) if wt.ahead_behind else None,
        "is_dirty": wt.is_dirty,
        "uncommitted_changes": wt.uncommitted_changes,
    }
    
    return WorktreeResponse(**wt_dict)


@router.delete("/{worktree_id}", response_model=MessageResponse)
async def delete_worktree(worktree_id: str, force: bool = False):
    """
    Delete a worktree and its branch.
    
    Query params:
    - force: Force delete even if dirty
    """
    manager = get_worktree_manager()
    success, message = manager.delete_worktree(worktree_id, force=force)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return MessageResponse(success=True, message=message)


@router.post("/{worktree_id}/merge", response_model=MergeResultResponse)
async def merge_worktree(worktree_id: str, request: MergeWorktreeRequestModel):
    """
    Merge a worktree branch into the target branch.
    
    Modes:
    - full: Merge and commit
    - stage-only: Stage changes without committing
    """
    manager = get_worktree_manager()
    
    mode = MergeMode.FULL if request.mode == "full" else MergeMode.STAGE_ONLY
    result = manager.merge_worktree(worktree_id, mode=mode, target_branch=request.target_branch)
    
    conflicts = [{"file_path": c.file_path} for c in result.conflicts]
    
    return MergeResultResponse(
        success=result.success,
        merged_files=result.merged_files,
        conflicts=conflicts,
        error=result.error,
    )


@router.post("/{worktree_id}/resolve-conflict", response_model=MessageResponse)
async def resolve_conflict(worktree_id: str, request: ResolveConflictRequestModel):
    """
    Resolve a merge conflict in a worktree.
    
    resolution: "ours" or "theirs"
    """
    manager = get_worktree_manager()
    success, message = manager.resolve_conflict(
        worktree_id, 
        request.file_path, 
        request.resolution
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return MessageResponse(success=True, message=message)


@router.post("/{worktree_id}/open-explorer", response_model=MessageResponse)
async def open_in_explorer(worktree_id: str):
    """Open the worktree folder in system file explorer"""
    manager = get_worktree_manager()
    success, message = manager.open_in_explorer(worktree_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return MessageResponse(success=True, message=message)


@router.get("/{worktree_id}/terminal-command", response_model=MessageResponse)
async def get_terminal_command(worktree_id: str):
    """Get the command to cd into the worktree directory"""
    manager = get_worktree_manager()
    success, command = manager.get_terminal_command(worktree_id)

    if not success:
        raise HTTPException(status_code=404, detail=command)

    return MessageResponse(success=True, message=command)


# ============================================================================
# Task Sync Endpoints (Opt-In)
# ============================================================================

@router.post("/{worktree_id}/sync-task-status", response_model=MessageResponse)
async def sync_task_status(worktree_id: str, request: SyncTaskStatusRequest):
    """
    Sync worktree status with linked task in todo.md.

    OPT-IN: This endpoint is called explicitly by the GUI when user wants to
    update task status. It does NOT happen automatically.

    Actions:
    - in_progress: Mark linked task as [~] in todo.md
    - done: Mark linked task as [x] **DONE** and move to Done section

    Requires worktree to have a task_id set.
    """
    manager = get_worktree_manager()
    wt = manager.get_worktree(worktree_id)

    if not wt:
        raise HTTPException(status_code=404, detail=f"Worktree not found: {worktree_id}")

    if not wt.task_id:
        raise HTTPException(
            status_code=400,
            detail="Worktree has no linked task_id. Cannot sync task status."
        )

    parser = TodoMdParser()

    if request.action == "in_progress":
        success = parser.mark_task_in_progress(wt.task_id)
        if success:
            logger.info(f"Marked task {wt.task_id} as in-progress via worktree {worktree_id}")
            return MessageResponse(
                success=True,
                message=f"Task {wt.task_id} marked as in-progress"
            )
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Task {wt.task_id} not found in todo.md"
            )

    elif request.action == "done":
        note = request.result_note or f"Completed via worktree {wt.branch_name}"
        success = parser.mark_task_done(wt.task_id, result_note=note)
        if success:
            logger.info(f"Marked task {wt.task_id} as done via worktree {worktree_id}")
            return MessageResponse(
                success=True,
                message=f"Task {wt.task_id} marked as done"
            )
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Task {wt.task_id} not found in todo.md"
            )

    # Should not reach here due to Literal type validation
    raise HTTPException(status_code=400, detail=f"Invalid action: {request.action}")
