# Kuroryuu Transcript Inbox Router
# Runs on UserPromptSubmit to organize transcripts into dated folders
# Creates: {date}/{shortId}.jsonl, {date}/{shortId}.meta.json, index.json

param()

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

try {
    # Get project root (current working directory)
    # Resolve project root: env var (for global plugin) or current directory (for project plugin)
    $projectRoot = if ($env:KURORYUU_PROJECT_ROOT) { $env:KURORYUU_PROJECT_ROOT } else { (Get-Location).Path }

    # Setup logging
    $logFile = Join-Path $projectRoot "ai\hooks\export_debug.log"
    Add-Content -Path $logFile -Value "`n[$timestamp] Inbox router fired"

    # Convert project path to Claude projects format
    # Example: C:\Projects\Kuroryuu -> C--Projects-Kuroryuu
    $projectPath = $projectRoot -replace ':\\', '--' -replace '\\', '-'

    # Find Claude projects directory
    $claudeProjectsDir = Join-Path $env:USERPROFILE ".claude\projects\$projectPath"

    if (-not (Test-Path $claudeProjectsDir)) {
        Add-Content -Path $logFile -Value "[$timestamp] Projects directory not found"
        exit 0
    }

    # Find most recent transcript file (not in subagents folder)
    $transcriptFile = Get-ChildItem $claudeProjectsDir -Filter "*.jsonl" -File |
        Where-Object { $_.Directory.Name -ne "subagents" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $transcriptFile) {
        Add-Content -Path $logFile -Value "[$timestamp] No transcript file found"
        exit 0
    }

    # Create exports directory
    $exportDir = Join-Path $projectRoot "ai\exports"
    if (-not (Test-Path $exportDir)) {
        New-Item -ItemType Directory -Path $exportDir -Force | Out-Null
    }

    # --- INBOX ROUTER LOGIC ---

    # Read first 200 lines to find metadata (more lines for better summary search)
    $lines = Get-Content $transcriptFile.FullName -First 200

    # Helper: Extract clean summary from a user message line
    function Get-CleanSummary {
        param([string]$Line)
        try {
            $msg = $Line | ConvertFrom-Json
            $content = $msg.message.content

            # Handle array content (tool results, etc.)
            if ($content -is [array]) {
                $textBlock = $content | Where-Object { $_.type -eq 'text' } | Select-Object -First 1
                if ($textBlock) {
                    $content = $textBlock.text
                } else {
                    return $null
                }
            }

            # Skip if not a string
            if ($content -isnot [string]) { return $null }

            # Strip XML/HTML tags
            $clean = $content -replace '<[^>]+>', ''
            $clean = $clean.Trim()

            # Skip if too short after cleaning
            if ($clean.Length -lt 10) { return $null }

            # Truncate to 200 chars
            if ($clean.Length -gt 200) {
                $clean = $clean.Substring(0, 200) + "..."
            }

            return $clean
        } catch {
            return $null
        }
    }

    # Find first REAL user message (skip meta and system-injected content)
    $realUserMsg = $lines | Where-Object {
        $_ -match '"type":"user"' -and
        $_ -notmatch '"isMeta"\s*:\s*true' -and
        $_ -notmatch '<local-command-caveat>' -and
        $_ -notmatch '<system-reminder>' -and
        $_ -notmatch '<command-name>' -and
        $_ -notmatch '"tool_result"' -and
        $_ -notmatch 'UserPromptSubmit hook'
    } | Select-Object -First 1

    # Get first user message for session metadata (sessionId, timestamp, etc.)
    $firstUserMsg = $lines | Where-Object { $_ -match '"type":"user"' } | Select-Object -First 1

    if ($firstUserMsg) {
        try {
            $msgData = $firstUserMsg | ConvertFrom-Json

            # Extract metadata
            $sessionId = $msgData.sessionId
            $shortId = $sessionId.Substring(0, 8)
            $sessionTimestamp = [DateTime]::Parse($msgData.timestamp)
            $dateFolder = $sessionTimestamp.ToString("yyyy-MM-dd")

            # Get session description from REAL user message
            $sessionDesc = ""

            # Try 1: Real user message (best source)
            if ($realUserMsg) {
                $sessionDesc = Get-CleanSummary -Line $realUserMsg
            }

            # Try 2: Look for summary entry
            if (-not $sessionDesc) {
                $summaryLine = $lines | Where-Object { $_ -match '"type":"summary"' } | Select-Object -Last 1
                if ($summaryLine) {
                    try {
                        $summaryData = $summaryLine | ConvertFrom-Json
                        if ($summaryData.summary -and $summaryData.summary -notmatch '<') {
                            $sessionDesc = $summaryData.summary
                        }
                    } catch { }
                }
            }

            # Try 3: First assistant text response
            if (-not $sessionDesc) {
                $assistantMsg = $lines | Where-Object { $_ -match '"type":"assistant"' } | Select-Object -First 1
                if ($assistantMsg) {
                    try {
                        $aData = $assistantMsg | ConvertFrom-Json
                        $textBlock = $aData.message.content | Where-Object { $_.type -eq 'text' } | Select-Object -First 1
                        if ($textBlock -and $textBlock.text) {
                            $sessionDesc = $textBlock.text -replace '<[^>]+>', ''
                            if ($sessionDesc.Length -gt 200) {
                                $sessionDesc = $sessionDesc.Substring(0, 200) + "..."
                            }
                        }
                    } catch { }
                }
            }

            # Try 4: Fall back to any first user message (cleaned)
            if (-not $sessionDesc) {
                $sessionDesc = Get-CleanSummary -Line $firstUserMsg
            }

            # Final fallback: session ID
            if (-not $sessionDesc) {
                $sessionDesc = "Session $shortId"
            }

            # Clean up for JSON (escape newlines, etc.)
            $sessionDesc = $sessionDesc -replace "`r`n", " " -replace "`n", " " -replace '"', "'"

            # Create filename-safe version of summary
            # Replace spaces with hyphens, remove invalid chars, truncate to 50 chars
            $safeDesc = $sessionDesc -replace '[^\w\s-]', '' -replace '\s+', '-'
            if ($safeDesc.Length -gt 50) {
                $safeDesc = $safeDesc.Substring(0, 50)
            }
            $safeDesc = $safeDesc.Trim('-')

            # Build filename: date_summary_shortId
            $baseFilename = "${dateFolder}_${safeDesc}_${shortId}"

            # Create date folder
            $datePath = Join-Path $exportDir $dateFolder
            if (-not (Test-Path $datePath)) {
                New-Item -ItemType Directory -Path $datePath -Force | Out-Null
                Add-Content -Path $logFile -Value "[$timestamp] Created folder: $dateFolder"
            }

            # Copy transcript to dated folder with descriptive name
            $sessionFile = Join-Path $datePath "$baseFilename.jsonl"
            Copy-Item -Path $transcriptFile.FullName -Destination $sessionFile -Force

            # Get line count for message count
            $lineCount = (Get-Content $transcriptFile.FullName | Measure-Object -Line).Lines

            # Write metadata file
            $metaFile = Join-Path $datePath "$baseFilename.meta.json"
            $metaContent = @{
                sessionId = $sessionId
                shortId = $shortId
                startTime = $msgData.timestamp
                summary = $sessionDesc
                cwd = $msgData.cwd
                gitBranch = $msgData.gitBranch
                lastUpdate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
                sizeBytes = $transcriptFile.Length
                messageCount = $lineCount
            }
            $metaContent | ConvertTo-Json -Depth 3 | Set-Content $metaFile -Encoding UTF8

            # Update index.json
            $indexFile = Join-Path $exportDir "index.json"
            $index = @{ sessions = @(); lastUpdated = "" }

            if (Test-Path $indexFile) {
                try {
                    $index = Get-Content $indexFile -Raw | ConvertFrom-Json
                    # Convert to hashtable for easier manipulation
                    if (-not $index.sessions) {
                        $index = @{ sessions = @(); lastUpdated = "" }
                    }
                } catch {
                    $index = @{ sessions = @(); lastUpdated = "" }
                }
            }

            # Find or create session entry
            $sessionEntry = @{
                id = $shortId
                fullId = $sessionId
                date = $dateFolder
                startTime = $sessionTimestamp.ToString("HH:mm:ss")
                lastUpdate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
                summary = $sessionDesc
                sizeBytes = $transcriptFile.Length
                messageCount = $lineCount
                path = "$dateFolder/$baseFilename.jsonl"
            }

            # Update or add session in index
            $sessions = [System.Collections.ArrayList]@()
            $found = $false
            foreach ($s in $index.sessions) {
                if ($s.id -eq $shortId) {
                    $sessions.Add($sessionEntry) | Out-Null
                    $found = $true
                } else {
                    $sessions.Add($s) | Out-Null
                }
            }
            if (-not $found) {
                $sessions.Add($sessionEntry) | Out-Null
            }

            # Sort by lastUpdate descending
            $sortedSessions = $sessions | Sort-Object { $_.lastUpdate } -Descending

            $newIndex = @{
                sessions = @($sortedSessions)
                lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            }
            $newIndex | ConvertTo-Json -Depth 4 | Set-Content $indexFile -Encoding UTF8

            Add-Content -Path $logFile -Value "[$timestamp] Indexed: $dateFolder/$shortId.jsonl ($lineCount msgs, $($transcriptFile.Length) bytes)"

        } catch {
            Add-Content -Path $logFile -Value "[$timestamp] Metadata parse error: $($_.Exception.Message)"
        }
    }

    # --- BACKWARDS COMPAT: Keep transcript_current.jsonl ---
    $exportFile = Join-Path $exportDir "transcript_current.jsonl"
    Copy-Item -Path $transcriptFile.FullName -Destination $exportFile -Force

    Add-Content -Path $logFile -Value "[$timestamp] SUCCESS: Router complete"

    # Output for Claude Code (prevents "no output" error)
    Write-Output "[OK] Transcript backed up"

} catch {
    # Log error but don't fail - hooks should be silent
    try {
        $logFile = Join-Path (Get-Location).Path "ai\hooks\export_debug.log"
        Add-Content -Path $logFile -Value "[$timestamp] ERROR: $($_.Exception.Message)"
    } catch {
        # Fail completely silently if even logging fails
    }
    exit 0
}
