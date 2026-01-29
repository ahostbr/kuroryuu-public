# Theme Migration Script - Phase 2
# Replaces yellow accent and hex colors with theme-aware classes

# Get project root from script location (scripts/ -> Kuroryuu)
$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$componentsPath = Join-Path $projectRoot "apps\desktop\src\renderer\components"

$replacements = @(
    @{ old = 'placeholder-zinc-500'; new = 'placeholder-muted-foreground' },
    @{ old = 'placeholder-zinc-600'; new = 'placeholder-muted-foreground' },
    @{ old = 'bg-zinc-100'; new = 'bg-foreground' },
    @{ old = 'hover:bg-zinc-100'; new = 'hover:bg-foreground/90' },
    @{ old = 'hover:bg-zinc-200'; new = 'hover:bg-foreground/80' },
    @{ old = 'active:bg-zinc-300'; new = 'active:bg-foreground/70' },
    @{ old = 'text-zinc-50'; new = 'text-foreground' },
    @{ old = 'text-zinc-950'; new = 'text-background' },
    @{ old = 'fill-zinc-500'; new = 'fill-muted-foreground' },
    @{ old = 'border-zinc-500'; new = 'border-muted-foreground' },
    @{ old = 'border-zinc-600'; new = 'border-muted' },
    @{ old = 'focus:border-zinc-600'; new = 'focus:border-muted-foreground' },
    @{ old = 'focus-visible:ring-zinc-300'; new = 'focus-visible:ring-primary' },
    @{ old = 'ring-offset-zinc-950'; new = 'ring-offset-background' },
    @{ old = 'border-t-zinc-700'; new = 'border-t-muted' },
    @{ old = 'border-r-zinc-700'; new = 'border-r-muted' },
    @{ old = 'border-b-zinc-700'; new = 'border-b-muted' },
    @{ old = 'border-l-zinc-700'; new = 'border-l-muted' },
    @{ old = 'text-zinc-700'; new = 'text-muted' }
)

$files = Get-ChildItem -Path $componentsPath -Recurse -Filter "*.tsx"
$totalChanges = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content

    foreach ($r in $replacements) {
        $content = $content -replace [regex]::Escape($r.old), $r.new
    }

    if ($content -ne $originalContent) {
        Set-Content $file.FullName $content -NoNewline
        $totalChanges++
        Write-Host "Updated: $($file.Name)"
    }
}

Write-Host "`nTotal files updated: $totalChanges"
