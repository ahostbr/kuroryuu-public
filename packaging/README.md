# Kuroryuu Packaging

1-click installer and packaging tools for hackathon judges.

## Quick Install (Online)

```powershell
irm https://raw.githubusercontent.com/ahostbr/Kuroryuu/master/packaging/kuroryuu-install.ps1 | iex
```

Or download and run manually:
```powershell
.\kuroryuu-install.ps1
```

## Installation Options

| Flag | Description |
|------|-------------|
| `-Offline` | Use bundled offline package (requires `kuroryuu-offline.zip`) |
| `-EmbeddedPython` | Use portable Python instead of winget |
| `-SkipDesktopApp` | Install backend services only |
| `-InstallDir <path>` | Custom installation directory |

### Examples

```powershell
# Standard online install
.\kuroryuu-install.ps1

# Use embedded/portable Python (no admin required)
.\kuroryuu-install.ps1 -EmbeddedPython

# Offline install (air-gapped networks)
.\kuroryuu-install.ps1 -Offline

# Backend only (for headless servers)
.\kuroryuu-install.ps1 -SkipDesktopApp
```

## Building Installer Packages

### Offline Package

Creates a self-contained ZIP with all dependencies:

```powershell
.\Build-Offline-Installer.ps1
.\Build-Offline-Installer.ps1 -IncludePython -IncludeDesktopApp
```

Output: `dist/kuroryuu-offline.zip`

### Standalone EXE

Converts the installer to a single executable using PS2EXE:

```powershell
.\Build-Exe-Installer.ps1
.\Build-Exe-Installer.ps1 -NoConsole  # GUI-only (hides PowerShell window)
```

Output: `dist/Kuroryuu-Install.exe`

## Post-Installation

### Launch Kuroryuu

1. **Start Menu** → Kuroryuu
2. **Desktop shortcut** (double-click)
3. **Command line:** `Start-Kuroryuu.ps1`

### Use with Claude Code

```powershell
cd $env:LOCALAPPDATA\Kuroryuu
claude
```

All `k_*` MCP tools will be available automatically.

### Stop Services

```powershell
.\Stop-Kuroryuu.ps1
```

Or close the desktop app (services stop automatically).

## Troubleshooting

### Python Installation Fails

- Try `-EmbeddedPython` flag (uses portable Python)
- Run as Administrator
- Check internet connection

### Services Won't Start

- Check ports 8100 and 8200 are available
- Run `.\Stop-Kuroryuu.ps1` then try again
- Check `apps\mcp_core\startup.log` for errors

### Desktop App Not Found

- Reinstall with `.\kuroryuu-install.ps1` (without `-SkipDesktopApp`)
- Download manually from GitHub releases

## File Structure

```
packaging/
├── kuroryuu-install.ps1      # Main 1-click installer
├── Start-Kuroryuu.ps1        # Combined launcher script
├── Build-Offline-Installer.ps1  # Create offline package
├── Build-Exe-Installer.ps1   # Create .exe installer
└── README.md                 # This file
```

## For Maintainers

### Release Checklist

1. Update `$KuroVersion` in all scripts
2. Build desktop app: `cd apps/desktop && npm run build`
3. Create GitHub release with desktop installer
4. Build offline package: `.\Build-Offline-Installer.ps1 -IncludePython -IncludeDesktopApp`
5. Build EXE installer: `.\Build-Exe-Installer.ps1`
6. Attach to GitHub release:
   - `Kuroryuu-Install.exe`
   - `kuroryuu-offline.zip`
