<#
.SYNOPSIS
    Continuous multi-monitor screenshot loop for Kuroryuu agents.
.DESCRIPTION
    Captures all monitors every N seconds to fixed filenames.
    Agents can read mon0.jpg, mon1.jpg etc. knowing they're always current.
.PARAMETER Interval
    Seconds between captures (default: 5)
.PARAMETER OutputDir
    Directory for screenshots (default: WORKING/screenshots)
.PARAMETER StopFile
    File to check for graceful shutdown (default: WORKING/.stop_screenshot_loop)
.EXAMPLE
    .\screenshot_loop.ps1 -Interval 3
    # Captures every 3 seconds
.EXAMPLE
    .\screenshot_loop.ps1 -Interval 10 -OutputDir "C:\Screenshots"
    # Captures every 10 seconds to custom directory
#>
# Get project root from env or script location
$projectRoot = if ($env:KURORYUU_PROJECT_ROOT) { $env:KURORYUU_PROJECT_ROOT } else { Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }

param(
    [int]$Interval = 5,
    [string]$OutputDir = (Join-Path $projectRoot "WORKING\screenshots"),
    [string]$StopFile = (Join-Path $projectRoot "WORKING\.stop_screenshot_loop")
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Remove stop file if exists from previous run
if (Test-Path $StopFile) {
    Remove-Item $StopFile -Force
}

Write-Host "Screenshot loop started. Interval: ${Interval}s. Output: $OutputDir" -ForegroundColor Cyan
Write-Host "Create '$StopFile' to stop gracefully, or Ctrl+C / kill the process." -ForegroundColor Yellow

$iteration = 0
while ($true) {
    # Check for stop file
    if (Test-Path $StopFile) {
        Write-Host "Stop file detected. Exiting gracefully." -ForegroundColor Green
        Remove-Item $StopFile -Force
        break
    }

    $iteration++
    $screens = [System.Windows.Forms.Screen]::AllScreens

    for ($i = 0; $i -lt $screens.Count; $i++) {
        $screen = $screens[$i]
        $bounds = $screen.Bounds

        try {
            $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)

            # Save as JPEG for smaller file size
            $path = Join-Path $OutputDir "mon${i}.jpg"
            $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)

            $graphics.Dispose()
            $bitmap.Dispose()
        }
        catch {
            Write-Host "Error capturing monitor $i : $_" -ForegroundColor Red
        }
    }

    $timestamp = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$timestamp] Captured $($screens.Count) monitor(s) - iteration $iteration"

    Start-Sleep -Seconds $Interval
}

Write-Host "Screenshot loop ended after $iteration iterations." -ForegroundColor Cyan
