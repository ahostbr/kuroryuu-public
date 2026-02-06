/**
 * Claude Teams Archive Service
 *
 * Persists team session data to disk when teams are cleaned up.
 * Archives are stored at: {projectRoot}/ai/team-history/{id}.json
 *
 * Each archive captures the full team state at the moment of archival:
 * config, tasks, inbox messages, and computed statistics.
 */

import * as path from 'path';
import * as fs from 'fs';
import { readFile, writeFile, readdir, unlink, mkdir } from 'fs/promises';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface ArchivedTeamStats {
  memberCount: number;
  taskCount: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  messageCount: number;
}

export interface ArchivedTeamSession {
  schema: 'kuroryuu_team_archive_v1';
  id: string;                        // "{teamName}_{YYYYMMDD}_{HHMMSS}"
  archivedAt: string;                // ISO 8601
  teamName: string;
  createdAt: number;                 // Epoch ms (from team config)
  duration: number;                  // ms from createdAt to archivedAt
  stats: ArchivedTeamStats;
  config: unknown;                   // Full TeamConfig
  tasks: unknown[];                  // Full TeamTask[]
  inboxes: Record<string, unknown[]>; // Full inbox messages by agent name
}

/** Lightweight entry for listing archives without loading full data. */
export interface TeamHistoryEntry {
  id: string;
  teamName: string;
  archivedAt: string;
  createdAt: number;
  duration: number;
  stats: ArchivedTeamStats;
  filePath: string;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/** Resolve project root from __dirname (main process is in apps/desktop/out/main/) */
function getProjectRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function getHistoryDir(): string {
  return path.join(getProjectRoot(), 'ai', 'team-history');
}

function ensureHistoryDir(): void {
  const dir = getHistoryDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

// -----------------------------------------------------------------------
// Archive Operations
// -----------------------------------------------------------------------

/**
 * Archive a team session to disk.
 * Called before cleanup to preserve team data.
 */
export async function archiveTeamSession(data: {
  teamName: string;
  config: unknown;
  tasks: unknown[];
  inboxes: Record<string, unknown[]>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    ensureHistoryDir();

    const now = new Date();
    const id = `${data.teamName}_${formatTimestamp(now)}`;
    const filePath = path.join(getHistoryDir(), `${id}.json`);

    // Extract createdAt from config
    const config = data.config as { createdAt?: number } | undefined;
    const createdAt = config?.createdAt ?? Date.now();

    // Compute stats
    const tasks = data.tasks as { status?: string }[];
    const stats: ArchivedTeamStats = {
      memberCount: ((data.config as { members?: unknown[] })?.members ?? []).length,
      taskCount: tasks.length,
      completedTasks: tasks.filter((t) => t.status === 'completed').length,
      pendingTasks: tasks.filter((t) => t.status === 'pending').length,
      inProgressTasks: tasks.filter((t) => t.status === 'in_progress').length,
      messageCount: Object.values(data.inboxes).reduce((sum, msgs) => sum + msgs.length, 0),
    };

    const archive: ArchivedTeamSession = {
      schema: 'kuroryuu_team_archive_v1',
      id,
      archivedAt: now.toISOString(),
      teamName: data.teamName,
      createdAt,
      duration: now.getTime() - createdAt,
      stats,
      config: data.config,
      tasks: data.tasks,
      inboxes: data.inboxes,
    };

    await writeFile(filePath, JSON.stringify(archive, null, 2), 'utf-8');
    console.log(`[TeamArchive] Saved archive: ${id}`);
    return { ok: true, id };
  } catch (err) {
    console.error('[TeamArchive] Failed to archive:', err);
    return { ok: false, error: String(err) };
  }
}

/**
 * List all archived team sessions (lightweight, no full data).
 * Sorted by archivedAt descending (most recent first).
 */
export async function listArchivedSessions(): Promise<TeamHistoryEntry[]> {
  const dir = getHistoryDir();
  if (!fs.existsSync(dir)) return [];

  const entries: TeamHistoryEntry[] = [];

  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(dir, file);
      try {
        const content = await readFile(filePath, 'utf-8');
        const archive = JSON.parse(content) as ArchivedTeamSession;

        if (archive.schema !== 'kuroryuu_team_archive_v1') continue;

        entries.push({
          id: archive.id,
          teamName: archive.teamName,
          archivedAt: archive.archivedAt,
          createdAt: archive.createdAt,
          duration: archive.duration,
          stats: archive.stats,
          filePath,
        });
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    return [];
  }

  // Sort by archivedAt descending
  entries.sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());
  return entries;
}

/**
 * Load a full archived team session by ID.
 */
export async function loadArchivedSession(
  archiveId: string,
): Promise<ArchivedTeamSession | null> {
  const filePath = path.join(getHistoryDir(), `${archiveId}.json`);
  try {
    const content = await readFile(filePath, 'utf-8');
    const archive = JSON.parse(content) as ArchivedTeamSession;
    if (archive.schema !== 'kuroryuu_team_archive_v1') return null;
    return archive;
  } catch {
    return null;
  }
}

/**
 * Delete an archived team session by ID.
 */
export async function deleteArchivedSession(
  archiveId: string,
): Promise<{ ok: boolean; error?: string }> {
  const filePath = path.join(getHistoryDir(), `${archiveId}.json`);
  try {
    await unlink(filePath);
    console.log(`[TeamArchive] Deleted archive: ${archiveId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
