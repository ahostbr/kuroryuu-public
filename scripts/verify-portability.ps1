<#
.SYNOPSIS
    Verify that no hardcoded paths remain in the Kuroryuu codebase.

.DESCRIPTION
    Scans all source files for known hardcoded path patterns and reports any found.
    Use this after making portability changes to ensure nothing was missed.

.EXAMPLE
    .\scripts\verify-portability.ps1
#>

param(
    [switch]$Verbose  # Show all files scanned
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PORTABILITY VERIFICATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Scanning: $ProjectRoot" -ForegroundColor White
Write-Host ""

# Patterns to search for (hardcoded paths)
$hardcodedPatterns = @(
    "E:\\SAS\\Kuroryuu",
    "E:/SAS/Kuroryuu",
    "E:\\\\SAS\\\\Kuroryuu",
    "E:\\SAS\\ShadowsAndShurikens",
    "E:/SAS/ShadowsAndShurikens",
    "E:\\\\SAS\\\\ShadowsAndShurikens",
    "C:\\Users\\Ryan",
    "C:/Users/Ryan",
    "/mnt/e/SAS/Kuroryuu"
)

# File extensions to scan
$extensions = @("*.ts", "*.tsx", "*.js", "*.py", "*.ps1", "*.json", "*.md")

# Directories to exclude
$excludeDirs = @(
    "node_modules",
    ".git",
    "dist",
    "out",
    ".venv",
    ".venv_mcp312",
    "__pycache__",
    ".next"
)

$issues = @()
$filesScanned = 0

# Build exclude pattern
$excludePattern = ($excludeDirs | ForEach-Object { [regex]::Escape($_) }) -join "|"

foreach ($ext in $extensions) {
    Get-ChildItem -Path $ProjectRoot -Recurse -Include $ext -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notmatch $excludePattern -and
            $_.Name -notlike "*.template*" -and
            $_.Name -ne "verify-portability.ps1"  # Don't flag ourselves
        } |
        ForEach-Object {
            $filesScanned++
            $file = $_
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue

            if ($content) {
                foreach ($pattern in $hardcodedPatterns) {
                    if ($content -match [regex]::Escape($pattern)) {
                        # Find line numbers
                        $lines = Get-Content $file.FullName
                        for ($i = 0; $i -lt $lines.Count; $i++) {
                            if ($lines[$i] -match [regex]::Escape($pattern)) {
                                $issues += [PSCustomObject]@{
                                    File = $file.FullName.Replace($ProjectRoot, ".")
                                    Line = $i + 1
                                    Pattern = $pattern
                                    Content = $lines[$i].Trim().Substring(0, [Math]::Min(80, $lines[$i].Trim().Length))
                                }
                            }
                        }
                    }
                }
            }

            if ($Verbose) {
                Write-Host "  Scanned: $($file.Name)" -ForegroundColor DarkGray
            }
        }
}

Write-Host "Files scanned: $filesScanned" -ForegroundColor White
Write-Host ""

if ($issues.Count -gt 0) {
    Write-Host "FAIL: Found $($issues.Count) hardcoded path(s)" -ForegroundColor Red
    Write-Host ""

    $groupedIssues = $issues | Group-Object File
    foreach ($group in $groupedIssues) {
        Write-Host "  $($group.Name)" -ForegroundColor Yellow
        foreach ($issue in $group.Group) {
            Write-Host "    Line $($issue.Line): $($issue.Pattern)" -ForegroundColor Red
            Write-Host "      $($issue.Content)" -ForegroundColor DarkGray
        }
        Write-Host ""
    }

    exit 1
} else {
    Write-Host "PASS: No hardcoded paths found" -ForegroundColor Green
    Write-Host ""
    exit 0
}
