param(
    [int]$Monitor = -1  # -1 = all monitors (virtual screen), 0+ = specific monitor
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if ($Monitor -eq -1) {
    # Capture all monitors (virtual screen)
    $left = [System.Windows.Forms.SystemInformation]::VirtualScreen.Left
    $top = [System.Windows.Forms.SystemInformation]::VirtualScreen.Top
    $width = [System.Windows.Forms.SystemInformation]::VirtualScreen.Width
    $height = [System.Windows.Forms.SystemInformation]::VirtualScreen.Height
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($left, $top, 0, 0, $bitmap.Size)
} else {
    # Capture specific monitor
    $screens = [System.Windows.Forms.Screen]::AllScreens
    if ($Monitor -ge $screens.Count) {
        Write-Error "Monitor $Monitor not found. Available: 0-$($screens.Count - 1)"
        exit 1
    }
    $screen = $screens[$Monitor].Bounds
    $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
}

# Get project root from script location (scripts/ -> Kuroryuu)
$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$outputPath = Join-Path $projectRoot "WORKING\screenshot.png"
$bitmap.Save($outputPath)
$graphics.Dispose()
$bitmap.Dispose()
Write-Host "Screenshot saved to: $outputPath"
