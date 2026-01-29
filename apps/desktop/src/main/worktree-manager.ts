/**
 * Worktree Manager
 * 
 * Git worktree orchestration for parallel task development.
 * Creates isolated worktrees per task, handles merging and cleanup.
 */

import { ipcMain } from 'electron';
import { spawn, execSync } from 'child_process';
import { join, basename } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Configuration
let worktreesEnabled = false;
let worktreeBasePath = '';  // Base directory for worktrees
let mainRepoPath = '';       // Path to main repository

/**
 * Configure worktree manager
 */
export function configureWorktrees(config: {
  enabled?: boolean;
  basePath?: string;
  repoPath?: string;
}): void {
  if (config.enabled !== undefined) worktreesEnabled = config.enabled;
  if (config.basePath) worktreeBasePath = config.basePath;
  if (config.repoPath) mainRepoPath = config.repoPath;
}

/**
 * Execute git command and return output
 */
function gitExec(args: string[], cwd?: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`git ${args.join(' ')}`, {
      cwd: cwd || mainRepoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: stdout.trim(), stderr: '', code: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: err.stdout?.toString() || '',
      stderr: err.stderr?.toString() || '',
      code: err.status || 1,
    };
  }
}

/**
 * List all worktrees
 */
function listWorktrees(): { worktrees: Worktree[]; error?: string } {
  if (!mainRepoPath) {
    return { worktrees: [], error: 'Repository path not configured' };
  }

  const result = gitExec(['worktree', 'list', '--porcelain']);
  if (result.code !== 0) {
    return { worktrees: [], error: result.stderr };
  }

  const worktrees: Worktree[] = [];
  let current: Partial<Worktree> = {};

  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) {
        worktrees.push(current as Worktree);
      }
      current = { path: line.slice(9) };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace('refs/heads/', '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.detached = true;
    }
  }

  if (current.path) {
    worktrees.push(current as Worktree);
  }

  // Add metadata
  for (const wt of worktrees) {
    wt.isMain = wt.path === mainRepoPath;
    wt.name = basename(wt.path);
  }

  return { worktrees };
}

/**
 * Create a new worktree for a task
 */
function createWorktree(params: {
  taskId: string;
  branchName?: string;
  baseBranch?: string;
}): { worktree?: Worktree; error?: string } {
  if (!worktreesEnabled) {
    return { error: 'Worktrees are not enabled' };
  }

  if (!mainRepoPath || !worktreeBasePath) {
    return { error: 'Repository or worktree base path not configured' };
  }

  // Generate branch name from task ID
  const branch = params.branchName || `task/${params.taskId}`;
  const worktreePath = join(worktreeBasePath, params.taskId);

  // Ensure base directory exists
  if (!existsSync(worktreeBasePath)) {
    mkdirSync(worktreeBasePath, { recursive: true });
  }

  // Check if worktree already exists
  if (existsSync(worktreePath)) {
    return { error: `Worktree already exists at ${worktreePath}` };
  }

  // Create branch from base (default: main or current branch)
  const baseBranch = params.baseBranch || 'main';
  
  // First, create the branch if it doesn't exist
  const branchResult = gitExec(['branch', branch, baseBranch]);
  if (branchResult.code !== 0 && !branchResult.stderr.includes('already exists')) {
    // Try with current HEAD if base branch doesn't exist
    const fallbackResult = gitExec(['branch', branch, 'HEAD']);
    if (fallbackResult.code !== 0 && !fallbackResult.stderr.includes('already exists')) {
      return { error: `Failed to create branch: ${fallbackResult.stderr}` };
    }
  }

  // Create worktree
  const result = gitExec(['worktree', 'add', worktreePath, branch]);
  if (result.code !== 0) {
    return { error: `Failed to create worktree: ${result.stderr}` };
  }

  return {
    worktree: {
      path: worktreePath,
      branch,
      name: params.taskId,
      head: '',
      isMain: false,
    },
  };
}

/**
 * Delete a worktree
 */
function deleteWorktree(params: {
  path: string;
  force?: boolean;
  deleteBranch?: boolean;
}): { ok: boolean; error?: string } {
  if (!mainRepoPath) {
    return { ok: false, error: 'Repository path not configured' };
  }

  // Get branch name before removing
  const { worktrees } = listWorktrees();
  const worktree = worktrees.find(wt => wt.path === params.path);
  const branch = worktree?.branch;

  // Remove worktree
  const args = ['worktree', 'remove', params.path];
  if (params.force) args.push('--force');
  
  const result = gitExec(args);
  if (result.code !== 0) {
    return { ok: false, error: result.stderr };
  }

  // Optionally delete the branch
  if (params.deleteBranch && branch && !branch.includes('main') && !branch.includes('master')) {
    gitExec(['branch', '-D', branch]);
  }

  return { ok: true };
}

/**
 * Merge a worktree's branch into target
 */
function mergeWorktree(params: {
  path: string;
  targetBranch?: string;
  deleteAfter?: boolean;
}): { ok: boolean; merged?: boolean; conflicts?: string[]; error?: string } {
  if (!mainRepoPath) {
    return { ok: false, error: 'Repository path not configured' };
  }

  // Get worktree info
  const { worktrees } = listWorktrees();
  const worktree = worktrees.find(wt => wt.path === params.path);
  
  if (!worktree?.branch) {
    return { ok: false, error: 'Worktree not found or has no branch' };
  }

  const targetBranch = params.targetBranch || 'main';

  // Checkout target branch in main repo
  const checkoutResult = gitExec(['checkout', targetBranch]);
  if (checkoutResult.code !== 0) {
    return { ok: false, error: `Failed to checkout ${targetBranch}: ${checkoutResult.stderr}` };
  }

  // Try to merge
  const mergeResult = gitExec(['merge', worktree.branch, '--no-edit']);
  
  if (mergeResult.code !== 0) {
    // Check for conflicts
    const statusResult = gitExec(['status', '--porcelain']);
    const conflicts = statusResult.stdout
      .split('\n')
      .filter(line => line.startsWith('UU ') || line.startsWith('AA '))
      .map(line => line.slice(3));

    if (conflicts.length > 0) {
      // Abort merge
      gitExec(['merge', '--abort']);
      return { ok: false, merged: false, conflicts };
    }

    return { ok: false, error: `Merge failed: ${mergeResult.stderr}` };
  }

  // Delete worktree if requested
  if (params.deleteAfter) {
    deleteWorktree({ path: params.path, deleteBranch: true });
  }

  return { ok: true, merged: true };
}

/**
 * List available branches sorted by recent activity
 */
function listBranches(limit: number = 15): { branches: BranchInfo[]; error?: string } {
  if (!mainRepoPath) {
    return { branches: [], error: 'Repository path not configured' };
  }

  const result = gitExec(['branch', '-a', '--sort=-committerdate']);
  if (result.code !== 0) {
    return { branches: [], error: result.stderr };
  }

  const branches: BranchInfo[] = [];
  const seen = new Set<string>();
  const lines = result.stdout.split('\n').filter(l => l.trim());

  for (const line of lines) {
    if (branches.length >= limit) break;

    const isCurrent = line.startsWith('*');
    const name = line.replace(/^\*?\s*/, '').trim();
    const isRemote = name.startsWith('remotes/');

    // Clean up remote prefix
    const cleanName = isRemote
      ? name.replace('remotes/origin/', '')
      : name;

    // Skip duplicates and HEAD pointer
    if (seen.has(cleanName) || cleanName === 'HEAD' || cleanName.includes('->')) {
      continue;
    }
    seen.add(cleanName);

    branches.push({
      name: cleanName,
      isDefault: cleanName === 'main' || cleanName === 'master',
      isRemote,
      isCurrent,
    });
  }

  return { branches };
}

/**
 * Get status of a worktree (changes, ahead/behind)
 */
function getWorktreeStatus(path: string): WorktreeStatus {
  const statusResult = gitExec(['status', '--porcelain'], path);
  const changes = statusResult.stdout
    .split('\n')
    .filter(line => line.trim())
    .map(line => ({
      status: line.slice(0, 2).trim(),
      file: line.slice(3),
    }));

  // Get ahead/behind
  const aheadBehindResult = gitExec(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], path);
  let ahead = 0;
  let behind = 0;
  
  if (aheadBehindResult.code === 0) {
    const [a, b] = aheadBehindResult.stdout.split('\t').map(Number);
    ahead = a || 0;
    behind = b || 0;
  }

  return {
    changes,
    ahead,
    behind,
    clean: changes.length === 0,
  };
}

// ============================================================================
// IPC Setup
// ============================================================================

export function setupWorktreeIpc(): void {
  // Configure
  ipcMain.handle('worktree:configure', (_, config: Parameters<typeof configureWorktrees>[0]) => {
    configureWorktrees(config);
    return { ok: true };
  });

  // Get status
  ipcMain.handle('worktree:status', () => {
    return {
      enabled: worktreesEnabled,
      basePath: worktreeBasePath,
      repoPath: mainRepoPath,
    };
  });

  // List worktrees
  ipcMain.handle('worktree:list', () => {
    return listWorktrees();
  });

  // Create worktree
  ipcMain.handle('worktree:create', (_, params: Parameters<typeof createWorktree>[0]) => {
    return createWorktree(params);
  });

  // Delete worktree
  ipcMain.handle('worktree:delete', (_, params: Parameters<typeof deleteWorktree>[0]) => {
    return deleteWorktree(params);
  });

  // Merge worktree
  ipcMain.handle('worktree:merge', (_, params: Parameters<typeof mergeWorktree>[0]) => {
    return mergeWorktree(params);
  });

  // Get worktree status
  ipcMain.handle('worktree:getStatus', (_, path: string) => {
    return getWorktreeStatus(path);
  });

  // List branches for selection
  ipcMain.handle('worktree:listBranches', (_, limit?: number) => {
    return listBranches(limit || 15);
  });

  // Open terminal at worktree path (sends event to renderer)
  ipcMain.handle('worktree:openTerminal', (event, path: string) => {
    // Send event to the renderer to open terminal
    event.sender.send('worktree:openTerminalRequest', { path });
    return { ok: true };
  });
}

// ============================================================================
// Types
// ============================================================================

export interface Worktree {
  path: string;
  branch?: string;
  head?: string;
  name: string;
  bare?: boolean;
  detached?: boolean;
  isMain: boolean;
}

export interface WorktreeStatus {
  changes: Array<{ status: string; file: string }>;
  ahead: number;
  behind: number;
  clean: boolean;
}

export interface BranchInfo {
  name: string;
  isDefault: boolean;
  isRemote: boolean;
  isCurrent: boolean;
}
