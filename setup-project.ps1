<#
.SYNOPSIS
    Kuroryuu Project Setup Script - Run once after cloning for complete setup.

.DESCRIPTION
    This script sets up EVERYTHING needed to run Kuroryuu from a fresh clone:
    1. Sets KURORYUU_PROJECT_ROOT environment variable (persistent)
    2. Creates runtime directories
    3. Generates .mcp.json from template with resolved paths
    4. Generates personal config files from templates
    5. Creates Python 3.12 virtual environment
    6. Installs ALL Python dependencies (mcp_core, gateway, mcp_stdio)
    7. Installs ALL Node.js dependencies (desktop, pty_daemon, web, tray_companion)
    8. Fixes npm security vulnerabilities (npm audit fix)
    9. Installs Playwright CLI and skills
    10. Copies build assets if missing
    11. Builds Electron apps (desktop, tray_companion)
    12. Downloads FFmpeg for screen capture

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
$totalSteps = 12

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
# Step 2: Create runtime directories (excluded from git)
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Creating runtime directories..." -ForegroundColor Yellow
$stepNum++

# Core runtime directories (these are in .gitignore)
$runtimeDirs = @(
    "ai\artifacts",
    "ai\chat_history",
    "ai\checkpoints",
    "ai\cli_sessions",
    "ai\collective",
    "ai\config",
    "ai\exports",
    "ai\logs",
    "ai\rag_index",
    "ai\repo_intel",
    "ai\reports",
    "ai\traffic",
    "ai\inbox\.index",
    "ai\inbox\cur",
    "ai\inbox\dead",
    "ai\inbox\done",
    "ai\inbox\new",
    "ai\inbox\tmp"
)

$createdCount = 0
foreach ($dir in $runtimeDirs) {
    $fullPath = Join-Path $ProjectRoot $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        $createdCount++
    }
}
if ($createdCount -gt 0) {
    Write-Host "  Created $createdCount runtime directories" -ForegroundColor Green
} else {
    Write-Host "  All runtime directories exist" -ForegroundColor Green
}

# Create default JSON/state files if missing
$defaultFiles = @{
    "ai\sessions.json" = "{}"
    "ai\agents_registry.json" = "{}"
    "ai\working_memory.json" = "{}"
    "ai\current_run.json" = "{}"
    "ai\inbox_messages.json" = "[]"
    "ai\agent_context.md" = ""
}

$createdFiles = 0
foreach ($file in $defaultFiles.Keys) {
    $filePath = Join-Path $ProjectRoot $file
    if (-not (Test-Path $filePath)) {
        $defaultFiles[$file] | Set-Content -Path $filePath -NoNewline
        $createdFiles++
    }
}
if ($createdFiles -gt 0) {
    Write-Host "  Created $createdFiles default state files" -ForegroundColor Green
} else {
    Write-Host "  All state files exist" -ForegroundColor Green
}

# ============================================================================
# Step 3: Generate .mcp.json from template
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

# Always remove legacy Playwright MCP entry from existing/generated config.
if (Test-Path $configPath) {
    try {
        $mcpJson = Get-Content $configPath -Raw | ConvertFrom-Json
        if ($mcpJson.mcpServers -and $mcpJson.mcpServers.PSObject.Properties['playwright']) {
            $mcpJson.mcpServers.PSObject.Properties.Remove('playwright')
            $updatedJson = $mcpJson | ConvertTo-Json -Depth 20
            $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
            [System.IO.File]::WriteAllText($configPath, $updatedJson, $utf8NoBom)
            Write-Host "  Removed legacy Playwright MCP entry from .mcp.json" -ForegroundColor Green
        }
    } catch {
        Write-Host "  WARNING: Failed to sanitize .mcp.json (Playwright MCP entry): $_" -ForegroundColor DarkYellow
    }
}

# ============================================================================
# Step 4: Generate personal config files from templates
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Generating personal config files from templates..." -ForegroundColor Yellow
$stepNum++

$templateCopies = @(
    @{ Template = ".claude\settings.template.json"; Target = ".claude\settings.json"; Name = "Claude Code settings" },
    @{ Template = "ai\todo.md.template"; Target = "ai\todo.md"; Name = "Task tracking (todo.md)" }
)

foreach ($item in $templateCopies) {
    $templateFile = Join-Path $ProjectRoot $item.Template
    $targetFile = Join-Path $ProjectRoot $item.Target

    if (-not (Test-Path $templateFile)) {
        Write-Host "  WARNING: Template not found: $($item.Template)" -ForegroundColor DarkYellow
    } elseif ((Test-Path $targetFile) -and -not $Force) {
        Write-Host "  $($item.Name) already exists (use -Force to overwrite)" -ForegroundColor DarkGray
    } else {
        Copy-Item $templateFile $targetFile -Force
        Write-Host "  Created: $($item.Target)" -ForegroundColor Green
    }
}

# ============================================================================
# Step 5: Create Python virtual environment
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
# Step 6: Install Python dependencies
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Installing Python dependencies..." -ForegroundColor Yellow
$stepNum++

if ($SkipPython) {
    Write-Host "  Skipped (-SkipPython)" -ForegroundColor DarkYellow
} elseif (Test-Path $pip) {
    # Check if uv is available (prettier progress output)
    $uvCmd = Get-Command uv -ErrorAction SilentlyContinue
    $useUv = $null -ne $uvCmd

    if ($useUv) {
        Write-Host "  Using uv for prettier progress..." -ForegroundColor DarkGray
    }

    $requirementsFiles = @(
        "apps\mcp_core\requirements.txt",
        "apps\mcp_stdio\requirements.txt",
        "apps\gateway\requirements.txt"
    )

    foreach ($reqFile in $requirementsFiles) {
        $reqPath = Join-Path $ProjectRoot $reqFile
        if (Test-Path $reqPath) {
            $appName = ($reqFile -split '\\')[1]
            Write-Host ""
            Write-Host "  Installing $appName dependencies..." -ForegroundColor Cyan
            $ErrorActionPreference = "Continue"
            if ($useUv) {
                & uv pip install -r $reqPath --python $venvPython 2>&1
            } else {
                & $pip install -r $reqPath 2>&1
            }
            $ErrorActionPreference = "Stop"
        }
    }

    # Install desktop app Python dependencies (voice input, audio transcription, TTS)
    Write-Host ""
    Write-Host "  Installing desktop speech/audio dependencies..." -ForegroundColor Cyan
    $ErrorActionPreference = "Continue"
    if ($useUv) {
        & uv pip install SpeechRecognition pyaudio edge-tts --python $venvPython 2>&1
    } else {
        & $pip install SpeechRecognition pyaudio edge-tts 2>&1
    }
    $ErrorActionPreference = "Stop"

    Write-Host ""
    Write-Host "  Python dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  ERROR: pip not found at $pip" -ForegroundColor Red
}

# ============================================================================
# Step 7: Install Node.js dependencies
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
        "apps\web",
        "apps\tray_companion"
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
                    Write-Host ""
                    Write-Host "  $appName - installing..." -ForegroundColor Cyan
                    Push-Location $appPath
                    $ErrorActionPreference = "Continue"
                    & npm install --progress 2>&1
                    $ErrorActionPreference = "Stop"
                    Pop-Location
                    Write-Host "  $appName - done" -ForegroundColor Green
                }
            }
        }
    }
}

# ============================================================================
# Step 8: Fix npm security vulnerabilities
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Running npm audit fix..." -ForegroundColor Yellow
$stepNum++

if ($SkipNode) {
    Write-Host "  Skipped (-SkipNode)" -ForegroundColor DarkYellow
} else {
    foreach ($app in $npmApps) {
        $appPath = Join-Path $ProjectRoot $app
        $nodeModules = Join-Path $appPath "node_modules"
        if (Test-Path $nodeModules) {
            $appName = Split-Path $app -Leaf
            Push-Location $appPath
            $ErrorActionPreference = "Continue"
            $auditOutput = & npm audit fix 2>&1
            $ErrorActionPreference = "Stop"
            Pop-Location

            # Check if any fixes were applied
            if ($auditOutput -match "found 0 vulnerabilities") {
                Write-Host "  $appName - no vulnerabilities" -ForegroundColor Green
            } else {
                Write-Host "  $appName - applied fixes" -ForegroundColor Green
            }
        }
    }
}

# ============================================================================
# Step 9: Install Playwright CLI + skills
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Installing Playwright CLI + skills..." -ForegroundColor Yellow
$stepNum++

if ($SkipNode) {
    Write-Host "  Skipped (-SkipNode)" -ForegroundColor DarkYellow
} else {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) {
        Write-Host "  WARNING: npm not found. Cannot install Playwright CLI." -ForegroundColor DarkYellow
        Write-Host "  Install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    } else {
        $pwCliCmd = Get-Command playwright-cli -ErrorAction SilentlyContinue

        if (-not $pwCliCmd) {
            Write-Host "  Installing @playwright/cli globally..." -ForegroundColor White
            $ErrorActionPreference = "Continue"
            & npm install -g @playwright/cli@latest 2>&1
            $ErrorActionPreference = "Stop"
            $pwCliCmd = Get-Command playwright-cli -ErrorAction SilentlyContinue
        } else {
            Write-Host "  playwright-cli already installed globally" -ForegroundColor DarkGray
        }

        if ($pwCliCmd) {
            Write-Host "  Installing playwright-cli skills in project..." -ForegroundColor White
            Push-Location $ProjectRoot
            $ErrorActionPreference = "Continue"
            & playwright-cli install --skills 2>&1
            $ErrorActionPreference = "Stop"
            Pop-Location

            $skillPath = Join-Path $ProjectRoot ".claude\skills\playwright-cli\SKILL.md"
            if (Test-Path $skillPath) {
                Write-Host "  playwright-cli skills installed" -ForegroundColor Green
            } else {
                Write-Host "  playwright-cli installed, but skill files were not detected in .claude/skills" -ForegroundColor DarkYellow
            }
        } else {
            Write-Host "  WARNING: playwright-cli install failed or command unavailable." -ForegroundColor DarkYellow
        }
    }
}

# ============================================================================
# Step 10: Check/copy build assets
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
# Step 11: Build Electron apps (desktop and tray companion)
# ============================================================================
Write-Host ""
Write-Host "[$stepNum/$totalSteps] Building Electron apps..." -ForegroundColor Yellow
$stepNum++

if ($SkipNode) {
    Write-Host "  Skipped (-SkipNode)" -ForegroundColor DarkYellow
} else {
    $electronApps = @(
        @{ Path = "apps\tray_companion"; Name = "tray_companion" },
        @{ Path = "apps\desktop"; Name = "desktop" }
    )

    foreach ($app in $electronApps) {
        $appPath = Join-Path $ProjectRoot $app.Path
        $outDir = Join-Path $appPath "out"

        if (Test-Path (Join-Path $appPath "package.json")) {
            if (Test-Path $outDir) {
                Write-Host "  $($app.Name) - already built" -ForegroundColor DarkGray
            } else {
                Write-Host ""
                Write-Host "  $($app.Name) - building..." -ForegroundColor Cyan
                Push-Location $appPath
                $ErrorActionPreference = "Continue"
                & npm run build 2>&1
                $ErrorActionPreference = "Stop"
                Pop-Location
                if (Test-Path $outDir) {
                    Write-Host "  $($app.Name) - done" -ForegroundColor Green
                } else {
                    Write-Host "  $($app.Name) - build may have failed (check manually)" -ForegroundColor Yellow
                }
            }
        }
    }
}

# ============================================================================
# Step 12: Download FFmpeg (for screen capture feature)
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
        # Download with progress
        Write-Host "  Downloading (~80MB)..." -ForegroundColor White
        $ProgressPreference = 'Continue'
        Invoke-WebRequest -Uri $ffmpegUrl -OutFile $zipPath
        Write-Host "  Download complete" -ForegroundColor Green

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
