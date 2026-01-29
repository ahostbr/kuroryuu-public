# Kuroryuu Stop Script
# Cleanly stops all Kuroryuu services

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "Stopping Kuroryuu services..." -ForegroundColor Cyan
Write-Host ""

$ports = @(
    @{ Port = 8100; Name = "MCP Core" },
    @{ Port = 8200; Name = "Gateway" },
    @{ Port = 7072; Name = "PTY Daemon" }
)

$stopped = 0

foreach ($svc in $ports) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $svc.Port -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "  Stopping $($svc.Name) (port $($svc.Port))..." -ForegroundColor DarkGray
        foreach ($c in $conn) {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
        $stopped++
    }
}

# Also stop any Kuroryuu desktop app
$desktopProcess = Get-Process -Name "Kuroryuu" -ErrorAction SilentlyContinue
if ($desktopProcess) {
    Write-Host "  Stopping Desktop App..." -ForegroundColor DarkGray
    $desktopProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    $stopped++
}

# Stop any electron processes from dev mode
$electronProcess = Get-Process -Name "electron" -ErrorAction SilentlyContinue
if ($electronProcess) {
    Write-Host "  Stopping Electron (dev mode)..." -ForegroundColor DarkGray
    $electronProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    $stopped++
}

Write-Host ""
if ($stopped -gt 0) {
    Write-Host "Stopped $stopped services." -ForegroundColor Green
} else {
    Write-Host "No running services found." -ForegroundColor Yellow
}
