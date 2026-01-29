# Self-compact script for Claude
# Run this, then STOP WORKING within 5 seconds!
# The script will send /compact to the specified coordinates

param(
    [int]$X = -500,  # Default: right terminal on monitor 1 (left monitor in negative coords)
    [int]$Y = 680,
    [switch]$Verbose
)

if ($Verbose) {
    Write-Host "Starting self-compact in 5 seconds..."
    Write-Host "STOP WORKING NOW so /compact runs as a command!"
    Write-Host ""
}

# Countdown
for ($i = 10; $i -gt 0; $i--) {
    if ($Verbose) { Write-Host "$i..." }
    Start-Sleep -Seconds 1
}

if ($Verbose) { Write-Host "Sending /compact to ($X, $Y)..." }

# Mouse click helper
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseClick {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int MOUSEEVENTF_LEFTDOWN = 0x02;
    public const int MOUSEEVENTF_LEFTUP = 0x04;
    public static void Click(int x, int y) {
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(50);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    }
}
"@

# Click at coordinates
[MouseClick]::Click($X, $Y)
Start-Sleep -Milliseconds 100

# Type /compact
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("/compact")

# Wait 100ms then send Enter
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")

if ($Verbose) { Write-Host "Done! /compact sent." }
