#Requires -Version 5.1
<#
.SYNOPSIS
    Kuroryuu 1-Click Installer for Hackathon Judges

.DESCRIPTION
    Pinokio-style installer that handles:
    - Python 3.12 installation (winget or embedded portable)
    - Kuroryuu source download
    - Python virtual environment setup
    - Desktop app installation
    - Start Menu shortcut creation

.PARAMETER Offline
    Use offline mode with bundled dependencies (requires kuroryuu-offline.zip)

.PARAMETER EmbeddedPython
    Use embedded portable Python instead of winget installation

.PARAMETER SkipDesktopApp
    Skip desktop app installation (backend services only)

.PARAMETER InstallDir
    Custom installation directory (default: %LOCALAPPDATA%\Kuroryuu)

.EXAMPLE
    # Online install (default)
    irm https://raw.githubusercontent.com/ahostbr/Kuroryuu/master/packaging/kuroryuu-install.ps1 | iex

    # Offline install
    .\kuroryuu-install.ps1 -Offline

    # Use embedded Python
    .\kuroryuu-install.ps1 -EmbeddedPython
#>

param(
    [switch]$Offline,
    [switch]$EmbeddedPython,
    [switch]$SkipDesktopApp,
    [string]$InstallDir = "$env:LOCALAPPDATA\Kuroryuu"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "Continue"

# Version info
$KuroVersion = "0.1.0"
$PythonVersion = "3.12.4"
$PythonEmbedUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$RepoZipUrl = "https://github.com/ahostbr/Kuroryuu/archive/refs/heads/master.zip"
$DesktopInstallerUrl = "https://github.com/ahostbr/Kuroryuu/releases/download/v$KuroVersion/Kuroryuu-$KuroVersion-Setup.exe"

# Colors and formatting
function Write-Banner {
    Write-Host ""
    Write-Host "  ██╗  ██╗██╗   ██╗██████╗  ██████╗ ██████╗ ██╗   ██╗██╗   ██╗" -ForegroundColor Magenta
    Write-Host "  ██║ ██╔╝██║   ██║██╔══██╗██╔═══██╗██╔══██╗╚██╗ ██╔╝██║   ██║" -ForegroundColor Magenta
    Write-Host "  █████╔╝ ██║   ██║██████╔╝██║   ██║██████╔╝ ╚████╔╝ ██║   ██║" -ForegroundColor Magenta
    Write-Host "  ██╔═██╗ ██║   ██║██╔══██╗██║   ██║██╔══██╗  ╚██╔╝  ██║   ██║" -ForegroundColor Magenta
    Write-Host "  ██║  ██╗╚██████╔╝██║  ██║╚██████╔╝██║  ██║   ██║   ╚██████╔╝" -ForegroundColor Magenta
    Write-Host "  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝ " -ForegroundColor Magenta
    Write-Host ""
    Write-Host "            1-Click Hackathon Installer v$KuroVersion" -ForegroundColor DarkGray
    Write-Host ""
}

function Write-Step($msg) {
    Write-Host ""
    Write-Host "▶ $msg" -ForegroundColor Cyan
}

function Write-OK($msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  ⚠ $msg" -ForegroundColor Yellow
}

function Write-Fail($msg) {
    Write-Host "  ✗ $msg" -ForegroundColor Red
}

function Write-Info($msg) {
    Write-Host "  → $msg" -ForegroundColor DarkGray
}

# Download with progress bar
function Download-WithProgress {
    param(
        [string]$Url,
        [string]$OutFile,
        [string]$Activity
    )

    try {
        $webClient = New-Object System.Net.WebClient
        $webClient.Headers.Add("User-Agent", "Kuroryuu-Installer/1.0")

        # Get file size for progress
        $uri = New-Object System.Uri($Url)
        $request = [System.Net.WebRequest]::Create($uri)
        $request.Method = "HEAD"
        $request.Timeout = 10000

        try {
            $response = $request.GetResponse()
            $totalSize = $response.ContentLength
            $response.Close()
        } catch {
            $totalSize = -1
        }

        # Download with progress
        if ($totalSize -gt 0) {
            $tempFile = "$OutFile.tmp"
            $fileStream = [System.IO.File]::Create($tempFile)
            $responseStream = $webClient.OpenRead($Url)
            $buffer = New-Object byte[] 65536
            $downloaded = 0

            while (($read = $responseStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $fileStream.Write($buffer, 0, $read)
                $downloaded += $read
                $percent = [math]::Round(($downloaded / $totalSize) * 100, 1)
                $downloadedMB = [math]::Round($downloaded / 1MB, 1)
                $totalMB = [math]::Round($totalSize / 1MB, 1)
                Write-Progress -Activity $Activity -Status "${downloadedMB}MB / ${totalMB}MB" -PercentComplete $percent
            }

            $fileStream.Close()
            $responseStream.Close()
            Move-Item $tempFile $OutFile -Force
            Write-Progress -Activity $Activity -Completed
        } else {
            # Fallback without size info
            Write-Progress -Activity $Activity -Status "Downloading..." -PercentComplete -1
            $webClient.DownloadFile($Url, $OutFile)
            Write-Progress -Activity $Activity -Completed
        }

        return $true
    } catch {
        Write-Progress -Activity $Activity -Completed
        return $false
    }
}

# Check if Python 3.11+ is available
function Test-Python {
    try {
        $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
        if (-not $pythonCmd) { return $false }

        $version = python --version 2>&1
        if ($version -match "Python 3\.1[1-9]|Python 3\.[2-9]") {
            return $true
        }
    } catch {}
    return $false
}

# Install embedded Python (portable, no admin required)
function Install-EmbeddedPython {
    param([string]$TargetDir)

    $pythonDir = Join-Path $TargetDir "python"
    $pythonZip = "$env:TEMP\python-embed.zip"
    $getPipFile = "$env:TEMP\get-pip.py"

    Write-Info "Downloading Python $PythonVersion embedded..."
    if (-not (Download-WithProgress -Url $PythonEmbedUrl -OutFile $pythonZip -Activity "Downloading Python")) {
        throw "Failed to download Python"
    }

    Write-Info "Extracting Python..."
    if (Test-Path $pythonDir) { Remove-Item $pythonDir -Recurse -Force }
    Expand-Archive -Path $pythonZip -DestinationPath $pythonDir -Force
    Remove-Item $pythonZip -Force

    # Enable pip in embedded Python
    $pthFile = Get-ChildItem $pythonDir -Filter "python*._pth" | Select-Object -First 1
    if ($pthFile) {
        # Uncomment import site
        $content = Get-Content $pthFile.FullName
        $content = $content -replace "#import site", "import site"
        $content | Set-Content $pthFile.FullName
    }

    # Install pip
    Write-Info "Installing pip..."
    Download-WithProgress -Url $GetPipUrl -OutFile $getPipFile -Activity "Downloading pip" | Out-Null
    $pythonExe = Join-Path $pythonDir "python.exe"
    & $pythonExe $getPipFile --no-warn-script-location 2>&1 | Out-Null
    Remove-Item $getPipFile -Force -ErrorAction SilentlyContinue

    Write-OK "Embedded Python installed to $pythonDir"
    return $pythonExe
}

# Install Python via winget
function Install-PythonWinget {
    Write-Info "Installing Python via winget..."

    try {
        winget install Python.Python.3.12 --accept-source-agreements --accept-package-agreements --silent 2>&1 | Out-Null

        # Refresh PATH
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

        Start-Sleep -Seconds 2

        if (Test-Python) {
            Write-OK "Python installed via winget"
            return "python"
        }
    } catch {
        Write-Warn "Winget installation failed: $_"
    }

    return $null
}

# Main installation flow
function Install-Kuroryuu {
    Write-Banner

    # =============================================
    # Step 1: Check/Install Python
    # =============================================
    Write-Step "Checking Python..."

    $pythonExe = $null

    if ($EmbeddedPython) {
        Write-Info "Using embedded Python (portable)"
        $pythonExe = Install-EmbeddedPython -TargetDir $InstallDir
    } elseif (Test-Python) {
        $pythonExe = "python"
        $version = python --version 2>&1
        Write-OK $version
    } else {
        Write-Warn "Python 3.11+ not found"

        # Try winget first, fall back to embedded
        $pythonExe = Install-PythonWinget

        if (-not $pythonExe) {
            Write-Info "Falling back to embedded Python..."
            $pythonExe = Install-EmbeddedPython -TargetDir $InstallDir
        }
    }

    if (-not $pythonExe) {
        throw "Failed to install Python"
    }

    # =============================================
    # Step 2: Download Kuroryuu
    # =============================================
    Write-Step "Downloading Kuroryuu..."

    if ($Offline) {
        # Offline mode: expect kuroryuu-offline.zip in same directory as script
        $offlineZip = Join-Path $PSScriptRoot "kuroryuu-offline.zip"
        if (-not (Test-Path $offlineZip)) {
            $offlineZip = Join-Path (Get-Location) "kuroryuu-offline.zip"
        }

        if (-not (Test-Path $offlineZip)) {
            throw "Offline mode requires kuroryuu-offline.zip in the same directory"
        }

        Write-Info "Using offline package: $offlineZip"

        if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

        Write-Progress -Activity "Extracting offline package" -Status "Please wait..." -PercentComplete -1
        Expand-Archive -Path $offlineZip -DestinationPath $InstallDir -Force
        Write-Progress -Activity "Extracting offline package" -Completed

    } else {
        # Online mode: download from GitHub
        $zipFile = "$env:TEMP\kuroryuu.zip"

        if (-not (Download-WithProgress -Url $RepoZipUrl -OutFile $zipFile -Activity "Downloading Kuroryuu")) {
            throw "Failed to download Kuroryuu"
        }

        if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

        Write-Progress -Activity "Extracting Kuroryuu" -Status "Please wait..." -PercentComplete -1
        Expand-Archive -Path $zipFile -DestinationPath "$env:TEMP\kuro-extract" -Force

        # Move contents from nested directory
        $extractedDir = Get-ChildItem "$env:TEMP\kuro-extract" -Directory | Select-Object -First 1
        Move-Item "$($extractedDir.FullName)\*" $InstallDir -Force
        Remove-Item "$env:TEMP\kuro-extract" -Recurse -Force
        Remove-Item $zipFile -Force
        Write-Progress -Activity "Extracting Kuroryuu" -Completed
    }

    Write-OK "Downloaded to $InstallDir"

    # =============================================
    # Step 3: Create venv and install dependencies
    # =============================================
    Write-Step "Setting up Python environment..."

    $venvDir = Join-Path $InstallDir ".venv"
    $venvPython = Join-Path $venvDir "Scripts\python.exe"
    $venvPip = Join-Path $venvDir "Scripts\pip.exe"

    # Create virtual environment
    Write-Info "Creating virtual environment..."
    & $pythonExe -m venv $venvDir 2>&1 | Out-Null

    if (-not (Test-Path $venvPython)) {
        throw "Failed to create virtual environment"
    }

    # Upgrade pip
    Write-Info "Upgrading pip..."
    & $venvPython -m pip install --upgrade pip --quiet 2>&1 | Out-Null

    # Install dependencies with progress
    $requirementFiles = @(
        "apps\gateway\requirements.txt",
        "apps\mcp_core\requirements.txt",
        "apps\kuroryuu_cli\requirements.txt"
    )

    $totalReqs = $requirementFiles.Count
    $currentReq = 0

    foreach ($reqFile in $requirementFiles) {
        $currentReq++
        $reqPath = Join-Path $InstallDir $reqFile
        $percent = [math]::Round(($currentReq / $totalReqs) * 100)

        if (Test-Path $reqPath) {
            $moduleName = Split-Path (Split-Path $reqFile -Parent) -Leaf
            Write-Progress -Activity "Installing Python dependencies" -Status "$moduleName ($currentReq/$totalReqs)" -PercentComplete $percent

            if ($Offline) {
                # Offline: use bundled wheels
                $wheelsDir = Join-Path $InstallDir "packaging\wheels"
                & $venvPip install --no-index --find-links=$wheelsDir -r $reqPath --quiet 2>&1 | Out-Null
            } else {
                # Online: download from PyPI
                & $venvPip install -r $reqPath --quiet 2>&1 | Out-Null
            }
        }
    }

    Write-Progress -Activity "Installing Python dependencies" -Completed
    Write-OK "Python dependencies installed"

    # =============================================
    # Step 4: Install Desktop App
    # =============================================
    if (-not $SkipDesktopApp) {
        Write-Step "Installing Desktop App..."

        $installerPath = "$env:TEMP\Kuroryuu-Setup.exe"
        $desktopExe = "$env:LOCALAPPDATA\Programs\Kuroryuu\Kuroryuu.exe"

        if ($Offline) {
            # Offline: use bundled installer
            $bundledInstaller = Join-Path $InstallDir "packaging\Kuroryuu-Setup.exe"
            if (Test-Path $bundledInstaller) {
                Copy-Item $bundledInstaller $installerPath -Force
            } else {
                Write-Warn "Desktop installer not found in offline package"
                $installerPath = $null
            }
        } else {
            # Online: download installer
            if (-not (Download-WithProgress -Url $DesktopInstallerUrl -OutFile $installerPath -Activity "Downloading Desktop App")) {
                Write-Warn "Failed to download desktop installer (continuing without it)"
                $installerPath = $null
            }
        }

        if ($installerPath -and (Test-Path $installerPath)) {
            Write-Info "Running installer (silent)..."
            Start-Process $installerPath -ArgumentList '/S' -Wait
            Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

            if (Test-Path $desktopExe) {
                Write-OK "Desktop app installed"
            } else {
                Write-Warn "Desktop app installation may have failed"
            }
        }
    } else {
        Write-Info "Skipping desktop app installation"
    }

    # =============================================
    # Step 5: Create Launcher Script
    # =============================================
    Write-Step "Creating launcher..."

    # Determine Python path for launcher
    $launcherPython = if ($EmbeddedPython -or (Test-Path (Join-Path $InstallDir "python\python.exe"))) {
        '$kuroDir\python\python.exe'
    } else {
        '$kuroDir\.venv\Scripts\python.exe'
    }

    $launcherContent = @"
# Kuroryuu Launcher
# Starts all backend services and launches the desktop app

`$ErrorActionPreference = "Continue"
`$kuroDir = "$InstallDir"
`$venvPython = "$($InstallDir)\.venv\Scripts\python.exe"

# Set environment
`$env:KURORYUU_PROJECT_ROOT = `$kuroDir
`$env:KURORYUU_MCP_URL = "http://127.0.0.1:8100"
`$env:KURORYUU_GATEWAY_PORT = "8200"
`$env:PYTHONPATH = `$kuroDir

Write-Host "Starting Kuroryuu services..." -ForegroundColor Cyan

# Function to check port
function Test-Port(`$port) {
    `$null -ne (Get-NetTCPConnection -State Listen -LocalPort `$port -ErrorAction SilentlyContinue)
}

# Kill any existing services on our ports
foreach (`$port in @(8100, 8200)) {
    `$existing = Get-NetTCPConnection -State Listen -LocalPort `$port -ErrorAction SilentlyContinue
    if (`$existing) {
        Write-Host "  Freeing port `$port..." -ForegroundColor Yellow
        `$existing | ForEach-Object { Stop-Process -Id `$_.OwningProcess -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Milliseconds 500
    }
}

# Start MCP Core (port 8100)
Write-Host "  Starting MCP Core..." -ForegroundColor DarkGray
`$mcpScript = Join-Path `$kuroDir "apps\mcp_core\server.py"
`$env:KURORYUU_MCP_PORT = "8100"
Start-Process `$venvPython -ArgumentList "-B `$mcpScript" -WorkingDirectory (Join-Path `$kuroDir "apps\mcp_core") -WindowStyle Hidden

# Wait for MCP to be ready
`$waited = 0
while (`$waited -lt 15) {
    if (Test-Port 8100) { break }
    Start-Sleep -Seconds 1
    `$waited++
}

# Start Gateway (port 8200)
Write-Host "  Starting Gateway..." -ForegroundColor DarkGray
Start-Process `$venvPython -ArgumentList "-m uvicorn apps.gateway.server:app --host 127.0.0.1 --port 8200" -WorkingDirectory `$kuroDir -WindowStyle Hidden

# Wait for Gateway
`$waited = 0
while (`$waited -lt 10) {
    if (Test-Port 8200) { break }
    Start-Sleep -Seconds 1
    `$waited++
}

# Check services
`$mcpOk = Test-Port 8100
`$gatewayOk = Test-Port 8200

if (`$mcpOk) { Write-Host "  MCP Core ready (port 8100)" -ForegroundColor Green }
else { Write-Host "  MCP Core may not be ready" -ForegroundColor Yellow }

if (`$gatewayOk) { Write-Host "  Gateway ready (port 8200)" -ForegroundColor Green }
else { Write-Host "  Gateway may not be ready" -ForegroundColor Yellow }

# Launch Desktop App
`$desktopExe = "`$env:LOCALAPPDATA\Programs\Kuroryuu\Kuroryuu.exe"
if (Test-Path `$desktopExe) {
    Write-Host "  Launching Desktop App..." -ForegroundColor DarkGray
    Start-Process `$desktopExe
} else {
    Write-Host "  Desktop app not found (services running in background)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Use 'claude' command in terminal to interact with MCP tools" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Kuroryuu is running!" -ForegroundColor Green
Write-Host "  MCP Core:  http://127.0.0.1:8100/health" -ForegroundColor DarkGray
Write-Host "  Gateway:   http://127.0.0.1:8200/v1/health" -ForegroundColor DarkGray
"@

    $launcherPath = Join-Path $InstallDir "Start-Kuroryuu.ps1"
    $launcherContent | Out-File $launcherPath -Encoding UTF8
    Write-OK "Launcher script created"

    # Create Stop script
    $stopContent = @"
# Kuroryuu Stop Script
Write-Host "Stopping Kuroryuu services..." -ForegroundColor Cyan

foreach (`$port in @(8100, 8200)) {
    `$conn = Get-NetTCPConnection -State Listen -LocalPort `$port -ErrorAction SilentlyContinue
    if (`$conn) {
        Write-Host "  Stopping service on port `$port..." -ForegroundColor DarkGray
        Stop-Process -Id `$conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Done." -ForegroundColor Green
"@

    $stopPath = Join-Path $InstallDir "Stop-Kuroryuu.ps1"
    $stopContent | Out-File $stopPath -Encoding UTF8

    # =============================================
    # Step 6: Create Start Menu Shortcut
    # =============================================
    Write-Step "Creating shortcuts..."

    try {
        $WshShell = New-Object -ComObject WScript.Shell

        # Start Menu shortcut
        $startMenuDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
        $shortcutPath = Join-Path $startMenuDir "Kuroryuu.lnk"

        $shortcut = $WshShell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = "powershell.exe"
        $shortcut.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPath`""
        $shortcut.WorkingDirectory = $InstallDir
        $shortcut.Description = "Launch Kuroryuu - AI Agent Orchestration Platform"

        # Use desktop app icon if available
        $desktopExe = "$env:LOCALAPPDATA\Programs\Kuroryuu\Kuroryuu.exe"
        if (Test-Path $desktopExe) {
            $shortcut.IconLocation = "$desktopExe,0"
        }

        $shortcut.Save()
        Write-OK "Start Menu shortcut created"

        # Desktop shortcut (optional)
        $desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Kuroryuu.lnk"
        $shortcut2 = $WshShell.CreateShortcut($desktopShortcut)
        $shortcut2.TargetPath = "powershell.exe"
        $shortcut2.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPath`""
        $shortcut2.WorkingDirectory = $InstallDir
        $shortcut2.Description = "Launch Kuroryuu - AI Agent Orchestration Platform"
        if (Test-Path $desktopExe) {
            $shortcut2.IconLocation = "$desktopExe,0"
        }
        $shortcut2.Save()
        Write-OK "Desktop shortcut created"

    } catch {
        Write-Warn "Could not create shortcuts: $_"
    }

    # =============================================
    # Done!
    # =============================================
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
    Write-Host "  Kuroryuu installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Location:     $InstallDir" -ForegroundColor White
    Write-Host "  Launch from:  Start Menu → Kuroryuu" -ForegroundColor White
    Write-Host "                or double-click Desktop shortcut" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  For Claude Code CLI:" -ForegroundColor Cyan
    Write-Host "    1. Open terminal in $InstallDir" -ForegroundColor DarkGray
    Write-Host "    2. Run: claude" -ForegroundColor DarkGray
    Write-Host "    3. All k_* tools will be available" -ForegroundColor DarkGray
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta

    # Ask to launch now
    Write-Host ""
    $launch = Read-Host "Launch Kuroryuu now? (Y/n)"
    if ($launch -ne 'n' -and $launch -ne 'N') {
        & $launcherPath
    }
}

# Run installer
try {
    Install-Kuroryuu
} catch {
    Write-Host ""
    Write-Fail "Installation failed: $_"
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  - Ensure you have internet connection" -ForegroundColor DarkGray
    Write-Host "  - Try running as Administrator" -ForegroundColor DarkGray
    Write-Host "  - Use -EmbeddedPython flag if winget fails" -ForegroundColor DarkGray
    Write-Host "  - Check https://github.com/ahostbr/Kuroryuu/issues" -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
