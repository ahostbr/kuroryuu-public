# RAG Interactive Mode Toggle
# Creates or removes .enable-rag-interactive flag file

param(
    [Parameter(Position=0)]
    [ValidateSet("on", "off", "status", "t", "f", "true", "false", "1", "0", "")]
    [string]$Mode = ""
)

$projectDir = $env:CLAUDE_PROJECT_DIR
if (-not $projectDir) { $projectDir = $env:KURORYUU_PROJECT_ROOT }
if (-not $projectDir) {
    # Walk up from script location looking for marker file
    $current = $PSScriptRoot
    while ($current) {
        if (Test-Path (Join-Path $current "KURORYUU_BOOTSTRAP.md")) {
            $projectDir = $current
            break
        }
        $parent = Split-Path $current -Parent
        if (-not $parent -or $parent -eq $current) { break }
        $current = $parent
    }
}
if (-not $projectDir) { $projectDir = (Get-Location).Path }

$flagFile = Join-Path $projectDir ".enable-rag-interactive"
$exists = Test-Path $flagFile

# Normalize mode
$normalizedMode = switch ($Mode.ToLower()) {
    { $_ -in @("on", "t", "true", "1") } { "on" }
    { $_ -in @("off", "f", "false", "0") } { "off" }
    { $_ -in @("status", "") } { "status" }
    default { "status" }
}

switch ($normalizedMode) {
    "on" {
        if (-not $exists) {
            "enabled" | Out-File -FilePath $flagFile -Encoding utf8 -NoNewline
        }
        Write-Output "[OK] RAG interactive mode ENABLED"
        Write-Output "All k_rag search queries will now prompt for result filtering."
        Write-Output "Flag file: $flagFile"
    }
    "off" {
        if ($exists) {
            Remove-Item $flagFile -Force
        }
        Write-Output "[OK] RAG interactive mode DISABLED"
        Write-Output "k_rag queries will proceed without filtering prompts."
    }
    "status" {
        if ($exists) {
            Write-Output "[STATUS] RAG interactive mode is ENABLED"
            Write-Output "All k_rag search queries will prompt for result filtering."
        } else {
            Write-Output "[STATUS] RAG interactive mode is DISABLED"
            Write-Output "Use '/rag-interactive on' to enable human-in-the-loop filtering."
        }
    }
}
