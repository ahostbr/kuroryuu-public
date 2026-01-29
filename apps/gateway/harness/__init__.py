"""Harness package - Agent harness file management.

Provides:
- HarnessStore: Read/write prompt files
- BUILD_13: Prime context builders
"""

from .harness_store import (
    get_harness_store,
    HARNESS_DIR,
)

from .harness_context import (
    # BUILD_13: Prime context
    build_prime_context,
    build_prime_report,
    is_repo_intel_stale,
    get_git_state,
    clear_prime_cache,
    PRIME_CACHE_TTL_SECONDS,
    REPO_INTEL_STALE_HOURS,
)

__all__ = [
    # Store
    "get_harness_store",
    "HARNESS_DIR",
    # BUILD_13: Prime
    "build_prime_context",
    "build_prime_report",
    "is_repo_intel_stale",
    "get_git_state",
    "clear_prime_cache",
    "PRIME_CACHE_TTL_SECONDS",
    "REPO_INTEL_STALE_HOURS",
]
