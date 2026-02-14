<#
.SYNOPSIS
Claude Code Status Line - Pretty Unicode Progress Bar with Color
Supports 3 display modes: full, compact, minimal
#>

try {
    $jsonInput = $input | Out-String
    if ([string]::IsNullOrWhiteSpace($jsonInput)) {
        Write-Output "..."
        exit 0
    }

    $data = $jsonInput | ConvertFrom-Json

    # Read display mode from file (fallback to env var, fallback to "full")
    $mode = "full"
    $modeFile = Join-Path $PSScriptRoot "statusline-mode"
    if (Test-Path $modeFile) {
        $mode = (Get-Content $modeFile -Raw).Trim().ToLower()
    }
    if ($env:KURORYUU_STATUSLINE_MODE) {
        $mode = $env:KURORYUU_STATUSLINE_MODE.ToLower()
    }

    # Model name
    $model = if ($data.model.display_name) { $data.model.display_name } else { "Claude" }

    # Context values
    $ctx = $data.context_window
    $contextWindow = if ($ctx.context_window_size) { [int64]$ctx.context_window_size } else { 200000 }
    $totalUsed = [int64]$ctx.total_input_tokens + [int64]$ctx.total_output_tokens
    # Use API's percentage (includes system prompt, tools, etc.)
    $percent = if ($ctx.used_percentage) { $ctx.used_percentage } else { [math]::Round(($totalUsed / $contextWindow) * 100, 1) }

    # Derive total from percentage (input+output doesn't include overhead)
    $totalUsed = [math]::Round(($percent / 100) * $contextWindow)

    # Format tokens first (needed for bar text)
    $usedStr = if ($totalUsed -ge 1000) { "{0:N0}K" -f ($totalUsed / 1000) } else { "$totalUsed" }
    $maxStr = if ($contextWindow -ge 1000) { "{0:N0}K" -f ($contextWindow / 1000) } else { "$contextWindow" }

    # ANSI color codes
    $esc = [char]27
    $bgOrange = "$esc[48;5;208m"  # Claude orange background
    $bgGray = "$esc[48;5;238m"    # Dark gray background
    $fgBlack = "$esc[38;5;0m"     # Pure black text (on orange)
    $fgLight = "$esc[38;5;250m"   # Light gray text (on dark gray for contrast)
    $reset = "$esc[0m"

    # Progress bar with embedded stats text
    $statsText = " $percent% $usedStr/$maxStr "
    $barWidth = [math]::Max($statsText.Length, 18)  # Minimum width or text length

    # Pad text to fill bar width (center it)
    $totalPad = $barWidth - $statsText.Length
    $leftPad = [math]::Floor($totalPad / 2)
    $rightPad = $totalPad - $leftPad
    $fullBarText = (" " * $leftPad) + $statsText + (" " * $rightPad)

    # Calculate split point based on percentage
    $filledWidth = [math]::Max(0, [math]::Min($barWidth, [math]::Floor(($percent / 100) * $barWidth)))

    # Split text into filled and empty portions
    $filledPart = $fullBarText.Substring(0, $filledWidth)
    $emptyPart = $fullBarText.Substring($filledWidth)

    # Build bar with background colors (black on orange, light on gray for contrast)
    $bar = "$bgOrange$fgBlack$filledPart$reset$bgGray$fgLight$emptyPart$reset"

    # Kuroryuu integration - extract role and session ID
    # Priority: KURORYUU_SESSION_ID (PTY context) > $data.session_id (Claude Code) > KURORYUU_AGENT_ID (legacy)
    $role = ""
    $sessionIdFull = ""
    if ($env:KURORYUU_AGENT_ROLE) {
        $role = $env:KURORYUU_AGENT_ROLE.ToUpper()
    }
    # 1. PTY context: KURORYUU_SESSION_ID (only set by Desktop PTY spawner)
    if ($env:KURORYUU_SESSION_ID) {
        $parts = $env:KURORYUU_SESSION_ID -split '_'
        $sessionIdFull = $parts[-1]
    }
    # 2. Claude Code native session_id from JSON (matches observability)
    if (-not $sessionIdFull -and $data.session_id) {
        $sessionIdFull = $data.session_id.Substring(0, [math]::Min(8, $data.session_id.Length))
    }
    # 3. Legacy fallback: KURORYUU_AGENT_ID
    if (-not $sessionIdFull -and $env:KURORYUU_AGENT_ID) {
        $parts = $env:KURORYUU_AGENT_ID -split '_'
        $sessionIdFull = $parts[-1]
    }

    # Output based on mode
    switch ($mode) {
        "minimal" {
            # Bar only
            Write-Output $bar
        }
        "compact" {
            # Full session ID + bar
            if ($sessionIdFull) {
                Write-Output "$sessionIdFull $bar"
            } else {
                Write-Output $bar
            }
        }
        default {
            # full mode: Model + Role + Full ID + bar
            $prefix = $model
            if ($role) {
                $prefix += " $role"
            }
            if ($sessionIdFull) {
                $prefix += " $sessionIdFull"
            }
            Write-Output "$prefix $bar"
        }
    }

} catch {
    Write-Output "status err: $_"
}
