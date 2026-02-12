/**
 * Scheduler IPC Handlers
 * 
 * Registers IPC handlers for the scheduler feature module.
 */

import { ipcMain } from 'electron';
import { createSchedulerModule, SchedulerFeature } from '../features/scheduler';
import {
    ScheduledJob,
    ScheduledEvent,
    CreateJobParams,
    UpdateJobParams,
    CreateEventParams,
    UpdateEventParams,
    JobHistoryQuery,
    JobRun,
    SchedulerSettings,
} from '../features/scheduler/types';
import { isSuccess } from '../features/base';

// ═══════════════════════════════════════════════════════════════════════════════
// Module Instance
// ═══════════════════════════════════════════════════════════════════════════════

let scheduler: SchedulerFeature | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════════════════════════

export async function setupSchedulerIpc(): Promise<void> {
    console.log('[Scheduler] Setting up IPC handlers...');

    // Create and initialize the scheduler module
    scheduler = createSchedulerModule();
    const initResult = await scheduler.initialize();

    if (!initResult.ok) {
        console.error('[Scheduler] Failed to initialize:', initResult.error);
    }

    // ---------------------------------------------------------------------------
    // Job CRUD
    // ---------------------------------------------------------------------------

    ipcMain.handle('scheduler:list', async (): Promise<ScheduledJob[]> => {
        if (!scheduler) return [];
        const result = await scheduler.listJobs();
        return isSuccess(result) ? (result.result ?? []) : [];
    });

    ipcMain.handle('scheduler:get', async (_event, id: string): Promise<ScheduledJob | null> => {
        if (!scheduler) return null;
        const result = await scheduler.getJob(id);
        return isSuccess(result) ? (result.result ?? null) : null;
    });

    ipcMain.handle('scheduler:create', async (_event, params: CreateJobParams): Promise<{ ok: boolean; job?: ScheduledJob; error?: string }> => {
        if (!scheduler) return { ok: false, error: 'Scheduler not initialized' };
        const result = await scheduler.createJob(params);
        if (isSuccess(result) && result.result) {
            return { ok: true, job: result.result };
        }
        return { ok: false, error: !isSuccess(result) ? result.error : 'Unknown error' };
    });

    ipcMain.handle('scheduler:update', async (_event, params: UpdateJobParams): Promise<{ ok: boolean; job?: ScheduledJob; error?: string }> => {
        if (!scheduler) return { ok: false, error: 'Scheduler not initialized' };
        const result = await scheduler.updateJob(params);
        if (isSuccess(result) && result.result) {
            return { ok: true, job: result.result };
        }
        return { ok: false, error: !isSuccess(result) ? result.error : 'Unknown error' };
    });

    ipcMain.handle('scheduler:delete', async (_event, id: string): Promise<{ ok: boolean; error?: string }> => {
        if (!scheduler) return { ok: false, error: 'Scheduler not initialized' };
        const result = await scheduler.deleteJob(id);
        return { ok: isSuccess(result) && result.result === true, error: !isSuccess(result) ? result.error : undefined };
    });

    // ---------------------------------------------------------------------------
    // Event CRUD
    // ---------------------------------------------------------------------------

    ipcMain.handle('scheduler:listEvents', async (): Promise<ScheduledEvent[]> => {
        if (!scheduler) return [];
        const result = await scheduler.listEvents();
        return isSuccess(result) ? (result.result ?? []) : [];
    });

    ipcMain.handle('scheduler:getEvent', async (_event, id: string): Promise<ScheduledEvent | null> => {
        if (!scheduler) return null;
        const result = await scheduler.getEvent(id);
        return isSuccess(result) ? (result.result ?? null) : null;
    });

    ipcMain.handle('scheduler:createEvent', async (_event, params: CreateEventParams): Promise<{ ok: boolean; event?: ScheduledEvent; error?: string }> => {
        if (!scheduler) return { ok: false, error: 'Scheduler not initialized' };
        const result = await scheduler.createEvent(params);
        if (isSuccess(result) && result.result) {
            return { ok: true, event: result.result };
        }
        return { ok: false, error: !isSuccess(result) ? result.error : 'Unknown error' };
    });

    ipcMain.handle('scheduler:updateEvent', async (_event, params: UpdateEventParams): Promise<{ ok: boolean; event?: ScheduledEvent; error?: string }> => {
        if (!scheduler) return { ok: false, error: 'Scheduler not initialized' };
        const result = await scheduler.updateEvent(params);
        if (isSuccess(result) && result.result) {
            return { ok: true, event: result.result };
        }
        return { ok: false, error: !isSuccess(result) ? result.error : 'Unknown error' };
    });

    ipcMain.handle('scheduler:deleteEvent', async (_event, id: string): Promise<{ ok: boolean; error?: string }> => {
        if (!scheduler) return { ok: false, error: 'Scheduler not initialized' };
        const result = await scheduler.deleteEvent(id);
        return { ok: isSuccess(result) && result.result === true, error: !isSuccess(result) ? result.error : undefined };
    });

    // ---------------------------------------------------------------------------
    // Job Control
    // ---------------------------------------------------------------------------

    ipcMain.handle('scheduler:cancelJob', async (_event, id: string): Promise<{ ok: boolean; error?: string }> => {
        if (!scheduler) return { ok: false, error: 'Scheduler not initialized' };
        try {
            await scheduler.cancelJob(id);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : 'Failed to cancel job' };
        }
    });

    ipcMain.handle('scheduler:runNow', async (_event, id: string): Promise<{ ok: boolean; error?: string }> => {
        if (!scheduler) return { ok: false, error: 'Scheduler not initialized' };
        const result = await scheduler.runJobNow(id);
        if (isSuccess(result) && result.result) {
            return result.result;
        }
        return { ok: false, error: !isSuccess(result) ? result.error : 'Unknown error' };
    });

    ipcMain.handle('scheduler:pause', async (_event, id: string): Promise<{ ok: boolean; error?: string }> => {
        if (!scheduler) return { ok: false, error: 'Scheduler not initialized' };
        const result = await scheduler.pauseJob(id);
        return { ok: isSuccess(result) && result.result === true, error: !isSuccess(result) ? result.error : undefined };
    });

    ipcMain.handle('scheduler:resume', async (_event, id: string): Promise<{ ok: boolean; error?: string }> => {
        if (!scheduler) return { ok: false, error: 'Scheduler not initialized' };
        const result = await scheduler.resumeJob(id);
        return { ok: isSuccess(result) && result.result === true, error: !isSuccess(result) ? result.error : undefined };
    });

    // ---------------------------------------------------------------------------
    // History
    // ---------------------------------------------------------------------------

    ipcMain.handle('scheduler:history', async (_event, query: JobHistoryQuery): Promise<JobRun[]> => {
        if (!scheduler) return [];
        const result = await scheduler.getJobHistory(query);
        return isSuccess(result) ? (result.result ?? []) : [];
    });

    // ---------------------------------------------------------------------------
    // Settings
    // ---------------------------------------------------------------------------

    ipcMain.handle('scheduler:getSettings', async (): Promise<SchedulerSettings | null> => {
        if (!scheduler) return null;
        const result = await scheduler.getSettings();
        return isSuccess(result) ? (result.result ?? null) : null;
    });

    ipcMain.handle('scheduler:updateSettings', async (_event, updates: Partial<SchedulerSettings>): Promise<{ ok: boolean; settings?: SchedulerSettings; error?: string }> => {
        if (!scheduler) return { ok: false, error: 'Scheduler not initialized' };
        const result = await scheduler.updateSettings(updates);
        if (isSuccess(result) && result.result) {
            return { ok: true, settings: result.result };
        }
        return { ok: false, error: !isSuccess(result) ? result.error : 'Unknown error' };
    });

    console.log('[Scheduler] IPC handlers registered');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════════════

export async function cleanupSchedulerIpc(): Promise<void> {
    console.log('[Scheduler] Cleaning up...');

    if (scheduler) {
        await scheduler.shutdown();
        scheduler = null;
    }

    // Remove handlers
    const handlers = [
        'scheduler:list',
        'scheduler:get',
        'scheduler:create',
        'scheduler:update',
        'scheduler:delete',
        'scheduler:listEvents',
        'scheduler:getEvent',
        'scheduler:createEvent',
        'scheduler:updateEvent',
        'scheduler:deleteEvent',
        'scheduler:cancelJob',
        'scheduler:runNow',
        'scheduler:pause',
        'scheduler:resume',
        'scheduler:history',
        'scheduler:getSettings',
        'scheduler:updateSettings',
    ];

    for (const channel of handlers) {
        ipcMain.removeHandler(channel);
    }

    console.log('[Scheduler] Cleanup complete');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export Scheduler Instance (for other modules)
// ═══════════════════════════════════════════════════════════════════════════════

export function getScheduler(): SchedulerFeature | null {
    return scheduler;
}
