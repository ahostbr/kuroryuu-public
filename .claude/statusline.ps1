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
    # Shorten "Claude Opus 4.6 (1M context)" → "Opus 4.6-1M"
    $model = $model -replace '^Claude\s+', ''
    $model = $model -replace '\s*\((\d+[KM])\s+context\)', '-$1'

    # Context values
    $ctx = $data.context_window
    # Opus 4.5/4.6 and Sonnet 4.6 run with 1M context in Claude Code (beta always enabled)
    # API may report 200K base window, but actual usable context is 1M
    if ($model -match '4\.[56]') {
        $contextWindow = 1000000
    } elseif ($ctx.context_window_size) {
        $contextWindow = [int64]$ctx.context_window_size
    } else {
        $contextWindow = 200000
    }
    # Derive real token usage: API percentage is based on API's own window (may be 200K)
    # We need to get actual tokens, then recalculate percentage against our (possibly 1M) window
    $apiWindow = if ($ctx.context_window_size) { [int64]$ctx.context_window_size } else { 200000 }
    if ($ctx.used_percentage) {
        # Get real token count from API's percentage × API's window
        $totalUsed = [math]::Round(($ctx.used_percentage / 100) * $apiWindow)
    } else {
        $totalUsed = [int64]$ctx.total_input_tokens + [int64]$ctx.total_output_tokens
    }
    # Recalculate percentage against our context window (1M for 4.5/4.6)
    $percent = [math]::Round(($totalUsed / $contextWindow) * 100, 1)

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

    # Rate limits (color-coded thresholds)
    $rateStr = ""
    if ($data.rate_limits) {
        $windows = @()
        $rl = $data.rate_limits
        if ($rl.five_hour -and $rl.five_hour.used_percentage -ne $null) {
            $pct = [math]::Round($rl.five_hour.used_percentage)
            $rateColor = if ($pct -ge 80) { "$esc[38;5;196m" } elseif ($pct -ge 50) { "$esc[38;5;220m" } else { "$esc[38;5;114m" }
            $windows += "${rateColor}5h:${pct}%${reset}"
        }
        if ($rl.seven_day -and $rl.seven_day.used_percentage -ne $null) {
            $pct = [math]::Round($rl.seven_day.used_percentage)
            $rateColor = if ($pct -ge 80) { "$esc[38;5;196m" } elseif ($pct -ge 50) { "$esc[38;5;220m" } else { "$esc[38;5;114m" }
            $windows += "${rateColor}7d:${pct}%${reset}"
        }
        if ($windows.Count -gt 0) {
            $rateStr = " " + ($windows -join " ")
        }
    }

    # Output based on mode
    switch ($mode) {
        "minimal" {
            Write-Output "$bar$rateStr"
        }
        "compact" {
            if ($sessionIdFull) {
                Write-Output "$sessionIdFull $bar$rateStr"
            } else {
                Write-Output "$bar$rateStr"
            }
        }
        default {
            # full mode: Model + Role + Full ID + bar + rate limits
            $prefix = $model
            if ($role) {
                $prefix += " $role"
            }
            if ($sessionIdFull) {
                $prefix += " $sessionIdFull"
            }
            Write-Output "$prefix $bar$rateStr"
        }
    }

} catch {
    Write-Output "status err: $_"
}
