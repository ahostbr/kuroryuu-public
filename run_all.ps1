param(
    [string]$Backend = "lmstudio",
    [int]$McpPort = 8100,
    [int]$GatewayPort = 8200,
    [int]$StartupWaitSec = 30,
    [switch]$Visible = $false  # Default hidden, pass -Visible to show terminal windows
)

$ErrorActionPreference = "Continue"  # Changed from "Stop" - Python logs to stderr which PS treats as errors
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Window style based on -Visible flag
$WindowStyle = if ($Visible) { "Normal" } else { "Hidden" }

function Write-Status($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }

Write-Host ""
Write-Host "" -ForegroundColor Magenta
Write-Host "              KURORYUU STACK LAUNCHER                         " -ForegroundColor Magenta
Write-Host "" -ForegroundColor Magenta
Write-Host ""

$Python = "python"
$VenvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$McpVenvPython = Join-Path $RepoRoot ".venv_mcp312\Scripts\python.exe"

# MCP needs Python 3.12, use dedicated venv
$McpPython = $McpVenvPython
if (-not (Test-Path $McpPython)) {
    # Try py launcher for Python 3.12
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        $version = & py -3.12 --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Warn "Using py -3.12 launcher (venv not found)"
            $McpPython = "py"
        }
    }
    if (-not (Test-Path $McpPython) -and $McpPython -ne "py") {
        Write-Host "ERROR: Python 3.12 venv not found at $McpVenvPython" -ForegroundColor Red
        Write-Host "Run: .\scripts\setup-project.ps1 to create it" -ForegroundColor Yellow
        exit 1
    }
}

if (Test-Path $VenvPython) {
    $Python = $VenvPython
    Write-Status "Using main venv: $VenvPython"
} else {
    # Try system Python from PATH
    $systemPython = Get-Command python -ErrorAction SilentlyContinue
    if ($systemPython) {
        $Python = $systemPython.Source
        Write-Status "Using system Python: $Python"
    } else {
        Write-Warn "No venv found, using 'python' from PATH"
    }
}

Write-Status "Using MCP Python 3.12: $McpPython"

$env:KURORYUU_LLM_BACKEND = $Backend
$env:KURORYUU_MCP_URL = "http://127.0.0.1:$McpPort"
$env:KURORYUU_GATEWAY_PORT = $GatewayPort
$env:KURORYUU_PROJECT_ROOT = $RepoRoot

Write-Status "Configuration:"
Write-Host "  Backend:     $Backend"
Write-Host "  MCP Port:    $McpPort"
Write-Host "  Gateway:     $GatewayPort"
Write-Host "  Project:     $RepoRoot"
Write-Host ""

Write-Status "Checking ports..."
# NOTE: Exclude PTY daemon port 7072 - daemon should survive restarts
foreach ($port in @($McpPort, $GatewayPort)) {
    $existing = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Warn "  Port $port in use, attempting to free..."
        $existing | ForEach-Object {
            $procId = $_.OwningProcess
            # Kill children first (e.g. uvicorn worker)
            Get-CimInstance Win32_Process -Filter "ParentProcessId = $procId" -ErrorAction SilentlyContinue | ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
            # Kill parent if it's a python process (e.g. uvicorn master)
            $procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
            if ($procInfo -and $procInfo.ParentProcessId) {
                $parentProc = Get-Process -Id $procInfo.ParentProcessId -ErrorAction SilentlyContinue
                if ($parentProc -and $parentProc.ProcessName -eq "python") {
                    Stop-Process -Id $parentProc.Id -Force -ErrorAction SilentlyContinue
                }
            }
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 500
    }
}

Write-Status "Starting MCP_CORE on port $McpPort..."
$McpScript = Join-Path $RepoRoot "apps\mcp_core\run.ps1"
# Pass Python path via environment variable (more reliable than command-line args)
$env:KURORYUU_MCP_PYTHON = $McpPython
$McpArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$McpScript`" -Port $McpPort"
$McpProcess = Start-Process -FilePath "powershell" -ArgumentList $McpArgs -WorkingDirectory $RepoRoot -PassThru -WindowStyle $WindowStyle

Write-Host "  MCP_CORE PID: $($McpProcess.Id)"

Write-Status "Waiting for MCP_CORE..."
$maxWait = $StartupWaitSec
$waited = 0
while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 1
    $waited++
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$McpPort/health" -TimeoutSec 2 -ErrorAction Stop
        if ($health.ok) {
            $secStr = $waited.ToString() + " sec"
            Write-Success "  MCP_CORE ready! ($secStr)"
            break
        }
    } catch {
        $waitMsg = $waited.ToString() + "/" + $maxWait.ToString()
        Write-Host "  ... waiting ($waitMsg)" -ForegroundColor DarkGray
    }
}

if ($waited -ge $maxWait) {
    Write-Warn "  MCP_CORE may not be ready (proceeding anyway)"
}

Write-Status "Starting Gateway on port $GatewayPort..."
$GatewayScript = Join-Path $RepoRoot "apps\gateway\run.ps1"
# Python path already in env:KURORYUU_MCP_PYTHON
$GatewayArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$GatewayScript`" -Backend $Backend -Port $GatewayPort"
$GatewayProcess = Start-Process -FilePath "powershell" -ArgumentList $GatewayArgs -WorkingDirectory $RepoRoot -PassThru -WindowStyle $WindowStyle

Write-Host "  Gateway PID: $($GatewayProcess.Id)"

Write-Status "Waiting for Gateway..."
$maxWait = $StartupWaitSec
$waited = 0
while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 1
    $waited++
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$GatewayPort/v1/health" -TimeoutSec 2 -ErrorAction Stop
        if ($health.ok) {
            $secStr = $waited.ToString() + " sec"
            Write-Success "  Gateway ready! ($secStr)"
            break
        }
    } catch {
        $waitMsg = $waited.ToString() + "/" + $maxWait.ToString()
        Write-Host "  ... waiting ($waitMsg)" -ForegroundColor DarkGray
    }
}

Write-Host ""

# Start PTY Daemon (only if not already running - daemon survives restarts)
$ptyDaemonRunning = Get-NetTCPConnection -State Listen -LocalPort 7072 -ErrorAction SilentlyContinue
if ($ptyDaemonRunning) {
    Write-Success "PTY Daemon already running on port 7072 (terminals will reconnect)"
    $PtyDaemonProcess = $null
} else {
    Write-Status "Starting PTY Daemon on port 7072..."
    $PtyDaemonDir = Join-Path $RepoRoot "apps\pty_daemon"
    $PtyDaemonProcess = Start-Process -FilePath "powershell" -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command", "cd '$PtyDaemonDir'; npm start"
    ) -WorkingDirectory $PtyDaemonDir -PassThru -WindowStyle $WindowStyle
    Write-Host "  PTY Daemon PID: $($PtyDaemonProcess.Id)"
}

Write-Host ""
Write-Host "" -ForegroundColor Green
Write-Success "  Kuroryuu Stack Running!"
Write-Host ""
Write-Host "  MCP_CORE:    http://127.0.0.1:$McpPort/health"
Write-Host "  Gateway:     http://127.0.0.1:$GatewayPort/v1/health"
Write-Host "  PTY Daemon:  127.0.0.1:7072"
Write-Host ""

# Tunnel Proxy disabled for local development
# To enable for production: uncomment the following section
# Write-Status "Starting Tunnel Proxy on port 8199..."
# $TunnelProxyScript = Join-Path $RepoRoot "apps\gateway\tunnel_proxy.py"
# $TunnelProxyProcess = Start-Process -FilePath $McpPython -ArgumentList @(
#     $TunnelProxyScript
# ) -WorkingDirectory $RepoRoot -PassThru -WindowStyle $WindowStyle
# Write-Host "  Tunnel Proxy PID: $($TunnelProxyProcess.Id)"
# Write-Host "  Public URL: https://chat.shadows-and-shurikens.com"
# Write-Host ""

# Build and Start Desktop App
Write-Status "Building Desktop App..."
$DesktopDir = Join-Path $RepoRoot "apps\desktop"

# Run full build first (inline so output is visible)
Push-Location $DesktopDir
try {
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Write-Success "  Desktop build complete!"
    } else {
        Write-Warn "  Desktop build had issues (exit code: $LASTEXITCODE)"
    }
} finally {
    Pop-Location
}

Write-Status "Starting Desktop App in dev mode..."
$DesktopProcess = Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", "cd '$DesktopDir'; npm run dev"
) -WorkingDirectory $DesktopDir -PassThru -WindowStyle $WindowStyle
Write-Host "  Desktop PID: $($DesktopProcess.Id)"

# Tray Companion - NOT auto-started here
# Use Desktop Settings > Integrations > "Launch on startup" to enable auto-launch
# Or click "Tray Companion" in the Desktop sidebar to launch manually
Write-Status "Tray Companion: Controlled by Desktop Settings (not auto-started)"
Write-Host ""

Write-Warn "Press Ctrl+C to stop all services"
Write-Host ""

try {
    # Track service status to avoid spamming repeated messages
    $mcpWasDown = $false
    $gatewayWasDown = $false
    $ptyWasDown = $false

    while ($true) {
        Start-Sleep -Seconds 10

        # Check MCP health by port
        $mcpUp = $null -ne (Get-NetTCPConnection -State Listen -LocalPort $McpPort -ErrorAction SilentlyContinue)
        if (-not $mcpUp -and -not $mcpWasDown) {
            Write-Warn "MCP_CORE has stopped (port $McpPort)"
            $mcpWasDown = $true
        } elseif ($mcpUp -and $mcpWasDown) {
            Write-Success "MCP_CORE recovered"
            $mcpWasDown = $false
        }

        # Check Gateway health by port
        $gatewayUp = $null -ne (Get-NetTCPConnection -State Listen -LocalPort $GatewayPort -ErrorAction SilentlyContinue)
        if (-not $gatewayUp -and -not $gatewayWasDown) {
            Write-Warn "Gateway has stopped (port $GatewayPort)"
            $gatewayWasDown = $true
        } elseif ($gatewayUp -and $gatewayWasDown) {
            Write-Success "Gateway recovered"
            $gatewayWasDown = $false
        }

        # Check PTY Daemon by port
        $ptyUp = $null -ne (Get-NetTCPConnection -State Listen -LocalPort 7072 -ErrorAction SilentlyContinue)
        if (-not $ptyUp -and -not $ptyWasDown) {
            Write-Warn "PTY Daemon has stopped (port 7072)"
            $ptyWasDown = $true
        } elseif ($ptyUp -and $ptyWasDown) {
            Write-Success "PTY Daemon recovered"
            $ptyWasDown = $false
        }

        # Exit if all core services are down
        if (-not $mcpUp -and -not $gatewayUp) {
            Write-Host "Core services stopped. Exiting..."
            break
        }
    }
} finally {
    Write-Status "Shutting down..."

    # Kill processes on ports (more reliable than tracking wrapper PIDs)
    foreach ($port in @($McpPort, $GatewayPort)) {
        $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
        if ($conn) {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }

    # Kill wrapper processes if still running
    if ($McpProcess -and -not $McpProcess.HasExited) {
        Stop-Process -Id $McpProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($GatewayProcess -and -not $GatewayProcess.HasExited) {
        Stop-Process -Id $GatewayProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($DesktopProcess -and -not $DesktopProcess.HasExited) {
        Stop-Process -Id $DesktopProcess.Id -Force -ErrorAction SilentlyContinue
    }
    # Tray Companion cleanup handled by Desktop app or user closing it

    # NOTE: Don't kill PTY daemon on Ctrl+C - it should survive restarts
    # Use kill_all.ps1 to stop the daemon

    # Kill any lingering Electron processes
    Get-Process -Name electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    Write-Success "Done."
}
