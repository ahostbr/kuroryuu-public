# Setup Kuroryuu CLI for global access
# Run this once: .\setup-cli.ps1

# Get project root from script location (scripts/ -> Kuroryuu)
$KuroryuuPath = (Resolve-Path "$PSScriptRoot\..").Path

Write-Host ""
Write-Host "  Kuroryuu CLI Setup" -ForegroundColor Cyan
Write-Host "  ==================" -ForegroundColor Cyan
Write-Host ""

# Option 1: Add to User PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$KuroryuuPath*") {
    Write-Host "Adding $KuroryuuPath to User PATH..." -ForegroundColor Yellow
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$KuroryuuPath", "User")
    Write-Host "  Done! PATH updated." -ForegroundColor Green
} else {
    Write-Host "  $KuroryuuPath already in PATH" -ForegroundColor Green
}

# Option 2: Add function to PowerShell profile
$profilePath = $PROFILE.CurrentUserAllHosts
$functionDef = @"

# Kuroryuu CLI
function kuroryuu-cli {
    Push-Location "$KuroryuuPath"
    try {
        python -m apps.kuroryuu_cli `$args
    } finally {
        Pop-Location
    }
}
Set-Alias -Name kuro -Value kuroryuu-cli
"@

# Check if profile exists
if (-not (Test-Path $profilePath)) {
    Write-Host "Creating PowerShell profile at $profilePath..." -ForegroundColor Yellow
    New-Item -Path $profilePath -ItemType File -Force | Out-Null
}

# Check if OLD lmstudio-cli function exists and remove it
$profileContent = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
if ($profileContent -like "*function lmstudio-cli*") {
    Write-Host "Removing old lmstudio-cli function from profile..." -ForegroundColor Yellow
    # Remove old function block (simple approach: just notify user)
    Write-Host "  NOTE: Please manually remove 'function lmstudio-cli' from:" -ForegroundColor Yellow
    Write-Host "        $profilePath" -ForegroundColor DarkGray
    Write-Host ""
}

# Check if kuroryuu-cli function already exists in profile
if ($profileContent -notlike "*function kuroryuu-cli*") {
    Write-Host "Adding kuroryuu-cli function to PowerShell profile..." -ForegroundColor Yellow
    Add-Content -Path $profilePath -Value $functionDef
    Write-Host "  Done! Function added." -ForegroundColor Green
} else {
    Write-Host "  kuroryuu-cli function already in profile" -ForegroundColor Green
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Usage (after restarting PowerShell):" -ForegroundColor Cyan
Write-Host ""
Write-Host "  kuroryuu-cli              # Start in auto mode"
Write-Host "  kuroryuu-cli --role leader"
Write-Host "  kuroryuu-cli --role worker"
Write-Host "  kuro                      # Alias for kuroryuu-cli"
Write-Host ""
Write-Host "Useful commands once running:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  /help       Show all commands"
Write-Host "  /context    Show context usage"
Write-Host "  /doctor     Check system health"
Write-Host "  /model      Switch LLM model"
Write-Host ""
Write-Host "Restart PowerShell to apply changes." -ForegroundColor Yellow
Write-Host ""
