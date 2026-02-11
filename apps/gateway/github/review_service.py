"""AI-powered PR review service."""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from .client import GitHubClient
from .models import PRReviewResult
from ..utils.logging_config import get_logger

logger = get_logger(__name__)

# Max diff size for LLM review (chars)
MAX_DIFF_SIZE = 8000

REVIEW_PROMPT = """You are a code reviewer. Review the following pull request diff.

PR #{number}: {title}

Analyze for:
1. Bugs and logic errors
2. Security vulnerabilities
3. Code quality issues
4. Missing error handling

Respond in this exact JSON format:
{{
  "verdict": "PASS" | "PASS_WITH_CHANGES" | "NEEDS_WORK",
  "summary": "Brief overall summary",
  "must_fix": ["list of critical issues that must be fixed"],
  "should_fix": ["list of recommended improvements"],
  "issues": [
    {{"severity": "critical|warning|info", "description": "issue description", "file": "filename", "suggestion": "how to fix"}}
  ]
}}

DIFF:
{diff}
"""


def _get_project_root() -> str:
    """Get project root path."""
    env_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if env_root:
        return env_root
    return str(Path(__file__).resolve().parent.parent.parent.parent)


def _save_review_file(number: int, title: str, review: PRReviewResult) -> str:
    """Save review to ai/reviews/pr-{number}-review.md. Returns the file path."""
    root = Path(_get_project_root())
    reviews_dir = root / "ai" / "reviews"
    reviews_dir.mkdir(parents=True, exist_ok=True)

    review_path = reviews_dir / f"pr-{number}-review.md"

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    content = f"""# PR Review: #{number} - {title}

**Verdict:** {review.verdict}
**Date:** {now}
**Reviewer:** AI (Kuroryuu)

## Summary
{review.summary}

## Must Fix
"""
    if review.must_fix:
        for item in review.must_fix:
            content += f"- {item}\n"
    else:
        content += "- None\n"

    content += "\n## Should Fix\n"
    if review.should_fix:
        for item in review.should_fix:
            content += f"- {item}\n"
    else:
        content += "- None\n"

    content += "\n## Issues\n"
    if review.issues:
        for issue in review.issues:
            sev = issue.get("severity", "info")
            desc = issue.get("description", "")
            file = issue.get("file", "")
            content += f"- [{sev}] {desc}"
            if file:
                content += f" ({file})"
            content += "\n"
    else:
        content += "- No issues found\n"

    review_path.write_text(content, encoding="utf-8")
    logger.info(f"Saved review to {review_path}")

    # Return relative path
    return str(review_path.relative_to(root))


def _update_task_sidecar(task_id: Optional[str], pr_number: int, review: PRReviewResult, review_file: str):
    """Update task-meta.json with review status."""
    if not task_id:
        return

    root = Path(_get_project_root())
    sidecar_path = root / "ai" / "task-meta.json"

    sidecar = {}
    if sidecar_path.exists():
        try:
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8-sig"))
        except Exception:
            pass

    if task_id not in sidecar:
        sidecar[task_id] = {}

    if "pr" not in sidecar[task_id]:
        sidecar[task_id]["pr"] = {}

    sidecar[task_id]["pr"]["review_status"] = review.verdict
    sidecar[task_id]["pr"]["review_file"] = review_file

    sidecar_path.write_text(json.dumps(sidecar, indent=2), encoding="utf-8")
    logger.info(f"Updated task sidecar for {task_id} with review status: {review.verdict}")


async def review_pr(
    client: GitHubClient,
    number: int,
    task_id: Optional[str] = None,
) -> PRReviewResult:
    """Run AI review on a PR.

    1. Fetch PR info and diff
    2. Send to LLM for review
    3. Save review file
    4. Post comment on PR
    5. Update task sidecar

    Returns the review result.
    """
    # 1. Get PR info
    pr_data = await client.get_pr(number)
    title = pr_data.get("title", f"PR #{number}")

    # 2. Get diff
    diff = await client.get_pr_diff(number)

    truncated = False
    if len(diff) > MAX_DIFF_SIZE:
        diff = diff[:MAX_DIFF_SIZE]
        truncated = True
        logger.warning(f"PR #{number} diff truncated from {len(diff)} to {MAX_DIFF_SIZE} chars")

    # 3. Build review prompt
    prompt = REVIEW_PROMPT.format(
        number=number,
        title=title,
        diff=diff,
    )
    if truncated:
        prompt += "\n\nNOTE: The diff was truncated due to size. Review what is shown."

    # 4. Send to LLM
    try:
        from ..llm import get_healthy_backend, LLMConfig, LLMMessage

        backend = get_healthy_backend()
        if not backend:
            raise RuntimeError("No healthy LLM backend available")

        config = LLMConfig(
            model=backend.default_model,
            max_tokens=2000,
            temperature=0.1,
        )

        messages = [LLMMessage(role="user", content=prompt)]

        response_text = ""
        async for chunk in backend.stream(messages, config):
            if hasattr(chunk, 'content') and chunk.content:
                response_text += chunk.content
            elif isinstance(chunk, str):
                response_text += chunk

        # Parse JSON from response
        # Find JSON block in response
        json_start = response_text.find("{")
        json_end = response_text.rfind("}") + 1
        if json_start == -1 or json_end == 0:
            raise ValueError("No JSON found in LLM response")

        review_data = json.loads(response_text[json_start:json_end])

        review = PRReviewResult(
            verdict=review_data.get("verdict", "PASS_WITH_CHANGES"),
            summary=review_data.get("summary", "Review completed"),
            issues=review_data.get("issues", []),
            must_fix=review_data.get("must_fix", []),
            should_fix=review_data.get("should_fix", []),
        )

    except Exception as e:
        logger.error(f"LLM review failed for PR #{number}: {e}")
        # Return a default review on LLM failure
        review = PRReviewResult(
            verdict="PASS_WITH_CHANGES",
            summary=f"Automated review could not complete: {e}",
            issues=[],
            must_fix=[],
            should_fix=["Manual review recommended due to automated review failure"],
        )

    # 5. Save review file
    review_file = _save_review_file(number, title, review)

    # 6. Post comment on PR
    try:
        verdict_emoji = {"PASS": "✅", "PASS_WITH_CHANGES": "⚠️", "NEEDS_WORK": "❌"}.get(review.verdict, "🔍")
        comment_body = f"""## {verdict_emoji} AI Review: {review.verdict}

{review.summary}
"""
        if review.must_fix:
            comment_body += "\n### Must Fix\n"
            for item in review.must_fix:
                comment_body += f"- {item}\n"

        if review.should_fix:
            comment_body += "\n### Should Fix\n"
            for item in review.should_fix:
                comment_body += f"- {item}\n"

        comment_body += f"\n---\n*Reviewed by Kuroryuu AI*"

        await client.post_review_comment(number, comment_body)
        logger.info(f"Posted review comment on PR #{number}")
    except Exception as e:
        logger.warning(f"Failed to post review comment on PR #{number}: {e}")

    # 7. Update task sidecar
    _update_task_sidecar(task_id, number, review, review_file)

    return review
