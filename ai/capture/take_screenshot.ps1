Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
# Get project root from env or current location
$projectRoot = if ($env:KURORYUU_PROJECT_ROOT) { $env:KURORYUU_PROJECT_ROOT } else { (Get-Location).Path }
$screenshotDir = Join-Path $projectRoot "WORKING\screenshots"
if (-not (Test-Path $screenshotDir)) { New-Item -ItemType Directory -Path $screenshotDir -Force | Out-Null }
$path = Join-Path $screenshotDir "worker_$timestamp.png"
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bitmap.Save($path)
Write-Output $path
