# Kuroryuu Transcript Reindex Script
# Re-processes all transcript files to extract clean summaries
# Run once to fix existing index.json with junk summaries

param(
    [switch]$DryRun = $false
)

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host "=== Kuroryuu Transcript Reindex ===" -ForegroundColor Cyan
Write-Host "Started: $timestamp"
if ($DryRun) {
    Write-Host "[DRY RUN] No changes will be made" -ForegroundColor Yellow
}

# Get project root (4 levels up from scripts folder)
# scripts -> kuro -> plugins -> .claude -> project root
$projectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
$exportDir = Join-Path $projectRoot "ai\exports"

Write-Host "Project root: $projectRoot"
Write-Host "Exports dir: $exportDir"

if (-not (Test-Path $exportDir)) {
    Write-Host "ERROR: Exports directory not found" -ForegroundColor Red
    exit 1
}

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

# Find all dated folders
$dateFolders = Get-ChildItem $exportDir -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' }
Write-Host "Found $($dateFolders.Count) date folders"

$sessions = [System.Collections.ArrayList]@()
$processed = 0
$errors = 0

foreach ($folder in $dateFolders) {
    $jsonlFiles = Get-ChildItem $folder.FullName -Filter "*.jsonl" -File

    foreach ($file in $jsonlFiles) {
        $processed++
        Write-Host "[$processed] Processing: $($file.Name)" -NoNewline

        try {
            # Read first 200 lines
            $lines = Get-Content $file.FullName -First 200

            # Find first REAL user message
            $realUserMsg = $lines | Where-Object {
                $_ -match '"type":"user"' -and
                $_ -notmatch '"isMeta"\s*:\s*true' -and
                $_ -notmatch '<local-command-caveat>' -and
                $_ -notmatch '<system-reminder>' -and
                $_ -notmatch '<command-name>' -and
                $_ -notmatch '"tool_result"' -and
                $_ -notmatch 'UserPromptSubmit hook'
            } | Select-Object -First 1

            # Get first user message for metadata
            $firstUserMsg = $lines | Where-Object { $_ -match '"type":"user"' } | Select-Object -First 1

            if (-not $firstUserMsg) {
                Write-Host " [SKIP - no user message]" -ForegroundColor Yellow
                continue
            }

            $msgData = $firstUserMsg | ConvertFrom-Json
            $sessionId = $msgData.sessionId
            $shortId = $sessionId.Substring(0, 8)
            $sessionTimestamp = [DateTime]::Parse($msgData.timestamp)
            $dateFolder = $sessionTimestamp.ToString("yyyy-MM-dd")

            # Extract clean summary with fallback chain
            $sessionDesc = ""

            # Try 1: Real user message
            if ($realUserMsg) {
                $sessionDesc = Get-CleanSummary -Line $realUserMsg
            }

            # Try 2: Summary entry
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

            # Try 3: First assistant response
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

            # Try 4: Any first user message cleaned
            if (-not $sessionDesc) {
                $sessionDesc = Get-CleanSummary -Line $firstUserMsg
            }

            # Final fallback
            if (-not $sessionDesc) {
                $sessionDesc = "Session $shortId"
            }

            # Clean for JSON
            $sessionDesc = $sessionDesc -replace "`r`n", " " -replace "`n", " " -replace '"', "'"

            # Get file stats
            $lineCount = (Get-Content $file.FullName | Measure-Object -Line).Lines

            # Build relative path
            $relativePath = "$($folder.Name)/$($file.Name)"

            $sessionEntry = @{
                id = $shortId
                fullId = $sessionId
                date = $dateFolder
                startTime = $sessionTimestamp.ToString("HH:mm:ss")
                lastUpdate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
                summary = $sessionDesc
                sizeBytes = $file.Length
                messageCount = $lineCount
                path = $relativePath
            }

            $sessions.Add($sessionEntry) | Out-Null

            # Show preview of summary
            $preview = if ($sessionDesc.Length -gt 50) { $sessionDesc.Substring(0, 50) + "..." } else { $sessionDesc }
            Write-Host " -> $preview" -ForegroundColor Green

        } catch {
            $errors++
            Write-Host " [ERROR: $($_.Exception.Message)]" -ForegroundColor Red
        }
    }
}

# Sort by date descending, then by startTime descending
$sortedSessions = $sessions | Sort-Object @{Expression={$_.date}; Descending=$true}, @{Expression={$_.startTime}; Descending=$true}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Processed: $processed files"
Write-Host "Sessions: $($sortedSessions.Count)"
Write-Host "Errors: $errors"

if (-not $DryRun) {
    # Write new index.json
    $indexFile = Join-Path $exportDir "index.json"
    $newIndex = @{
        sessions = @($sortedSessions)
        lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }

    # Use UTF8 without BOM
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    $jsonContent = $newIndex | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText($indexFile, $jsonContent, $utf8NoBom)

    Write-Host ""
    Write-Host "Written: $indexFile" -ForegroundColor Green
    Write-Host "Done!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[DRY RUN] Would write $($sortedSessions.Count) sessions to index.json" -ForegroundColor Yellow
}
