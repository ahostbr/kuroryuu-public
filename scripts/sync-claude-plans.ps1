# sync-claude-plans.ps1
# Copies all Claude Code plans from global ~/.claude/plans to project Docs/Plans/
#
# Usage: .\scripts\sync-claude-plans.ps1
# Or with custom source: .\scripts\sync-claude-plans.ps1 -SourceDir "C:\custom\path"

param(
    [string]$SourceDir = "$env:USERPROFILE\.claude\plans",
    [string]$DestDir = "$PSScriptRoot\..\Docs\Plans",
    [switch]$DryRun,
    [switch]$Verbose
)

# Resolve paths
$SourceDir = Resolve-Path $SourceDir -ErrorAction SilentlyContinue
$DestDir = Join-Path (Resolve-Path "$PSScriptRoot\..") "Docs\Plans"

if (-not $SourceDir) {
    Write-Host "Source directory not found: $env:USERPROFILE\.claude\plans" -ForegroundColor Red
    exit 1
}

# Ensure destination exists
if (-not (Test-Path $DestDir)) {
    if ($DryRun) {
        Write-Host "[DRY RUN] Would create: $DestDir" -ForegroundColor Yellow
    } else {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
        Write-Host "Created: $DestDir" -ForegroundColor Green
    }
}

# Get all markdown files from source
$plans = Get-ChildItem -Path $SourceDir -Filter "*.md" -ErrorAction SilentlyContinue

if (-not $plans -or $plans.Count -eq 0) {
    Write-Host "No plan files found in: $SourceDir" -ForegroundColor Yellow
    exit 0
}

Write-Host "`nSyncing Claude plans..." -ForegroundColor Cyan
Write-Host "  Source: $SourceDir" -ForegroundColor Gray
Write-Host "  Dest:   $DestDir" -ForegroundColor Gray
Write-Host ""

$copied = 0
$skipped = 0

foreach ($plan in $plans) {
    $destPath = Join-Path $DestDir $plan.Name

    # Check if file already exists and is identical
    $shouldCopy = $true
    if (Test-Path $destPath) {
        $sourceHash = Get-FileHash $plan.FullName -Algorithm MD5
        $destHash = Get-FileHash $destPath -Algorithm MD5
        if ($sourceHash.Hash -eq $destHash.Hash) {
            $shouldCopy = $false
            $skipped++
            if ($Verbose) {
                Write-Host "  [SKIP] $($plan.Name) (unchanged)" -ForegroundColor Gray
            }
        }
    }

    if ($shouldCopy) {
        if ($DryRun) {
            Write-Host "  [DRY RUN] Would copy: $($plan.Name)" -ForegroundColor Yellow
        } else {
            Copy-Item -Path $plan.FullName -Destination $destPath -Force
            Write-Host "  [COPY] $($plan.Name)" -ForegroundColor Green
        }
        $copied++
    }
}

Write-Host ""
Write-Host "Done! Copied: $copied, Skipped: $skipped" -ForegroundColor Cyan
