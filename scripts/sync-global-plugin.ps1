<#
.SYNOPSIS
    Sync Kuroryuu plugin to global ~/.claude/plugins/kuro-global/

.DESCRIPTION
    Copies the project's .claude/plugins/kuro/ to a global location so that
    Claude Code agent teammates (which run globally) get hooks, scripts, and commands.

    Called by:
    - setup-project.ps1 (first install, with -Force)
    - Desktop plugin-sync-service.ts (ongoing 60s poll)

.PARAMETER ProjectRoot
    Path to the Kuroryuu project root. Required.

.PARAMETER Force
    Force sync even if already up-to-date.

.EXAMPLE
    .\sync-global-plugin.ps1 -ProjectRoot "E:\SAS\CLONE\Kuroryuu-master" -Force
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectRoot,

    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Paths
$SourceDir = Join-Path $ProjectRoot ".claude\plugins\kuro"
$TargetDir = Join-Path $HOME ".claude\plugins\kuro-global"
$TimestampFile = Join-Path $TargetDir ".sync_timestamp"
$GlobalSettingsPath = Join-Path $HOME ".claude\settings.json"

# Validate source exists
if (-not (Test-Path $SourceDir)) {
    Write-Host "  ERROR: Source plugin not found at $SourceDir" -ForegroundColor Red
    exit 1
}

# Check if sync is needed
if (-not $Force -and (Test-Path $TimestampFile)) {
    $lastSync = Get-Content $TimestampFile -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($lastSync -and $lastSync.sourceHash) {
        # Compare source plugin.json version + newest file mtime
        $sourceManifest = Join-Path $SourceDir ".claude-plugin\plugin.json"
        if (Test-Path $sourceManifest) {
            $currentVersion = (Get-Content $sourceManifest -Raw | ConvertFrom-Json).version
            $newestFile = Get-ChildItem $SourceDir -Recurse -File |
                Where-Object { $_.FullName -notlike "*_skills-sh-data*" } |
                Sort-Object LastWriteTimeUtc -Descending |
                Select-Object -First 1
            $currentHash = "$currentVersion|$($newestFile.LastWriteTimeUtc.ToString('o'))"

            if ($currentHash -eq $lastSync.sourceHash) {
                # Already up-to-date
                exit 2
            }
        }
    }
}

# Perform sync
Write-Host "  Syncing plugin to $TargetDir..." -ForegroundColor White

# Clean target (fresh copy every time)
if (Test-Path $TargetDir) {
    Remove-Item -Recurse -Force $TargetDir
}
New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

# Copy source to target, excluding skills/_skills-sh-data/ (too large, not needed)
$excludeDirs = @("_skills-sh-data")
Get-ChildItem $SourceDir -Recurse |
    Where-Object {
        $relativePath = $_.FullName.Substring($SourceDir.Length + 1)
        # Exclude _skills-sh-data directory and its contents
        $excluded = $false
        foreach ($dir in $excludeDirs) {
            if ($relativePath -like "skills\$dir\*" -or $relativePath -like "skills\$dir") {
                $excluded = $true
                break
            }
        }
        # Also exclude the skills directory entirely (teammates get prompts via spawn)
        if ($relativePath -like "skills\*" -or $relativePath -eq "skills") {
            $excluded = $true
        }
        # Exclude hooks-global.json from target (we'll use it to replace hooks.json)
        if ($relativePath -eq "hooks\hooks-global.json") {
            $excluded = $true
        }
        -not $excluded
    } |
    ForEach-Object {
        $relativePath = $_.FullName.Substring($SourceDir.Length + 1)
        $targetPath = Join-Path $TargetDir $relativePath
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
        } else {
            $targetParent = Split-Path $targetPath -Parent
            if (-not (Test-Path $targetParent)) {
                New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
            }
            Copy-Item $_.FullName $targetPath -Force
        }
    }

# Override hooks.json with global version
$globalHooksSource = Join-Path $SourceDir "hooks\hooks-global.json"
$globalHooksTarget = Join-Path $TargetDir "hooks\hooks.json"
if (Test-Path $globalHooksSource) {
    Copy-Item $globalHooksSource $globalHooksTarget -Force
    Write-Host "  Applied global hooks template" -ForegroundColor DarkGray
}

# Update plugin.json name to kuro-global
$manifestTarget = Join-Path $TargetDir ".claude-plugin\plugin.json"
if (Test-Path $manifestTarget) {
    $manifest = Get-Content $manifestTarget -Raw | ConvertFrom-Json
    $manifest.name = "kuro-global"
    $manifest.description = "Kuroryuu global plugin (synced from project)"
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($manifestTarget, ($manifest | ConvertTo-Json -Depth 10), $utf8NoBom)
}

# Write sync timestamp marker
$sourceManifest = Join-Path $SourceDir ".claude-plugin\plugin.json"
$currentVersion = "unknown"
if (Test-Path $sourceManifest) {
    $currentVersion = (Get-Content $sourceManifest -Raw | ConvertFrom-Json).version
}
$newestFile = Get-ChildItem $SourceDir -Recurse -File |
    Where-Object { $_.FullName -notlike "*_skills-sh-data*" } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
$currentHash = "$currentVersion|$($newestFile.LastWriteTimeUtc.ToString('o'))"

$timestampData = @{
    syncedAt = (Get-Date).ToString('o')
    sourceHash = $currentHash
    sourceVersion = $currentVersion
    projectRoot = $ProjectRoot
} | ConvertTo-Json
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($TimestampFile, $timestampData, $utf8NoBom)

# Register in ~/.claude/settings.json
if (Test-Path $GlobalSettingsPath) {
    try {
        $settings = Get-Content $GlobalSettingsPath -Raw | ConvertFrom-Json
        if (-not $settings.enabledPlugins) {
            $settings | Add-Member -NotePropertyName "enabledPlugins" -NotePropertyValue @{} -Force
        }
        # Add kuro-global if not already registered
        if (-not $settings.enabledPlugins.'kuro-global') {
            $settings.enabledPlugins | Add-Member -NotePropertyName "kuro-global" -NotePropertyValue $true -Force
            $settingsJson = $settings | ConvertTo-Json -Depth 20
            [System.IO.File]::WriteAllText($GlobalSettingsPath, $settingsJson, $utf8NoBom)
            Write-Host "  Registered kuro-global in settings.json" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  WARNING: Could not update settings.json: $_" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  WARNING: ~/.claude/settings.json not found" -ForegroundColor DarkYellow
}

Write-Host "  Plugin synced successfully" -ForegroundColor Green
exit 0
