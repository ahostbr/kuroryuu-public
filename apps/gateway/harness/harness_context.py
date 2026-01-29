"""Harness Context - Build LLM context from harness state.

BUILD_13: Prime context system for gathering repo intel and git state.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .harness_store import (
    HarnessStore,
    get_harness_store,
)


# ═══════════════════════════════════════════════════════════════════════════════
# BUILD_13: Prime Context with TTL Cache + Staleness Alerts
# ═══════════════════════════════════════════════════════════════════════════════

import subprocess
import os
from datetime import timedelta
from pathlib import Path

# TTL Cache for prime context
_prime_cache: Dict[str, Any] = {}
_prime_cache_time: Optional[datetime] = None
PRIME_CACHE_TTL_SECONDS = int(os.environ.get("KURORYUU_PRIME_CACHE_TTL", "300"))  # 5 min
REPO_INTEL_STALE_HOURS = int(os.environ.get("KURORYUU_REPO_INTEL_STALE_HOURS", "24"))


def is_repo_intel_stale(last_indexed: Optional[str], ttl_hours: int = REPO_INTEL_STALE_HOURS) -> bool:
    """Check if repo_intel index is stale (older than TTL)."""
    if not last_indexed:
        return True
    try:
        indexed_at = datetime.fromisoformat(last_indexed.replace("Z", "+00:00"))
        return datetime.now(timezone.utc) - indexed_at > timedelta(hours=ttl_hours)
    except (ValueError, TypeError):
        return True


def get_staleness_hours(last_indexed: Optional[str]) -> Optional[int]:
    """Get hours since last index, or None if unknown."""
    if not last_indexed:
        return None
    try:
        indexed_at = datetime.fromisoformat(last_indexed.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - indexed_at
        return int(delta.total_seconds() / 3600)
    except (ValueError, TypeError):
        return None


def get_git_state() -> Dict[str, Any]:
    """Get current git state (branch, status, recent commits)."""
    git_state = {
        "branch": "unknown",
        "clean": True,
        "status": "",
        "recent_commits": [],
        "error": None,
    }
    
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            git_state["branch"] = result.stdout.strip() or "HEAD detached"
        
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            status_lines = result.stdout.strip().split("\n") if result.stdout.strip() else []
            git_state["clean"] = len(status_lines) == 0
            git_state["status"] = f"{len(status_lines)} uncommitted changes" if status_lines else "Clean"
        
        result = subprocess.run(
            ["git", "log", "-5", "--oneline"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            git_state["recent_commits"] = [
                line.strip() for line in result.stdout.strip().split("\n") if line.strip()
            ][:5]
            
    except subprocess.TimeoutExpired:
        git_state["error"] = "Git command timeout"
    except FileNotFoundError:
        git_state["error"] = "Git not found"
    except Exception as e:
        git_state["error"] = str(e)
    
    return git_state


def build_prime_context(
    store: Optional[HarnessStore] = None,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """Build comprehensive prime context with TTL cache.

    BUILD_13: Bootstrap-aware prime context builder.
    KURORYUU_BOOTSTRAP.md is THE authority - this just gathers state.
    """
    global _prime_cache, _prime_cache_time

    # Check cache
    if not force_refresh and _prime_cache and _prime_cache_time:
        cache_age = (datetime.now(timezone.utc) - _prime_cache_time).total_seconds()
        if cache_age < PRIME_CACHE_TTL_SECONDS:
            cached_result = dict(_prime_cache)
            cached_result["cached"] = True
            cached_result["cache_age_seconds"] = int(cache_age)
            return cached_result

    if store is None:
        store = get_harness_store()

    # Load prompt content
    prime_prompt = store.load_prompt("prime") or ""

    # === GATHER: Repo Intel Status ===
    repo_intel_data = {
        "indexed": False,
        "last_indexed": None,
        "stale": True,
        "stale_hours": None,
        "total_files": 0,
        "total_symbols": 0,
        "total_todos": 0,
    }

    try:
        from ..repo_intel.router import get_index_status
        status = get_index_status()
        repo_intel_data["indexed"] = status.indexed
        repo_intel_data["last_indexed"] = status.last_indexed
        repo_intel_data["total_files"] = status.total_files
        repo_intel_data["total_symbols"] = status.total_symbols
        repo_intel_data["total_todos"] = status.total_todos
        repo_intel_data["stale"] = is_repo_intel_stale(status.last_indexed)
        repo_intel_data["stale_hours"] = get_staleness_hours(status.last_indexed)
    except Exception as e:
        repo_intel_data["error"] = str(e)

    # === GATHER: Git State ===
    git_data = get_git_state()

    # === BUILD: Alerts ===
    alerts = []

    if repo_intel_data.get("stale"):
        hours = repo_intel_data.get("stale_hours")
        if hours is not None:
            alerts.append({
                "type": "repo_intel_stale",
                "severity": "warning",
                "message": f"⚠️ REPO INTEL STALE — Last indexed {hours}h ago",
                "action": "Run: POST /v1/repo_intel/refresh",
            })
        else:
            alerts.append({
                "type": "repo_intel_not_indexed",
                "severity": "warning",
                "message": "⚠️ REPO INTEL NOT INDEXED",
                "action": "Run: POST /v1/repo_intel/refresh",
            })

    if not git_data.get("clean", True):
        alerts.append({
            "type": "git_dirty",
            "severity": "info",
            "message": f"ℹ️ GIT: {git_data.get('status', 'Uncommitted changes')}",
            "action": "Commit or stash changes before major work",
        })

    # === BUILD: Result ===
    result = {
        "ok": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "bootstrap": "KURORYUU_BOOTSTRAP.md",  # THE authority
        "repo_intel": repo_intel_data,
        "git": git_data,
        "alerts": alerts,
        "prime_prompt": prime_prompt,
        "cached": False,
        "cache_age_seconds": 0,
    }

    # Update cache
    _prime_cache = result
    _prime_cache_time = datetime.now(timezone.utc)

    return result


def build_prime_report(context: Dict[str, Any]) -> str:
    """Build formatted prime report for chat display."""
    lines = [
        "═══════════════════════════════════════════════════════════════════",
        "🔑 KURORYUU PRIME — Context Loaded",
        "═══════════════════════════════════════════════════════════════════",
        "",
        f"📋 BOOTSTRAP: {context.get('bootstrap', 'KURORYUU_BOOTSTRAP.md')}",
        "",
    ]

    # Alerts first
    for alert in context.get("alerts", []):
        lines.append(alert.get("message", ""))
        lines.append(f"   → {alert.get('action', '')}")
        lines.append("")

    # Repo Intel
    ri = context.get("repo_intel", {})
    lines.extend([
        "📊 REPO INTEL",
        f"├── Indexed: {'✅' if ri.get('indexed') else '❌'}",
        f"├── Files: {ri.get('total_files', 0)} | Symbols: {ri.get('total_symbols', 0)} | TODOs: {ri.get('total_todos', 0)}",
        f"└── {'⚠️ STALE' if ri.get('stale') else '✅ Current'}",
        "",
    ])

    # Git
    git = context.get("git", {})
    lines.extend([
        f"🔀 GIT: {git.get('branch', 'unknown')} | {'Clean' if git.get('clean') else git.get('status', 'Dirty')}",
        "",
    ])

    # Cache info
    if context.get("cached"):
        lines.append(f"📦 Cached ({context.get('cache_age_seconds', 0)}s old)")

    lines.append("═══════════════════════════════════════════════════════════════════")

    return "\n".join(lines)


def clear_prime_cache() -> None:
    """Clear the prime context cache."""
    global _prime_cache, _prime_cache_time
    _prime_cache = {}
    _prime_cache_time = None


__all__ = [
    "build_prime_context",
    "build_prime_report",
    "is_repo_intel_stale",
    "get_git_state",
    "clear_prime_cache",
    "PRIME_CACHE_TTL_SECONDS",
    "REPO_INTEL_STALE_HOURS",
]
