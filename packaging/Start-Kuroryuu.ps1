# Kuroryuu Combined Launcher
# Starts all backend services and launches the desktop app
# Can be used standalone after installation

param(
    [switch]$NoDesktop,       # Don't launch desktop app
    [switch]$Visible,         # Show service terminal windows
    [string]$KuroDir = ""     # Override installation directory
)

$ErrorActionPreference = "Continue"

# Detect installation directory
if (-not $KuroDir) {
    # Check common locations
    $possibleDirs = @(
        $env:KURORYUU_PROJECT_ROOT,
        "$env:LOCALAPPDATA\Kuroryuu",
        (Split-Path -Parent $MyInvocation.MyCommand.Path),
        (Get-Location).Path
    )

    foreach ($dir in $possibleDirs) {
        if ($dir -and (Test-Path (Join-Path $dir "apps\mcp_core\server.py"))) {
            $KuroDir = $dir
            break
        }
    }
}

if (-not $KuroDir -or -not (Test-Path $KuroDir)) {
    Write-Host "Error: Cannot find Kuroryuu installation" -ForegroundColor Red
    Write-Host "Please specify the installation directory with -KuroDir" -ForegroundColor Yellow
    exit 1
}

# Detect Python
$venvPython = Join-Path $KuroDir ".venv\Scripts\python.exe"
$mcpPython = Join-Path $KuroDir ".venv_mcp312\Scripts\python.exe"
$embeddedPython = Join-Path $KuroDir "python\python.exe"

$python = $null
foreach ($p in @($mcpPython, $venvPython, $embeddedPython, "python")) {
    if (Test-Path $p -ErrorAction SilentlyContinue) {
        $python = $p
        break
    }
    if ($p -eq "python") {
        $python = $p  # Use system Python as fallback
    }
}

# Set environment
$env:KURORYUU_PROJECT_ROOT = $KuroDir
$env:KURORYUU_MCP_URL = "http://127.0.0.1:8100"
$env:KURORYUU_GATEWAY_PORT = "8200"
$env:KURORYUU_MCP_PORT = "8100"
$env:PYTHONPATH = $KuroDir

$WindowStyle = if ($Visible) { "Normal" } else { "Hidden" }

Write-Host ""
Write-Host "  KURORYUU LAUNCHER" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Project: $KuroDir" -ForegroundColor DarkGray
Write-Host "  Python:  $python" -ForegroundColor DarkGray
Write-Host ""

# Function to check port
function Test-Port($port) {
    $null -ne (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

# Kill any existing services on our ports
Write-Host "Checking ports..." -ForegroundColor Cyan
foreach ($port in @(8100, 8200)) {
    $existing = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "  Freeing port $port..." -ForegroundColor Yellow
        $existing | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Milliseconds 500
    }
}

# Start MCP Core (port 8100)
Write-Host "Starting MCP Core (port 8100)..." -ForegroundColor Cyan
$mcpDir = Join-Path $KuroDir "apps\mcp_core"
$mcpScript = Join-Path $mcpDir "server.py"

$env:KURORYUU_CHECKPOINT_ROOT = Join-Path $KuroDir "ai\checkpoints"
$env:KURORYUU_RAG_INDEX_DIR = Join-Path $KuroDir "ai\rag_index"

Start-Process $python -ArgumentList "-B $mcpScript" -WorkingDirectory $mcpDir -WindowStyle $WindowStyle

# Wait for MCP to be ready
$waited = 0
while ($waited -lt 20) {
    if (Test-Port 8100) {
        Write-Host "  MCP Core ready" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
    $waited++
    if ($waited % 5 -eq 0) {
        Write-Host "  Waiting for MCP Core... ($waited sec)" -ForegroundColor DarkGray
    }
}

if (-not (Test-Port 8100)) {
    Write-Host "  Warning: MCP Core may not be ready" -ForegroundColor Yellow
}

# Start Gateway (port 8200)
Write-Host "Starting Gateway (port 8200)..." -ForegroundColor Cyan

Start-Process $python -ArgumentList "-m uvicorn apps.gateway.server:app --host 127.0.0.1 --port 8200" -WorkingDirectory $KuroDir -WindowStyle $WindowStyle

# Wait for Gateway
$waited = 0
while ($waited -lt 15) {
    if (Test-Port 8200) {
        Write-Host "  Gateway ready" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
    $waited++
}

if (-not (Test-Port 8200)) {
    Write-Host "  Warning: Gateway may not be ready" -ForegroundColor Yellow
}

# Launch Desktop App
if (-not $NoDesktop) {
    $desktopExe = "$env:LOCALAPPDATA\Programs\Kuroryuu\Kuroryuu.exe"
    if (Test-Path $desktopExe) {
        Write-Host "Launching Desktop App..." -ForegroundColor Cyan
        Start-Process $desktopExe
    } else {
        Write-Host "Desktop app not installed (services running)" -ForegroundColor Yellow
    }
}

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Kuroryuu is running!" -ForegroundColor Green
Write-Host ""
Write-Host "  MCP Core:  http://127.0.0.1:8100/health" -ForegroundColor White
Write-Host "  Gateway:   http://127.0.0.1:8200/v1/health" -ForegroundColor White
Write-Host ""
Write-Host "  To use with Claude Code:" -ForegroundColor Cyan
Write-Host "    cd $KuroDir" -ForegroundColor DarkGray
Write-Host "    claude" -ForegroundColor DarkGray
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
