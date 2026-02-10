/**
 * Git Service
 *
 * IPC handlers for git operations needed by the GitHub Desktop clone.
 * Provides status, diff, staging, commit, and history operations.
 */

import { ipcMain } from 'electron';
import { execFileSync, execFile } from 'child_process';
import { basename, join } from 'path';
import { statSync } from 'fs';

// Configuration (shared with worktree-manager)
let repoPath = '';

// File size limit for GitHub (100MB limit, use 99MB to be safe)
const MAX_FILE_SIZE_MB = 99;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Configure git service with repository path
 */
export function configureGitService(config: { repoPath?: string }): void {
  if (config.repoPath) repoPath = config.repoPath;
}

/**
 * Execute git command and return output
 */
function gitExec(args: string[], cwd?: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execFileSync('git', args, {
      cwd: cwd || repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
      env: { ...process.env, TERM: 'dumb' }, // Prevent interactive prompts (GitHub Desktop pattern)
    });
    return { stdout: stdout.trimEnd(), stderr: '', code: 0 };
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
 * Execute git command with stdin input (for commit messages via -F -)
 * Async version to avoid blocking on stdin write.
 */
function gitExecStdin(args: string[], stdin: string, cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = execFile('git', args, {
      cwd: cwd || repoPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, TERM: 'dumb' },
    }, (error, stdout, stderr) => {
      if (error) {
        const err = error as { code?: number };
        resolve({
          stdout: (stdout || '').trimEnd(),
          stderr: (stderr || '').trimEnd(),
          code: err.code || 1,
        });
      } else {
        resolve({ stdout: (stdout || '').trimEnd(), stderr: '', code: 0 });
      }
    });
    // Write commit message to stdin and close
    child.stdin?.write(stdin);
    child.stdin?.end();
  });
}

/**
 * Setup IPC handlers for git operations
 */
export function setupGitIpc(): void {
  // Get repository name
  ipcMain.handle('git:getRepoName', () => {
    if (!repoPath) return 'Unknown';
    return basename(repoPath);
  });

  // Get repository path
  ipcMain.handle('git:getRepoPath', () => {
    return repoPath;
  });

  // Get current branch with ahead/behind info
  ipcMain.handle('git:getCurrentBranch', () => {
    const branchResult = gitExec(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branchResult.code !== 0) {
      return { error: branchResult.stderr };
    }

    const branch = branchResult.stdout;
    let ahead = 0;
    let behind = 0;

    // Get ahead/behind counts
    const aheadBehindResult = gitExec([
      'rev-list',
      '--left-right',
      '--count',
      `origin/${branch}...HEAD`,
    ]);

    if (aheadBehindResult.code === 0) {
      const [behindStr, aheadStr] = aheadBehindResult.stdout.split('\t');
      behind = parseInt(behindStr, 10) || 0;
      ahead = parseInt(aheadStr, 10) || 0;
    }

    return { branch, ahead, behind };
  });

  // Get current branch name (simple version for code-editor-store)
  ipcMain.handle('git:branch', () => {
    const result = gitExec(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (result.code !== 0) {
      return { ok: false, branch: 'unknown', error: result.stderr };
    }
    return { ok: true, branch: result.stdout };
  });

  // Get git status (porcelain format, NUL-delimited for robust parsing)
  ipcMain.handle('git:status', () => {
    const result = gitExec(['status', '--porcelain', '-z']);
    if (result.code !== 0) {
      return { error: result.stderr };
    }

    // -z uses NUL as delimiter. Split on NUL, filter empty entries.
    const entries = result.stdout.split('\0').filter(Boolean);

    const filteredEntries: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      // Porcelain -z format: "XY path" (renames have a second NUL-delimited path)
      const match = entry.match(/^(.)(.) (.+)$/);
      if (!match) {
        filteredEntries.push(entry);
        continue;
      }

      const [, indexStatus, , filePath] = match;

      // Renames (R) and copies (C) have a second entry for the source path
      let renameSrc: string | undefined;
      if ((indexStatus === 'R' || indexStatus === 'C') && i + 1 < entries.length) {
        renameSrc = entries[++i]; // consume next entry as rename source
      }

      // Check if file exists and get size (deleted files won't exist)
      try {
        const fullPath = join(repoPath, filePath);
        const stats = statSync(fullPath);
        if (stats.size > MAX_FILE_SIZE_BYTES) {
          console.log(
            `[Git] Filtering large file (${(stats.size / 1024 / 1024).toFixed(1)}MB): ${filePath}`
          );
          continue; // Skip this file
        }
      } catch {
        // File doesn't exist (deleted) or can't be accessed - keep it
      }

      // Reconstruct entry with rename info for the renderer parser
      if (renameSrc) {
        filteredEntries.push(`${entry}\0${renameSrc}`);
      } else {
        filteredEntries.push(entry);
      }
    }

    // Return NUL-delimited output so the renderer can parse reliably
    return { output: filteredEntries.join('\0'), format: 'nul' };
  });

  // Get diff for a specific file
  ipcMain.handle('git:diff', (_event, filePath: string) => {
    // Try staged diff first, then unstaged
    let result = gitExec(['diff', '--cached', '--', filePath]);
    if (result.code === 0 && result.stdout) {
      return { diff: result.stdout };
    }

    // Fall back to unstaged diff
    result = gitExec(['diff', '--', filePath]);
    if (result.code === 0 && result.stdout) {
      return { diff: result.stdout };
    }

    // For new files, show the entire file as added
    result = gitExec(['diff', '--no-index', '/dev/null', filePath]);
    if (result.stdout) {
      return { diff: result.stdout };
    }

    return { diff: '', error: 'No diff available' };
  });

  // Stage a file
  ipcMain.handle('git:stage', (_event, filePath: string) => {
    const result = gitExec(['add', '--', filePath]);
    return { success: result.code === 0, error: result.stderr };
  });

  // Unstage a file
  ipcMain.handle('git:unstage', (_event, filePath: string) => {
    const result = gitExec(['reset', 'HEAD', '--', filePath]);
    return { success: result.code === 0, error: result.stderr };
  });

  // Stage all files
  ipcMain.handle('git:stageAll', () => {
    const result = gitExec(['add', '-A']);
    return { success: result.code === 0, error: result.stderr };
  });

  // Unstage all files
  ipcMain.handle('git:unstageAll', () => {
    const result = gitExec(['reset', 'HEAD']);
    return { success: result.code === 0, error: result.stderr };
  });

  // Discard changes for a file (git checkout -- file)
  ipcMain.handle('git:discardChanges', (_event, filePath: string) => {
    // First check if it's an untracked file (new file)
    const statusResult = gitExec(['status', '--porcelain', '--', filePath]);
    if (statusResult.code === 0 && statusResult.stdout.startsWith('??')) {
      // Untracked file - need to delete it
      try {
        const fs = require('fs');
        const path = require('path');
        const fullPath = path.join(repoPath, filePath);
        fs.unlinkSync(fullPath);
        return { success: true };
      } catch (error) {
        return { success: false, error: `Failed to delete file: ${error}` };
      }
    }

    // For tracked files, use git checkout
    const result = gitExec(['checkout', '--', filePath]);
    if (result.code !== 0) {
      // Try git restore for newer git versions
      const restoreResult = gitExec(['restore', '--', filePath]);
      return { success: restoreResult.code === 0, error: restoreResult.stderr };
    }
    return { success: result.code === 0, error: result.stderr };
  });

  // Create a commit (message via stdin to avoid shell parsing issues — GitHub Desktop pattern)
  ipcMain.handle('git:commit', async (_event, message: string) => {
    const result = await gitExecStdin(['commit', '-F', '-'], message);
    if (result.code !== 0) {
      return { ok: false, error: result.stderr };
    }
    return { ok: true };
  });

  // Fetch from origin
  ipcMain.handle('git:fetch', () => {
    const result = gitExec(['fetch', '--all', '--prune']);
    return { success: result.code === 0, error: result.stderr };
  });

  // Get commit history
  ipcMain.handle('git:log', (_event, limit: number = 50) => {
    const format = '%H|%h|%s|%an|%ae|%ai|%P';
    const result = gitExec(['log', `-${limit}`, `--format=${format}`]);

    if (result.code !== 0) {
      return { commits: [], error: result.stderr };
    }

    const commits = result.stdout.split('\n').filter(Boolean).map((line) => {
      const [hash, shortHash, summary, authorName, authorEmail, date, parents] = line.split('|');
      return {
        hash,
        shortHash,
        summary,
        message: summary, // Full message loaded separately
        author: {
          name: authorName,
          email: authorEmail,
          date,
        },
        timestamp: new Date(date).getTime(),
        parents: parents ? parents.split(' ') : [],
        filesChanged: 0, // Loaded separately
        additions: 0,
        deletions: 0,
      };
    });

    return { commits };
  });

  // Get commit details
  ipcMain.handle('git:show', (_event, hash: string) => {
    // Get full commit message
    const messageResult = gitExec(['log', '-1', '--format=%B', hash]);
    if (messageResult.code !== 0) {
      return { error: messageResult.stderr };
    }

    // Get commit info
    const infoResult = gitExec(['log', '-1', '--format=%H|%h|%s|%an|%ae|%ai|%P', hash]);
    if (infoResult.code !== 0) {
      return { error: infoResult.stderr };
    }

    const [commitHash, shortHash, summary, authorName, authorEmail, date, parents] = infoResult.stdout.split('|');

    // Get files changed with stats
    const statsResult = gitExec(['diff-tree', '--no-commit-id', '--name-status', '-r', hash]);
    const files = statsResult.stdout.split('\n').filter(Boolean).map((line) => {
      const [status, path] = line.split('\t');
      let fileStatus: 'new' | 'modified' | 'deleted' | 'renamed' = 'modified';
      if (status === 'A') fileStatus = 'new';
      else if (status === 'D') fileStatus = 'deleted';
      else if (status.startsWith('R')) fileStatus = 'renamed';

      return {
        path,
        status: fileStatus,
        additions: 0,
        deletions: 0,
      };
    });

    // Get numstat for additions/deletions
    const numstatResult = gitExec(['diff-tree', '--no-commit-id', '--numstat', '-r', hash]);
    const numstatLines = numstatResult.stdout.split('\n').filter(Boolean);

    for (const line of numstatLines) {
      const [additions, deletions, path] = line.split('\t');
      const file = files.find((f) => f.path === path);
      if (file) {
        file.additions = parseInt(additions, 10) || 0;
        file.deletions = parseInt(deletions, 10) || 0;
      }
    }

    const commit = {
      hash: commitHash,
      shortHash,
      summary,
      message: messageResult.stdout,
      body: messageResult.stdout.split('\n').slice(1).join('\n').trim(),
      author: {
        name: authorName,
        email: authorEmail,
        date,
      },
      timestamp: new Date(date).getTime(),
      parents: parents ? parents.split(' ') : [],
      files,
      filesChanged: files.length,
      additions: files.reduce((sum, f) => sum + f.additions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    };

    return { commit };
  });

  // Get diff for a specific commit's file
  ipcMain.handle('git:diffCommit', (_event, hash: string, filePath: string) => {
    const result = gitExec(['show', '--format=', hash, '--', filePath]);
    if (result.code !== 0) {
      return { error: result.stderr };
    }
    return { diff: result.stdout };
  });
}
