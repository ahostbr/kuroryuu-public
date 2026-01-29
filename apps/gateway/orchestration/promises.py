"""Promise Parsing - Extract completion signals from worker output.

Ralph Wiggum completion promise protocol:
- Workers output <promise>SIGNAL</promise> or <promise>SIGNAL:detail</promise>
- Signals: DONE, BLOCKED, STUCK, PROGRESS

Examples:
    <promise>DONE</promise>
    <promise>BLOCKED:missing API key</promise>
    <promise>STUCK:circular dependency detected</promise>
    <promise>PROGRESS:75</promise>
"""

import re
from typing import Optional, Tuple

from .models import PromiseType


# Pattern: <promise>SIGNAL</promise> or <promise>SIGNAL:detail</promise>
PROMISE_PATTERN = re.compile(
    r"<promise>(\w+)(?::([^<]+))?</promise>",
    re.IGNORECASE
)


def parse_promise(text: str) -> Tuple[Optional[PromiseType], str]:
    """Parse completion promise from worker output.
    
    Args:
        text: Worker output text to search
        
    Returns:
        Tuple of (PromiseType or None, detail string)
        
    Examples:
        >>> parse_promise("Task complete <promise>DONE</promise>")
        (PromiseType.DONE, "")
        
        >>> parse_promise("Need key <promise>BLOCKED:missing API key</promise>")
        (PromiseType.BLOCKED, "missing API key")
        
        >>> parse_promise("Working... <promise>PROGRESS:80</promise>")
        (PromiseType.PROGRESS, "80")
    """
    match = PROMISE_PATTERN.search(text)
    if not match:
        return None, ""
    
    signal = match.group(1).upper()
    detail = match.group(2) or ""
    
    try:
        promise_type = PromiseType(signal)
        return promise_type, detail.strip()
    except ValueError:
        # Unknown signal - treat as text
        return None, ""


def format_promise(promise: PromiseType, detail: str = "") -> str:
    """Format a completion promise for output.
    
    Args:
        promise: The promise type
        detail: Optional detail string
        
    Returns:
        Formatted promise string
        
    Examples:
        >>> format_promise(PromiseType.DONE)
        "<promise>DONE</promise>"
        
        >>> format_promise(PromiseType.BLOCKED, "missing API key")
        "<promise>BLOCKED:missing API key</promise>"
    """
    if detail:
        return f"<promise>{promise.value}:{detail}</promise>"
    return f"<promise>{promise.value}</promise>"


def extract_progress_pct(detail: str) -> Optional[int]:
    """Extract progress percentage from promise detail.
    
    Args:
        detail: The promise detail string
        
    Returns:
        Integer percentage (0-100) or None if not parseable
    """
    try:
        pct = int(detail.strip().rstrip('%'))
        return max(0, min(100, pct))
    except (ValueError, AttributeError):
        return None


def is_terminal_promise(promise: Optional[PromiseType]) -> bool:
    """Check if promise indicates task completion (success or failure).
    
    DONE = success completion
    STUCK with no iterations left = failure
    """
    return promise == PromiseType.DONE


def needs_leader_attention(promise: Optional[PromiseType]) -> bool:
    """Check if promise requires leader intervention.
    
    BLOCKED = needs external resource/approval
    STUCK = needs reassignment or hint
    """
    return promise in (PromiseType.BLOCKED, PromiseType.STUCK)
