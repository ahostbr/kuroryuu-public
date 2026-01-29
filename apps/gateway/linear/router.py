"""
Linear Integration API Router

Provides REST endpoints for Linear.app integration.

TODO.MD SYNC (Phase 6.2):
- POST /sync/from-todo-md - Sync a task from todo.md to Linear
- POST /sync/to-todo-md - Sync a Linear issue status back to todo.md
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
from dataclasses import asdict

from .client import get_linear_client
from .models import LinearConfig, SyncDirection
from ..orchestration.todo_md import TodoMdParser, TaskState
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


router = APIRouter(prefix="/v1/linear", tags=["linear"])


# ============================================================================
# Request/Response Models
# ============================================================================

class LinearConfigRequest(BaseModel):
    api_key: Optional[str] = None
    team_id: Optional[str] = None
    project_id: Optional[str] = None
    sync_direction: str = "bidirectional"
    auto_sync: bool = False
    sync_interval_minutes: int = 15
    default_assignee_id: Optional[str] = None


class LinearConfigResponse(BaseModel):
    is_configured: bool
    team_id: Optional[str] = None
    project_id: Optional[str] = None
    sync_direction: str = "bidirectional"
    auto_sync: bool = False
    sync_interval_minutes: int = 15


class UserResponse(BaseModel):
    id: str
    name: str
    email: Optional[str] = None


class TeamResponse(BaseModel):
    id: str
    name: str
    key: str
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    state: str = "started"
    progress: float = 0.0
    target_date: Optional[str] = None


class IssueResponse(BaseModel):
    id: str
    identifier: str
    title: str
    description: Optional[str] = None
    state: str = "todo"
    priority: int = 0
    estimate: Optional[int] = None
    assignee_name: Optional[str] = None
    team_key: Optional[str] = None
    project_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CreateIssueRequest(BaseModel):
    title: str
    description: Optional[str] = None
    team_id: Optional[str] = None
    project_id: Optional[str] = None
    assignee_id: Optional[str] = None
    priority: int = 0
    estimate: Optional[int] = None


class UpdateIssueRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    state_id: Optional[str] = None
    assignee_id: Optional[str] = None
    priority: Optional[int] = None
    estimate: Optional[int] = None


class CommentRequest(BaseModel):
    body: str


class SyncTaskRequest(BaseModel):
    task_id: str
    title: str
    description: Optional[str] = None
    status: str = "todo"


class SyncFromTodoMdRequest(BaseModel):
    """Request to sync a task from todo.md to Linear."""
    task_id: str  # e.g., "T500"


class SyncToTodoMdRequest(BaseModel):
    """Request to sync a Linear issue status back to todo.md."""
    issue_id: str  # Linear issue ID
    task_id: str   # Kuroryuu task ID in todo.md


class MessageResponse(BaseModel):
    success: bool
    message: str


# ============================================================================
# Configuration Endpoints
# ============================================================================

@router.get("/config", response_model=LinearConfigResponse)
async def get_config():
    """Get current Linear integration configuration"""
    client = get_linear_client()
    config = client.config
    
    return LinearConfigResponse(
        is_configured=client.is_configured,
        team_id=config.team_id,
        project_id=config.project_id,
        sync_direction=config.sync_direction.value,
        auto_sync=config.auto_sync,
        sync_interval_minutes=config.sync_interval_minutes,
    )


@router.post("/config", response_model=MessageResponse)
async def update_config(request: LinearConfigRequest):
    """Update Linear integration configuration"""
    client = get_linear_client()
    
    sync_dir_map = {
        "kuroryuu_to_linear": SyncDirection.KURORYUU_TO_LINEAR,
        "linear_to_kuroryuu": SyncDirection.LINEAR_TO_KURORYUU,
        "bidirectional": SyncDirection.BIDIRECTIONAL,
    }
    
    config = LinearConfig(
        api_key=request.api_key,
        team_id=request.team_id,
        project_id=request.project_id,
        sync_direction=sync_dir_map.get(request.sync_direction, SyncDirection.BIDIRECTIONAL),
        auto_sync=request.auto_sync,
        sync_interval_minutes=request.sync_interval_minutes,
        default_assignee_id=request.default_assignee_id,
    )
    
    client.configure(config)
    
    return MessageResponse(success=True, message="Configuration updated")


@router.get("/status", response_model=MessageResponse)
async def check_status():
    """Check if Linear integration is working"""
    client = get_linear_client()
    
    if not client.is_configured:
        return MessageResponse(success=False, message="Linear API key not configured")
    
    success, result = await client.get_viewer()
    
    if not success:
        return MessageResponse(success=False, message=f"Connection failed: {result}")
    
    return MessageResponse(
        success=True, 
        message=f"Connected as {result.name} ({result.email})"
    )


# ============================================================================
# Read Endpoints
# ============================================================================

@router.get("/me", response_model=UserResponse)
async def get_current_user():
    """Get authenticated Linear user"""
    client = get_linear_client()
    
    if not client.is_configured:
        raise HTTPException(status_code=401, detail="Linear API key not configured")
    
    success, result = await client.get_viewer()
    
    if not success:
        raise HTTPException(status_code=500, detail=result)
    
    return UserResponse(
        id=result.id,
        name=result.name,
        email=result.email,
    )


@router.get("/teams", response_model=list[TeamResponse])
async def list_teams():
    """List all Linear teams"""
    client = get_linear_client()
    
    if not client.is_configured:
        raise HTTPException(status_code=401, detail="Linear API key not configured")
    
    success, result = await client.get_teams()
    
    if not success:
        raise HTTPException(status_code=500, detail=result)
    
    return [
        TeamResponse(
            id=team.id,
            name=team.name,
            key=team.key,
            description=team.description,
        )
        for team in result
    ]


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(team_id: Optional[str] = None):
    """List Linear projects, optionally filtered by team"""
    client = get_linear_client()
    
    if not client.is_configured:
        raise HTTPException(status_code=401, detail="Linear API key not configured")
    
    success, result = await client.get_projects(team_id)
    
    if not success:
        raise HTTPException(status_code=500, detail=result)
    
    return [
        ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            state=project.state,
            progress=project.progress,
            target_date=project.target_date,
        )
        for project in result
    ]


@router.get("/issues", response_model=list[IssueResponse])
async def list_issues(
    team_id: Optional[str] = None,
    project_id: Optional[str] = None,
    limit: int = 50,
):
    """List Linear issues"""
    client = get_linear_client()
    
    if not client.is_configured:
        raise HTTPException(status_code=401, detail="Linear API key not configured")
    
    success, result = await client.get_issues(team_id, project_id, limit)
    
    if not success:
        raise HTTPException(status_code=500, detail=result)
    
    return [
        IssueResponse(
            id=issue.id,
            identifier=issue.identifier,
            title=issue.title,
            description=issue.description,
            state=issue.state.value,
            priority=issue.priority.value,
            estimate=issue.estimate,
            assignee_name=issue.assignee.name if issue.assignee else None,
            team_key=issue.team.key if issue.team else None,
            project_name=issue.project.name if issue.project else None,
            created_at=issue.created_at,
            updated_at=issue.updated_at,
        )
        for issue in result
    ]


@router.get("/issues/{issue_id}", response_model=IssueResponse)
async def get_issue(issue_id: str):
    """Get a specific Linear issue"""
    client = get_linear_client()
    
    if not client.is_configured:
        raise HTTPException(status_code=401, detail="Linear API key not configured")
    
    success, result = await client.get_issue(issue_id)
    
    if not success:
        raise HTTPException(status_code=404, detail=result)
    
    return IssueResponse(
        id=result.id,
        identifier=result.identifier,
        title=result.title,
        description=result.description,
        state=result.state.value,
        priority=result.priority.value,
        estimate=result.estimate,
        assignee_name=result.assignee.name if result.assignee else None,
        team_key=result.team.key if result.team else None,
        project_name=result.project.name if result.project else None,
        created_at=result.created_at,
        updated_at=result.updated_at,
    )


# ============================================================================
# Write Endpoints
# ============================================================================

@router.post("/issues", response_model=IssueResponse)
async def create_issue(request: CreateIssueRequest):
    """Create a new Linear issue"""
    client = get_linear_client()
    
    if not client.is_configured:
        raise HTTPException(status_code=401, detail="Linear API key not configured")
    
    success, result = await client.create_issue(
        title=request.title,
        description=request.description,
        team_id=request.team_id,
        project_id=request.project_id,
        assignee_id=request.assignee_id,
        priority=request.priority,
        estimate=request.estimate,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=result)
    
    return IssueResponse(
        id=result.id,
        identifier=result.identifier,
        title=result.title,
        state="todo",
        priority=request.priority,
    )


@router.patch("/issues/{issue_id}", response_model=MessageResponse)
async def update_issue(issue_id: str, request: UpdateIssueRequest):
    """Update a Linear issue"""
    client = get_linear_client()
    
    if not client.is_configured:
        raise HTTPException(status_code=401, detail="Linear API key not configured")
    
    success, result = await client.update_issue(
        issue_id=issue_id,
        title=request.title,
        description=request.description,
        state_id=request.state_id,
        assignee_id=request.assignee_id,
        priority=request.priority,
        estimate=request.estimate,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=result)
    
    return MessageResponse(success=True, message=result)


@router.post("/issues/{issue_id}/comments", response_model=MessageResponse)
async def add_comment(issue_id: str, request: CommentRequest):
    """Add a comment to a Linear issue"""
    client = get_linear_client()
    
    if not client.is_configured:
        raise HTTPException(status_code=401, detail="Linear API key not configured")
    
    success, result = await client.add_comment(issue_id, request.body)
    
    if not success:
        raise HTTPException(status_code=400, detail=result)
    
    return MessageResponse(success=True, message=result)


# ============================================================================
# Sync Endpoints
# ============================================================================

@router.post("/sync/task-to-linear", response_model=IssueResponse)
async def sync_task_to_linear(request: SyncTaskRequest):
    """Sync a Kuroryuu task to Linear"""
    client = get_linear_client()
    
    if not client.is_configured:
        raise HTTPException(status_code=401, detail="Linear API key not configured")
    
    success, result = await client.sync_task_to_linear(
        task_id=request.task_id,
        title=request.title,
        description=request.description,
        status=request.status,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=result)
    
    return IssueResponse(
        id=result.id,
        identifier=result.identifier,
        title=result.title,
        state="todo",
        priority=0,
    )


# ============================================================================
# Todo.md Sync Endpoints (Phase 6.2)
# ============================================================================

@router.post("/sync/from-todo-md", response_model=IssueResponse)
async def sync_from_todo_md(request: SyncFromTodoMdRequest):
    """
    Sync a task from todo.md to Linear.

    Reads task info from todo.md and creates/updates a corresponding Linear issue.
    Maps todo.md task states to Linear issue states.
    """
    client = get_linear_client()

    if not client.is_configured:
        raise HTTPException(status_code=401, detail="Linear API key not configured")

    # Read task from todo.md
    parser = TodoMdParser()
    all_tasks = parser.read_all()

    task = None
    task_section = None
    for section, tasks in all_tasks.items():
        for t in tasks:
            if t.task_id == request.task_id:
                task = t
                task_section = section
                break
        if task:
            break

    if not task:
        raise HTTPException(
            status_code=404,
            detail=f"Task {request.task_id} not found in todo.md"
        )

    # Map todo.md state to Linear status
    state_map = {
        TaskState.PENDING: "todo",
        TaskState.IN_PROGRESS: "inProgress",
        TaskState.DONE: "done",
    }
    linear_status = state_map.get(task.state, "todo")

    # Section also influences status
    if task_section == "Done":
        linear_status = "done"
    elif task_section == "Active":
        linear_status = "inProgress"
    elif task_section == "Delayed":
        linear_status = "backlog"

    # Sync to Linear
    success, result = await client.sync_task_to_linear(
        task_id=task.task_id,
        title=task.title,
        description=f"Synced from Kuroryuu todo.md\n\nStatus: {task.status or 'N/A'}\nAssignee: {task.assignee}",
        status=linear_status,
    )

    if not success:
        raise HTTPException(status_code=400, detail=result)

    logger.info(f"Synced task {task.task_id} to Linear issue {result.identifier}")

    return IssueResponse(
        id=result.id,
        identifier=result.identifier,
        title=result.title,
        state=linear_status,
        priority=0,
    )


@router.post("/sync/to-todo-md", response_model=MessageResponse)
async def sync_to_todo_md(request: SyncToTodoMdRequest):
    """
    Sync a Linear issue status back to todo.md.

    Reads the Linear issue state and updates the corresponding task in todo.md.
    Maps Linear issue states to todo.md task states.
    """
    client = get_linear_client()

    if not client.is_configured:
        raise HTTPException(status_code=401, detail="Linear API key not configured")

    # Get Linear issue
    success, issue = await client.get_issue(request.issue_id)

    if not success:
        raise HTTPException(status_code=404, detail=f"Linear issue not found: {issue}")

    # Map Linear state to todo.md action
    parser = TodoMdParser()

    # Check task exists in todo.md
    all_tasks = parser.read_all()
    task_found = False
    for tasks in all_tasks.values():
        for t in tasks:
            if t.task_id == request.task_id:
                task_found = True
                break
        if task_found:
            break

    if not task_found:
        raise HTTPException(
            status_code=404,
            detail=f"Task {request.task_id} not found in todo.md"
        )

    # Map Linear state to todo.md action
    linear_state = issue.state.value.lower() if issue.state else "todo"

    if linear_state in ("done", "completed", "closed", "cancelled"):
        success = parser.mark_task_done(
            request.task_id,
            result_note=f"Completed via Linear {issue.identifier}"
        )
        action = "marked done"
    elif linear_state in ("inprogress", "in_progress", "started", "active"):
        success = parser.mark_task_in_progress(request.task_id)
        action = "marked in-progress"
    else:
        # todo, backlog, etc. - no state change needed
        return MessageResponse(
            success=True,
            message=f"Linear issue {issue.identifier} state '{linear_state}' does not require todo.md update"
        )

    if success:
        logger.info(f"Synced Linear issue {issue.identifier} → task {request.task_id} ({action})")
        return MessageResponse(
            success=True,
            message=f"Task {request.task_id} {action} (synced from Linear {issue.identifier})"
        )
    else:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update task {request.task_id} in todo.md"
        )
