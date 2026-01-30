# Kuroryuu Gateway Run Script
# Usage: .\run.ps1 [-Backend lmstudio|claude] [-Python path]

param(
    [string]$Backend = "lmstudio",
    [string]$Python = "",
    [int]$Port = 8200
)

$ErrorActionPreference = "Continue"  # uvicorn logs to stderr
$RepoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName

# ALWAYS detect Python from project venv (most reliable for portability)
$LocalMcpPython = Join-Path $RepoRoot ".venv_mcp312\Scripts\python.exe"
if (Test-Path $LocalMcpPython) {
    $Python = $LocalMcpPython
    Write-Host "Using venv Python: $Python" -ForegroundColor Green
} else {
    Write-Host "ERROR: Python venv not found at: $LocalMcpPython" -ForegroundColor Red
    Write-Host "Run: .\scripts\setup-project.ps1 to create it" -ForegroundColor Yellow
    exit 1
}

# Set environment
$env:KURORYUU_LLM_BACKEND = $Backend
$env:KURORYUU_GATEWAY_PORT = $Port
$env:KURORYUU_MCP_URL = "http://127.0.0.1:8100"
$env:KURORYUU_PROJECT_ROOT = $RepoRoot
$env:PYTHONPATH = $RepoRoot
# Internal secret - shared between gateway and mcp_core (auto-generated, persisted)
$secretFile = Join-Path $RepoRoot "ai\.internal_secret"
if (Test-Path $secretFile) {
    $env:KURORYUU_INTERNAL_SECRET = (Get-Content $secretFile -Raw).Trim()
} else {
    # Generate once, save for both services
    $env:KURORYUU_INTERNAL_SECRET = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
    # Ensure ai directory exists
    $aiDir = Join-Path $RepoRoot "ai"
    if (-not (Test-Path $aiDir)) { New-Item -ItemType Directory -Path $aiDir -Force | Out-Null }
    # Write without BOM (compatible with all PowerShell versions)
    [System.IO.File]::WriteAllText($secretFile, $env:KURORYUU_INTERNAL_SECRET)
}

Write-Host "=== Kuroryuu Gateway ===" -ForegroundColor Cyan
Write-Host "  Backend: $Backend"
Write-Host "  Port: $Port"
Write-Host "  MCP: $env:KURORYUU_MCP_URL"
Write-Host "  Python: $Python"
Write-Host "  Root: $RepoRoot"
Write-Host ""

# Change to repo root (so imports work) and run server
Set-Location $RepoRoot
& $Python -m uvicorn apps.gateway.server:app --host 127.0.0.1 --port $Port
