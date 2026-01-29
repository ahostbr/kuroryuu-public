# Test script to see what data PostToolUse hooks receive
param()

$projectRoot = (Get-Location).Path
$logFile = Join-Path $projectRoot "ai\hooks\hook_test.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Log everything we can find
Add-Content -Path $logFile -Value "`n=== HOOK FIRED AT $timestamp ==="

# Try stdin
$inputJson = $input | Out-String
Add-Content -Path $logFile -Value "STDIN length: $($inputJson.Length)"
if ($inputJson) {
    Add-Content -Path $logFile -Value "STDIN content: $inputJson"
}

# Try environment variables
Add-Content -Path $logFile -Value "`nENVIRONMENT VARIABLES:"
Get-ChildItem env: | Where-Object { $_.Name -like "*CLAUDE*" -or $_.Name -like "*SESSION*" -or $_.Name -like "*TRANSCRIPT*" } | ForEach-Object {
    Add-Content -Path $logFile -Value "  $($_.Name) = $($_.Value)"
}

# Try common Claude paths
$claudeProjectsDir = Join-Path $env:USERPROFILE ".claude\projects"
if (Test-Path $claudeProjectsDir) {
    Add-Content -Path $logFile -Value "`nCLAUDE PROJECTS DIR EXISTS: $claudeProjectsDir"
    $recentTranscript = Get-ChildItem $claudeProjectsDir -Filter "*.jsonl" -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($recentTranscript) {
        Add-Content -Path $logFile -Value "  Most recent transcript: $($recentTranscript.FullName)"
        Add-Content -Path $logFile -Value "  Size: $($recentTranscript.Length) bytes"
        Add-Content -Path $logFile -Value "  Modified: $($recentTranscript.LastWriteTime)"
    }
}

Add-Content -Path $logFile -Value "=== END ==="
