param(
    [Parameter(Mandatory=$true)]
    [string]$EventType,
    [string]$SourceApp = "kuroryuu"
)

# Read stdin JSON (hook payload from Claude Code)
$input_json = [Console]::In.ReadToEnd()

try {
    $event = $input_json | ConvertFrom-Json
} catch {
    # If stdin is empty or invalid, create minimal payload
    $event = @{ session_id = "unknown" }
}

# Extract session_id from hook payload
$sessionId = if ($event.session_id) { $event.session_id } else { "unknown" }

# Extract agent_id if present (for team agents)
$agentId = $null
if ($event.agent_id) { $agentId = $event.agent_id }
if ($event.agent -and $event.agent.name) { $agentId = $event.agent.name }

# Extract tool_name for PreToolUse/PostToolUse events
$toolName = $null
if ($event.tool_name) { $toolName = $event.tool_name }
if ($event.tool -and $event.tool.name) { $toolName = $event.tool.name }

# Build payload
$body = @{
    source_app = $SourceApp
    session_id = $sessionId
    hook_event_type = $EventType
    tool_name = $toolName
    agent_id = $agentId
    payload = $event
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
} | ConvertTo-Json -Depth 10 -Compress

# Fire-and-forget POST to Gateway, always exit 0
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:8200/v1/observability/events" `
        -Method POST -Body $body -ContentType "application/json" `
        -TimeoutSec 3 | Out-Null
} catch {
    # Silent failure — hooks must never block Claude Code
}

exit 0
