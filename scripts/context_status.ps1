#!/usr/bin/env pwsh
# Context Status Line Script for Claude Code
# Shows context usage percentage with warnings at 60% and 80%

$json = [Console]::In.ReadToEnd() | ConvertFrom-Json

if ($null -eq $json.context_window) {
    Write-Output "ctx:--"
    exit 0
}

$size = $json.context_window.context_window_size
$used = $json.context_window.total_input_tokens

if ($size -eq 0) {
    Write-Output "ctx:--"
    exit 0
}

$pct = [math]::Round(($used / $size) * 100)

if ($pct -ge 80) {
    Write-Output "[!!SAVE NOW!!] $pct%"
} elseif ($pct -ge 60) {
    Write-Output "[WARN] $pct%"
} else {
    Write-Output "ctx:$pct%"
}
