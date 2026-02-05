"""Command Security Module - Shared security validation for k_bash and k_pty.

Provides:
- BLOCKED_COMMAND_PATTERNS: Regex patterns for dangerous commands
- SHELL_INJECTION_PATTERNS: Additional patterns for shell injection detection
- SECRET_REDACTION_PATTERNS: Patterns for sanitizing sensitive output
- check_dangerous_command(): Validation function
- redact_secrets(): Output sanitization
- emit_security_event(): Gateway event emission for monitoring
"""

import re
import os
from typing import Any, Dict, Optional

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore

GATEWAY_URL = os.environ.get("KURORYUU_GATEWAY_URL", "http://127.0.0.1:8200")

# ============================================================================
# Blocked Command Patterns (Agent Safety)
# Ported from tools_pty.py - these patterns block destructive operations
# ============================================================================

BLOCKED_COMMAND_PATTERNS = [
    # Destructive file operations
    r'rm\s+(-[rf]+\s+)*[/~]',       # rm -rf / or ~
    r'del\s+/[sqf]',                # Windows del with dangerous flags
    r'rmdir\s+/[sq]',               # Windows rmdir recursive
    r'rd\s+/[sq]',                  # Windows rd alias

    # Disk/partition operations
    r'format\s+[a-z]:',             # Format drives
    r'diskpart',                    # Disk partitioning
    r'mkfs\.',                      # Linux format (mkfs.ext4, etc.)
    r'dd\s+if=.+of=/dev',           # Disk write
    r'fdisk',                       # Partition editor

    # System damage
    r':\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;',  # Fork bomb (bash)
    r'%0\|%0',                      # Fork bomb (Windows)
    r'shutdown\s+[/-]',             # Shutdown commands
    r'\bhalt\b',                    # System halt
    r'init\s+0',                    # Linux halt

    # Credential/key access
    r'cat.+\.ssh/',                 # SSH keys (Linux)
    r'type.+\\\.ssh\\',             # SSH keys (Windows)
    r'cat.+\.aws/',                 # AWS credentials
    r'cat.+\.config/gcloud',        # GCloud credentials
    r'reg\s+query.+SAM',            # Windows SAM database
    r'mimikatz',                    # Credential dumper
    r'sekurlsa',                    # Mimikatz module

    # NOTE: Download-execute and reverse shell patterns removed for trusted agents
    # Uncomment if running in untrusted multi-tenant environment:
    # r'curl.+\|\s*(ba)?sh',          # curl | bash
    # r'wget.+-O-?\s*\|\s*(ba)?sh',   # wget | sh
    # r'Invoke-WebRequest.+\|\s*iex', # PowerShell download exec
    # r'IEX\s*\(.+DownloadString',    # PowerShell IEX variant
    # r'nc\s+.+-e\s+/bin/',           # Netcat reverse shell
    # r'bash\s+-i\s+>&\s+/dev/tcp',   # Bash reverse shell
    # r'ncat.+--exec',                # Ncat exec

    # Registry/system config attacks
    r'reg\s+(delete|add)\s+HK(LM|CU)',  # Registry modification
    r'bcdedit',                     # Boot config edit
    r'vssadmin\s+delete',           # Delete shadow copies
    r'wbadmin\s+delete',            # Delete backups
]

# ============================================================================
# Shell Injection Patterns (DISABLED for trusted agents)
# Uncomment if running in untrusted multi-tenant environment
# ============================================================================

SHELL_INJECTION_PATTERNS = [
    # NOTE: All patterns disabled for trusted agent use - common in legitimate scripts
    # (r'\$\([^)]+\)', 'Shell command substitution $(...)'),
    # (r'`[^`]+`', 'Backtick command substitution'),
    # (r'\|\s*(bash|sh|zsh|python|node|ruby)\b', 'Pipe to interpreter'),
]

# ============================================================================
# Secret Redaction Patterns
# Ported from tools_pty.py - sanitizes sensitive data from output
# ============================================================================

SECRET_REDACTION_PATTERNS = [
    (r'sk-[a-zA-Z0-9]{20,}', '[REDACTED_API_KEY]'),
    (r'ghp_[a-zA-Z0-9]{36,}', '[REDACTED_GITHUB_TOKEN]'),
    (r'Bearer [a-zA-Z0-9_-]+', 'Bearer [REDACTED]'),
    (r'export\s+\w*TOKEN\w*=\S+', 'export TOKEN=[REDACTED]'),
    (r'export\s+\w*KEY\w*=\S+', 'export KEY=[REDACTED]'),
    (r'ANTHROPIC_API_KEY=\S+', 'ANTHROPIC_API_KEY=[REDACTED]'),
    (r'OPENAI_API_KEY=\S+', 'OPENAI_API_KEY=[REDACTED]'),
]


# ============================================================================
# Security Functions
# ============================================================================

def check_dangerous_command(cmd: str) -> Dict[str, Any] | None:
    """Check if command matches dangerous patterns.

    Args:
        cmd: The command string to validate

    Returns:
        Error dict if blocked, None if safe
    """
    # Check blocked patterns (destructive operations)
    for pattern in BLOCKED_COMMAND_PATTERNS:
        if re.search(pattern, cmd, re.IGNORECASE):
            return {
                "ok": False,
                "error_code": "DANGEROUS_COMMAND_BLOCKED",
                "message": "Command blocked by safety filter: matches dangerous pattern",
                "details": {"pattern": pattern, "command_preview": cmd[:100]},
            }

    # Check shell injection patterns
    for pattern, name in SHELL_INJECTION_PATTERNS:
        if re.search(pattern, cmd, re.IGNORECASE):
            return {
                "ok": False,
                "error_code": "SHELL_INJECTION_BLOCKED",
                "message": f"Command blocked: {name}",
                "details": {"pattern": pattern, "command_preview": cmd[:100]},
            }

    return None


def redact_secrets(text: str) -> str:
    """Redact common secret patterns from output.

    Args:
        text: Output text that may contain secrets

    Returns:
        Text with secrets redacted
    """
    for pattern, replacement in SECRET_REDACTION_PATTERNS:
        text = re.sub(pattern, replacement, text)
    return text


def emit_security_event(
    tool_name: str,
    session_id: str,
    command: str,
    blocked: bool = False,
    blocked_pattern: Optional[str] = None,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
    agent_id: Optional[str] = None,
    wave_id: Optional[str] = None,
) -> None:
    """Emit security event to Gateway for monitoring.

    Fire-and-forget POST to /v1/pty-traffic/emit endpoint.
    Does not raise exceptions - silently fails if Gateway unavailable.
    """
    if httpx is None:
        return

    event = {
        "action": "security_block" if blocked else "command_executed",
        "session_id": session_id,
        "agent_id": agent_id or os.environ.get("KURORYUU_AGENT_ID"),
        "command": command[:500] if command else None,
        "command_size": len(command) if command else 0,
        "success": not blocked,
        "blocked": blocked,
        "blocked_pattern": blocked_pattern,
        "error_code": error_code,
        "error_message": error_message,
        "cli_type": tool_name,
        "wave_id": wave_id,
    }

    try:
        httpx.post(
            f"{GATEWAY_URL}/v1/pty-traffic/emit",
            json=event,
            timeout=1.0,
        )
    except Exception:
        pass  # Fire-and-forget
