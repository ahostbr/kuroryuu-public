param(
    [int]$McpPort = 8100,
    [int]$GatewayPort = 8200,
    [int]$PtyDaemonPort = 7072,
    [switch]$Quiet
)

$ErrorActionPreference = "Continue"

function Write-Status($msg) { if (-not $Quiet) { Write-Host $msg -ForegroundColor Cyan } }
function Write-Success($msg) { if (-not $Quiet) { Write-Host $msg -ForegroundColor Green } }
function Write-Warn($msg) { if (-not $Quiet) { Write-Host $msg -ForegroundColor Yellow } }

if (-not $Quiet) {
    Write-Host ""
    Write-Host "              KURORYUU STACK KILLER                           " -ForegroundColor Red
    Write-Host ""
}

$killed = 0

# Kill processes on specific ports
Write-Status "Checking ports..."
foreach ($port in @($McpPort, $GatewayPort, $PtyDaemonPort)) {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Warn "  Killing $($proc.ProcessName) (PID: $($proc.Id)) on port $port"
                # Kill children first (e.g. uvicorn worker spawned by parent)
                Get-CimInstance Win32_Process -Filter "ParentProcessId = $($proc.Id)" -ErrorAction SilentlyContinue | ForEach-Object {
                    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
                }
                # Kill parent that spawned the listener (e.g. uvicorn master)
                $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction SilentlyContinue
                if ($parent -and $parent.ParentProcessId) {
                    $parentProc = Get-Process -Id $parent.ParentProcessId -ErrorAction SilentlyContinue
                    if ($parentProc -and $parentProc.ProcessName -eq "python") {
                        Write-Warn "  Killing parent $($parentProc.ProcessName) (PID: $($parentProc.Id))"
                        Stop-Process -Id $parentProc.Id -Force -ErrorAction SilentlyContinue
                        $killed++
                    }
                }
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                $killed++
            }
        }
    }
}

# Kill Electron/Kuroryuu desktop processes
Write-Status "Checking Electron processes..."
$electronProcs = Get-Process -Name electron -ErrorAction SilentlyContinue
if ($electronProcs) {
    foreach ($proc in $electronProcs) {
        # Check if it's Kuroryuu-related by checking window title or command line
        Write-Warn "  Killing Electron (PID: $($proc.Id))"
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        $killed++
    }
}

# Kill node processes that might be from npm run dev
Write-Status "Checking Node processes..."
$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
    # Try to identify Kuroryuu-related node processes
    $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    $cmdLine -match "kuroryuu|vite|desktop|pty_daemon"
}
if ($nodeProcs) {
    foreach ($proc in $nodeProcs) {
        Write-Warn "  Killing Node (PID: $($proc.Id))"
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        $killed++
    }
}

# Kill Python uvicorn processes for gateway/mcp
Write-Status "Checking Python processes..."
$pythonProcs = Get-Process -Name python, python3, pythonw -ErrorAction SilentlyContinue | Where-Object {
    $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    $cmdLine -match "uvicorn|gateway|mcp_core|kuroryuu|server\.py"
}
if ($pythonProcs) {
    foreach ($proc in $pythonProcs) {
        Write-Warn "  Killing Python (PID: $($proc.Id))"
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        $killed++
    }
}

# Kill any powershell windows running run.ps1 scripts
Write-Status "Checking PowerShell child processes..."
$psProcs = Get-Process -Name powershell, pwsh -ErrorAction SilentlyContinue | Where-Object {
    $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    $cmdLine -match "run\.ps1.*-Port|apps\\gateway|apps\\mcp_core|apps\\pty_daemon|npm run dev"
}
if ($psProcs) {
    foreach ($proc in $psProcs) {
        Write-Warn "  Killing PowerShell (PID: $($proc.Id))"
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        $killed++
    }
}

# Final port check
Start-Sleep -Milliseconds 500
Write-Status "Verifying ports are free..."
$stillInUse = @()
foreach ($port in @($McpPort, $GatewayPort, $PtyDaemonPort)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        $stillInUse += $port
    }
}

if ($stillInUse.Count -gt 0) {
    Write-Warn "Ports still in use: $($stillInUse -join ', ')"
    Write-Warn "You may need to wait a moment or run again"
} else {
    Write-Success "  All ports freed"
}

Write-Host ""
if ($killed -gt 0) {
    Write-Success "Killed $killed process(es)"
} else {
    Write-Success "No Kuroryuu processes found running"
}
Write-Host ""
