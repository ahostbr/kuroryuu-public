# Bulk A2UI Component Porter - PowerShell version with theme translation
# Ports all missing components from reference to Kuroryuu with proper theming

$SRC_BASE = "E:\SAS\REPO_CLONES\second-brain-research-dashboard-main\frontend\src\components\A2UI"
$DEST_BASE = "E:\SAS\CLONE\Kuroryuu-master\apps\desktop\src\renderer\components\genui\a2ui"

# Theme translation function
function Port-Component {
    param(
        [string]$SourceFile,
        [string]$DestFile
    )

    if (Test-Path $SourceFile) {
        $content = Get-Content -Path $SourceFile -Raw

        # Apply theme substitutions
        $content = $content `
            -replace 'from "@/components/ui/', 'from "../../../ui/' `
            -replace 'from "@/lib/utils"', 'from "../../../../lib/utils"' `
            -replace 'from "\.\./\.\./\.\./ui/', 'from "../../../ui/' `
            -replace 'text-blue-300/80', 'text-muted-foreground' `
            -replace 'text-blue-300/70', 'text-muted-foreground' `
            -replace 'text-blue-300', 'text-foreground/80' `
            -replace 'text-blue-200/80', 'text-foreground/70' `
            -replace 'text-blue-200', 'text-foreground/80' `
            -replace 'text-blue-100', 'text-foreground' `
            -replace 'text-blue-400', 'text-primary' `
            -replace 'border-blue-500/20', 'border-primary/20' `
            -replace 'border-blue-500/30', 'border-primary/30' `
            -replace 'border-blue-500/40', 'border-primary/40' `
            -replace 'border-blue-500/50', 'border-primary/50' `
            -replace 'bg-blue-900/30', 'bg-primary/10' `
            -replace 'bg-blue-950/30', 'bg-primary/10' `
            -replace 'bg-blue-950/20', 'bg-primary/5' `
            -replace 'bg-blue-500/10', 'bg-primary/5' `
            -replace 'bg-blue-500/20', 'bg-primary/10' `
            -replace 'bg-blue-500/30', 'bg-primary/15' `
            -replace 'bg-blue-500', 'bg-primary' `
            -replace 'bg-slate-800/50', 'bg-card/50' `
            -replace 'bg-slate-900', 'bg-background' `
            -replace 'from-slate-900/50', 'from-background/50' `
            -replace 'border-slate-700', 'border-border' `
            -replace 'text-slate-400', 'text-muted-foreground' `
            -replace 'text-slate-300', 'text-foreground/80'

        # Remove framer-motion imports and usage
        $content = $content -replace "import .* from 'framer-motion';?\r?\n", ""
        $content = $content -replace '<motion\.div', '<div'
        $content = $content -replace '</motion\.div>', '</div>'
        $content = $content -replace '\s+initial=\{[^\}]+\}', ''
        $content = $content -replace '\s+animate=\{[^\}]+\}', ''
        $content = $content -replace '\s+variants=\{[^\}]+\}', ''
        $content = $content -replace '\s+transition=\{[^\}]+\}', ''

        # Write to destination
        [System.IO.File]::WriteAllText($DestFile, $content, [System.Text.UTF8Encoding]::new($false))
        Write-Host "  ✓ $([System.IO.Path]::GetFileName($DestFile))"
    }
}

# Port each category
$categories = @("Comparison", "Layout", "Tags", "Media")

foreach ($category in $categories) {
    Write-Host "`nPorting $category components..."

    $srcDir = Join-Path $SRC_BASE $category
    $destDir = Join-Path $DEST_BASE $category

    # Create dest directory if needed
    if (!(Test-Path $destDir)) {
        New-Item -Path $destDir -ItemType Directory -Force | Out-Null
    }

    # Port all .tsx files
    Get-ChildItem -Path $srcDir -Filter "*.tsx" | ForEach-Object {
        $srcFile = $_.FullName
        $destFile = Join-Path $destDir $_.Name

        # Skip if already exists and is the right size (optimization)
        if (Test-Path $destFile) {
            $srcSize = (Get-Item $srcFile).Length
            $destSize = (Get-Item $destFile).Length
            if ($destSize -gt 100) {
                # Already exists and has content, skip
                return
            }
        }

        Port-Component -SourceFile $srcFile -DestFile $destFile
    }
}

Write-Host "`n✓ All components ported!"
