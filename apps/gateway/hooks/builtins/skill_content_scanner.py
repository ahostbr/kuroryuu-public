"""Skill Content Security Scanner.

Scans skills.sh content for malicious patterns before application.
Fires on PostToolUse for WebFetch calls to skills.sh domains.

Binary pass/fail: warns when any malicious pattern detected.

Pattern categories:
- SECRET: Embedded API keys, tokens, private keys
- SHELL_INJECTION: Command substitution, dangerous shell commands
- FILESYSTEM_WRITE: File write operations
- EXFILTRATION: Network requests to external domains
- CODE_INJECTION: eval(), exec(), dynamic code execution
- OBFUSCATION: Base64, hex escapes, character code obfuscation
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

# =============================================================================
# Pattern Definitions
# =============================================================================

# Type alias for pattern tuples: (regex, name)
PatternList = List[Tuple[str, str]]

# API Keys and Secrets (ported from security-scanner.ts)
SECRET_PATTERNS: PatternList = [
    # API Keys
    (r'AKIA[0-9A-Z]{16}', 'AWS Access Key'),
    (r'gh[ps]_[A-Za-z0-9_]{36,}', 'GitHub Token'),
    (r'gho_[A-Za-z0-9_]{36,}', 'GitHub OAuth'),
    (r'sk-ant-[A-Za-z0-9\-_]{40,}', 'Anthropic API Key'),
    (r'sk-[A-Za-z0-9]{48}', 'OpenAI API Key'),
    (r'xox[baprs]-[0-9A-Za-z\-]{10,}', 'Slack Token'),
    (r'[MN][A-Za-z\d]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}', 'Discord Token'),
    (r'sk_live_[0-9a-zA-Z]{24}', 'Stripe Key'),
    (r'AIza[0-9A-Za-z\-_]{35}', 'Google API Key'),
    # Generic secrets
    (r'-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----', 'Private Key'),
    (r'[a-zA-Z]{3,10}://[^/\s:@]+:[^/\s:@]+@', 'Password in URL'),
    (r'(?:secret|password|passwd|pwd|token|api[_\-]?key)\s*[=:]\s*["\']?[A-Za-z0-9+/=_\-]{16,}["\']?', 'Generic Secret'),
]

# Shell Command Injection
SHELL_INJECTION_PATTERNS: PatternList = [
    # Command substitution
    (r'\$\([^)]+\)', 'Shell command substitution $(...)'),
    (r'`[^`]+`', 'Backtick command substitution'),
    # Dangerous shell commands in code
    (r'\bos\.system\s*\(', 'os.system call'),
    (r'\bsubprocess\.(run|call|Popen|check_output)\s*\(', 'subprocess execution'),
    (r'\bexecSync\s*\(', 'Node execSync'),
    (r'\bspawnSync\s*\(', 'Node spawnSync'),
    (r'\bchild_process', 'Node child_process import'),
    # Shell escapes - command chaining with dangerous commands
    (r';\s*(rm|wget|curl|nc|bash|sh|zsh|powershell)\s', 'Shell command chaining'),
    (r'\|\s*(bash|sh|zsh|python|node|ruby)\b', 'Pipe to interpreter'),
]

# File System Write Operations
FILESYSTEM_WRITE_PATTERNS: PatternList = [
    # JavaScript/TypeScript
    (r'fs\.writeFile(Sync)?\s*\(', 'fs.writeFile'),
    (r'fs\.appendFile(Sync)?\s*\(', 'fs.appendFile'),
    (r'fs\.mkdir(Sync)?\s*\(', 'fs.mkdir'),
    (r'fs\.rm(Sync)?\s*\(', 'fs.rm'),
    (r'fs\.unlink(Sync)?\s*\(', 'fs.unlink'),
    (r'fs\.rename(Sync)?\s*\(', 'fs.rename'),
    # Python
    (r'open\s*\([^)]*["\'][wax][+]?["\']', 'Python file write mode'),
    (r'shutil\.(copy|move|rmtree)\s*\(', 'shutil file operations'),
    (r'pathlib\.Path\([^)]*\)\.(write_text|write_bytes)\s*\(', 'pathlib write'),
    # General
    (r'>\s*["\'][^"\']+["\']', 'Shell redirect to file'),
]

# Network Exfiltration
EXFILTRATION_PATTERNS: PatternList = [
    # Fetch to external domains (not skills.sh or common CDNs)
    (r'fetch\s*\(\s*["\']https?://(?!skills\.sh|cdn\.|unpkg\.com|cdnjs\.|jsdelivr\.)[^"\']+', 'Fetch to external domain'),
    (r'axios\.(get|post|put|delete|patch)\s*\(\s*["\']https?://(?!skills\.sh)[^"\']+', 'Axios to external domain'),
    (r'requests\.(get|post|put|delete|patch)\s*\(\s*["\']https?://(?!skills\.sh)[^"\']+', 'Requests to external domain'),
    (r'urllib\.request\.urlopen\s*\(\s*["\']https?://(?!skills\.sh)[^"\']+', 'urllib to external domain'),
    (r'httpx\.(get|post|put|delete|patch)\s*\(\s*["\']https?://(?!skills\.sh)[^"\']+', 'httpx to external domain'),
    # WebSocket connections
    (r'new\s+WebSocket\s*\(\s*["\']wss?://(?!skills\.sh)', 'WebSocket to external domain'),
]

# Code Injection
CODE_INJECTION_PATTERNS: PatternList = [
    # JavaScript
    (r'\beval\s*\(', 'eval()'),
    (r'\bnew\s+Function\s*\(', 'new Function()'),
    (r'setTimeout\s*\(\s*["\']', 'setTimeout with string'),
    (r'setInterval\s*\(\s*["\']', 'setInterval with string'),
    # Python
    (r'\b__import__\s*\(', '__import__()'),
    (r'\bexec\s*\(', 'exec()'),
    (r'\bcompile\s*\(', 'compile()'),
    (r'importlib\.import_module\s*\(', 'dynamic import'),
    # Dynamic property access (common for injection)
    (r'\[\s*["\'][^"\']+["\']\s*\]\s*\(', 'Dynamic method invocation'),
]

# Obfuscation Indicators
OBFUSCATION_PATTERNS: PatternList = [
    # Base64 decoding functions
    (r'\batob\s*\(', 'Base64 decode (atob)'),
    (r'\bbtoa\s*\(', 'Base64 encode (btoa)'),
    (r'base64\.(b64decode|decodebytes)\s*\(', 'Python base64 decode'),
    # Long hex escape sequences (>6 consecutive)
    (r'(?:\\x[0-9a-fA-F]{2}){6,}', 'Hex escape sequence'),
    (r'(?:0x[0-9a-fA-F]+,?\s*){6,}', 'Hex array'),
    # Unicode escape sequences (>6 consecutive)
    (r'(?:\\u[0-9a-fA-F]{4}){6,}', 'Unicode escape sequence'),
    # Character code obfuscation
    (r'String\.fromCharCode\s*\([^)]{30,}\)', 'String.fromCharCode obfuscation'),
    (r'(?:chr\s*\(\s*\d+\s*\)\s*\+\s*){5,}', 'Python chr() obfuscation'),
    # Excessive string concatenation
    (r'(?:["\'](?:[^"\']*)?["\']\s*\+\s*){6,}', 'Excessive string concatenation'),
]

# Combine all patterns with their categories
ALL_PATTERNS: List[Tuple[str, PatternList]] = [
    ('SECRET', SECRET_PATTERNS),
    ('SHELL_INJECTION', SHELL_INJECTION_PATTERNS),
    ('FILESYSTEM_WRITE', FILESYSTEM_WRITE_PATTERNS),
    ('EXFILTRATION', EXFILTRATION_PATTERNS),
    ('CODE_INJECTION', CODE_INJECTION_PATTERNS),
    ('OBFUSCATION', OBFUSCATION_PATTERNS),
]


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class Finding:
    """A security finding from content scanning."""
    category: str
    pattern_name: str
    line: int
    preview: str


# =============================================================================
# Scanner Functions
# =============================================================================

def scan_content(content: str) -> List[Finding]:
    """Scan content for malicious patterns.

    Args:
        content: The text content to scan.

    Returns:
        List of Finding objects for each detected pattern.
    """
    findings: List[Finding] = []
    lines = content.split('\n')

    for line_num, line in enumerate(lines, 1):
        # Skip very long lines (likely minified code or data)
        if len(line) > 2000:
            continue

        for category, patterns in ALL_PATTERNS:
            for pattern_regex, pattern_name in patterns:
                try:
                    if re.search(pattern_regex, line, re.IGNORECASE):
                        # Truncate preview for readability
                        preview = line.strip()[:80]
                        if len(line.strip()) > 80:
                            preview += '...'

                        findings.append(Finding(
                            category=category,
                            pattern_name=pattern_name,
                            line=line_num,
                            preview=preview,
                        ))
                        # Only one finding per line per category to reduce noise
                        break
                except re.error:
                    # Skip invalid regex patterns
                    continue

    return findings


def build_security_warning(findings: List[Finding], url: str) -> str:
    """Build formatted warning message for detected patterns.

    Args:
        findings: List of security findings.
        url: The URL that was scanned.

    Returns:
        Formatted warning string with box drawing characters.
    """
    # Group findings by category
    by_category: Dict[str, List[Finding]] = {}
    for f in findings:
        if f.category not in by_category:
            by_category[f.category] = []
        by_category[f.category].append(f)

    lines = [
        '',
        '=' * 76,
        '  SECURITY WARNING: Potentially Malicious Skill Content Detected',
        '=' * 76,
        '',
        f'  Source: {url}',
        f'  Findings: {len(findings)} potential issue(s) detected',
        '',
        '-' * 76,
    ]

    for category, category_findings in by_category.items():
        lines.append(f'  [{category}] ({len(category_findings)} issue(s))')
        # Show up to 3 examples per category
        for f in category_findings[:3]:
            lines.append(f'    Line {f.line}: {f.pattern_name}')
            lines.append(f'      > {f.preview}')
        if len(category_findings) > 3:
            lines.append(f'    ... and {len(category_findings) - 3} more')
        lines.append('')

    lines.extend([
        '-' * 76,
        '  ACTION REQUIRED:',
        '  - DO NOT apply this skill content to your codebase',
        '  - Report suspicious skills to skills.sh maintainers',
        '  - If this is a false positive, manually review the skill source',
        '=' * 76,
        '',
    ])

    return '\n'.join(lines)


# =============================================================================
# Hook Handler
# =============================================================================

def on_webfetch_skill(payload: Dict[str, Any]) -> Dict[str, Any]:
    """PostToolUse hook for WebFetch tool - scans skills.sh content.

    This hook fires after WebFetch completes. It checks if the fetched URL
    is from skills.sh and scans the content for malicious patterns.

    Args:
        payload: Hook payload dictionary with tool and result data.

    Returns:
        Hook result dictionary with warnings if malicious patterns found.
    """
    # Extract tool data from payload
    data = payload.get("data", {})
    tool_data = data.get("tool", {})
    result_data = data.get("result", {})

    # Only process WebFetch tool calls
    tool_name = tool_data.get("name", "")
    if tool_name != "WebFetch":
        return {"ok": True, "actions": {"allow": True}}

    # Get the URL that was fetched
    arguments = tool_data.get("arguments", {})
    url = arguments.get("url", "")

    # Only scan skills.sh URLs
    if "skills.sh" not in url:
        return {"ok": True, "actions": {"allow": True}}

    # Get fetched content from result
    # Result structure varies - try common paths
    content = ""
    if isinstance(result_data, dict):
        content = result_data.get("content", "")
        if not content:
            content = result_data.get("text", "")
        if not content:
            content = result_data.get("body", "")
    elif isinstance(result_data, str):
        content = result_data

    if not content:
        # No content to scan
        return {"ok": True, "actions": {"allow": True}}

    # Scan for malicious patterns
    findings = scan_content(content)

    if not findings:
        # Content is clean
        return {
            "ok": True,
            "actions": {
                "allow": True,
                "notes": [{"level": "info", "message": f"Skill from {url} passed security scan"}],
            }
        }

    # Build warning message
    warning = build_security_warning(findings, url)

    # Build category summary for UI
    categories = list(set(f.category for f in findings))

    return {
        "ok": True,
        "actions": {
            "allow": True,  # PostToolUse cannot block (already executed)
            "notes": [{"level": "error", "message": warning}],
        },
        "ui_events": [{
            "type": "security_warning",
            "level": "critical",
            "text": f"Malicious patterns detected in skill from skills.sh",
            "data": {
                "findings_count": len(findings),
                "categories": categories,
                "url": url,
            }
        }],
        # Inject warning into agent context
        "inject_context": (
            f"\n\n**SECURITY WARNING:** The skill content from {url} contains "
            f"{len(findings)} potentially malicious pattern(s) in categories: "
            f"{', '.join(categories)}. "
            f"DO NOT apply this content to the codebase.\n\n{warning}"
        ),
    }
