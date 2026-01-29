# Kuroryuu Portable Path Resolution
# Provides Get-KuroryuuRoot function for all scripts to use

function Get-KuroryuuRoot {
    <#
    .SYNOPSIS
        Get the Kuroryuu project root directory using portable detection.

    .DESCRIPTION
        Priority:
        1. KURORYUU_PROJECT_ROOT environment variable
        2. Walk up from script location looking for KURORYUU_BOOTSTRAP.md marker
        3. Current working directory as fallback

    .OUTPUTS
        String path to project root
    #>

    # 1. Check environment variable first
    if ($env:KURORYUU_PROJECT_ROOT) {
        return $env:KURORYUU_PROJECT_ROOT
    }

    # 2. Walk up from script location looking for marker file
    $current = $PSScriptRoot
    if (-not $current) {
        $current = (Get-Location).Path
    }

    for ($i = 0; $i -lt 10; $i++) {
        $marker = Join-Path $current "KURORYUU_BOOTSTRAP.md"
        if (Test-Path $marker) {
            return $current
        }
        $parent = Split-Path $current -Parent
        if (-not $parent -or $parent -eq $current) {
            break
        }
        $current = $parent
    }

    # 3. Fallback to current working directory
    return (Get-Location).Path
}

function Get-KuroryuuVenv {
    <#
    .SYNOPSIS
        Get the path to Kuroryuu's Python 3.12 virtual environment.
    #>
    $root = Get-KuroryuuRoot
    return Join-Path $root ".venv_mcp312"
}

function Get-KuroryuuPython {
    <#
    .SYNOPSIS
        Get the path to Python executable, with fallbacks.

    .DESCRIPTION
        Priority:
        1. Project .venv_mcp312 virtual environment
        2. System py launcher (Python 3.12)
        3. python from PATH
    #>

    # 1. Try project venv
    $venvPython = Join-Path (Get-KuroryuuVenv) "Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $venvPython
    }

    # 2. Try py launcher with Python 3.12
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        # Verify 3.12 is available
        $result = & py -3.12 --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            return "py -3.12"
        }
    }

    # 3. Fallback to PATH python
    $pathPython = Get-Command python -ErrorAction SilentlyContinue
    if ($pathPython) {
        return $pathPython.Source
    }

    throw "No Python found. Run scripts/setup-project.ps1 to create virtual environment."
}

# Export functions
Export-ModuleMember -Function Get-KuroryuuRoot, Get-KuroryuuVenv, Get-KuroryuuPython
