# Kuroryuu Transcript Backport Script
# Imports all existing Claude conversations into the inbox format
# COPIES ONLY - does not delete originals

param(
    [string]$ClaudeDir = "$env:USERPROFILE\.claude",
    [string]$ExportDir = ""  # Will be set below if empty
)

# Get project root from script location (.claude/plugins/kuro/scripts/ -> go up 4 levels)
$projectRoot = (Resolve-Path "$PSScriptRoot\..\..\..\..").Path

# Set default ExportDir if not provided
if (-not $ExportDir) {
    $ExportDir = Join-Path $projectRoot "ai\exports"
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "[$timestamp] Starting transcript backport..." -ForegroundColor Cyan
Write-Host "Source: $ClaudeDir\projects" -ForegroundColor Gray
Write-Host "Destination: $ExportDir" -ForegroundColor Gray
Write-Host ""

# Ensure export dir exists
if (-not (Test-Path $ExportDir)) {
    New-Item -ItemType Directory -Path $ExportDir -Force | Out-Null
}

# Load or create index
$indexFile = Join-Path $ExportDir "index.json"
$index = @{ sessions = @(); lastUpdated = "" }
if (Test-Path $indexFile) {
    try {
        $index = Get-Content $indexFile -Raw | ConvertFrom-Json
        if (-not $index.sessions) {
            $index = @{ sessions = @(); lastUpdated = "" }
        }
    } catch {
        $index = @{ sessions = @(); lastUpdated = "" }
    }
}

# Track existing session IDs to avoid duplicates
$existingIds = @{}
foreach ($s in $index.sessions) {
    $existingIds[$s.id] = $true
}

# Find all project directories
$projectsDir = Join-Path $ClaudeDir "projects"
if (-not (Test-Path $projectsDir)) {
    Write-Host "No projects directory found at $projectsDir" -ForegroundColor Red
    exit 1
}

$projectFolders = Get-ChildItem $projectsDir -Directory
Write-Host "Found $($projectFolders.Count) project folders" -ForegroundColor Yellow
Write-Host ""

$imported = 0
$skipped = 0
$errors = 0

foreach ($project in $projectFolders) {
    Write-Host "Processing: $($project.Name)" -ForegroundColor Cyan

    # Find all .jsonl files (not in subagents)
    $transcripts = Get-ChildItem $project.FullName -Filter "*.jsonl" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Directory.Name -ne "subagents" -and $_.Length -gt 0 }

    foreach ($transcript in $transcripts) {
        try {
            # Read first 100 lines to extract metadata
            $lines = Get-Content $transcript.FullName -First 100 -ErrorAction Stop

            # Get latest summary
            $summaryLines = $lines | Where-Object { $_ -match '"type":"summary"' }
            $latestSummary = $summaryLines | Select-Object -Last 1

            # Get first user message
            $firstUserMsg = $lines | Where-Object { $_ -match '"type":"user"' } | Select-Object -First 1

            if (-not $firstUserMsg) {
                Write-Host "  Skip (no user message): $($transcript.Name)" -ForegroundColor DarkGray
                $skipped++
                continue
            }

            $msgData = $firstUserMsg | ConvertFrom-Json

            # Extract metadata
            $sessionId = $msgData.sessionId
            $shortId = $sessionId.Substring(0, 8)

            # Skip if already in index
            if ($existingIds[$shortId]) {
                Write-Host "  Skip (already indexed): $shortId" -ForegroundColor DarkGray
                $skipped++
                continue
            }

            $sessionTimestamp = [DateTime]::Parse($msgData.timestamp)
            $dateFolder = $sessionTimestamp.ToString("yyyy-MM-dd")

            # Get session description
            $sessionDesc = ""
            if ($latestSummary) {
                try {
                    $summaryData = $latestSummary | ConvertFrom-Json
                    $sessionDesc = $summaryData.summary
                } catch {}
            }
            if (-not $sessionDesc) {
                $sessionDesc = $msgData.message.content
                if ($sessionDesc.Length -gt 200) {
                    $sessionDesc = $sessionDesc.Substring(0, 200) + "..."
                }
            }
            $sessionDesc = $sessionDesc -replace "`r`n", " " -replace "`n", " " -replace '"', "'"

            # Create filename-safe summary
            $safeDesc = $sessionDesc -replace '[^\w\s-]', '' -replace '\s+', '-'
            if ($safeDesc.Length -gt 50) {
                $safeDesc = $safeDesc.Substring(0, 50)
            }
            $safeDesc = $safeDesc.Trim('-')
            if (-not $safeDesc) { $safeDesc = "session" }

            $baseFilename = "${dateFolder}_${safeDesc}_${shortId}"

            # Create date folder
            $datePath = Join-Path $ExportDir $dateFolder
            if (-not (Test-Path $datePath)) {
                New-Item -ItemType Directory -Path $datePath -Force | Out-Null
            }

            # Copy transcript
            $sessionFile = Join-Path $datePath "$baseFilename.jsonl"
            Copy-Item -Path $transcript.FullName -Destination $sessionFile -Force

            # Get line count
            $lineCount = (Get-Content $transcript.FullName | Measure-Object -Line).Lines

            # Write metadata
            $metaFile = Join-Path $datePath "$baseFilename.meta.json"
            $metaContent = @{
                sessionId = $sessionId
                shortId = $shortId
                startTime = $msgData.timestamp
                summary = $sessionDesc
                cwd = $msgData.cwd
                gitBranch = $msgData.gitBranch
                project = $project.Name
                originalFile = $transcript.FullName
                lastUpdate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
                sizeBytes = $transcript.Length
                messageCount = $lineCount
            }
            $metaContent | ConvertTo-Json -Depth 3 | Set-Content $metaFile -Encoding UTF8

            # Add to index
            $sessionEntry = @{
                id = $shortId
                fullId = $sessionId
                date = $dateFolder
                startTime = $sessionTimestamp.ToString("HH:mm:ss")
                lastUpdate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
                summary = $sessionDesc
                project = $project.Name
                sizeBytes = $transcript.Length
                messageCount = $lineCount
                path = "$dateFolder/$baseFilename.jsonl"
            }
            $index.sessions += $sessionEntry
            $existingIds[$shortId] = $true

            $sizeKB = [math]::Round($transcript.Length / 1024, 1)
            Write-Host "  + $baseFilename ($sizeKB KB, $lineCount msgs)" -ForegroundColor Green
            $imported++

        } catch {
            Write-Host "  ERROR: $($transcript.Name) - $($_.Exception.Message)" -ForegroundColor Red
            $errors++
        }
    }
}

# Sort sessions by date descending
$sortedSessions = $index.sessions | Sort-Object { $_.lastUpdate } -Descending

# Save index
$newIndex = @{
    sessions = @($sortedSessions)
    lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
}
$newIndex | ConvertTo-Json -Depth 4 | Set-Content $indexFile -Encoding UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backport complete!" -ForegroundColor Green
Write-Host "  Imported: $imported" -ForegroundColor Green
Write-Host "  Skipped:  $skipped" -ForegroundColor Yellow
Write-Host "  Errors:   $errors" -ForegroundColor $(if ($errors -gt 0) { "Red" } else { "Gray" })
Write-Host "  Total in index: $($newIndex.sessions.Count)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
