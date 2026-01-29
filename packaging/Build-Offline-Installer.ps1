#Requires -Version 5.1
<#
.SYNOPSIS
    Build offline installer package for Kuroryuu

.DESCRIPTION
    Creates a self-contained offline package that includes:
    - Kuroryuu source code
    - All Python wheels (pre-downloaded)
    - Embedded Python (optional)
    - Desktop app installer
    - Install script

.PARAMETER IncludePython
    Bundle embedded Python in the offline package

.PARAMETER IncludeDesktopApp
    Bundle the desktop app installer

.PARAMETER OutputDir
    Output directory for the offline package (default: .\dist)

.EXAMPLE
    .\Build-Offline-Installer.ps1
    .\Build-Offline-Installer.ps1 -IncludePython -IncludeDesktopApp
#>

param(
    [switch]$IncludePython,
    [switch]$IncludeDesktopApp,
    [string]$OutputDir = ".\dist"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "Continue"

$KuroVersion = "0.1.0"
$PythonVersion = "3.12.4"
$PythonEmbedUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$DesktopInstallerUrl = "https://github.com/ahostbr/Kuroryuu/releases/download/v$KuroVersion/Kuroryuu-$KuroVersion-Setup.exe"

function Write-Step($msg) {
    Write-Host "`n▶ $msg" -ForegroundColor Cyan
}

function Write-OK($msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function Write-Info($msg) {
    Write-Host "  → $msg" -ForegroundColor DarkGray
}

# Get repo root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Kuroryuu Offline Package Builder" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta

# Create output directories
$distDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $RepoRoot $OutputDir }
$buildDir = Join-Path $distDir "build"
$wheelsDir = Join-Path $buildDir "packaging\wheels"

Write-Step "Preparing build directory..."
if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
New-Item -ItemType Directory -Path $wheelsDir -Force | Out-Null
Write-OK "Build directory: $buildDir"

# =============================================
# Copy source code
# =============================================
Write-Step "Copying source code..."

$excludeDirs = @(
    ".git",
    ".venv",
    ".venv_mcp312",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    "dist",
    "build",
    ".next",
    "out"
)

$excludePatterns = @(
    "*.pyc",
    "*.pyo",
    "*.egg-info",
    "*.log",
    ".env",
    ".env.*",
    "*.db",
    "*.db-journal"
)

# Copy essential directories
$copyDirs = @(
    "apps",
    "ai",
    "Docs",
    ".claude"
)

foreach ($dir in $copyDirs) {
    $srcDir = Join-Path $RepoRoot $dir
    $dstDir = Join-Path $buildDir $dir

    if (Test-Path $srcDir) {
        Write-Info "Copying $dir..."
        Copy-Item $srcDir $dstDir -Recurse -Force

        # Clean up excluded items
        foreach ($exclude in $excludeDirs) {
            Get-ChildItem $dstDir -Directory -Recurse -Filter $exclude -ErrorAction SilentlyContinue |
                Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        }
        foreach ($pattern in $excludePatterns) {
            Get-ChildItem $dstDir -File -Recurse -Filter $pattern -ErrorAction SilentlyContinue |
                Remove-Item -Force -ErrorAction SilentlyContinue
        }
    }
}

# Copy root files
$rootFiles = @(
    "CLAUDE.md",
    "KURORYUU_BOOTSTRAP.md",
    "KURORYUU_LAWS.md",
    "run_all.ps1",
    "kill_all.ps1",
    "README.md"
)

foreach ($file in $rootFiles) {
    $srcFile = Join-Path $RepoRoot $file
    if (Test-Path $srcFile) {
        Copy-Item $srcFile $buildDir -Force
    }
}

# Copy packaging scripts
$packagingDir = Join-Path $buildDir "packaging"
New-Item -ItemType Directory -Path $packagingDir -Force | Out-Null
Copy-Item (Join-Path $ScriptDir "kuroryuu-install.ps1") $packagingDir -Force

Write-OK "Source code copied"

# =============================================
# Download Python wheels
# =============================================
Write-Step "Downloading Python wheels..."

# Find requirements files
$requirementFiles = @(
    "apps\gateway\requirements.txt",
    "apps\mcp_core\requirements.txt",
    "apps\kuroryuu_cli\requirements.txt"
)

# Detect Python
$python = "python"
$venvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$mcpPython = Join-Path $RepoRoot ".venv_mcp312\Scripts\python.exe"

if (Test-Path $mcpPython) {
    $python = $mcpPython
} elseif (Test-Path $venvPython) {
    $python = $venvPython
}

Write-Info "Using Python: $python"

foreach ($reqFile in $requirementFiles) {
    $reqPath = Join-Path $RepoRoot $reqFile

    if (Test-Path $reqPath) {
        $moduleName = Split-Path (Split-Path $reqFile -Parent) -Leaf
        Write-Info "Downloading wheels for $moduleName..."

        & $python -m pip download -r $reqPath -d $wheelsDir --quiet 2>&1 | Out-Null
    }
}

$wheelCount = (Get-ChildItem $wheelsDir -Filter "*.whl").Count
Write-OK "Downloaded $wheelCount wheels"

# =============================================
# Download embedded Python (optional)
# =============================================
if ($IncludePython) {
    Write-Step "Downloading embedded Python..."

    $pythonZip = Join-Path $packagingDir "python-embed.zip"

    try {
        Write-Progress -Activity "Downloading Python $PythonVersion" -Status "Please wait..." -PercentComplete -1
        Invoke-WebRequest -Uri $PythonEmbedUrl -OutFile $pythonZip -UseBasicParsing
        Write-Progress -Activity "Downloading Python $PythonVersion" -Completed
        Write-OK "Embedded Python downloaded"
    } catch {
        Write-Host "  ⚠ Failed to download Python: $_" -ForegroundColor Yellow
    }
}

# =============================================
# Download Desktop App installer (optional)
# =============================================
if ($IncludeDesktopApp) {
    Write-Step "Downloading Desktop App installer..."

    $installerPath = Join-Path $packagingDir "Kuroryuu-Setup.exe"

    try {
        Write-Progress -Activity "Downloading Desktop App" -Status "Please wait..." -PercentComplete -1
        Invoke-WebRequest -Uri $DesktopInstallerUrl -OutFile $installerPath -UseBasicParsing
        Write-Progress -Activity "Downloading Desktop App" -Completed
        Write-OK "Desktop installer downloaded"
    } catch {
        Write-Host "  ⚠ Failed to download desktop installer: $_" -ForegroundColor Yellow
        Write-Info "Desktop installer will need to be downloaded during installation"
    }
}

# =============================================
# Create offline package ZIP
# =============================================
Write-Step "Creating offline package..."

$zipFile = Join-Path $distDir "kuroryuu-offline.zip"

if (Test-Path $zipFile) { Remove-Item $zipFile -Force }

Write-Progress -Activity "Compressing package" -Status "Please wait..." -PercentComplete -1
Compress-Archive -Path "$buildDir\*" -DestinationPath $zipFile -CompressionLevel Optimal
Write-Progress -Activity "Compressing package" -Completed

$zipSize = [math]::Round((Get-Item $zipFile).Length / 1MB, 1)
Write-OK "Package created: $zipFile ($zipSize MB)"

# Cleanup build directory
Remove-Item $buildDir -Recurse -Force

# =============================================
# Done
# =============================================
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Offline package built successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Output:  $zipFile" -ForegroundColor White
Write-Host "  Size:    $zipSize MB" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Usage:" -ForegroundColor Cyan
Write-Host "    1. Copy kuroryuu-offline.zip and kuroryuu-install.ps1 to USB" -ForegroundColor DarkGray
Write-Host "    2. On target machine: .\kuroryuu-install.ps1 -Offline" -ForegroundColor DarkGray
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
