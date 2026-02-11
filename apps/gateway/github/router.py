"""GitHub PR management API router."""

import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Header
from typing import Optional

from .models import (
    PRCreateRequest,
    PRInfo,
    PRListResponse,
    PRMergeRequest,
    PRReviewResult,
    MessageResponse,
)
from .client import GitHubClient
from .review_service import review_pr as run_review
from ..utils.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/github", tags=["github"])


def _get_token(authorization: Optional[str]) -> str:
    """Extract bearer token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    return authorization[7:]


def _pr_info_from_dict(data: dict) -> PRInfo:
    """Convert GitHub API response dict to PRInfo model."""
    return PRInfo(
        number=data["number"],
        url=data["html_url"],
        state=data["state"],
        title=data["title"],
        body=data.get("body") or "",
        head=data["head"]["ref"],
        base=data["base"]["ref"],
        created_at=data["created_at"],
        merged=data.get("merged", False),
        mergeable=data.get("mergeable"),
    )


@router.post("/pr/create", response_model=PRInfo)
async def create_pr(
    request: PRCreateRequest,
    authorization: Optional[str] = Header(None),
):
    """Create a pull request."""
    token = _get_token(authorization)
    owner, repo = GitHubClient.parse_remote_url()
    client = GitHubClient(token, owner, repo)
    try:
        result = await client.create_pr(
            request.branch, request.base, request.title, request.body
        )
        logger.info(f"Created PR #{result['number']}: {request.title}")
        return _pr_info_from_dict(result)
    except Exception as e:
        logger.error(f"Failed to create PR: {e}")
        raise HTTPException(500, f"Failed to create PR: {e}")
    finally:
        await client.close()


@router.get("/pr/list", response_model=PRListResponse)
async def list_prs(
    state: str = "open",
    authorization: Optional[str] = Header(None),
):
    """List pull requests."""
    token = _get_token(authorization)
    owner, repo = GitHubClient.parse_remote_url()
    client = GitHubClient(token, owner, repo)
    try:
        results = await client.list_prs(state)
        prs = [_pr_info_from_dict(pr) for pr in results]
        return PRListResponse(prs=prs)
    except Exception as e:
        logger.error(f"Failed to list PRs: {e}")
        raise HTTPException(500, f"Failed to list PRs: {e}")
    finally:
        await client.close()


@router.get("/pr/{number}", response_model=PRInfo)
async def get_pr(
    number: int,
    authorization: Optional[str] = Header(None),
):
    """Get details of a specific pull request."""
    token = _get_token(authorization)
    owner, repo = GitHubClient.parse_remote_url()
    client = GitHubClient(token, owner, repo)
    try:
        result = await client.get_pr(number)
        return _pr_info_from_dict(result)
    except Exception as e:
        logger.error(f"Failed to get PR #{number}: {e}")
        raise HTTPException(500, f"Failed to get PR #{number}: {e}")
    finally:
        await client.close()


@router.post("/pr/{number}/review", response_model=PRReviewResult)
async def review_pr_endpoint(
    number: int,
    task_id: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    """Trigger AI review on PR diff."""
    token = _get_token(authorization)
    owner, repo = GitHubClient.parse_remote_url()
    client = GitHubClient(token, owner, repo)
    try:
        result = await run_review(client, number, task_id)
        logger.info(f"AI review completed for PR #{number}: {result.verdict}")
        return result
    except Exception as e:
        logger.error(f"Failed to review PR #{number}: {e}")
        raise HTTPException(500, f"Failed to review PR #{number}: {e}")
    finally:
        await client.close()


@router.post("/pr/{number}/merge", response_model=MessageResponse)
async def merge_pr(
    number: int,
    request: PRMergeRequest = None,
    authorization: Optional[str] = Header(None),
):
    """Merge a pull request."""
    token = _get_token(authorization)
    owner, repo = GitHubClient.parse_remote_url()
    client = GitHubClient(token, owner, repo)

    # Review gating: check task sidecar for review status
    project_root = os.environ.get("KURORYUU_PROJECT_ROOT", str(Path(__file__).resolve().parent.parent.parent.parent))
    sidecar_path = Path(project_root) / "ai" / "task-meta.json"

    if sidecar_path.exists():
        try:
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8-sig"))
            for tid, meta in sidecar.items():
                pr_meta = meta.get("pr", {})
                if pr_meta.get("number") == number:
                    review_status = pr_meta.get("review_status")
                    if review_status == "NEEDS_WORK":
                        raise HTTPException(
                            409,
                            f"PR #{number} has review status NEEDS_WORK. Fix issues before merging."
                        )
                    break
        except (json.JSONDecodeError, KeyError):
            pass

    try:
        merge_method = request.merge_method if request else "merge"
        commit_title = request.commit_title if request else None
        result = await client.merge_pr(number, merge_method, commit_title)
        logger.info(f"Merged PR #{number} via {merge_method}")
        return MessageResponse(
            success=True,
            message=result.get("message", f"PR #{number} merged successfully"),
        )
    except Exception as e:
        logger.error(f"Failed to merge PR #{number}: {e}")
        raise HTTPException(500, f"Failed to merge PR #{number}: {e}")
    finally:
        await client.close()


@router.post("/workflow/auto-worktree", response_model=MessageResponse)
async def auto_create_worktree(
    task_id: str,
    task_title: str = "",
):
    """Auto-create a worktree for a task when workflow is enabled.

    Called when a task transitions to in_progress.
    Reads workflow config to check if auto-worktree is enabled.
    """
    import re

    project_root = os.environ.get("KURORYUU_PROJECT_ROOT", str(Path(__file__).resolve().parent.parent.parent.parent))

    # Create slug from task title
    slug = re.sub(r'[^a-z0-9]+', '-', (task_title or task_id).lower()).strip('-')[:30]
    branch_name = f"task/{task_id}-{slug}"

    # Use existing worktree manager
    from ..worktrees.manager import get_worktree_manager
    from ..worktrees.models import CreateWorktreeRequest

    manager = get_worktree_manager()

    create_req = CreateWorktreeRequest(
        branch_name=branch_name,
        task_id=task_id,
        task_title=task_title or task_id,
        base_branch="master",
    )

    success, result = manager.create_worktree(create_req)

    if not success:
        raise HTTPException(400, f"Failed to create worktree: {result}")

    # Update task sidecar with worktree info
    sidecar_path = Path(project_root) / "ai" / "task-meta.json"
    sidecar = {}
    if sidecar_path.exists():
        try:
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8-sig"))
        except Exception:
            pass

    if task_id not in sidecar:
        sidecar[task_id] = {}

    sidecar[task_id]["worktree_id"] = result.id
    sidecar[task_id]["branch_name"] = result.branch_name

    sidecar_path.write_text(json.dumps(sidecar, indent=2), encoding="utf-8")

    logger.info(f"Auto-created worktree for task {task_id}: {result.branch_name} at {result.path}")

    return MessageResponse(
        success=True,
        message=f"Worktree created: {result.branch_name} at {result.path}",
    )


@router.post("/workflow/auto-pr", response_model=PRInfo)
async def auto_create_pr(
    task_id: str,
    authorization: Optional[str] = Header(None),
    trigger_review: bool = True,
):
    """Auto-create a PR for a completed task.

    Flow:
    1. Read task sidecar to get branch_name
    2. Push branch to origin
    3. Create PR with title/body from task info
    4. Store PR info in sidecar
    5. Optionally trigger AI review
    """
    import re
    import subprocess

    token = _get_token(authorization)

    project_root = os.environ.get("KURORYUU_PROJECT_ROOT", str(Path(__file__).resolve().parent.parent.parent.parent))
    sidecar_path = Path(project_root) / "ai" / "task-meta.json"

    # 1. Read task sidecar
    if not sidecar_path.exists():
        raise HTTPException(404, f"Task sidecar not found")

    try:
        sidecar = json.loads(sidecar_path.read_text(encoding="utf-8-sig"))
    except Exception as e:
        raise HTTPException(500, f"Failed to read task sidecar: {e}")

    task_meta = sidecar.get(task_id, {})
    branch_name = task_meta.get("branch_name")

    if not branch_name:
        raise HTTPException(400, f"Task {task_id} has no branch_name in sidecar")

    # Get task title from sidecar or task_id
    task_title = task_meta.get("description", task_id)
    # Use first line of description as PR title, rest as body
    title_parts = task_title.split("\n", 1)
    pr_title = title_parts[0][:80] if title_parts else task_id
    pr_body = title_parts[1] if len(title_parts) > 1 else ""

    # 2. Push branch to origin
    worktree_path = None
    worktree_id = task_meta.get("worktree_id")
    if worktree_id:
        from ..worktrees.manager import get_worktree_manager
        manager = get_worktree_manager()
        wt = manager.get_worktree(worktree_id)
        if wt:
            worktree_path = wt.path

    push_cwd = worktree_path or project_root
    try:
        result = subprocess.run(
            ["git", "push", "-u", "origin", branch_name],
            cwd=push_cwd,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            logger.warning(f"Git push returned non-zero: {result.stderr}")
            # Don't fail -- branch might already be pushed
    except Exception as e:
        logger.warning(f"Failed to push branch: {e}")

    # 3. Create PR
    owner, repo = GitHubClient.parse_remote_url()
    client = GitHubClient(token, owner, repo)

    try:
        # Determine base branch (default to master)
        base_branch = "master"

        pr_result = await client.create_pr(
            head=branch_name,
            base=base_branch,
            title=pr_title,
            body=f"## Task: {task_id}\n\n{pr_body}\n\n---\n*Auto-generated by Kuroryuu GitHub Workflow*",
        )

        pr_info = _pr_info_from_dict(pr_result)

        # 4. Update sidecar with PR info
        if task_id not in sidecar:
            sidecar[task_id] = {}

        sidecar[task_id]["pr"] = {
            "number": pr_info.number,
            "url": pr_info.url,
            "state": pr_info.state,
        }

        sidecar_path.write_text(json.dumps(sidecar, indent=2), encoding="utf-8")
        logger.info(f"Created PR #{pr_info.number} for task {task_id}")

        # 5. Trigger review if requested
        if trigger_review:
            try:
                review_result = await run_review(client, pr_info.number, task_id)
                logger.info(f"AI review completed for PR #{pr_info.number}: {review_result.verdict}")
            except Exception as e:
                logger.warning(f"AI review failed for PR #{pr_info.number}: {e}")

        return pr_info

    except Exception as e:
        logger.error(f"Failed to create PR for task {task_id}: {e}")
        raise HTTPException(500, f"Failed to create PR: {e}")
    finally:
        await client.close()