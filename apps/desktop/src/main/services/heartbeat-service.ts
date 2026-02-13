/**
 * Heartbeat Service
 *
 * Manages the heartbeat lifecycle — creates/updates a scheduler job that
 * periodically runs a prompt with identity context. Reads identity files,
 * builds the prompt, and logs heartbeat runs + actions.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BrowserWindow, Notification, ipcMain } from 'electron';
import { getScheduler } from '../ipc/scheduler-handlers';
import { getProjectRoot } from '../utils/paths';
import { getIdentityService } from './identity-service';
import type { IdentityService } from './identity-service';
import { isSuccess } from '../features/base';
import type {
    HeartbeatConfig,
    HeartbeatRun,
    HeartbeatNotificationMode,
    ActionType,
    ActionExecutionMode,
} from '../../renderer/types/identity';
import type { CreateJobParams, ScheduledJob } from '../features/scheduler/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const HEARTBEAT_JOB_TAG = 'heartbeat-personal-assistant';
const HEARTBEAT_JOB_NAME = 'Kuroryuu Personal Assistant Heartbeat';

// ═══════════════════════════════════════════════════════════════════════════════
// Config persistence
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG_DIR = path.join(os.homedir(), '.claude', 'kuroryuu');
const CONFIG_FILE = path.join(CONFIG_DIR, 'heartbeat-config.json');

const DEFAULT_CONFIG: HeartbeatConfig = {
    enabled: false,
    intervalMinutes: 30,
    notificationMode: 'toast',
    perActionMode: {
        create_task: 'proposal_first',
        update_identity: 'direct',
        memory_update: 'direct',
        scheduler_job: 'proposal_first',
    },
    agentName: 'Kuroryuu',
    maxLinesPerFile: 50,
    maxTurns: 10,
    timeoutMinutes: 5,
    executionBackend: 'cli',
    executionRendering: 'pty',
};

async function loadConfig(): Promise<HeartbeatConfig> {
    try {
        const content = await fs.promises.readFile(CONFIG_FILE, 'utf-8');
        return JSON.parse(content) as HeartbeatConfig;
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

async function saveConfig(config: HeartbeatConfig): Promise<void> {
    await fs.promises.mkdir(CONFIG_DIR, { recursive: true });
    const tempFile = CONFIG_FILE + '.tmp';
    await fs.promises.writeFile(tempFile, JSON.stringify(config, null, 2), 'utf-8');
    await fs.promises.rename(tempFile, CONFIG_FILE);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Service Class
// ═══════════════════════════════════════════════════════════════════════════════

export class HeartbeatService {
    private identityService: IdentityService;
    private config: HeartbeatConfig | null = null;

    constructor() {
        this.identityService = getIdentityService();
    }

    // ---------------------------------------------------------------------------
    // Config
    // ---------------------------------------------------------------------------

    async getConfig(): Promise<HeartbeatConfig> {
        if (!this.config) {
            this.config = await loadConfig();
        }
        return { ...this.config };
    }

    async setEnabled(enabled: boolean): Promise<void> {
        const config = await this.getConfig();
        config.enabled = enabled;
        this.config = config;
        await saveConfig(config);
        await this.syncJob();
    }

    async setInterval(minutes: number): Promise<void> {
        const config = await this.getConfig();
        config.intervalMinutes = Math.max(5, Math.min(1440, minutes));
        this.config = config;
        await saveConfig(config);
        await this.syncJob();
    }

    async setNotificationMode(mode: HeartbeatNotificationMode): Promise<void> {
        const config = await this.getConfig();
        config.notificationMode = mode;
        this.config = config;
        await saveConfig(config);
    }

    async setPerActionMode(actionType: ActionType, mode: ActionExecutionMode): Promise<void> {
        const config = await this.getConfig();
        config.perActionMode[actionType] = mode;
        this.config = config;
        await saveConfig(config);
    }

    async setAgentName(name: string): Promise<void> {
        const config = await this.getConfig();
        config.agentName = name.trim() || 'Kuroryuu';
        this.config = config;
        await saveConfig(config);
    }

    async setMaxLinesPerFile(lines: number): Promise<void> {
        const config = await this.getConfig();
        config.maxLinesPerFile = Math.max(10, Math.min(500, lines));
        this.config = config;
        await saveConfig(config);
    }

    async setMaxTurns(turns: number): Promise<void> {
        const config = await this.getConfig();
        config.maxTurns = Math.max(1, Math.min(50, turns));
        this.config = config;
        await saveConfig(config);
        await this.syncJob();
    }

    async setTimeoutMinutes(minutes: number): Promise<void> {
        const config = await this.getConfig();
        config.timeoutMinutes = Math.max(1, Math.min(30, minutes));
        this.config = config;
        await saveConfig(config);
        await this.syncJob();
    }

    async setExecutionBackend(backend: 'cli' | 'sdk'): Promise<void> {
        const config = await this.getConfig();
        config.executionBackend = backend;
        this.config = config;
        await saveConfig(config);
        await this.syncJob();
    }

    async setExecutionRendering(rendering: 'pty' | 'jsonl'): Promise<void> {
        const config = await this.getConfig();
        config.executionRendering = rendering;
        this.config = config;
        await saveConfig(config);
        await this.syncJob();
    }

    // ---------------------------------------------------------------------------
    // Status
    // ---------------------------------------------------------------------------

    async getStatus(): Promise<{
        config: HeartbeatConfig;
        jobExists: boolean;
        jobStatus: string | null;
        lastRun: number | null;
        nextRun: number | null;
        ghAvailable: boolean;
    }> {
        const config = await this.getConfig();
        const job = await this.findHeartbeatJob();

        let ghAvailable = false;
        try {
            const { execSync } = require('child_process');
            execSync('where gh', { stdio: 'pipe' });
            ghAvailable = true;
        } catch {
            // gh not found
        }

        return {
            config,
            jobExists: !!job,
            jobStatus: job?.status ?? null,
            lastRun: job?.lastRun ?? null,
            nextRun: job?.nextRun ?? null,
            ghAvailable,
        };
    }

    // ---------------------------------------------------------------------------
    // Scheduler Job Management
    // ---------------------------------------------------------------------------

    async syncJob(): Promise<void> {
        const scheduler = getScheduler();
        if (!scheduler) {
            console.warn('[Heartbeat] Scheduler not available, cannot sync job');
            return;
        }

        const config = await this.getConfig();
        const existingJob = await this.findHeartbeatJob();

        if (!config.enabled) {
            if (existingJob && existingJob.enabled) {
                await scheduler.updateJob({
                    id: existingJob.id,
                    enabled: false,
                });
                console.log('[Heartbeat] Disabled heartbeat job');
            }
            return;
        }

        const prompt = await this.buildHeartbeatPrompt();

        const backend = config.executionBackend || 'cli';

        if (existingJob) {
            await scheduler.updateJob({
                id: existingJob.id,
                enabled: true,
                schedule: {
                    type: 'interval',
                    every: config.intervalMinutes,
                    unit: 'minutes',
                },
                action: {
                    type: 'prompt',
                    prompt,
                    workdir: getProjectRoot(),
                    executionMode: 'background',
                    permissionMode: 'default',
                    maxTurns: config.maxTurns ?? 10,
                    timeoutMinutes: config.timeoutMinutes ?? 5,
                    executionBackend: backend,
                    executionRendering: config.executionRendering || 'pty',
                },
            });
            console.log('[Heartbeat] Updated heartbeat job');
        } else {
            const params: CreateJobParams = {
                name: HEARTBEAT_JOB_NAME,
                description: 'Proactive personal assistant heartbeat — checks tasks, project health, and updates identity',
                schedule: {
                    type: 'interval',
                    every: config.intervalMinutes,
                    unit: 'minutes',
                },
                action: {
                    type: 'prompt',
                    prompt,
                    workdir: getProjectRoot(),
                    executionMode: 'background',
                    permissionMode: 'default',
                    maxTurns: config.maxTurns ?? 10,
                    timeoutMinutes: config.timeoutMinutes ?? 5,
                    executionBackend: backend,
                    executionRendering: config.executionRendering || 'pty',
                },
                enabled: true,
                tags: [HEARTBEAT_JOB_TAG, 'personal-assistant'],
                notifyOnComplete: false,
                notifyOnError: true,
            };
            await scheduler.createJob(params);
            console.log('[Heartbeat] Created heartbeat job');
        }
    }

    async runNow(): Promise<{ ok: boolean; error?: string }> {
        const scheduler = getScheduler();
        if (!scheduler) {
            return { ok: false, error: 'Scheduler not available' };
        }

        let job = await this.findHeartbeatJob();
        if (!job) {
            await this.syncJob();
            job = await this.findHeartbeatJob();
            if (!job) {
                return { ok: false, error: 'Failed to create heartbeat job' };
            }
        }

        // Refresh prompt before running
        const config = await this.getConfig();
        const prompt = await this.buildHeartbeatPrompt();
        const runBackend = config.executionBackend || 'cli';
        await scheduler.updateJob({
            id: job.id,
            action: {
                type: 'prompt',
                prompt,
                workdir: getProjectRoot(),
                executionMode: 'background',
                permissionMode: 'default',
                maxTurns: config.maxTurns ?? 10,
                timeoutMinutes: config.timeoutMinutes ?? 5,
                executionBackend: runBackend,
                executionRendering: 'pty',
            },
        });

        const result = await scheduler.runJobNow(job.id);
        if (isSuccess(result) && result.result) {
            return result.result;
        }
        return { ok: false, error: !isSuccess(result) ? result.error : 'Unknown error' };
    }

    // ---------------------------------------------------------------------------
    // Prompt Building
    // ---------------------------------------------------------------------------

    async buildHeartbeatPrompt(): Promise<string> {
        const profile = await this.identityService.getProfile();
        const config = await this.getConfig();

        // Sync Claude memory before building prompt
        try {
            const { getMemorySyncService } = require('./memory-sync-service');
            const syncService = getMemorySyncService();
            const syncResult = await syncService.syncFromClaude();
            if (syncResult.sectionsImported > 0) {
                console.log(`[Heartbeat] Synced ${syncResult.sectionsImported} lines from Claude Memory`);
            }
        } catch (err) {
            console.warn('[Heartbeat] Claude Memory sync failed:', err);
        }

        const maxLines = config.maxLinesPerFile ?? 50;
        const truncate = (content: string, label: string): string => {
            const lines = content.split('\n');
            if (lines.length > maxLines) {
                console.warn(`[Heartbeat] Truncating ${label} from ${lines.length} to ${maxLines} lines`);
                return lines.slice(0, maxLines).join('\n') + '\n\n[... truncated]';
            }
            return content;
        };

        // Get today's daily memory (last 20 lines)
        let dailyContext = '';
        try {
            const daily = await this.identityService.getDailyMemory();
            const lines = daily.content.split('\n');
            if (lines.length > 1) { // More than just the header
                dailyContext = lines.slice(-20).join('\n');
            }
        } catch { /* no daily memory yet */ }

        // Check for gh CLI
        let ghAvailable = false;
        try {
            const { execSync } = require('child_process');
            execSync('where gh', { stdio: 'pipe' });
            ghAvailable = true;
        } catch {
            // gh not found
        }

        const actionModes = Object.entries(config.perActionMode)
            .map(([type, mode]) => `- ${type}: ${mode}`)
            .join('\n');

        const agentName = config.agentName || 'Kuroryuu';
        const timeout = config.timeoutMinutes ?? 5;
        const todayDate = new Date().toISOString().split('T')[0];

        return `You are ${agentName}, performing a scheduled heartbeat check.

## Your Identity

### Soul
${truncate(profile.soul.content, 'soul')}

### User Preferences
${truncate(profile.user.content, 'user')}

### Long-Term Memory
${truncate(profile.memory.content, 'memory')}

${dailyContext ? `### Today's Context\n${dailyContext}\n` : ''}
### Standing Instructions
${truncate(profile.heartbeat.content, 'heartbeat')}

## HARD RULE — Identity File Updates (MANDATORY)

**You MUST update your identity files on EVERY heartbeat run. This is non-negotiable.**

Files to update (all under ai/identity/):
1. **ai/identity/memory/${todayDate}.md** — ALWAYS write today's daily context. Summarize what happened, what changed, current status. This is the MOST important output.
2. **ai/identity/heartbeat.md** — Update wave progress table, status changes, any new standing instructions.
3. **ai/identity/actions.json** — Append your heartbeat action entry to the actions array.
4. **ai/identity/soul.md** — Update "Current Phase" section if the phase has changed (wave started/completed).
5. **ai/identity/memory.md** — Add a new memory entry ONLY for major milestones (wave completion, significant discovery).
6. **ai/identity/user.md** — Update ONLY if user preferences or facts have changed.

If you skip updating these files, the heartbeat is INCOMPLETE. The Desktop UI reads these files directly — stale files mean stale context for every future session.

## Execution Rules

Action execution modes:
${actionModes}

- For "direct" actions: Execute immediately
- For "proposal_first" actions: Log as proposals in ai/identity/actions.json but do not execute

${ghAvailable ? '- GitHub CLI (gh) is available for repository checks' : '- GitHub CLI (gh) is NOT available — skip GitHub-related checks'}

## Output Format

After performing your checks, write your findings to:
1. ai/identity/actions.json — any actions taken or proposed
2. ai/identity/mutations.jsonl — any identity file updates (append JSONL)
3. Update identity files directly if you have high-confidence improvements

Keep the heartbeat run under ${timeout} minutes. Focus on the most impactful observations.`;
    }

    // ---------------------------------------------------------------------------
    // Heartbeat Run Logging
    // ---------------------------------------------------------------------------

    async logHeartbeatRun(run: HeartbeatRun): Promise<void> {
        await this.identityService.addHeartbeatRun(run);

        const config = await this.getConfig();
        const hasActions = run.actionsGenerated > 0;
        const isFailed = run.status === 'failed';

        // Always send IPC event to renderer (for badge count)
        if (hasActions || isFailed) {
            const windows = BrowserWindow.getAllWindows();
            for (const win of windows) {
                if (!win.isDestroyed()) {
                    win.webContents.send('identity:heartbeat:completed', {
                        actionsCount: run.actionsGenerated,
                        status: run.status,
                    });
                }
            }
        }

        // Notification based on configured mode
        if (hasActions || isFailed) {
            const title = isFailed
                ? 'Heartbeat: Error'
                : `Heartbeat: ${run.actionsGenerated} action${run.actionsGenerated !== 1 ? 's' : ''}`;
            const body = isFailed
                ? run.error ?? 'Heartbeat failed'
                : `${run.actionsGenerated} action${run.actionsGenerated !== 1 ? 's' : ''} executed`;

            await this.sendNotification(config.notificationMode, title, body);
        }

        // Archive expired actions on each heartbeat
        await this.identityService.archiveExpiredActions();

        // Append run summary to today's daily memory
        try {
            const summary = run.status === 'failed'
                ? `- ${new Date(run.startedAt).toLocaleTimeString()} — Heartbeat failed: ${run.error ?? 'unknown error'}`
                : `- ${new Date(run.startedAt).toLocaleTimeString()} — Heartbeat completed: ${run.actionsGenerated} action(s)`;
            await this.identityService.appendDailyMemory(summary, 'Heartbeat Runs');
        } catch (err) {
            console.warn('[Heartbeat] Failed to log to daily memory:', err);
        }
    }

    // ---------------------------------------------------------------------------
    // Notification Dispatch
    // ---------------------------------------------------------------------------

    private async sendNotification(mode: HeartbeatNotificationMode, title: string, body: string): Promise<void> {
        switch (mode) {
            case 'none':
                break;

            case 'toast':
                // Toast is handled renderer-side via the IPC event already sent above
                // The renderer's onHeartbeatCompleted listener shows toast via the store
                break;

            case 'os':
                try {
                    const notification = new Notification({ title, body, urgency: 'normal' });
                    notification.show();
                } catch (err) {
                    console.error('[Heartbeat] Failed to show OS notification:', err);
                }
                break;

            case 'tts':
                try {
                    // Use the TTS IPC channel directly (same as renderer would)
                    // ipcMain.handle is async, so we invoke the TTS module via the handler
                    const { TTSModule } = require('../features/tts/module');
                    // Access the global ttsModule if available
                    const ttsResult = await new Promise<void>((resolve) => {
                        // Fire and forget — trigger tts:speak through the IPC system
                        const windows = BrowserWindow.getAllWindows();
                        const win = windows.find(w => !w.isDestroyed());
                        if (win) {
                            win.webContents.send('identity:heartbeat:tts', `${title}. ${body}`);
                        }
                        resolve();
                    });
                } catch (err) {
                    console.error('[Heartbeat] Failed to trigger TTS notification:', err);
                }
                break;
        }
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private async findHeartbeatJob(): Promise<ScheduledJob | null> {
        const scheduler = getScheduler();
        if (!scheduler) return null;

        const result = await scheduler.listJobs();
        if (isSuccess(result) && result.result) {
            return result.result.find(j => j.tags?.includes(HEARTBEAT_JOB_TAG)) ?? null;
        }
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton
// ═══════════════════════════════════════════════════════════════════════════════

let _heartbeat: HeartbeatService | null = null;

export function getHeartbeatService(): HeartbeatService {
    if (!_heartbeat) {
        _heartbeat = new HeartbeatService();
    }
    return _heartbeat;
}
