# RAG Interactive Gate - PreToolUse hook for k_rag
# When .enable-rag-interactive flag exists, reminds Claude to use query_interactive
# Does NOT auto-redirect - just provides guidance via systemMessage

param()

$ErrorActionPreference = "Stop"

# Get project root (portable)
function Get-ProjectRoot {
    if ($env:KURORYUU_PROJECT_ROOT) { return $env:KURORYUU_PROJECT_ROOT }
    if ($env:CLAUDE_PROJECT_DIR) { return $env:CLAUDE_PROJECT_DIR }
    $current = $PSScriptRoot
    while ($current) {
        if (Test-Path (Join-Path $current "KURORYUU_BOOTSTRAP.md")) { return $current }
        $parent = Split-Path $current -Parent
        if (-not $parent -or $parent -eq $current) { break }
        $current = $parent
    }
    return (Get-Location).Path
}

$projectRoot = Get-ProjectRoot

# Debug logging to verify hook is being called
$debugLog = Join-Path $projectRoot "ai\hooks\rag-gate-debug.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $debugLog -Value "[$timestamp] RAG Gate hook invoked"

# Read hook input from stdin (use $hookData, not $input - that's reserved)
$hookData = $null
try {
    $hookData = [Console]::In.ReadToEnd() | ConvertFrom-Json
} catch {
    # No input or invalid JSON - allow through
    Write-Output '{"hookSpecificOutput":{"permissionDecision":"allow"}}'
    exit 0
}

# Check for flag file (use already-resolved project root)
$flagFile = Join-Path $projectRoot ".enable-rag-interactive"

if (-not (Test-Path $flagFile)) {
    # Flag not present - allow through silently
    Write-Output '{"hookSpecificOutput":{"permissionDecision":"allow"}}'
    exit 0
}

# Flag exists - check what action is being used
$toolInput = $hookData.tool_input
if (-not $toolInput) {
    Write-Output '{"hookSpecificOutput":{"permissionDecision":"allow"}}'
    exit 0
}

$action = $toolInput.action
if (-not $action) {
    Write-Output '{"hookSpecificOutput":{"permissionDecision":"allow"}}'
    exit 0
}

# If already using query_interactive, allow through
if ($action -eq "query_interactive") {
    Write-Output '{"hookSpecificOutput":{"permissionDecision":"allow"}}'
    exit 0
}

# Non-search actions - allow through
$nonSearchActions = @("help", "status", "index", "index_semantic")
if ($action -in $nonSearchActions) {
    Write-Output '{"hookSpecificOutput":{"permissionDecision":"allow"}}'
    exit 0
}

# Search action detected while flag is set - BLOCK with simple stderr message
# Exit code 2 = block, stderr message is shown to Claude
$reason = "[RAG INTERACTIVE MODE] Use action='query_interactive' instead of '$action' for human-in-the-loop result filtering."

# Write to stderr - this should be returned to Claude
[Console]::Error.WriteLine($reason)
exit 2
