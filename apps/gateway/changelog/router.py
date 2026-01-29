"""
Router - Changelog

Endpoints for changelog generation:
- GET /git-history - Fetch git commits with filtering
- GET /tasks - Fetch done tasks from ai/todo.md
- POST /generate - Generate changelog via LLM
"""
from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from pathlib import Path
import subprocess
import re

router = APIRouter(prefix="/v1/changelog", tags=["changelog"])

# ============================================================================
# Models
# ============================================================================

class GitCommit(BaseModel):
    """A git commit entry."""
    id: str
    hash: str
    message: str
    author: str
    date: str
    type: Literal['feature', 'fix', 'improvement', 'breaking', 'docs', 'other'] = 'other'
    title: str = ""
    selected: bool = True


class GitHistoryResponse(BaseModel):
    """Response with git history."""
    ok: bool = True
    entries: List[GitCommit] = []
    total: int = 0
    error: Optional[str] = None


class TaskEntry(BaseModel):
    """A done task entry."""
    id: str
    type: Literal['feature', 'fix', 'improvement', 'breaking', 'docs', 'other'] = 'feature'
    title: str
    description: Optional[str] = None
    taskId: Optional[str] = None
    selected: bool = True


class TasksResponse(BaseModel):
    """Response with done tasks."""
    ok: bool = True
    entries: List[TaskEntry] = []
    total: int = 0
    error: Optional[str] = None


class ChangelogGenerateRequest(BaseModel):
    """Request to generate changelog."""
    entries: List[Dict[str, Any]]
    version: str = "1.0.0"
    releaseDate: str = ""
    format: Literal['markdown', 'plain', 'html'] = 'markdown'
    audience: Literal['developers', 'end-users', 'stakeholders'] = 'developers'
    emojiLevel: Literal['none', 'minimal', 'all'] = 'minimal'
    customInstructions: Optional[str] = None


class ChangelogGenerateResponse(BaseModel):
    """Response with generated changelog."""
    ok: bool = True
    content: str = ""
    error: Optional[str] = None


# ============================================================================
# Git Helpers
# ============================================================================

def run_git(args: List[str], cwd: Optional[Path] = None) -> tuple[bool, str]:
    """Run a git command."""
    try:
        # Default to project root (3 levels up from this file)
        project_root = cwd or Path(__file__).parent.parent.parent.parent
        result = subprocess.run(
            ["git"] + args,
            cwd=project_root,
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            return True, result.stdout.strip()
        return False, result.stderr.strip()
    except Exception as e:
        return False, str(e)


def classify_commit_type(message: str) -> Literal['feature', 'fix', 'improvement', 'breaking', 'docs', 'other']:
    """Classify commit type from message."""
    msg_lower = message.lower()

    # Check for conventional commit prefixes
    if msg_lower.startswith('feat') or 'add' in msg_lower or 'new' in msg_lower:
        return 'feature'
    elif msg_lower.startswith('fix') or 'bug' in msg_lower or 'patch' in msg_lower:
        return 'fix'
    elif msg_lower.startswith('docs') or 'readme' in msg_lower or 'documentation' in msg_lower:
        return 'docs'
    elif 'breaking' in msg_lower or 'BREAKING' in message:
        return 'breaking'
    elif msg_lower.startswith('refactor') or msg_lower.startswith('perf') or msg_lower.startswith('improve'):
        return 'improvement'
    else:
        return 'other'


def parse_git_log(output: str) -> List[GitCommit]:
    """Parse git log output into commit objects."""
    commits = []

    # Split by commit separator
    entries = output.split("---COMMIT---")

    for entry in entries:
        entry = entry.strip()
        if not entry:
            continue

        lines = entry.split("\n")
        if len(lines) < 4:
            continue

        hash_val = lines[0].strip()
        author = lines[1].strip()
        date = lines[2].strip()
        message = "\n".join(lines[3:]).strip()

        # Get first line as title
        title = message.split("\n")[0][:100]

        commit = GitCommit(
            id=hash_val[:8],
            hash=hash_val,
            message=message,
            author=author,
            date=date,
            type=classify_commit_type(message),
            title=title,
            selected=True
        )
        commits.append(commit)

    return commits


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/git-history", response_model=GitHistoryResponse)
async def get_git_history(
    mode: str = Query("count", description="Filter mode: count, date-range, tags"),
    count: int = Query(50, description="Number of commits (for count mode)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD (for date-range mode)"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD (for date-range mode)"),
    start_tag: Optional[str] = Query(None, description="Start tag (for tags mode)"),
    end_tag: Optional[str] = Query(None, description="End tag (for tags mode)"),
    include_merges: bool = Query(False, description="Include merge commits")
) -> GitHistoryResponse:
    """
    Fetch git commit history with filtering options.
    """
    try:
        # Build git log command
        format_str = "%H%n%an%n%ai%n%B---COMMIT---"
        args = ["log", f"--format={format_str}"]

        # Add filters based on mode
        if mode == "count":
            args.append(f"-n{count}")
        elif mode == "date-range":
            if start_date:
                args.append(f"--since={start_date}")
            if end_date:
                args.append(f"--until={end_date}")
        elif mode == "tags" and start_tag and end_tag:
            args.append(f"{start_tag}..{end_tag}")

        # Exclude merges unless requested
        if not include_merges:
            args.append("--no-merges")

        ok, output = run_git(args)

        if not ok:
            return GitHistoryResponse(ok=False, error=output)

        commits = parse_git_log(output)

        return GitHistoryResponse(
            ok=True,
            entries=commits,
            total=len(commits)
        )

    except Exception as e:
        return GitHistoryResponse(ok=False, error=str(e))


@router.get("/tasks", response_model=TasksResponse)
async def get_done_tasks() -> TasksResponse:
    """
    Fetch done tasks from ai/todo.md.
    """
    try:
        # Read todo.md
        todo_path = Path(__file__).parent.parent.parent.parent / "ai" / "todo.md"

        if not todo_path.exists():
            return TasksResponse(ok=False, error="ai/todo.md not found")

        content = todo_path.read_text(encoding="utf-8")

        # Parse done tasks [x]
        entries = []
        task_pattern = re.compile(r'- \[x\]\s*(T\d+)?\s*[—-]?\s*(.+)', re.IGNORECASE)

        for i, line in enumerate(content.split("\n")):
            match = task_pattern.match(line.strip())
            if match:
                task_id = match.group(1) or f"TASK{i:03d}"
                title = match.group(2).strip()

                # Classify type from title
                title_lower = title.lower()
                if 'fix' in title_lower or 'bug' in title_lower:
                    entry_type = 'fix'
                elif 'doc' in title_lower:
                    entry_type = 'docs'
                elif 'refactor' in title_lower or 'improve' in title_lower:
                    entry_type = 'improvement'
                else:
                    entry_type = 'feature'

                entries.append(TaskEntry(
                    id=task_id,
                    type=entry_type,
                    title=title,
                    taskId=task_id,
                    selected=True
                ))

        return TasksResponse(
            ok=True,
            entries=entries,
            total=len(entries)
        )

    except Exception as e:
        return TasksResponse(ok=False, error=str(e))


@router.post("/generate", response_model=ChangelogGenerateResponse)
async def generate_changelog(request: ChangelogGenerateRequest) -> ChangelogGenerateResponse:
    """
    Generate formatted changelog using LLM.
    """
    try:
        # Import LLM dependencies
        from ..llm import get_healthy_backend, LLMMessage
        from ..llm.backends.base import LLMConfig

        # Build entry list for prompt
        entry_text = ""
        for entry in request.entries:
            entry_type = entry.get('type', 'other')
            title = entry.get('title', '')
            desc = entry.get('description', '')
            entry_text += f"- [{entry_type}] {title}"
            if desc:
                entry_text += f": {desc}"
            entry_text += "\n"

        # Build prompt
        emoji_instruction = {
            'none': "Do NOT use any emojis.",
            'minimal': "Use emojis only in section headers (e.g., ## ✨ Features).",
            'all': "Use emojis in section headers AND bullet points."
        }.get(request.emojiLevel, "Use emojis minimally.")

        audience_instruction = {
            'developers': "Write for developers - include technical details and file/code references.",
            'end-users': "Write for end users - focus on benefits and user-facing changes, avoid technical jargon.",
            'stakeholders': "Write for stakeholders - highlight business value and key improvements."
        }.get(request.audience, "Write for a general audience.")

        prompt = f"""Generate a changelog for version {request.version} (released {request.releaseDate or 'today'}).

Changes to include:
{entry_text}

Format: {request.format}
{audience_instruction}
{emoji_instruction}

{f"Additional instructions: {request.customInstructions}" if request.customInstructions else ""}

Group changes by type (Breaking Changes, Features, Improvements, Bug Fixes, Documentation, Other).
Only include sections that have entries.
Use proper markdown formatting with headers and bullet points.

Output ONLY the changelog content, no explanation."""

        # Get LLM backend using fallback chain (circuit breaker pattern)
        try:
            backend = await get_healthy_backend()
        except RuntimeError:
            # No healthy backend available - fallback to local formatting
            return ChangelogGenerateResponse(
                ok=True,
                content=generate_local_changelog(request)
            )

        messages = [
            LLMMessage(role="user", content=prompt)
        ]

        config = LLMConfig(
            model="claude-3-5-sonnet-20241022",
            temperature=0.4,
            max_tokens=2000
        )

        # Stream response
        response = ""
        async for event in backend.stream_chat(messages, config):
            if event.type == "delta" and event.text:
                response += event.text

        return ChangelogGenerateResponse(
            ok=True,
            content=response.strip()
        )

    except Exception as e:
        # Fallback to local generation
        try:
            return ChangelogGenerateResponse(
                ok=True,
                content=generate_local_changelog(request)
            )
        except:
            return ChangelogGenerateResponse(ok=False, error=str(e))


def generate_local_changelog(request: ChangelogGenerateRequest) -> str:
    """Generate changelog locally without LLM."""

    # Group entries by type
    groups: Dict[str, List[Dict]] = {
        'breaking': [],
        'feature': [],
        'improvement': [],
        'fix': [],
        'docs': [],
        'other': []
    }

    for entry in request.entries:
        entry_type = entry.get('type', 'other')
        if entry_type in groups:
            groups[entry_type].append(entry)
        else:
            groups['other'].append(entry)

    # Emoji map
    emojis = {
        'breaking': '💥',
        'feature': '✨',
        'improvement': '⚡',
        'fix': '🐛',
        'docs': '📚',
        'other': '📝'
    }

    labels = {
        'breaking': 'Breaking Changes',
        'feature': 'Features',
        'improvement': 'Improvements',
        'fix': 'Bug Fixes',
        'docs': 'Documentation',
        'other': 'Other Changes'
    }

    use_header_emoji = request.emojiLevel in ['minimal', 'all']
    use_bullet_emoji = request.emojiLevel == 'all'

    # Build output
    lines = []
    lines.append(f"# Changelog - v{request.version}")
    lines.append("")
    if request.releaseDate:
        lines.append(f"**Release Date:** {request.releaseDate}")
        lines.append("")

    order = ['breaking', 'feature', 'improvement', 'fix', 'docs', 'other']

    for group_type in order:
        entries = groups.get(group_type, [])
        if not entries:
            continue

        emoji = emojis.get(group_type, '')
        label = labels.get(group_type, group_type.title())

        if use_header_emoji:
            lines.append(f"## {emoji} {label}")
        else:
            lines.append(f"## {label}")
        lines.append("")

        for entry in entries:
            title = entry.get('title', 'Untitled')
            bullet_emoji = f"{emoji} " if use_bullet_emoji else ""
            lines.append(f"- {bullet_emoji}{title}")

        lines.append("")

    return "\n".join(lines)


@router.get("/status")
async def changelog_status() -> Dict[str, Any]:
    """Get changelog endpoint status."""
    ok, _ = run_git(["--version"])
    return {
        "ok": True,
        "git_available": ok,
        "endpoints": ["/git-history", "/tasks", "/generate"]
    }
