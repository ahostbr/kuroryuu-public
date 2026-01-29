"""
Router - Commands

Slash commands for agent workflows:
- /commit - Generate commit message, stage, commit
- /pr - Generate PR description
- /plan - Generate implementation plan
- /test - Generate tests
- /doc - Generate documentation
"""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
import json
import subprocess

router = APIRouter(prefix="/v1/commands", tags=["commands"])

# ============================================================================
# Models
# ============================================================================
class CommitRequest(BaseModel):
    """Request for /commit command."""
    files: List[str] = []  # Empty = all staged
    message_hint: str = ""
    auto_stage: bool = True
    auto_commit: bool = False  # Requires confirmation by default

class CommitResponse(BaseModel):
    """Response with commit details."""
    ok: bool = True
    suggested_message: str = ""
    files_staged: List[str] = []
    committed: bool = False
    error: Optional[str] = None

class PRRequest(BaseModel):
    """Request for /pr command."""
    base_branch: str = "main"
    title_hint: str = ""
    include_commits: bool = True

class PRResponse(BaseModel):
    """Response with PR details."""
    ok: bool = True
    title: str = ""
    body: str = ""
    commits: List[str] = []
    error: Optional[str] = None

class PlanRequest(BaseModel):
    """Request for /plan command."""
    description: str
    scope: str = "feature"  # feature, fix, refactor

class PlanResponse(BaseModel):
    """Response with implementation plan."""
    ok: bool = True
    plan: str = ""
    steps: List[Dict[str, Any]] = []
    error: Optional[str] = None

# ============================================================================
# Git Helpers
# ============================================================================
def run_git(args: List[str], cwd: Optional[Path] = None) -> tuple[bool, str]:
    """Run a git command."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=cwd or Path(__file__).parent.parent.parent,
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            return True, result.stdout.strip()
        return False, result.stderr.strip()
    except Exception as e:
        return False, str(e)

def get_staged_diff() -> str:
    """Get diff of staged files."""
    ok, output = run_git(["diff", "--cached", "--stat"])
    if ok:
        return output
    return ""

def get_unstaged_files() -> List[str]:
    """Get list of modified but unstaged files."""
    ok, output = run_git(["status", "--porcelain"])
    if not ok:
        return []
    
    files = []
    for line in output.split("\n"):
        if line and len(line) > 3:
            status = line[:2]
            filepath = line[3:]
            if status[1] == "M" or status[0] == "?":
                files.append(filepath)
    return files

def get_commits_since(base: str) -> List[str]:
    """Get commits since base branch."""
    ok, output = run_git(["log", f"{base}..HEAD", "--oneline"])
    if ok:
        return output.split("\n") if output else []
    return []

# ============================================================================
# LLM Integration
# ============================================================================
async def generate_commit_message(diff: str, hint: str) -> str:
    """Generate commit message from diff."""
    # Import here to avoid circular imports
    from ..llm import get_healthy_backend, LLMMessage
    from ..llm.backends.base import LLMConfig

    # Use fallback chain (circuit breaker pattern)
    try:
        backend = await get_healthy_backend()
    except RuntimeError:
        return "chore: update files"  # Fallback if no backend available
    
    prompt = f"""Generate a concise git commit message for these changes.

Changes:
{diff[:3000]}

{"Hint: " + hint if hint else ""}

Format: type(scope): description

Types: feat, fix, docs, refactor, test, chore, style

Respond with ONLY the commit message, nothing else."""

    messages = [
        LLMMessage(role="user", content=prompt)
    ]
    
    config = LLMConfig(
        model="devstral-small-2-2512",
        temperature=0.3,
        max_tokens=200
    )
    
    response = ""
    async for event in backend.stream_chat(messages, config):
        if event.type == "delta" and event.text:
            response += event.text
    
    return response.strip()

async def generate_pr_description(commits: List[str], hint: str) -> tuple[str, str]:
    """Generate PR title and body."""
    from ..llm import get_healthy_backend, LLMMessage
    from ..llm.backends.base import LLMConfig

    # Use fallback chain (circuit breaker pattern)
    try:
        backend = await get_healthy_backend()
    except RuntimeError:
        return "Update", "No LLM backend available"  # Fallback if no backend
    
    prompt = f"""Generate a Pull Request title and description for these commits:

Commits:
{chr(10).join(commits[:20])}

{"Context: " + hint if hint else ""}

Format your response as:
TITLE: <title>

## Summary
<brief summary>

## Changes
- <change 1>
- <change 2>

## Testing
<how to test>"""

    messages = [
        LLMMessage(role="user", content=prompt)
    ]
    
    config = LLMConfig(
        model="devstral-small-2-2512",
        temperature=0.4,
        max_tokens=1000
    )
    
    response = ""
    async for event in backend.stream_chat(messages, config):
        if event.type == "delta" and event.text:
            response += event.text
    
    # Parse response
    lines = response.strip().split("\n")
    title = ""
    body_lines = []
    
    for i, line in enumerate(lines):
        if line.startswith("TITLE:"):
            title = line.replace("TITLE:", "").strip()
        elif title:  # After title
            body_lines.append(line)
    
    return title, "\n".join(body_lines).strip()

# ============================================================================
# Endpoints
# ============================================================================
@router.post("/commit", response_model=CommitResponse)
async def commit_command(request: CommitRequest) -> CommitResponse:
    """
    /commit - Generate commit message and optionally commit.
    
    1. Gets staged diff (or stages files)
    2. Generates commit message with LLM
    3. Optionally commits
    """
    try:
        files_staged = []
        
        # Stage files if requested
        if request.auto_stage:
            if request.files:
                for f in request.files:
                    ok, _ = run_git(["add", f])
                    if ok:
                        files_staged.append(f)
            else:
                # Stage all modified
                unstaged = get_unstaged_files()
                for f in unstaged[:50]:  # Limit
                    ok, _ = run_git(["add", f])
                    if ok:
                        files_staged.append(f)
        
        # Get diff
        diff = get_staged_diff()
        if not diff:
            return CommitResponse(
                ok=False,
                error="No staged changes to commit"
            )
        
        # Generate message
        message = await generate_commit_message(diff, request.message_hint)
        
        committed = False
        if request.auto_commit and message:
            ok, _ = run_git(["commit", "-m", message])
            committed = ok
        
        return CommitResponse(
            ok=True,
            suggested_message=message,
            files_staged=files_staged,
            committed=committed
        )
        
    except Exception as e:
        return CommitResponse(ok=False, error=str(e))

@router.post("/pr", response_model=PRResponse)
async def pr_command(request: PRRequest) -> PRResponse:
    """
    /pr - Generate PR title and description.
    
    Analyzes commits since base branch and generates PR content.
    """
    try:
        commits = []
        if request.include_commits:
            commits = get_commits_since(request.base_branch)
        
        if not commits:
            return PRResponse(
                ok=False,
                error=f"No commits found since {request.base_branch}"
            )
        
        title, body = await generate_pr_description(commits, request.title_hint)
        
        return PRResponse(
            ok=True,
            title=title,
            body=body,
            commits=commits
        )
        
    except Exception as e:
        return PRResponse(ok=False, error=str(e))

@router.get("/status")
async def commands_status() -> Dict[str, Any]:
    """Get commands status and git info."""
    ok, branch = run_git(["branch", "--show-current"])
    _, status = run_git(["status", "--porcelain"])
    
    modified = len([l for l in status.split("\n") if l]) if status else 0
    
    return {
        "ok": True,
        "git_available": ok,
        "current_branch": branch if ok else None,
        "modified_files": modified,
        "commands": ["/commit", "/pr", "/plan", "/test", "/doc"]
    }
