# Kuroryuu Claude Mode Inbox Checker
# This script runs on UserPromptSubmit hook to check for new inbox messages
# Only runs if Claude Mode is enabled (flag file exists)

# ============================================================================
# Security: Sanitize text for safe display (defense in depth)
# ============================================================================
function Sanitize-ForDisplay {
    param([string]$text, [int]$maxLen = 80)
    if (-not $text) { return "" }
    # Remove shell metacharacters that could be used for injection
    $clean = $text -replace '[;|&`$(){}[\]<>]', ''
    # Remove hex/escape sequences
    $clean = $clean -replace '\\x[0-9a-fA-F]{2}', ''
    # Remove backslashes (escape chars)
    $clean = $clean -replace '\\', ''
    # Truncate long strings
    if ($clean.Length -gt $maxLen) {
        $clean = $clean.Substring(0, $maxLen - 3) + "..."
    }
    return $clean.Trim()
}

# Check if Claude Mode is enabled via flag file
$sessionId = $env:KURORYUU_SESSION_ID
if (-not $sessionId) {
    exit 0  # No session ID = not a Desktop PTY
}

# Project root is where .claude/ directory exists (current working dir for Claude Code)
# Resolve project root: env var (for global plugin) or current directory (for project plugin)
$projectRoot = if ($env:KURORYUU_PROJECT_ROOT) { $env:KURORYUU_PROJECT_ROOT } else { (Get-Location).Path }
$flagPath = Join-Path $projectRoot "ai\.claude_mode\$sessionId"
if (-not (Test-Path $flagPath)) {
    exit 0  # Claude Mode not enabled
}

# Poll k_inbox for new messages
try {
    $body = @{
        jsonrpc = "2.0"
        method = "tools/call"
        params = @{
            name = "k_inbox"
            arguments = @{ action = "list"; folder = "new"; limit = 5 }
        }
        id = 1
    } | ConvertTo-Json -Depth 5

    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8100/mcp" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3

    # Parse result
    $resultText = $resp.result.content[0].text
    $result = $resultText | ConvertFrom-Json

    if ($result.ok -and $result.count -gt 0) {
        Write-Output ""
        Write-Output "=== KURORYUU INBOX ($($result.count) new) ==="
        foreach ($msg in $result.messages) {
            # Security: Sanitize subject and from fields before display
            $subject = Sanitize-ForDisplay $(if ($msg.subject) { $msg.subject } else { "(no subject)" })
            $from = Sanitize-ForDisplay $(if ($msg.from) { $msg.from } else { "unknown" }) 40
            Write-Output "[$($msg.id)] $subject (from: $from)"
        }
        Write-Output "Use /k-inbox read <id> or k_inbox(action='claim', id='...') to respond."
        Write-Output ""
    }
} catch {
    # Fail silently - don't disrupt normal operation
    # Uncomment for debugging:
    # Write-Error "Inbox check failed: $_"
}
