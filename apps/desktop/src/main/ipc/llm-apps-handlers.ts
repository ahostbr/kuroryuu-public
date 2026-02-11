/**
 * LLM Apps IPC Handlers
 * Clone, catalog build, and README serving for the awesome-llm-apps repo
 */
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const PROJECT_ROOT = process.env.KURORYUU_ROOT || path.resolve(__dirname, '../../../..');
const TOOLS_DIR = path.join(PROJECT_ROOT, 'tools', 'llm-apps');
const REPO_DIR = path.join(TOOLS_DIR, 'awesome-llm-apps');
const REPO_URL = 'https://github.com/Shubhamsaboo/awesome-llm-apps';
const CATALOG_FILE = path.join(PROJECT_ROOT, 'ai', 'data', 'llm-apps-catalog.json');
const SETUP_STATE_FILE = path.join(PROJECT_ROOT, 'ai', 'data', 'llm-apps-setup.json');

// Directories to skip when walking the repo
const SKIP_DIRS = new Set(['.git', '__pycache__', 'node_modules', '.github', '.venv', 'venv', 'env']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ ok: boolean; error?: string; output?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      shell: process.platform === 'win32',
      env: process.env as Record<string, string>,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (data) => { stdout += data.toString(); });
    proc.stderr?.on('data', (data) => { stderr += data.toString(); });

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

/** Convert directory name to human-readable label */
function humanize(dirName: string): string {
  return dirName
    .replace(/_/g, ' ')
    .replace(/\bai\b/gi, 'AI')
    .replace(/\bllm\b/gi, 'LLM')
    .replace(/\brag\b/gi, 'RAG')
    .replace(/\bmcp\b/gi, 'MCP')
    .replace(/\badk\b/gi, 'ADK')
    .replace(/\bsdk\b/gi, 'SDK')
    .replace(/\bui\b/gi, 'UI')
    .replace(/\bux\b/gi, 'UX')
    .replace(/\b3d\b/gi, '3D')
    .replace(/\bapps?\b/gi, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase())
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Derive a category label from the relative directory path */
function deriveCategory(relDir: string): { id: string; label: string } {
  const parts = relDir.split(/[\\/]/);
  // Remove the app dir itself (last segment)
  parts.pop();

  if (parts.length === 0) return { id: 'root', label: 'Other' };

  // Special mapping for known deep paths
  const joined = parts.join('/');
  const CATEGORY_MAP: Record<string, string> = {
    'starter_ai_agents': 'Starter AI Agents',
    'advanced_ai_agents/single_agent_apps': 'Advanced Single Agents',
    'advanced_ai_agents/multi_agent_apps/agent_teams': 'Agent Teams',
    'advanced_ai_agents/multi_agent_apps': 'Multi-Agent Apps',
    'advanced_ai_agents/autonomous_game_playing_agent_apps': 'Game Playing Agents',
    'rag_tutorials': 'RAG Tutorials',
    'mcp_ai_agents': 'MCP Agents',
    'voice_ai_agents': 'Voice AI Agents',
    'advanced_llm_apps/chat_with_X_tutorials': 'Chat Tutorials',
    'advanced_llm_apps/llm_apps_with_memory_tutorials': 'Memory Apps',
    'advanced_llm_apps/llm_optimization_tools': 'Optimization Tools',
    'advanced_llm_apps/llm_finetuning_tutorials': 'Fine-tuning Tutorials',
    'ai_agent_framework_crash_course/google_adk_crash_course': 'Google ADK Course',
    'ai_agent_framework_crash_course/openai_sdk_crash_course': 'OpenAI SDK Course',
    'awesome_agent_skills': 'Agent Skills',
  };

  // Try longest match first
  for (const [key, label] of Object.entries(CATEGORY_MAP).sort((a, b) => b[0].length - a[0].length)) {
    if (joined.startsWith(key)) {
      return { id: key.replace(/\//g, '_'), label };
    }
  }

  // Fallback: humanize the first directory
  return { id: parts[0], label: humanize(parts[0]) };
}

/** Extract first paragraph from README content */
function extractDescription(readmeContent: string): string {
  const lines = readmeContent.split(/\r?\n/);
  const paragraphs: string[] = [];
  let current = '';

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headings, badges, images, empty lines at start
    if (trimmed.startsWith('#') || trimmed.startsWith('![') || trimmed.startsWith('[![')) {
      if (current) {
        paragraphs.push(current.trim());
        current = '';
      }
      continue;
    }
    if (trimmed === '') {
      if (current) {
        paragraphs.push(current.trim());
        current = '';
      }
      continue;
    }
    current += ' ' + trimmed;
  }
  if (current) paragraphs.push(current.trim());

  // Return first non-empty paragraph, truncated
  for (const p of paragraphs) {
    if (p.length > 10) {
      return p.length > 300 ? p.slice(0, 297) + '...' : p;
    }
  }
  return '';
}

/** Extract tutorial URL from README (theunwindai.com pattern) */
function extractTutorialUrl(content: string): string | null {
  const match = content.match(/https:\/\/www\.theunwindai\.com\/p\/[a-z0-9-]+/);
  return match ? match[0] : null;
}

/** Extract run command from README (streamlit run / python3) */
function extractRunCommand(content: string): string | null {
  const match = content.match(/(?:streamlit run|python3?) [a-z_0-9]+\.py/i);
  return match ? match[0] : null;
}

/** Parse requirements.txt to extract package names */
function parseTechStack(reqContent: string): string[] {
  const packages: string[] = [];
  for (const line of reqContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    // Extract package name (before any version specifier)
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)/);
    if (match) packages.push(match[1].toLowerCase());
  }
  return packages;
}

interface AppEntry {
  id: string;
  name: string;
  category: string;
  categoryId: string;
  path: string;
  absolutePath: string;
  description: string;
  hasReadme: boolean;
  hasRequirements: boolean;
  techStack: string[];
  entryPoint: string | null;
  pyFileCount: number;
  tutorialUrl: string | null;
  runCommand: string | null;
}

interface CategoryEntry {
  id: string;
  label: string;
  appCount: number;
}

/** Build catalog JSON from the local repo and write it to disk. Returns the catalog object. */
function buildCatalogFromDisk(): { apps: AppEntry[]; categories: CategoryEntry[]; generatedAt: string; repoPath: string; totalApps: number } {
  const apps = findApps(REPO_DIR);

  const catMap = new Map<string, { label: string; count: number }>();
  for (const app of apps) {
    const existing = catMap.get(app.categoryId);
    if (existing) existing.count++;
    else catMap.set(app.categoryId, { label: app.category, count: 1 });
  }

  const categories: CategoryEntry[] = Array.from(catMap.entries())
    .map(([id, { label, count }]) => ({ id, label, appCount: count }))
    .sort((a, b) => b.appCount - a.appCount);

  const catalog = {
    apps,
    categories,
    generatedAt: new Date().toISOString(),
    repoPath: REPO_DIR,
    totalApps: apps.length,
  };

  const catalogDir = path.dirname(CATALOG_FILE);
  if (!fs.existsSync(catalogDir)) fs.mkdirSync(catalogDir, { recursive: true });
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`[LLM Apps] Catalog written: ${apps.length} apps in ${categories.length} categories`);

  return catalog;
}

/** Recursively walk the repo and find all app directories */
function findApps(baseDir: string): AppEntry[] {
  const apps: AppEntry[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const pyFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.py'));
    const subdirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'));

    if (pyFiles.length > 0) {
      // This directory is an app
      const relPath = path.relative(baseDir, dir).replace(/\\/g, '/');
      const dirName = path.basename(dir);
      const { id: categoryId, label: category } = deriveCategory(relPath);

      let description = '';
      let hasReadme = false;
      let tutorialUrl: string | null = null;
      let runCommand: string | null = null;
      const readmeCandidates = ['README.md', 'README.MD', 'readme.md', 'Readme.md'];
      for (const name of readmeCandidates) {
        const readmePath = path.join(dir, name);
        if (fs.existsSync(readmePath)) {
          hasReadme = true;
          try {
            const content = fs.readFileSync(readmePath, 'utf-8');
            description = extractDescription(content);
            tutorialUrl = extractTutorialUrl(content);
            runCommand = extractRunCommand(content);
          } catch { /* ignore read errors */ }
          break;
        }
      }

      let techStack: string[] = [];
      let hasRequirements = false;
      const reqPath = path.join(dir, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        hasRequirements = true;
        try {
          const content = fs.readFileSync(reqPath, 'utf-8');
          techStack = parseTechStack(content);
        } catch { /* ignore */ }
      }

      apps.push({
        id: relPath,
        name: humanize(dirName),
        category,
        categoryId,
        path: relPath,
        absolutePath: dir,
        description,
        hasReadme,
        hasRequirements,
        techStack,
        entryPoint: pyFiles[0]?.name || null,
        pyFileCount: pyFiles.length,
        tutorialUrl,
        runCommand,
      });
    }

    // Continue walking subdirectories
    for (const sub of subdirs) {
      walk(path.join(dir, sub.name));
    }
  }

  walk(baseDir);
  return apps;
}

// ---------------------------------------------------------------------------
// Register IPC Handlers
// ---------------------------------------------------------------------------

export function registerLLMAppsHandlers(): void {
  // Clone the awesome-llm-apps repository
  ipcMain.handle('llm-apps:cloneRepo', async () => {
    try {
      if (fs.existsSync(REPO_DIR)) {
        console.log('[LLM Apps] Repo already exists at:', REPO_DIR);
        return { ok: true, alreadyExists: true };
      }

      // Ensure parent directory exists
      if (!fs.existsSync(TOOLS_DIR)) {
        fs.mkdirSync(TOOLS_DIR, { recursive: true });
      }

      console.log('[LLM Apps] Cloning', REPO_URL, 'to', REPO_DIR);
      return await runCommand('git', ['clone', '--depth', '1', REPO_URL, REPO_DIR], TOOLS_DIR);
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Build catalog from the cloned repo
  ipcMain.handle('llm-apps:buildCatalog', async () => {
    try {
      if (!fs.existsSync(REPO_DIR)) {
        return { ok: false, error: 'Repository not cloned yet. Clone first.' };
      }
      console.log('[LLM Apps] Building catalog from:', REPO_DIR);
      const catalog = buildCatalogFromDisk();
      return { ok: true, catalog };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Pull upstream updates (git fetch + reset) then rebuild catalog
  ipcMain.handle('llm-apps:pullUpdates', async () => {
    try {
      if (!fs.existsSync(REPO_DIR)) {
        return { ok: false, error: 'Repository not cloned yet.' };
      }

      // Get current app count for delta comparison
      let oldCount = 0;
      if (fs.existsSync(CATALOG_FILE)) {
        try { oldCount = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8')).totalApps; } catch { /* ignore */ }
      }

      console.log('[LLM Apps] Fetching upstream updates...');

      // Shallow fetch + hard reset works on --depth 1 clones
      let fetchResult = await runCommand('git', ['fetch', '--depth', '1', 'origin', 'main'], REPO_DIR);
      if (!fetchResult.ok) {
        // Try 'master' branch if 'main' fails
        fetchResult = await runCommand('git', ['fetch', '--depth', '1', 'origin', 'master'], REPO_DIR);
        if (!fetchResult.ok) {
          return { ok: false, error: `Fetch failed: ${fetchResult.error}` };
        }
      }

      const resetResult = await runCommand('git', ['reset', '--hard', 'FETCH_HEAD'], REPO_DIR);
      if (!resetResult.ok) {
        return { ok: false, error: `Reset failed: ${resetResult.error}` };
      }

      console.log('[LLM Apps] Rebuilding catalog after update...');
      const catalog = buildCatalogFromDisk();
      const newApps = catalog.totalApps - oldCount;

      return { ok: true, catalog, newApps, totalApps: catalog.totalApps };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Get the catalog JSON
  ipcMain.handle('llm-apps:getCatalog', async () => {
    try {
      if (!fs.existsSync(CATALOG_FILE)) {
        return { ok: false, error: 'Catalog not built yet.' };
      }
      const data = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
      return { ok: true, catalog: data };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Read an individual app's README
  ipcMain.handle('llm-apps:getAppReadme', async (_event, appPath: string) => {
    try {
      const fullDir = path.join(REPO_DIR, appPath);
      const readmeCandidates = ['README.md', 'README.MD', 'readme.md', 'Readme.md'];
      for (const name of readmeCandidates) {
        const readmePath = path.join(fullDir, name);
        if (fs.existsSync(readmePath)) {
          const content = fs.readFileSync(readmePath, 'utf-8');
          return { ok: true, content };
        }
      }
      return { ok: false, error: 'No README found' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Run an app — opens a new PowerShell window with install + run commands
  ipcMain.handle('llm-apps:runApp', async (_event, appPath: string, runCmd: string | null, hasReqs: boolean) => {
    try {
      const fullDir = path.join(REPO_DIR, appPath);
      if (!fs.existsSync(fullDir)) {
        return { ok: false, error: `App directory not found: ${appPath}` };
      }

      // Build the command chain for PowerShell
      const cmds: string[] = [];
      cmds.push(`cd '${fullDir}'`);
      if (hasReqs) cmds.push('pip install -r requirements.txt');
      if (runCmd) {
        cmds.push(runCmd);
      } else {
        // Fallback: try to find a .py file to run
        const pyFiles = fs.readdirSync(fullDir).filter((f) => f.endsWith('.py'));
        if (pyFiles.length === 1) {
          cmds.push(`python ${pyFiles[0]}`);
        } else {
          cmds.push('echo "No run command found — check the README"');
        }
      }

      const psCommand = cmds.join('; ');
      console.log('[LLM Apps] Running app:', psCommand);

      // Spawn a new PowerShell window (-NoExit keeps it open)
      spawn('powershell', [
        '-NoExit',
        '-Command',
        psCommand,
      ], {
        cwd: fullDir,
        detached: true,
        stdio: 'ignore',
        shell: false,
      }).unref();

      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Get setup state
  ipcMain.handle('llm-apps:getSetupState', async () => {
    try {
      if (fs.existsSync(SETUP_STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(SETUP_STATE_FILE, 'utf-8'));
        return data;
      }
      return { complete: false };
    } catch {
      return { complete: false };
    }
  });

  // Save setup state
  ipcMain.handle('llm-apps:saveSetup', async (_event, state: unknown) => {
    try {
      const dir = path.dirname(SETUP_STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(SETUP_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}
