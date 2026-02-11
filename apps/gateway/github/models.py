"""GitHub PR data models."""

from typing import Literal, Optional
from pydantic import BaseModel


class PRCreateRequest(BaseModel):
    """Request to create a pull request."""
    task_id: Optional[str] = None
    branch: str
    base: str = "master"
    title: str
    body: str = ""


class PRInfo(BaseModel):
    """Pull request information."""
    number: int
    url: str
    state: str
    title: str
    body: str
    head: str
    base: str
    created_at: str
    merged: bool
    mergeable: Optional[bool] = None


class PRReviewResult(BaseModel):
    """AI review result for a pull request."""
    verdict: Literal["PASS", "PASS_WITH_CHANGES", "NEEDS_WORK"]
    summary: str
    issues: list[dict]
    must_fix: list[str]
    should_fix: list[str]


class PRListResponse(BaseModel):
    """Response for listing pull requests."""
    prs: list[PRInfo]


class PRMergeRequest(BaseModel):
    """Request to merge a pull request."""
    merge_method: str = "merge"
    commit_title: Optional[str] = None


class MessageResponse(BaseModel):
    """Generic success/message response."""
    success: bool
    message: str
