# clear-inbox.ps1
# Clears all messages from the Kuroryuu inbox (Maildir-style)
# Usage: .\clear-inbox.ps1 [-WhatIf] [-KeepIndex]

param(
    [switch]$WhatIf,
    [switch]$KeepIndex
)

$InboxRoot = $PSScriptRoot  # Script lives in inbox dir
$Folders = @("new", "cur", "done", "dead")

Write-Host "Kuroryuu Inbox Clear Script" -ForegroundColor Cyan
Write-Host "Inbox root: $InboxRoot" -ForegroundColor Gray

if ($WhatIf) {
    Write-Host "[DRY RUN] No files will be deleted" -ForegroundColor Yellow
}

$totalDeleted = 0

foreach ($folder in $Folders) {
    $folderPath = Join-Path $InboxRoot $folder
    if (Test-Path $folderPath) {
        $files = Get-ChildItem -Path $folderPath -Filter "*.json" -File -ErrorAction SilentlyContinue
        $count = ($files | Measure-Object).Count

        if ($count -gt 0) {
            if ($WhatIf) {
                Write-Host "  [DRY] Would delete $count files from $folder/" -ForegroundColor Yellow
            } else {
                $files | Remove-Item -Force
                Write-Host "  Deleted $count files from $folder/" -ForegroundColor Green
            }
            $totalDeleted += $count
        } else {
            Write-Host "  $folder/ is empty" -ForegroundColor Gray
        }
    } else {
        Write-Host "  $folder/ does not exist" -ForegroundColor Gray
    }
}

# Clear index unless -KeepIndex specified
if (-not $KeepIndex) {
    $indexPath = Join-Path $InboxRoot ".index"
    if (Test-Path $indexPath) {
        $indexFiles = Get-ChildItem -Path $indexPath -File -ErrorAction SilentlyContinue
        $indexCount = ($indexFiles | Measure-Object).Count

        if ($indexCount -gt 0) {
            if ($WhatIf) {
                Write-Host "  [DRY] Would delete $indexCount index files from .index/" -ForegroundColor Yellow
            } else {
                $indexFiles | Remove-Item -Force
                Write-Host "  Deleted $indexCount index files from .index/" -ForegroundColor Green
            }
            $totalDeleted += $indexCount
        }
    }
}

Write-Host ""
if ($WhatIf) {
    Write-Host "Would delete $totalDeleted total files" -ForegroundColor Yellow
} else {
    Write-Host "Deleted $totalDeleted total files" -ForegroundColor Green
    Write-Host "Inbox cleared!" -ForegroundColor Cyan
}
