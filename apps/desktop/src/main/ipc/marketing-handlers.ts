/**
 * Marketing IPC Handlers
 * Tool installation and setup management for the marketing workspace
 */
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';

const PROJECT_ROOT = process.env.KURORYUU_ROOT || path.resolve(__dirname, '../../../..');
const TOOLS_DIR = path.join(PROJECT_ROOT, 'tools', 'marketing');
const SETUP_STATE_FILE = path.join(PROJECT_ROOT, 'ai', 'data', 'marketing-setup.json');

// ---------------------------------------------------------------------------
// PATH augmentation — Electron doesn't inherit full user shell PATH
// ---------------------------------------------------------------------------

const HOME = process.env.USERPROFILE || process.env.HOME || '';

/** Common tool directories that Electron may not have in its PATH */
const EXTRA_PATH_DIRS = [
  path.join(HOME, '.local', 'bin'),       // uv, astral-sh installs
  path.join(HOME, '.cargo', 'bin'),       // rustup/cargo installs
  path.join(HOME, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts'),
  path.join(HOME, 'AppData', 'Roaming', 'Python', 'Python312', 'Scripts'),
  path.join(HOME, 'scoop', 'shims'),      // scoop installs
];

/** Build a PATH string with extra dirs prepended */
function getAugmentedPath(): string {
  const existing = process.env.PATH || '';
  const extras = EXTRA_PATH_DIRS.filter((d) => fs.existsSync(d));
  if (extras.length === 0) return existing;
  const sep = process.platform === 'win32' ? ';' : ':';
  return extras.join(sep) + sep + existing;
}

/** Env object with augmented PATH for spawned processes */
function getSpawnEnv(): Record<string, string> {
  return { ...process.env, PATH: getAugmentedPath() } as Record<string, string>;
}

// ---------------------------------------------------------------------------
// uv detection + auto-install
// ---------------------------------------------------------------------------

function findUvPath(): string | null {
  // 1. Try the augmented PATH via `where`/`which`
  try {
    const result = execSync(
      process.platform === 'win32' ? 'where uv' : 'which uv',
      { stdio: 'pipe', shell: true, env: { ...process.env, PATH: getAugmentedPath() } },
    );
    const firstLine = result.toString().trim().split(/\r?\n/)[0];
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  } catch {
    // Not found via PATH
  }

  // 2. Check well-known locations directly
  const candidates = process.platform === 'win32'
    ? [
        path.join(HOME, '.local', 'bin', 'uv.exe'),
        path.join(HOME, '.cargo', 'bin', 'uv.exe'),
      ]
    : [
        path.join(HOME, '.local', 'bin', 'uv'),
        path.join(HOME, '.cargo', 'bin', 'uv'),
        '/usr/local/bin/uv',
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function isUvInstalled(): boolean {
  return findUvPath() !== null;
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ ok: boolean; error?: string; output?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      shell: process.platform === 'win32',
      env: getSpawnEnv(),
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, output: stdout });
      } else {
        resolve({ ok: false, error: stderr || `Exit code ${code}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ ok: false, error: `Spawn error: ${err.message}` });
    });
  });
}

async function ensureUv(): Promise<{ ok: boolean; error?: string }> {
  const uvPath = findUvPath();
  if (uvPath) {
    console.log('[Marketing] uv found at:', uvPath);
    return { ok: true };
  }

  console.log('[Marketing] uv not found, installing...');

  if (process.platform === 'win32') {
    // Windows: powershell install
    const result = await runCommand(
      'powershell',
      ['-ExecutionPolicy', 'ByPass', '-c', 'irm https://astral.sh/uv/install.ps1 | iex'],
      PROJECT_ROOT,
    );
    if (!result.ok) {
      return { ok: false, error: `uv install failed: ${result.error}` };
    }
  } else {
    // macOS/Linux: curl install
    const result = await runCommand(
      'sh',
      ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'],
      PROJECT_ROOT,
    );
    if (!result.ok) {
      return { ok: false, error: `uv install failed: ${result.error}` };
    }
  }

  // Verify installation succeeded (re-check with fresh lookup)
  if (!findUvPath()) {
    return {
      ok: false,
      error: 'uv install script completed but uv command still not found. You may need to restart your terminal or add uv to PATH.',
    };
  }

  console.log('[Marketing] uv installed successfully');
  return { ok: true };
}

const TOOL_DEFINITIONS = [
  {
    id: 'google-image-gen',
    name: 'Google Image Generator',
    description: 'Generate images using Google Gemini AI',
    repoUrl: 'https://github.com/AI-Engineer-Skool/google-image-gen-api-starter',
    dirName: 'google-image-gen-api-starter',
    optional: false,
  },
  {
    id: 'video-toolkit',
    name: 'Claude Code Video Toolkit',
    description: 'Video, voiceover, and music generation',
    repoUrl: 'https://github.com/digitalsamba/claude-code-video-toolkit',
    dirName: 'claude-code-video-toolkit',
    optional: false,
  },
];

const DEPS_MARKER = '.kuroryuu-deps-installed';

interface ToolStatus {
  id: string;
  name: string;
  description: string;
  installed: boolean;       // repo directory exists (cloned)
  depsInstalled: boolean;   // deps marker file exists (fully set up)
  path: string | null;
  version: string | null;
  repoUrl: string;
  optional: boolean;
}

interface SetupState {
  complete: boolean;
  tools: ToolStatus[];
}

export function registerMarketingHandlers(): void {
  // Clone a repository
  ipcMain.handle('marketing:cloneRepo', async (_event, repoUrl: string, targetDir: string) => {
    try {
      const fullPath = path.join(PROJECT_ROOT, targetDir);

      // Check if already exists
      if (fs.existsSync(fullPath)) {
        return { ok: true }; // Already cloned
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      return await runCommand('git', ['clone', repoUrl, fullPath], PROJECT_ROOT);
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Install dependencies for a tool
  // Scans root + immediate subdirectories for package.json / pyproject.toml / requirements.txt
  ipcMain.handle('marketing:installDeps', async (_event, toolDir: string) => {
    try {
      const fullPath = path.join(PROJECT_ROOT, toolDir);

      if (!fs.existsSync(fullPath)) {
        return { ok: false, error: 'Tool directory not found' };
      }

      // Collect all install targets: root + first-level subdirs
      const dirsToCheck = [fullPath];
      try {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            dirsToCheck.push(path.join(fullPath, entry.name));
          }
        }
      } catch {
        // Can't read dir — proceed with root only
      }

      let installedSomething = false;
      let needsUv = false;

      // First pass: check if any Python deps exist so we can ensure uv once
      for (const dir of dirsToCheck) {
        if (
          fs.existsSync(path.join(dir, 'pyproject.toml')) ||
          fs.existsSync(path.join(dir, 'requirements.txt'))
        ) {
          needsUv = true;
          break;
        }
      }

      if (needsUv) {
        const uvResult = await ensureUv();
        if (!uvResult.ok) {
          return { ok: false, error: uvResult.error };
        }
      }

      // Second pass: install deps in each directory that has manifest files
      for (const dir of dirsToCheck) {
        const hasPyProject = fs.existsSync(path.join(dir, 'pyproject.toml'));
        const hasRequirements = fs.existsSync(path.join(dir, 'requirements.txt'));
        const hasPackageJson = fs.existsSync(path.join(dir, 'package.json'));

        if (hasPyProject) {
          console.log(`[Marketing] uv sync in ${dir}`);
          const result = await runCommand('uv', ['sync'], dir);
          if (!result.ok) return { ok: false, error: `uv sync failed in ${path.basename(dir)}: ${result.error}` };
          installedSomething = true;
        }

        if (hasRequirements) {
          console.log(`[Marketing] pip install -r requirements.txt in ${dir}`);
          const result = await runCommand('uv', ['pip', 'install', '-r', 'requirements.txt'], dir);
          if (!result.ok) return { ok: false, error: `pip install failed in ${path.basename(dir)}: ${result.error}` };
          installedSomething = true;
        }

        if (hasPackageJson) {
          console.log(`[Marketing] npm install in ${dir}`);
          const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
          const result = await runCommand(npmCmd, ['install'], dir);
          if (!result.ok) return { ok: false, error: `npm install failed in ${path.basename(dir)}: ${result.error}` };
          installedSomething = true;
        }
      }

      if (!installedSomething) {
        // No manifest files found but repo cloned OK — treat as success (some repos have no deps)
        console.log(`[Marketing] No dependency manifests found in ${toolDir}, skipping install`);
      }

      // Write marker file so getToolStatus knows deps are installed
      try {
        fs.writeFileSync(path.join(fullPath, DEPS_MARKER), new Date().toISOString(), 'utf-8');
        console.log(`[Marketing] Wrote deps marker: ${path.join(fullPath, DEPS_MARKER)}`);
      } catch (markerErr) {
        console.warn('[Marketing] Failed to write deps marker:', markerErr);
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Check and install uv if needed
  ipcMain.handle('marketing:ensureUv', async () => {
    return await ensureUv();
  });

  // Get tool installation status
  ipcMain.handle('marketing:getToolStatus', async () => {
    try {
      const tools: ToolStatus[] = TOOL_DEFINITIONS.map((def) => {
        const toolPath = path.join(TOOLS_DIR, def.dirName);
        const installed = fs.existsSync(toolPath);
        const depsInstalled = installed && fs.existsSync(path.join(toolPath, DEPS_MARKER));

        return {
          id: def.id,
          name: def.name,
          description: def.description,
          installed,
          depsInstalled,
          path: installed ? toolPath : null,
          version: null,
          repoUrl: def.repoUrl,
          optional: def.optional,
        };
      });

      return { tools };
    } catch (err) {
      console.error('[Marketing] getToolStatus error:', err);
      return { tools: [] };
    }
  });

  // Get setup state
  ipcMain.handle('marketing:getSetupState', async () => {
    try {
      // Check if setup state file exists
      if (fs.existsSync(SETUP_STATE_FILE)) {
        const data = fs.readFileSync(SETUP_STATE_FILE, 'utf-8');
        const state: SetupState = JSON.parse(data);
        return state;
      }

      // Default state
      return {
        complete: false,
        tools: [],
      };
    } catch (err) {
      console.error('[Marketing] getSetupState error:', err);
      return { complete: false, tools: [] };
    }
  });

  // Save setup state
  ipcMain.handle('marketing:saveSetup', async (_event, state: unknown) => {
    try {
      // Ensure directory exists
      const dir = path.dirname(SETUP_STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(SETUP_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
      return { ok: true };
    } catch (err) {
      console.error('[Marketing] saveSetup error:', err);
      return { ok: false, error: String(err) };
    }
  });
}
