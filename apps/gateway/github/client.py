"""GitHub REST API client."""

import os
import re
import subprocess
from pathlib import Path
from typing import Optional

import httpx

from ..utils.logging_config import get_logger

logger = get_logger(__name__)


def _get_default_repo_path() -> str:
    """Get default repo path from env or derive from __file__."""
    env_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if env_root:
        return env_root
    # __file__ is apps/gateway/github/client.py -> go up 3 levels
    return str(Path(__file__).resolve().parent.parent.parent.parent)


class GitHubClient:
    """GitHub REST API client using httpx (async)."""

    BASE_URL = "https://api.github.com"

    def __init__(self, token: str, owner: str = "", repo: str = ""):
        self.token = token
        self.owner = owner
        self.repo = repo
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=30.0,
        )

    @staticmethod
    def parse_remote_url(repo_path: str = "") -> tuple[str, str]:
        """Parse owner/repo from git remote origin URL.

        Handles both SSH (git@github.com:owner/repo.git) and
        HTTPS (https://github.com/owner/repo.git) formats.

        Returns:
            Tuple of (owner, repo).

        Raises:
            ValueError: If remote URL cannot be parsed.
        """
        cwd = repo_path or _get_default_repo_path()
        try:
            result = subprocess.run(
                ["git", "remote", "get-url", "origin"],
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode != 0:
                raise ValueError(f"Failed to get git remote: {result.stderr.strip()}")

            url = result.stdout.strip()
        except subprocess.TimeoutExpired:
            raise ValueError("Git command timed out")

        # SSH: git@github.com:owner/repo.git
        ssh_match = re.match(r"git@github\.com:([^/]+)/(.+?)(?:\.git)?$", url)
        if ssh_match:
            return ssh_match.group(1), ssh_match.group(2)

        # HTTPS: https://github.com/owner/repo.git
        https_match = re.match(r"https://github\.com/([^/]+)/(.+?)(?:\.git)?$", url)
        if https_match:
            return https_match.group(1), https_match.group(2)

        raise ValueError(f"Cannot parse GitHub remote URL: {url}")

    async def create_pr(self, head: str, base: str, title: str, body: str = "") -> dict:
        """Create a pull request."""
        resp = await self._client.post(
            f"/repos/{self.owner}/{self.repo}/pulls",
            json={"head": head, "base": base, "title": title, "body": body},
        )
        resp.raise_for_status()
        return resp.json()

    async def get_pr(self, number: int) -> dict:
        """Get PR details."""
        resp = await self._client.get(
            f"/repos/{self.owner}/{self.repo}/pulls/{number}"
        )
        resp.raise_for_status()
        return resp.json()

    async def list_prs(self, state: str = "open") -> list[dict]:
        """List PRs."""
        resp = await self._client.get(
            f"/repos/{self.owner}/{self.repo}/pulls",
            params={"state": state, "per_page": 100},
        )
        resp.raise_for_status()
        return resp.json()

    async def get_pr_diff(self, number: int) -> str:
        """Get PR diff."""
        resp = await self._client.get(
            f"/repos/{self.owner}/{self.repo}/pulls/{number}",
            headers={"Accept": "application/vnd.github.v3.diff"},
        )
        resp.raise_for_status()
        return resp.text

    async def post_review_comment(self, number: int, body: str) -> dict:
        """Post a comment on a PR."""
        resp = await self._client.post(
            f"/repos/{self.owner}/{self.repo}/issues/{number}/comments",
            json={"body": body},
        )
        resp.raise_for_status()
        return resp.json()

    async def merge_pr(
        self, number: int, merge_method: str = "merge", commit_title: Optional[str] = None
    ) -> dict:
        """Merge a PR."""
        payload: dict = {"merge_method": merge_method}
        if commit_title:
            payload["commit_title"] = commit_title

        resp = await self._client.put(
            f"/repos/{self.owner}/{self.repo}/pulls/{number}/merge",
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()

    async def close(self):
        """Close the HTTP client."""
        await self._client.aclose()
