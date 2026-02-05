/**
 * Claude Teams File Watcher Service
 *
 * Watches ~/.claude/teams/ and ~/.claude/tasks/ for changes
 * and emits IPC events to the renderer process for real-time updates.
 *
 * Uses chokidar for reliable cross-platform file watching with debounce.
 */

import { watch, type FSWatcher } from 'chokidar';
import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { readFile, readdir } from 'fs/promises';

// ---------------------------------------------------------------------------
// Types (matches Phase 0 discovery schemas)
// Will be imported from renderer/types/claude-teams.ts once available.
// ---------------------------------------------------------------------------

interface TeamConfig {
  name: string;
  description: string;
  createdAt: number;
  leadAgentId: string;
  leadSessionId: string;
  members: TeamMember[];
}

interface TeamMember {
  agentId: string;
  name: string;
  agentType: string;
  model: string;
  joinedAt: number;
  tmuxPaneId: string;
  cwd: string;
  subscriptions: string[];
  prompt?: string;
  color?: string;
  planModeRequired?: boolean;
  backendType?: string;
}

interface TaskFile {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  blocks: string[];
  blockedBy: string[];
  activeForm?: string;
  owner?: string;
  metadata?: {
    _internal?: boolean;
    [key: string]: unknown;
  };
}

interface InboxMessage {
  from: string;
  text: string;
  timestamp: string;
  read: boolean;
  summary?: string;
  color?: string;
}

// ---------------------------------------------------------------------------
// Snapshot types for bulk state delivery
// ---------------------------------------------------------------------------

export interface TeamsSnapshot {
  teams: { teamName: string; config: TeamConfig }[];
  tasks: { teamName: string; tasks: TaskFile[] }[];
  messages: { teamName: string; agentName: string; messages: InboxMessage[] }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAMS_DIR = path.join(os.homedir(), '.claude', 'teams');
const TASKS_DIR = path.join(os.homedir(), '.claude', 'tasks');

// ---------------------------------------------------------------------------
// Watcher Service
// ---------------------------------------------------------------------------

class ClaudeTeamsWatcher {
  private teamsWatcher: FSWatcher | null = null;
  private tasksWatcher: FSWatcher | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isWatching = false;
  private isRendererReady = false;

  /**
   * Set the main window reference for IPC communication.
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    this.isRendererReady = false;
    window.webContents.on('did-finish-load', () => {
      this.isRendererReady = true;
    });
  }

  /**
   * Start watching ~/.claude/teams/ and ~/.claude/tasks/ for changes.
   * On start, sends a full snapshot of all existing teams/tasks/messages.
   */
  async start(): Promise<TeamsSnapshot> {
    if (this.isWatching) {
      return this.getFullSnapshot();
    }

    // Ensure directories exist before watching
    this.ensureDir(TEAMS_DIR);
    this.ensureDir(TASKS_DIR);

    // Watch teams directory (config.json + inboxes)
    this.teamsWatcher = watch(TEAMS_DIR, {
      persistent: true,
      ignoreInitial: true,
      depth: 3, // teams/{name}/inboxes/{agent}.json
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
      ignored: (filePath: string) => {
        // Ignore .lock files and non-JSON files (but allow directories)
        const ext = path.extname(filePath);
        if (ext && ext !== '.json') return true;
        if (path.basename(filePath) === '.lock') return true;
        return false;
      },
    });

    this.teamsWatcher.on('add', (filePath: string) => this.handleTeamsFileChange(filePath));
    this.teamsWatcher.on('change', (filePath: string) => this.handleTeamsFileChange(filePath));
    this.teamsWatcher.on('unlink', (filePath: string) => this.handleTeamsFileDelete(filePath));
    this.teamsWatcher.on('error', (err: unknown) => {
      console.error('[ClaudeTeamsWatcher] Teams watcher error:', err);
      this.send('claude-teams:watcher-error', { error: String(err) });
    });

    // Watch tasks directory
    this.tasksWatcher = watch(TASKS_DIR, {
      persistent: true,
      ignoreInitial: true,
      depth: 2, // tasks/{name}/{id}.json
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
      ignored: (filePath: string) => {
        const ext = path.extname(filePath);
        if (ext && ext !== '.json') return true;
        if (path.basename(filePath) === '.lock') return true;
        return false;
      },
    });

    this.tasksWatcher.on('add', (filePath: string) => this.handleTasksFileChange(filePath));
    this.tasksWatcher.on('change', (filePath: string) => this.handleTasksFileChange(filePath));
    this.tasksWatcher.on('unlink', (filePath: string) => this.handleTasksFileDelete(filePath));
    this.tasksWatcher.on('error', (err: unknown) => {
      console.error('[ClaudeTeamsWatcher] Tasks watcher error:', err);
      this.send('claude-teams:watcher-error', { error: String(err) });
    });

    this.isWatching = true;
    console.log('[ClaudeTeamsWatcher] Started watching', TEAMS_DIR, 'and', TASKS_DIR);

    // Send initial full snapshot
    return this.getFullSnapshot();
  }

  /**
   * Stop all watchers.
   */
  async stop(): Promise<void> {
    if (this.teamsWatcher) {
      await this.teamsWatcher.close();
      this.teamsWatcher = null;
    }
    if (this.tasksWatcher) {
      await this.tasksWatcher.close();
      this.tasksWatcher = null;
    }
    this.isWatching = false;
    console.log('[ClaudeTeamsWatcher] Stopped watching');
  }

  /**
   * Get the current watching status.
   */
  getStatus(): boolean {
    return this.isWatching;
  }

  // -------------------------------------------------------------------------
  // Full snapshot (reads all teams, tasks, messages from disk)
  // -------------------------------------------------------------------------

  async getFullSnapshot(): Promise<TeamsSnapshot> {
    const snapshot: TeamsSnapshot = { teams: [], tasks: [], messages: [] };

    // Read all teams
    const teamNames = await this.listSubdirs(TEAMS_DIR);
    for (const teamName of teamNames) {
      const config = await this.readTeamConfig(teamName);
      if (config) {
        snapshot.teams.push({ teamName, config });
      }

      // Read inbox messages for this team
      const inboxDir = path.join(TEAMS_DIR, teamName, 'inboxes');
      const inboxFiles = await this.listJsonFiles(inboxDir);
      for (const inboxFile of inboxFiles) {
        const agentName = path.basename(inboxFile, '.json');
        const messages = await this.readInbox(teamName, agentName);
        if (messages && messages.length > 0) {
          snapshot.messages.push({ teamName, agentName, messages });
        }
      }
    }

    // Read all tasks
    const taskTeamNames = await this.listSubdirs(TASKS_DIR);
    for (const teamName of taskTeamNames) {
      const tasks = await this.readAllTasks(teamName);
      if (tasks.length > 0) {
        snapshot.tasks.push({ teamName, tasks });
      }
    }

    return snapshot;
  }

  // -------------------------------------------------------------------------
  // Individual reads
  // -------------------------------------------------------------------------

  async readTeamConfig(teamName: string): Promise<TeamConfig | null> {
    const configPath = path.join(TEAMS_DIR, teamName, 'config.json');
    return this.readJsonFile<TeamConfig>(configPath);
  }

  async readAllTasks(teamName: string): Promise<TaskFile[]> {
    const taskDir = path.join(TASKS_DIR, teamName);
    const files = await this.listJsonFiles(taskDir);
    const tasks: TaskFile[] = [];

    for (const file of files) {
      const basename = path.basename(file, '.json');
      // Only read numeric task files (skip .lock and any metadata files)
      if (!/^\d+$/.test(basename)) continue;

      const task = await this.readJsonFile<TaskFile>(path.join(taskDir, file));
      if (task) {
        tasks.push(task);
      }
    }

    // Sort by numeric ID
    tasks.sort((a, b) => parseInt(a.id) - parseInt(b.id));
    return tasks;
  }

  async readInbox(teamName: string, agentName: string): Promise<InboxMessage[] | null> {
    const inboxPath = path.join(TEAMS_DIR, teamName, 'inboxes', `${agentName}.json`);
    return this.readJsonFile<InboxMessage[]>(inboxPath);
  }

  // -------------------------------------------------------------------------
  // File change handlers
  // -------------------------------------------------------------------------

  private async handleTeamsFileChange(filePath: string): Promise<void> {
    const normalized = filePath.replace(/\\/g, '/');
    const teamsNorm = TEAMS_DIR.replace(/\\/g, '/');
    const relative = normalized.replace(teamsNorm + '/', '');
    const parts = relative.split('/');

    if (parts.length < 2) return;

    const teamName = parts[0];

    // Determine if this is a config change or inbox change
    if (parts[1] === 'config.json') {
      // Team config updated (member added/removed, team created)
      const config = await this.readTeamConfig(teamName);
      if (config) {
        this.send('claude-teams:config-updated', { teamName, config });
      }
    } else if (parts[1] === 'inboxes' && parts.length >= 3) {
      // Inbox message added/updated
      const agentName = path.basename(parts[2], '.json');
      const messages = await this.readInbox(teamName, agentName);
      if (messages) {
        this.send('claude-teams:messages-updated', { teamName, agentName, messages });
      }
    }
  }

  private handleTeamsFileDelete(filePath: string): void {
    const normalized = filePath.replace(/\\/g, '/');
    const teamsNorm = TEAMS_DIR.replace(/\\/g, '/');
    const relative = normalized.replace(teamsNorm + '/', '');
    const parts = relative.split('/');

    if (parts.length < 2) return;

    const teamName = parts[0];

    if (parts[1] === 'config.json') {
      // Team deleted (cleanup happened)
      this.send('claude-teams:team-deleted', { teamName });
    }
  }

  private async handleTasksFileChange(filePath: string): Promise<void> {
    const normalized = filePath.replace(/\\/g, '/');
    const tasksNorm = TASKS_DIR.replace(/\\/g, '/');
    const relative = normalized.replace(tasksNorm + '/', '');
    const parts = relative.split('/');

    if (parts.length < 2) return;

    const teamName = parts[0];
    const basename = path.basename(parts[1], '.json');

    // Only process numeric task files
    if (!/^\d+$/.test(basename)) return;

    // Read all tasks for this team and send the full set
    const tasks = await this.readAllTasks(teamName);
    this.send('claude-teams:tasks-updated', { teamName, tasks });
  }

  private async handleTasksFileDelete(filePath: string): Promise<void> {
    const normalized = filePath.replace(/\\/g, '/');
    const tasksNorm = TASKS_DIR.replace(/\\/g, '/');
    const relative = normalized.replace(tasksNorm + '/', '');
    const parts = relative.split('/');

    if (parts.length < 2) return;

    const teamName = parts[0];

    // Re-read remaining tasks
    const tasks = await this.readAllTasks(teamName);
    this.send('claude-teams:tasks-updated', { teamName, tasks });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private send(channel: string, data: unknown): void {
    try {
      if (!this.isRendererReady) {
        console.warn('[ClaudeTeamsWatcher] Sending before renderer ready:', channel);
      }
      if (
        this.mainWindow &&
        !this.mainWindow.isDestroyed() &&
        this.mainWindow.webContents &&
        !this.mainWindow.webContents.isDestroyed()
      ) {
        this.mainWindow.webContents.send(channel, data);
      }
    } catch {
      // Window was destroyed between check and send
    }
  }

  private ensureDir(dirPath: string): void {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    } catch {
      // May not have permission - that's OK, watcher will handle it
    }
  }

  private async readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private async listSubdirs(dirPath: string): Promise<string[]> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  private async listJsonFiles(dirPath: string): Promise<string[]> {
    try {
      const entries = await readdir(dirPath);
      return entries.filter((e) => e.endsWith('.json'));
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const claudeTeamsWatcher = new ClaudeTeamsWatcher();
