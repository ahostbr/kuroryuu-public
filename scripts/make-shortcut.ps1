$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$s = $ws.CreateShortcut("$desktop\Claude Bypass.lnk")
$s.TargetPath = "cmd.exe"
$s.Arguments = "/k claude --dangerously-skip-permissions"
$root = (Resolve-Path "$PSScriptRoot\..").Path
$s.WorkingDirectory = $root
$s.Description = "Claude CLI with skip permissions from Kuroryuu root"
$s.Save()
Write-Host "Shortcut created on Desktop: $desktop\Claude Bypass.lnk"
Write-Host "Right-click it -> 'Show more options' -> 'Pin to taskbar'"
