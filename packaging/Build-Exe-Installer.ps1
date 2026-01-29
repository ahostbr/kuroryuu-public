#Requires -Version 5.1
<#
.SYNOPSIS
    Build single .exe installer using PS2EXE

.DESCRIPTION
    Converts kuroryuu-install.ps1 into a standalone .exe file that can be
    distributed and run without requiring PowerShell knowledge.

.PARAMETER NoConsole
    Create GUI-only executable (hides console window)

.PARAMETER OutputDir
    Output directory for the .exe (default: .\dist)

.EXAMPLE
    .\Build-Exe-Installer.ps1
    .\Build-Exe-Installer.ps1 -NoConsole
#>

param(
    [switch]$NoConsole,
    [string]$OutputDir = ".\dist"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$KuroVersion = "0.1.0"

function Write-Step($msg) {
    Write-Host "`n▶ $msg" -ForegroundColor Cyan
}

function Write-OK($msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function Write-Info($msg) {
    Write-Host "  → $msg" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Kuroryuu EXE Installer Builder (PS2EXE)" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta

# Check for PS2EXE module
Write-Step "Checking PS2EXE module..."

$ps2exe = Get-Module -ListAvailable -Name ps2exe
if (-not $ps2exe) {
    Write-Info "Installing PS2EXE module..."
    Install-Module -Name ps2exe -Scope CurrentUser -Force
    Import-Module ps2exe
}

Write-OK "PS2EXE module available"

# Prepare output directory
$distDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $RepoRoot $OutputDir }
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

# Source script
$sourceScript = Join-Path $ScriptDir "kuroryuu-install.ps1"
$outputExe = Join-Path $distDir "Kuroryuu-Install.exe"

if (-not (Test-Path $sourceScript)) {
    throw "Source script not found: $sourceScript"
}

# Build parameters
Write-Step "Building executable..."

$ps2exeParams = @{
    InputFile = $sourceScript
    OutputFile = $outputExe
    Title = "Kuroryuu Installer"
    Description = "Kuroryuu 1-Click Installer for Hackathon Judges"
    Company = "Kuroryuu"
    Product = "Kuroryuu"
    Version = $KuroVersion
    Copyright = "MIT License"
    RequireAdmin = $false
    SupportOS = $true
    Verbose = $false
}

if ($NoConsole) {
    $ps2exeParams.NoConsole = $true
    Write-Info "Building GUI-only executable (no console)"
} else {
    Write-Info "Building console executable"
}

# Check for icon
$iconPath = Join-Path $RepoRoot "apps\desktop\build\icon.ico"
if (Test-Path $iconPath) {
    $ps2exeParams.IconFile = $iconPath
    Write-Info "Using custom icon: $iconPath"
}

try {
    Invoke-ps2exe @ps2exeParams 2>&1 | Out-Null
    Write-OK "Executable built: $outputExe"
} catch {
    Write-Host "  ⚠ PS2EXE failed: $_" -ForegroundColor Yellow
    Write-Info "Falling back to IExpress wrapper..."

    # Create IExpress SED file as fallback
    $sedContent = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$outputExe
FriendlyName=Kuroryuu Installer
AppLaunched=powershell.exe -ExecutionPolicy Bypass -File kuroryuu-install.ps1
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[Strings]
[SourceFiles]
SourceFiles0=$ScriptDir
[SourceFiles0]
kuroryuu-install.ps1=
"@

    $sedFile = Join-Path $env:TEMP "kuroryuu-installer.sed"
    $sedContent | Out-File $sedFile -Encoding ASCII

    # Run IExpress
    Start-Process iexpress.exe -ArgumentList "/N /Q $sedFile" -Wait -NoNewWindow

    if (Test-Path $outputExe) {
        Write-OK "IExpress executable built: $outputExe"
    } else {
        throw "Failed to build executable"
    }
}

# Show results
$exeSize = [math]::Round((Get-Item $outputExe).Length / 1KB, 1)

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Executable built successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Output:  $outputExe" -ForegroundColor White
Write-Host "  Size:    $exeSize KB" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Distribution:" -ForegroundColor Cyan
Write-Host "    Judges can double-click the .exe to install" -ForegroundColor DarkGray
Write-Host "    No PowerShell knowledge required" -ForegroundColor DarkGray
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
