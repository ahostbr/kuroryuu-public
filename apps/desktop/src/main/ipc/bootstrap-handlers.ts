/**
 * Bootstrap IPC Handlers
 * Install CLI bootstrap redirect files
 */
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// From out/main -> go up to apps/desktop, then up to Kuroryuu root
// out/main -> out -> desktop -> apps -> Kuroryuu (4 levels, not 5)
const PROJECT_ROOT = process.env.KURORYUU_ROOT || path.resolve(__dirname, '../../../..');

// Helper function to detect tray companion launch target
function getTrayCompanionLaunchTarget(): { type: 'dev' | 'packaged'; path: string } | null {
  const trayCompanionRoot = path.join(PROJECT_ROOT, 'apps', 'tray_companion');

  // Priority 1: Check for dev build (out/main/index.js)
  const devBuild = path.join(trayCompanionRoot, 'out', 'main', 'index.js');
  if (fs.existsSync(devBuild)) {
    return { type: 'dev', path: devBuild };
  }

  // Priority 2: Check for packaged exe (dist/tray_companion.exe on Windows)
  const exeName = process.platform === 'win32' ? 'tray_companion.exe' : 'tray_companion';
  const packagedExe = path.join(trayCompanionRoot, 'dist', exeName);
  if (fs.existsSync(packagedExe)) {
    return { type: 'packaged', path: packagedExe };
  }

  return null; // Not found
}

// Exported launch function (can be called from IPC handler or directly from main)
export async function launchTrayCompanion(options?: { debug?: boolean }): Promise<{ ok: boolean; error?: string; message?: string }> {
  const showTerminal = options?.debug ?? false;

  try {
    const target = getTrayCompanionLaunchTarget();

    if (!target) {
      // No build found, but still try to give helpful feedback
      return {
        ok: false,
        error: 'Tray Companion not found. Build it first:\n  cd apps/tray_companion\n  npm run dev (for dev build)\n  npm run build (for production build)'
      };
    }

    const trayCompanionRoot = path.join(PROJECT_ROOT, 'apps', 'tray_companion');

    // Clone env but remove ELECTRON_RENDERER_URL to prevent tray companion
    // from trying to load the desktop app's vite dev server URL
    const childEnv = { ...process.env };
    delete childEnv.ELECTRON_RENDERER_URL;
    childEnv.KURORYUU_ROOT = PROJECT_ROOT;
    childEnv.ELECTRON_IS_DEV = target.type === 'dev' ? '1' : '0';

    let child;

    if (process.platform === 'win32' && !showTerminal) {
      // On Windows, use PowerShell with -WindowStyle Hidden to truly hide the terminal
      const electronPaths = [
        path.join(PROJECT_ROOT, 'apps', 'desktop', 'node_modules', '.bin', 'electron.cmd'),
        path.join(PROJECT_ROOT, 'node_modules', '.bin', 'electron.cmd')
      ];
      const electronCmd = electronPaths.find(p => fs.existsSync(p)) || electronPaths[0];

      if (target.type === 'dev') {
        // Launch dev build via PowerShell hidden
        const psCommand = `& '${electronCmd}' '${trayCompanionRoot}'`;
        child = spawn('powershell.exe', [
          '-NoProfile',
          '-WindowStyle', 'Hidden',
          '-Command', psCommand
        ], {
          cwd: trayCompanionRoot,
          detached: true,
          stdio: 'ignore',
          env: childEnv
        });
      } else {
        // Launch packaged exe directly (no shell needed)
        child = spawn(target.path, [], {
          cwd: trayCompanionRoot,
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          env: childEnv
        });
      }
    } else {
      // Non-Windows or debug mode: use standard spawn
      let execPath: string;
      let args: string[];

      if (target.type === 'dev') {
        const electronPaths = [
          path.join(PROJECT_ROOT, 'apps', 'desktop', 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron'),
          path.join(PROJECT_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')
        ];
        execPath = electronPaths.find(p => fs.existsSync(p)) || electronPaths[0];
        args = [trayCompanionRoot];
      } else {
        execPath = target.path;
        args = [];
      }

      child = spawn(execPath, args, {
        cwd: trayCompanionRoot,
        detached: true,
        stdio: showTerminal ? 'inherit' : 'ignore',
        shell: process.platform === 'win32',
        windowsHide: !showTerminal,
        env: childEnv
      });
    }

    // Unref so the parent doesn't wait for the child
    child.unref();

    // Note: If tray companion is already running, the new instance will detect this
    // via single-instance lock, focus the existing window, and quit immediately.
    // From our perspective, the spawn succeeded either way.
    return {
      ok: true,
      message: `Tray Companion launched successfully${showTerminal ? ' (debug mode)' : ''} (or already running and focused)`
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Failed to launch: ${err.message || String(err)}`
    };
  }
}

const CLI_FILES: Record<string, { path: string; content: string }> = {
  kiro: {
    path: '.kiro/steering/KURORYUU_LAWS.md',
    content: `# STOP. Read KURORYUU_BOOTSTRAP.md FIRST.

> **Location:** \`KURORYUU_BOOTSTRAP.md\` (project root)

## On Session Start

1. Read \`KURORYUU_BOOTSTRAP.md\`
2. Call: \`kuroryuu_session_start(process_id, "kiro", "your_agent_id")\`
3. Confirm: \`KURORYUU-aware. Session: {session_id}. Ready.\`
`,
  },
  claude: {
    path: 'CLAUDE.md',
    content: `# STOP. Read KURORYUU_BOOTSTRAP.md FIRST.

> **Location:** \`KURORYUU_BOOTSTRAP.md\` (this directory)

## On Session Start

1. Read \`KURORYUU_BOOTSTRAP.md\`
2. Call: \`kuroryuu_session_start(process_id, "claude", "your_agent_id")\`
3. Confirm: \`KURORYUU-aware. Session: {session_id}. Ready.\`
`,
  },
  copilot: {
    path: '.github/copilot-instructions.md',
    content: `# STOP. Read KURORYUU_BOOTSTRAP.md FIRST.

> **Location:** \`KURORYUU_BOOTSTRAP.md\` (project root)

## On Session Start

1. Read \`KURORYUU_BOOTSTRAP.md\`
2. Call: \`kuroryuu_session_start(process_id, "copilot", "your_agent_id")\`
3. Confirm: \`KURORYUU-aware. Session: {session_id}. Ready.\`
`,
  },
  cline: {
    path: '.Cline/Rules/.clinerules00-kuroryuu.md',
    content: `# STOP. Read KURORYUU_BOOTSTRAP.md FIRST.

> **Location:** \`KURORYUU_BOOTSTRAP.md\` (project root)

## On Session Start

1. Read \`KURORYUU_BOOTSTRAP.md\`
2. Call: \`kuroryuu_session_start(process_id, "cline", "your_agent_id")\`
3. Confirm: \`KURORYUU-aware. Session: {session_id}. Ready.\`
`,
  },
  codex: {
    path: 'AGENTS.md',
    content: `# STOP. Read KURORYUU_BOOTSTRAP.md FIRST.

> **Location:** \`KURORYUU_BOOTSTRAP.md\` (this directory)

## On Session Start

1. Read \`KURORYUU_BOOTSTRAP.md\`
2. Call: \`kuroryuu_session_start(process_id, "codex", "your_agent_id")\`
3. Confirm: \`KURORYUU-aware. Session: {session_id}. Ready.\`
`,
  },
  cursor: {
    path: '.cursorrules',
    content: `# STOP. Read KURORYUU_BOOTSTRAP.md FIRST.

Location: KURORYUU_BOOTSTRAP.md (this directory)

On Session Start:
1. Read KURORYUU_BOOTSTRAP.md
2. Call: kuroryuu_session_start(process_id, "cursor", "your_agent_id")
3. Confirm: KURORYUU-aware. Session: {session_id}. Ready.
`,
  },
  windsurf: {
    path: '.windsurfrules',
    content: `# STOP. Read KURORYUU_BOOTSTRAP.md FIRST.

Location: KURORYUU_BOOTSTRAP.md (this directory)

On Session Start:
1. Read KURORYUU_BOOTSTRAP.md
2. Call: kuroryuu_session_start(process_id, "windsurf", "your_agent_id")
3. Confirm: KURORYUU-aware. Session: {session_id}. Ready.
`,
  },
};

export function registerBootstrapHandlers(): void {
  ipcMain.handle('bootstrap:install', async (_, cliId: string) => {
    const cli = CLI_FILES[cliId];
    if (!cli) return { ok: false, error: `Unknown CLI: ${cliId}` };

    try {
      const fullPath = path.join(PROJECT_ROOT, cli.path);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, cli.content, 'utf-8');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('bootstrap:installAll', async () => {
    const results: Record<string, boolean> = {};
    for (const cliId of Object.keys(CLI_FILES)) {
      const cli = CLI_FILES[cliId];
      try {
        const fullPath = path.join(PROJECT_ROOT, cli.path);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, cli.content, 'utf-8');
        results[cliId] = true;
      } catch {
        results[cliId] = false;
      }
    }
    return { ok: true, results };
  });

  ipcMain.handle('bootstrap:check', async (_, cliId: string) => {
    const cli = CLI_FILES[cliId];
    if (!cli) return { installed: false };
    const fullPath = path.join(PROJECT_ROOT, cli.path);
    return { installed: fs.existsSync(fullPath) };
  });

  // Get project root - not hardcoded, uses env or resolves from app location
  ipcMain.handle('app:getProjectRoot', async () => {
    return PROJECT_ROOT;
  });

  // Launch the Tray Companion app (Electron app, not Python)
  // Pass { debug: true } to show terminal window for debugging
  ipcMain.handle('app:launchTrayCompanion', async (_event, options?: { debug?: boolean }) => {
    return launchTrayCompanion(options);
  });

  // Buffer access mode - get current setting
  ipcMain.handle('app:getBufferAccessMode', async () => {
    // Normalize legacy values: 'all' and 'leader_only' → 'on'
    const mode = process.env.KURORYUU_TERM_BUFFER_ACCESS || 'on';
    if (mode === 'all' || mode === 'leader_only') return 'on';
    return mode;
  });

  // Buffer access mode - set (validates input)
  // Simplified to 2 modes: 'off' and 'on'
  ipcMain.handle('app:setBufferAccessMode', async (_, mode: string) => {
    const validModes = ['off', 'on'];
    // Accept legacy values for backwards compatibility
    const normalizedMode = (mode === 'all' || mode === 'leader_only') ? 'on' : mode;
    if (!validModes.includes(normalizedMode)) {
      return { ok: false, error: `Invalid mode: ${mode}. Must be one of: ${validModes.join(', ')}` };
    }
    process.env.KURORYUU_TERM_BUFFER_ACCESS = normalizedMode;
    return { ok: true, mode: normalizedMode };
  });
}
