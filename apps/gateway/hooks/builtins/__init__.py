"""Builtin hooks package.

Includes:
- Todo Source-of-Truth Enforcer
- Skill Content Security Scanner
"""

from .todo_sot_enforcer import (
    on_session_start,
    on_user_prompt,
    on_post_tool,
    on_model_response,
)

from .skill_content_scanner import (
    on_webfetch_skill,
    scan_content,
)

__all__ = [
    # Todo SOT Enforcer
    "on_session_start",
    "on_user_prompt",
    "on_post_tool",
    "on_model_response",
    # Skill Content Scanner
    "on_webfetch_skill",
    "scan_content",
]
