<#
.SYNOPSIS
    Launch Kuroryuu MCP_CORE server.

.DESCRIPTION
    Starts the MCP tool server with configurable host, port, and environment.

.PARAMETER Host
    Host to bind to (default: 127.0.0.1)

.PARAMETER Port
    Port to listen on (default: 8000)

.PARAMETER Python
    Python executable path (default: python)

.PARAMETER ProjectRoot
    Kuroryuu project root (default: script's grandparent)

.EXAMPLE
    .\run.ps1
    .\run.ps1 -Port 8080
    .\run.ps1 -Python "<PROJECT_ROOT>\.venv\Scripts\python.exe"
#>

param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8100,
    [string]$Python = "",
    [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

# Resolve paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppsDir = Split-Path -Parent $ScriptDir
$RepoRoot = Split-Path -Parent $AppsDir

if (-not $ProjectRoot) {
    $ProjectRoot = $RepoRoot
}

# ALWAYS detect Python from project venv (most reliable for portability)
# Ignore parameter - derive from script location
$VenvPython = Join-Path $ProjectRoot ".venv_mcp312\Scripts\python.exe"
if (Test-Path $VenvPython) {
    $Python = $VenvPython
    Write-Host "Using venv Python: $Python" -ForegroundColor Green
} else {
    Write-Host "ERROR: Python venv not found at: $VenvPython" -ForegroundColor Red
    Write-Host "Run: .\scripts\setup-project.ps1 to create it" -ForegroundColor Yellow
    exit 1
}

# Set environment variables
$env:KURORYUU_PROJECT_ROOT = $ProjectRoot
$env:KURORYUU_MCP_HOST = $BindHost
$env:KURORYUU_MCP_PORT = $Port
# Override no longer needed - code default is now ai/inbox
$env:KURORYUU_CHECKPOINT_ROOT = Join-Path $ProjectRoot "ai\checkpoints"
$env:KURORYUU_RAG_INDEX_DIR = Join-Path $ProjectRoot "ai\rag_index"
$env:KURORYUU_INTERNAL_SECRET = "216316ac3a491e1a019bd0671f3877ebe98c8dc16dccdf801d47a5d4ce706dfc"

Write-Host "=== Kuroryuu MCP_CORE ===" -ForegroundColor Cyan
Write-Host "Project Root: $ProjectRoot"
Write-Host "Host: $BindHost"
Write-Host "Port: $Port"
Write-Host "Python: $Python"
Write-Host ""

# Ensure ai directories exist
$WorkingDirs = @(
    (Join-Path $ProjectRoot "ai"),
    (Join-Path $ProjectRoot "ai\inbox"),
    (Join-Path $ProjectRoot "ai\checkpoints"),
    (Join-Path $ProjectRoot "ai\rag_index")
)

foreach ($dir in $WorkingDirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "Created: $dir" -ForegroundColor DarkGray
    }
}

# Change to script directory
Push-Location $ScriptDir

try {
    # Run via python script directly (more reliable path handling than -m uvicorn)
    Write-Host "Starting server..." -ForegroundColor Green
    $LogFile = Join-Path $RepoRoot "apps\mcp_core\startup.log"
    # Use Continue for this section - uvicorn writes INFO to stderr which PowerShell treats as error
    $ErrorActionPreference = "Continue"
    # -B flag disables pycache to ensure fresh code is always loaded
    & $Python -B server.py 2>&1 | Tee-Object -FilePath $LogFile
}
finally {
    if ($LastExitCode -ne 0) {
        Write-Host "Server exited with code $LastExitCode" -ForegroundColor Yellow
        Read-Host "Press Enter to close..."
    }
    Pop-Location
}
