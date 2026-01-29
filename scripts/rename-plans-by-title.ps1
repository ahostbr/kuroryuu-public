# rename-plans-by-title.ps1
# Extracts titles from Claude Code plan files and renames them accordingly
#
# Usage:
#   .\scripts\rename-plans-by-title.ps1                    # Dry run
#   .\scripts\rename-plans-by-title.ps1 -Execute           # Actually rename
#   .\scripts\rename-plans-by-title.ps1 -Execute -Verbose  # Verbose output

param(
    [string]$PlansDir = "$PSScriptRoot\..\Docs\Plans",
    [switch]$Execute,
    [switch]$Verbose,
    [int]$MaxTitleLength = 80
)

# Resolve path
$PlansDir = Resolve-Path $PlansDir -ErrorAction Stop

# Get all markdown files
$plans = Get-ChildItem -Path $PlansDir -Filter "*.md" -File

if (-not $plans -or $plans.Count -eq 0) {
    Write-Host "No plan files found in: $PlansDir" -ForegroundColor Yellow
    exit 0
}

# Function to extract first H1 title from markdown
function Get-PlanTitle {
    param([string]$FilePath)

    $content = Get-Content $FilePath -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return $null }

    # Match first H1 heading (# Title)
    if ($content -match '(?m)^#\s+(.+?)(?:\r?\n|$)') {
        return $matches[1].Trim()
    }

    return $null
}

# Function to sanitize filename
function Convert-ToSafeFilename {
    param(
        [string]$Title,
        [int]$MaxLength = 80
    )

    # Remove markdown formatting
    $safe = $Title -replace '\*\*', ''  # Bold
    $safe = $safe -replace '\*', ''     # Italic
    $safe = $safe -replace '`', ''      # Code
    $safe = $safe -replace '#', ''      # Headers

    # Replace invalid characters with dash
    $safe = $safe -replace '[\\/:*?"<>|]', '-'

    # Replace spaces with dash
    $safe = $safe -replace '\s+', '-'

    # Remove multiple consecutive dashes
    $safe = $safe -replace '-+', '-'

    # Trim dashes from start and end
    $safe = $safe.Trim('-')

    # Truncate if too long
    if ($safe.Length -gt $MaxLength) {
        $safe = $safe.Substring(0, $MaxLength).TrimEnd('-')
    }

    # Ensure not empty
    if ([string]::IsNullOrWhiteSpace($safe)) {
        $safe = "untitled"
    }

    return $safe
}

Write-Host "`nAnalyzing plan files..." -ForegroundColor Cyan
Write-Host "Directory: $PlansDir" -ForegroundColor Gray
Write-Host "Mode: $(if ($Execute) { 'EXECUTE (will rename files)' } else { 'DRY RUN (no changes)' })" -ForegroundColor $(if ($Execute) { 'Yellow' } else { 'Green' })
Write-Host ""

$renamed = 0
$skipped = 0
$errors = 0
$nameCollisions = @{}

# First pass: collect all target names to detect collisions
$renamePlan = @()

foreach ($plan in $plans) {
    $title = Get-PlanTitle -FilePath $plan.FullName

    if (-not $title) {
        Write-Host "  [SKIP] $($plan.Name) - No title found" -ForegroundColor Gray
        $skipped++
        continue
    }

    $newName = (Convert-ToSafeFilename -Title $title -MaxLength $MaxTitleLength) + ".md"

    # Check if already has correct name
    if ($plan.Name -eq $newName) {
        if ($Verbose) {
            Write-Host "  [SKIP] $($plan.Name) - Already correctly named" -ForegroundColor Gray
        }
        $skipped++
        continue
    }

    # Track for collision detection
    if (-not $nameCollisions.ContainsKey($newName)) {
        $nameCollisions[$newName] = @()
    }
    $nameCollisions[$newName] += @{
        Original = $plan
        Title = $title
        NewName = $newName
    }

    $renamePlan += @{
        Original = $plan
        Title = $title
        NewName = $newName
    }
}

# Second pass: handle collisions and rename
foreach ($item in $renamePlan) {
    $plan = $item.Original
    $title = $item.Title
    $newName = $item.NewName

    # Handle collision
    if ($nameCollisions[$newName].Count -gt 1) {
        # Find index of this file in collision list
        $index = 0
        for ($i = 0; $i -lt $nameCollisions[$newName].Count; $i++) {
            if ($nameCollisions[$newName][$i].Original.FullName -eq $plan.FullName) {
                $index = $i
                break
            }
        }

        # Add suffix to all but first
        if ($index -gt 0) {
            $baseName = [System.IO.Path]::GetFileNameWithoutExtension($newName)
            $newName = "$baseName-$($index + 1).md"
        }
    }

    $newPath = Join-Path $PlansDir $newName

    # Check if target already exists (shouldn't happen with collision detection)
    if ((Test-Path $newPath) -and ($newPath -ne $plan.FullName)) {
        Write-Host "  [ERROR] $($plan.Name) -> $newName - Target already exists!" -ForegroundColor Red
        $errors++
        continue
    }

    # Display the rename operation
    $truncatedTitle = if ($title.Length -gt 60) { $title.Substring(0, 57) + "..." } else { $title }

    if ($Execute) {
        try {
            Rename-Item -Path $plan.FullName -NewName $newName -ErrorAction Stop
            Write-Host "  [RENAME] $($plan.Name)" -ForegroundColor Green
            Write-Host "        -> $newName" -ForegroundColor Cyan
            if ($Verbose) {
                Write-Host "           Title: $truncatedTitle" -ForegroundColor Gray
            }
            $renamed++
        }
        catch {
            Write-Host "  [ERROR] $($plan.Name) -> $newName" -ForegroundColor Red
            Write-Host "          $($_.Exception.Message)" -ForegroundColor Red
            $errors++
        }
    }
    else {
        Write-Host "  [WOULD RENAME] $($plan.Name)" -ForegroundColor Yellow
        Write-Host "              -> $newName" -ForegroundColor Cyan
        if ($Verbose) {
            Write-Host "                 Title: $truncatedTitle" -ForegroundColor Gray
        }
        $renamed++
    }
}

Write-Host ""
if ($Execute) {
    Write-Host "Done! Renamed: $renamed, Skipped: $skipped, Errors: $errors" -ForegroundColor Cyan
}
else {
    Write-Host "Dry run complete! Would rename: $renamed, Skip: $skipped, Errors: $errors" -ForegroundColor Green
    Write-Host ""
    Write-Host "Run with -Execute to actually rename files" -ForegroundColor Yellow
}

if ($errors -gt 0) {
    Write-Host ""
    Write-Host "⚠️  $errors errors occurred. Review output above." -ForegroundColor Red
    exit 1
}
