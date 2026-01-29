# Migrate CLIProxyAPI from global %APPDATA% to project-local .cliproxyapi/
#
# This script:
# 1. Copies the binary from global to local
# 2. Copies auth files (OAuth tokens)
# 3. Updates config.yaml to use relative paths
#
# Run from project root:
#   powershell -ExecutionPolicy Bypass -File apps/desktop/scripts/migrate-cliproxy-to-local.ps1

$ErrorActionPreference = "Stop"

# Determine project root
$root = $env:KURORYUU_PROJECT_ROOT
if (-not $root) {
    $root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
}

$globalDir = "$env:APPDATA\Kuroryuu\cliproxyapi"
$localDir = "$root\.cliproxyapi"

Write-Host "=== CLIProxyAPI Migration Script ===" -ForegroundColor Cyan
Write-Host "From: $globalDir"
Write-Host "To:   $localDir"
Write-Host ""

# Check if global directory exists
if (-not (Test-Path $globalDir)) {
    Write-Host "[INFO] No global CLIProxyAPI directory found at $globalDir" -ForegroundColor Yellow
    Write-Host "[INFO] Nothing to migrate. The project-local directory will be used for new installations." -ForegroundColor Yellow
    exit 0
}

# Create local directory structure
Write-Host "[1/4] Creating local directory structure..." -ForegroundColor Green
New-Item -ItemType Directory -Force -Path "$localDir\auth" | Out-Null

# Copy binary
if (Test-Path "$globalDir\CLIProxyAPIPlus.exe") {
    Write-Host "[2/4] Copying binary..." -ForegroundColor Green
    Copy-Item "$globalDir\CLIProxyAPIPlus.exe" "$localDir\" -Force
    Write-Host "      Copied: CLIProxyAPIPlus.exe"
} else {
    Write-Host "[2/4] No binary found in global directory (will be downloaded on first use)" -ForegroundColor Yellow
}

# Copy auth files
$authFiles = Get-ChildItem "$globalDir\auth\*.json" -ErrorAction SilentlyContinue
if ($authFiles) {
    Write-Host "[3/4] Copying auth files..." -ForegroundColor Green
    foreach ($file in $authFiles) {
        Copy-Item $file.FullName "$localDir\auth\" -Force
        Write-Host "      Copied: $($file.Name)"
    }
} else {
    Write-Host "[3/4] No auth files found (OAuth login required after migration)" -ForegroundColor Yellow
}

# Create/update config.yaml with relative path
Write-Host "[4/4] Creating config.yaml with relative paths..." -ForegroundColor Green
$configContent = @"
# CLIProxyAPIPlus Config for Kuroryuu (Native Mode)
# Migrated from global to project-local
# Auth directory uses relative path for portability

host: ""
port: 8317
auth-dir: "./auth"
auth_token: "kuroryuu-local"

gemini_callback_port: 8085
claude_callback_port: 54545
openai_callback_port: 1455
copilot_callback_port: 54546
kiro_callback_port: 54547
antigravity_callback_port: 51121
"@
$configContent | Set-Content "$localDir\config.yaml" -Encoding UTF8

Write-Host ""
Write-Host "=== Migration Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Verify binary works: .\.cliproxyapi\CLIProxyAPIPlus.exe -version"
Write-Host "  2. Start Kuroryuu Desktop and check Settings > CLI Proxy"
Write-Host "  3. (Optional) Delete global directory: Remove-Item -Recurse `"$globalDir`""
Write-Host ""
