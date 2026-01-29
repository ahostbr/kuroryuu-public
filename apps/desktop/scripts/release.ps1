# Kuroryuu Desktop Release Script
# Builds the app and deploys to shadows-and-shurikens.com/updates/

param(
    [switch]$SkipBuild,
    [switch]$SkipDeploy,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Configuration
$DesktopDir = Split-Path -Parent $PSScriptRoot
$UpdatesDir = "E:\shadows-and-shurikens.com\shadows-and-shurikens.com\updates"

# Change to desktop directory
Push-Location $DesktopDir

try {
    # Get version from package.json
    $PackageJson = Get-Content "package.json" | ConvertFrom-Json
    $Version = $PackageJson.version

    Write-Host "`n=== Kuroryuu Desktop Release v$Version ===" -ForegroundColor Cyan

    # Step 1: Build
    if (-not $SkipBuild) {
        Write-Host "`n[1/4] Building app..." -ForegroundColor Yellow
        npm run dist
        if ($LASTEXITCODE -ne 0) {
            throw "Build failed with exit code $LASTEXITCODE"
        }
        Write-Host "Build complete!" -ForegroundColor Green
    } else {
        Write-Host "`n[1/4] Skipping build (--SkipBuild)" -ForegroundColor Gray
    }

    # Step 2: Verify build artifacts
    Write-Host "`n[2/4] Verifying build artifacts..." -ForegroundColor Yellow

    $InstallerPath = "dist\Kuroryuu Setup $Version.exe"
    $LatestYmlPath = "dist\latest.yml"

    if (-not (Test-Path $InstallerPath)) {
        throw "Installer not found: $InstallerPath"
    }
    if (-not (Test-Path $LatestYmlPath)) {
        throw "latest.yml not found: $LatestYmlPath"
    }

    $InstallerSize = (Get-Item $InstallerPath).Length / 1MB
    Write-Host "  Installer: $InstallerPath ($([math]::Round($InstallerSize, 1)) MB)" -ForegroundColor Gray
    Write-Host "  Metadata: $LatestYmlPath" -ForegroundColor Gray
    Write-Host "Artifacts verified!" -ForegroundColor Green

    # Step 3: Copy to updates directory
    if (-not $SkipDeploy) {
        Write-Host "`n[3/4] Deploying to $UpdatesDir..." -ForegroundColor Yellow

        # Create updates directory if needed
        if (-not (Test-Path $UpdatesDir)) {
            Write-Host "Creating updates directory..." -ForegroundColor Gray
            New-Item -ItemType Directory -Path $UpdatesDir -Force | Out-Null
        }

        if ($DryRun) {
            Write-Host "  [DRY RUN] Would copy:" -ForegroundColor Magenta
            Write-Host "    $InstallerPath -> $UpdatesDir\" -ForegroundColor Gray
            Write-Host "    $LatestYmlPath -> $UpdatesDir\" -ForegroundColor Gray
        } else {
            Copy-Item $InstallerPath $UpdatesDir -Force
            Copy-Item $LatestYmlPath $UpdatesDir -Force
            Write-Host "Files copied!" -ForegroundColor Green
        }
    } else {
        Write-Host "`n[3/4] Skipping deploy (--SkipDeploy)" -ForegroundColor Gray
    }

    # Step 4: Git commit and push
    if (-not $SkipDeploy) {
        Write-Host "`n[4/4] Committing to git..." -ForegroundColor Yellow

        Push-Location $UpdatesDir
        try {
            if ($DryRun) {
                Write-Host "  [DRY RUN] Would run:" -ForegroundColor Magenta
                Write-Host "    git add ." -ForegroundColor Gray
                Write-Host "    git commit -m 'Release v$Version'" -ForegroundColor Gray
                Write-Host "    git push origin main" -ForegroundColor Gray
            } else {
                git add .
                git commit -m "Release v$Version"
                git push origin main
                Write-Host "Pushed to remote!" -ForegroundColor Green
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "`n[4/4] Skipping git (--SkipDeploy)" -ForegroundColor Gray
    }

    # Summary
    Write-Host "`n=== Release Complete ===" -ForegroundColor Green
    Write-Host "Version: v$Version" -ForegroundColor Cyan
    Write-Host "URL: https://shadows-and-shurikens.com/updates/latest.yml" -ForegroundColor Cyan

    if ($DryRun) {
        Write-Host "`n[DRY RUN - No changes were made]" -ForegroundColor Magenta
    }

} catch {
    Write-Host "`nError: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
