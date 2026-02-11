/**
 * Marketing IPC Handlers
 * Tool installation and setup management for the marketing workspace
 */
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const PROJECT_ROOT = process.env.KURORYUU_ROOT || path.resolve(__dirname, '../../../..');
const TOOLS_DIR = path.join(PROJECT_ROOT, 'tools', 'marketing');
const SETUP_STATE_FILE = path.join(PROJECT_ROOT, 'ai', 'data', 'marketing-setup.json');

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

interface ToolStatus {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  repoUrl: string;
  optional: boolean;
}

interface SetupState {
  complete: boolean;
  tools: ToolStatus[];
  googleApiKey?: string;
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

      // Clone the repo
      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const git = spawn('git', ['clone', repoUrl, fullPath], {
          cwd: PROJECT_ROOT,
          shell: process.platform === 'win32',
        });

        let stderr = '';
        git.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        git.on('close', (code) => {
          if (code === 0) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: `Git clone failed: ${stderr}` });
          }
        });

        git.on('error', (err) => {
          resolve({ ok: false, error: `Git spawn error: ${err.message}` });
        });
      });
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Install dependencies for a tool
  ipcMain.handle('marketing:installDeps', async (_event, toolDir: string) => {
    try {
      const fullPath = path.join(PROJECT_ROOT, toolDir);

      if (!fs.existsSync(fullPath)) {
        return { ok: false, error: 'Tool directory not found' };
      }

      // Check for package.json (npm) or pyproject.toml (uv/python)
      const hasPackageJson = fs.existsSync(path.join(fullPath, 'package.json'));
      const hasPyProject = fs.existsSync(path.join(fullPath, 'pyproject.toml'));

      if (!hasPackageJson && !hasPyProject) {
        return { ok: false, error: 'No package.json or pyproject.toml found' };
      }

      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        let cmd: string;
        let args: string[];

        if (hasPackageJson) {
          cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
          args = ['install'];
        } else {
          cmd = 'uv';
          args = ['sync'];
        }

        const proc = spawn(cmd, args, {
          cwd: fullPath,
          shell: process.platform === 'win32',
        });

        let stderr = '';
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: `Install failed: ${stderr}` });
          }
        });

        proc.on('error', (err) => {
          resolve({ ok: false, error: `Spawn error: ${err.message}` });
        });
      });
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Get tool installation status
  ipcMain.handle('marketing:getToolStatus', async () => {
    try {
      const tools: ToolStatus[] = TOOL_DEFINITIONS.map((def) => {
        const toolPath = path.join(TOOLS_DIR, def.dirName);
        const installed = fs.existsSync(toolPath);

        return {
          id: def.id,
          name: def.name,
          description: def.description,
          installed,
          path: installed ? toolPath : null,
          version: null, // TODO: Could parse package.json or pyproject.toml for version
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
