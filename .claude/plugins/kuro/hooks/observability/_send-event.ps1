# Observability hook: POST event to Gateway
# Called directly by Claude Code hooks (no wrapper scripts)
# Usage: _send-event.ps1 <EventType> [SourceApp]
#
# DOES NOT read stdin — all stdin approaches block on Windows:
#   - [Console]::In.ReadToEnd() blocks forever
#   - $input | Out-String blocks forever
#   - ReadToEndAsync().Wait() deadlocks in PS runtime
# Session ID comes from CLAUDE_SESSION_ID env var if available.

$EventType = $args[0]
$SourceApp = if ($args[1]) { $args[1] } else { "kuroryuu" }

if (-not $EventType) {
    exit 0
}

$sessionId = if ($env:CLAUDE_SESSION_ID) { $env:CLAUDE_SESSION_ID } else { "unknown" }
$toolName = $env:TOOL_NAME

$body = @{
    source_app = $SourceApp
    session_id = $sessionId
    hook_event_type = $EventType
    tool_name = $toolName
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
} | ConvertTo-Json -Depth 10 -Compress

try {
    Invoke-RestMethod -Uri "http://127.0.0.1:8200/v1/observability/events" `
        -Method POST -Body $body -ContentType "application/json" `
        -TimeoutSec 3 | Out-Null
} catch {}

exit 0
