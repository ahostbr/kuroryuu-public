<#
.SYNOPSIS
    Kuroryuu Project Setup Script - Run once after cloning for complete setup.

.DESCRIPTION
    This script sets up EVERYTHING needed to run Kuroryuu from a fresh clone:
    1. Sets KURORYUU_PROJECT_ROOT environment variable (persistent)
    2. Generates .mcp.json from template with resolved paths
    3. Creates Python 3.12 virtual environment
    4. Installs ALL Python dependencies (mcp_core, gateway, mcp_stdio)
    5. Installs ALL Node.js dependencies (desktop, pty_daemon, web)
    6. Copies build assets if missing

.EXAMPLE
    .\setup-project.ps1

.EXAMPLE
    .\setup-project.ps1 -SkipNode    # Skip npm installs
    .\setup-project.ps1 -SkipPython  # Skip Python venv/deps
#>

param(
    [switch]$SkipPython,    # Skip Python venv and deps
    [switch]$SkipNode,      # Skip Node.js deps
    [switch]$Force          # Overwrite existing configs
)

$ErrorActionPreference = "Stop"

# Determine project root (this script is in root)
$ProjectRoot = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  KURORYUU PROJECT SETUP" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project Root: $ProjectRoot" -ForegroundColor White
Write-Host ""

$stepNum = 1
$totalSteps = 7

# ============================================================================
# Step 1: Set persistent environment variable
# ============================================================================
Write-Host "[$stepNum/$totalSteps] Setting KURORYUU_PROJECT_ROOT..." -ForegroundColor Yellow
$stepNum++

$currentEnv = [Environment]::GetEnvironmentVariable("KURORYUU_PROJECT_ROOT", "User")
if ($currentEnv -and $currentEnv -ne $ProjectRoot) {
    Write-Host "  Updating from: $currentEnv" -ForegroundColor DarkYellow
}

[Environment]::SetEnvironmentVariable("KURORYUU_PROJECT_ROOT", $ProjectRoot, "User")
$env:KURORYUU_PROJECT_ROOT = $ProjectRoot
Write-Host "  Set to: $ProjectRoot" -ForegroundColor Green

# ============================================================================
# Step 2: Generate .mcp.json from template
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Generating .mcp.json from template..." -ForegroundColor Yellow
$stepNum++

$templatePath = Join-Path $ProjectRoot ".mcp.json.template"
$configPath = Join-Path $ProjectRoot ".mcp.json"

if (-not (Test-Path $templatePath)) {
    Write-Host "  WARNING: Template not found at $templatePath" -ForegroundColor DarkYellow
    Write-Host "  Skipping .mcp.json generation" -ForegroundColor DarkYellow
} elseif ((Test-Path $configPath) -and -not $Force) {
    Write-Host "  .mcp.json already exists (use -Force to overwrite)" -ForegroundColor DarkYellow
} else {
    $template = Get-Content $templatePath -Raw
    # For JSON, backslashes must be escaped as \\ (two chars in file = one backslash)
    # Use .Replace() instead of -replace to avoid regex escaping issues
    $escapedRoot = $ProjectRoot.Replace('\', '\\')
    $escapedVenv = "$ProjectRoot\.venv_mcp312".Replace('\', '\\')
    $config = $template.Replace('{{KURORYUU_ROOT}}', $escapedRoot)
    $config = $config.Replace('{{KURORYUU_VENV}}', $escapedVenv)
    # Write without BOM for cleaner JSON
    [System.IO.File]::WriteAllText($configPath, $config)
    Write-Host "  Generated: .mcp.json" -ForegroundColor Green
}

# ============================================================================
# Step 3: Create Python virtual environment
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Setting up Python 3.12 virtual environment..." -ForegroundColor Yellow
$stepNum++

$venvPath = Join-Path $ProjectRoot ".venv_mcp312"
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$pip = Join-Path $venvPath "Scripts\pip.exe"

if ($SkipPython) {
    Write-Host "  Skipped (-SkipPython)" -ForegroundColor DarkYellow
} elseif (Test-Path $venvPython) {
    # Verify venv works (copied venvs are broken)
    $testResult = & $venvPython -c "import sys; print(sys.prefix)" 2>&1
    if ($LASTEXITCODE -ne 0 -or -not ($testResult -like "*$ProjectRoot*")) {
        Write-Host "  Existing venv is broken, recreating..." -ForegroundColor DarkYellow
        Remove-Item -Recurse -Force $venvPath -ErrorAction SilentlyContinue
        & py -3.12 -m venv $venvPath
        Write-Host "  Recreated venv" -ForegroundColor Green
    } else {
        Write-Host "  Venv already exists and works" -ForegroundColor Green
    }
} else {
    Write-Host "  Creating Python 3.12 virtual environment..." -ForegroundColor White
    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) {
        & py -3.12 -m venv $venvPath
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Failed to create venv. Is Python 3.12 installed?" -ForegroundColor Red
            Write-Host "  Install from: https://www.python.org/downloads/" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "  ERROR: 'py' launcher not found. Install Python 3.12" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Created: .venv_mcp312" -ForegroundColor Green
}

# ============================================================================
# Step 4: Install Python dependencies
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Installing Python dependencies..." -ForegroundColor Yellow
$stepNum++

if ($SkipPython) {
    Write-Host "  Skipped (-SkipPython)" -ForegroundColor DarkYellow
} elseif (Test-Path $pip) {
    $requirementsFiles = @(
        "apps\mcp_core\requirements.txt",
        "apps\mcp_stdio\requirements.txt",
        "apps\gateway\requirements.txt"
    )

    foreach ($reqFile in $requirementsFiles) {
        $reqPath = Join-Path $ProjectRoot $reqFile
        if (Test-Path $reqPath) {
            $appName = ($reqFile -split '\\')[1]
            Write-Host "  Installing $appName dependencies..." -ForegroundColor White
            # Temporarily allow errors (pip outputs warnings to stderr)
            $ErrorActionPreference = "Continue"
            & $pip install -r $reqPath -q 2>&1 | Out-Null
            $ErrorActionPreference = "Stop"
        }
    }

    # Install desktop app Python dependencies (voice input, audio transcription, TTS)
    Write-Host "  Installing desktop speech/audio dependencies..." -ForegroundColor White
    $ErrorActionPreference = "Continue"
    & $pip install SpeechRecognition pyaudio edge-tts -q 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"

    Write-Host "  Python dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  ERROR: pip not found at $pip" -ForegroundColor Red
}

# ============================================================================
# Step 5: Install Node.js dependencies
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Installing Node.js dependencies..." -ForegroundColor Yellow
$stepNum++

if ($SkipNode) {
    Write-Host "  Skipped (-SkipNode)" -ForegroundColor DarkYellow
} else {
    $npmApps = @(
        "apps\desktop",
        "apps\pty_daemon",
        "apps\web"
    )

    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) {
        Write-Host "  WARNING: npm not found. Skipping Node.js setup." -ForegroundColor DarkYellow
        Write-Host "  Install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    } else {
        foreach ($app in $npmApps) {
            $appPath = Join-Path $ProjectRoot $app
            $packageJson = Join-Path $appPath "package.json"
            $nodeModules = Join-Path $appPath "node_modules"

            if (Test-Path $packageJson) {
                $appName = Split-Path $app -Leaf
                if (Test-Path $nodeModules) {
                    Write-Host "  $appName - already installed" -ForegroundColor DarkGray
                } else {
                    Write-Host "  $appName - installing..." -ForegroundColor White
                    Push-Location $appPath
                    # Temporarily allow errors (npm outputs warnings to stderr)
                    $ErrorActionPreference = "Continue"
                    & npm install --silent 2>&1 | Out-Null
                    $ErrorActionPreference = "Stop"
                    Pop-Location
                    Write-Host "  $appName - done" -ForegroundColor Green
                }
            }
        }
    }
}

# ============================================================================
# Step 6: Check/copy build assets
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Checking build assets..." -ForegroundColor Yellow
$stepNum++

$buildDir = Join-Path $ProjectRoot "apps\desktop\build"
$resourcesDir = Join-Path $ProjectRoot "apps\desktop\resources"
$iconIco = Join-Path $buildDir "icon.ico"
$iconPng = Join-Path $buildDir "icon.png"
$srcIco = Join-Path $resourcesDir "Kuroryuu_ico.ico"
$srcPng = Join-Path $resourcesDir "Kuroryuu_png.png"

# Create build dir if missing
if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
    Write-Host "  Created apps/desktop/build/" -ForegroundColor Green
}

# Copy icon.ico for Windows taskbar (required for proper taskbar icon)
if ((Test-Path $srcIco) -and -not (Test-Path $iconIco)) {
    Copy-Item $srcIco $iconIco
    Write-Host "  Copied icon.ico for Windows builds" -ForegroundColor Green
} elseif (Test-Path $iconIco) {
    Write-Host "  icon.ico present" -ForegroundColor Green
}

# Copy icon.png for electron-builder
if ((Test-Path $srcPng) -and -not (Test-Path $iconPng)) {
    Copy-Item $srcPng $iconPng
    Write-Host "  Copied icon.png for builds" -ForegroundColor Green
} elseif (Test-Path $iconPng) {
    Write-Host "  icon.png present" -ForegroundColor Green
}

if (-not (Test-Path $iconIco) -and -not (Test-Path $iconPng)) {
    Write-Host "  WARNING: No build icons found" -ForegroundColor DarkYellow
    Write-Host "  Copy icons from apps/desktop/resources/ to apps/desktop/build/" -ForegroundColor Yellow
}

# ============================================================================
# Step 7: Download FFmpeg (for screen capture feature)
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Setting up FFmpeg for screen capture..." -ForegroundColor Yellow
$stepNum++

$ffmpegDir = Join-Path $ProjectRoot "ffmpeg\win64"
$ffmpegBin = Join-Path $ffmpegDir "bin\ffmpeg.exe"

if (Test-Path $ffmpegBin) {
    Write-Host "  FFmpeg already installed" -ForegroundColor Green
} else {
    Write-Host "  Downloading FFmpeg (GPL build from BtbN)..." -ForegroundColor White
    $ffmpegUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
    $zipPath = Join-Path $env:TEMP "ffmpeg-kuroryuu.zip"
    $extractPath = Join-Path $env:TEMP "ffmpeg-kuroryuu-extract"

    try {
        # Download
        Invoke-WebRequest -Uri $ffmpegUrl -OutFile $zipPath -UseBasicParsing
        Write-Host "  Downloaded (~80MB)" -ForegroundColor DarkGray

        # Extract to temp
        if (Test-Path $extractPath) {
            Remove-Item -Recurse -Force $extractPath
        }
        Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
        Write-Host "  Extracted" -ForegroundColor DarkGray

        # Find the extracted folder (name varies: ffmpeg-master-latest-win64-gpl)
        $extractedDir = Get-ChildItem $extractPath -Directory | Where-Object { $_.Name -like "ffmpeg-*" } | Select-Object -First 1

        if ($extractedDir) {
            # Create target directory structure
            $ffmpegParent = Join-Path $ProjectRoot "ffmpeg"
            if (-not (Test-Path $ffmpegParent)) {
                New-Item -ItemType Directory -Path $ffmpegParent -Force | Out-Null
            }

            # Move extracted contents to ffmpeg/win64
            if (Test-Path $ffmpegDir) {
                Remove-Item -Recurse -Force $ffmpegDir
            }
            Move-Item $extractedDir.FullName $ffmpegDir -Force
            Write-Host "  FFmpeg installed to ffmpeg/win64/bin/" -ForegroundColor Green
        } else {
            Write-Host "  WARNING: Could not find extracted FFmpeg folder" -ForegroundColor DarkYellow
        }

        # Cleanup
        Remove-Item $zipPath -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $extractPath -ErrorAction SilentlyContinue
    } catch {
        Write-Host "  WARNING: Failed to download FFmpeg: $_" -ForegroundColor DarkYellow
        Write-Host "  Download manually from: https://github.com/BtbN/FFmpeg-Builds/releases" -ForegroundColor Yellow
        Write-Host "  Extract to: $ffmpegDir" -ForegroundColor Yellow
    }
}

# ============================================================================
# Done
# ============================================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Restart your terminal (to pick up env variable)" -ForegroundColor White
Write-Host "  2. Run: .\run_all.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "Optional:" -ForegroundColor DarkGray
Write-Host "  - Build desktop: cd apps\desktop && npm run build" -ForegroundColor DarkGray
Write-Host "  - Dev mode:      cd apps\desktop && npm run dev" -ForegroundColor DarkGray
Write-Host ""
