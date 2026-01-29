"""
Run ID Generation

Generates sortable, human-friendly run IDs for the stateless agent architecture.
Format: YYYYMMDD_HHMMSS_<8hex>
Example: 20260108_153045_a7f3c912
"""
from __future__ import annotations

import re
import secrets
from datetime import datetime

# Strict regex for run_id format (prevents path traversal, weird IDs)
RUN_ID_PATTERN = re.compile(r"^[0-9]{8}_[0-9]{6}_[0-9a-f]{8}$")


def generate_run_id() -> str:
    """
    Generate a new run ID.
    
    Format: YYYYMMDD_HHMMSS_<8hex>
    - Sortable by timestamp
    - Human-readable
    - Unique via random suffix
    
    Returns:
        Run ID string (e.g., "20260108_153045_a7f3c912")
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    random_suffix = secrets.token_hex(4)  # 8 hex chars
    return f"{timestamp}_{random_suffix}"


def parse_run_id(run_id: str) -> dict:
    """
    Parse a run ID into its components.
    
    Args:
        run_id: Run ID string
        
    Returns:
        Dict with 'timestamp', 'datetime', 'random_suffix'
        
    Raises:
        ValueError: If run_id format is invalid
    """
    if not RUN_ID_PATTERN.match(run_id):
        raise ValueError(f"Invalid run_id format: {run_id} (must match YYYYMMDD_HHMMSS_<8hex>)")
    
    parts = run_id.split("_")
    date_part, time_part, random_suffix = parts
    timestamp_str = f"{date_part}_{time_part}"
    
    return {
        "timestamp": timestamp_str,
        "datetime": datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S"),
        "random_suffix": random_suffix,
        "run_id": run_id
    }


def is_valid_run_id(run_id: str) -> bool:
    """
    Check if a string is a valid run ID.
    
    Uses strict regex to prevent path traversal attacks.
    
    Args:
        run_id: String to validate
        
    Returns:
        True if valid run ID format (YYYYMMDD_HHMMSS_<8hex>)
    """
    if not run_id or not isinstance(run_id, str):
        return False
    return bool(RUN_ID_PATTERN.match(run_id))


def validate_run_id_or_raise(run_id: str) -> str:
    """
    Validate run_id format, raise ValueError if invalid.
    
    Use this for input validation on API boundaries.
    
    Args:
        run_id: String to validate
        
    Returns:
        The validated run_id
        
    Raises:
        ValueError: If format is invalid
    """
    if not is_valid_run_id(run_id):
        raise ValueError(f"Invalid run_id format: {run_id!r} (must match YYYYMMDD_HHMMSS_<8hex>)")
    return run_id
