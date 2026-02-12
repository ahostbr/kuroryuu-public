/**
 * Identity IPC Handlers
 *
 * Registers IPC handlers for the identity/personal assistant system.
 * Follows scheduler-handlers.ts pattern.
 */

import { ipcMain } from 'electron';
import { IdentityService, getIdentityService } from '../services/identity-service';
import { HeartbeatService, getHeartbeatService } from '../services/heartbeat-service';
import type { IdentityFileKey, ActionType, ActionExecutionMode, HeartbeatNotificationMode } from '../../renderer/types/identity';

// ═══════════════════════════════════════════════════════════════════════════════
// Module Instance
// ═══════════════════════════════════════════════════════════════════════════════

let service: IdentityService | null = null;
let heartbeat: HeartbeatService | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════════════════════════

export async function setupIdentityIpc(): Promise<void> {
    console.log('[Identity] Setting up IPC handlers...');

    service = getIdentityService();
    await service.initialize();
    heartbeat = getHeartbeatService();

    // ---------------------------------------------------------------------------
    // Profile & Files
    // ---------------------------------------------------------------------------

    ipcMain.handle('identity:getProfile', async () => {
        if (!service) return null;
        return await service.getProfile();
    });

    ipcMain.handle('identity:getFile', async (_event, key: IdentityFileKey) => {
        if (!service) return null;
        return await service.getFile(key);
    });

    ipcMain.handle('identity:updateFile', async (_event, key: IdentityFileKey, content: string) => {
        if (!service) return { ok: false, error: 'Identity service not initialized' };
        try {
            await service.updateFile(key, content);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    // ---------------------------------------------------------------------------
    // Mutations
    // ---------------------------------------------------------------------------

    ipcMain.handle('identity:getMutations', async (_event, limit?: number, since?: number) => {
        if (!service) return [];
        return await service.getMutations(limit, since);
    });

    // ---------------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------------

    ipcMain.handle('identity:getActions', async (_event, limit?: number, since?: number) => {
        if (!service) return [];
        return await service.getActions(limit, since);
    });

    // ---------------------------------------------------------------------------
    // Activity (unified timeline)
    // ---------------------------------------------------------------------------

    ipcMain.handle('identity:getActivity', async (_event, since?: number, until?: number) => {
        if (!service) return [];
        return await service.getActivity(since, until);
    });

    // ---------------------------------------------------------------------------
    // Heartbeat History
    // ---------------------------------------------------------------------------

    ipcMain.handle('identity:getHeartbeatHistory', async (_event, limit?: number) => {
        if (!service) return [];
        return await service.getHeartbeatHistory(limit);
    });

    // ---------------------------------------------------------------------------
    // Initialize
    // ---------------------------------------------------------------------------

    ipcMain.handle('identity:initialize', async () => {
        if (!service) return { ok: false, error: 'Identity service not initialized' };
        try {
            await service.initialize();
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    // ---------------------------------------------------------------------------
    // Heartbeat
    // ---------------------------------------------------------------------------

    ipcMain.handle('identity:heartbeat:status', async () => {
        if (!heartbeat) return null;
        return await heartbeat.getStatus();
    });

    ipcMain.handle('identity:heartbeat:configure', async (_event, config: Partial<{
        enabled: boolean;
        intervalMinutes: number;
        perActionMode: Record<string, string>;
    }>) => {
        if (!heartbeat) return { ok: false, error: 'Heartbeat service not initialized' };
        try {
            if (config.enabled !== undefined) {
                await heartbeat.setEnabled(config.enabled);
            }
            if (config.intervalMinutes !== undefined) {
                await heartbeat.setInterval(config.intervalMinutes);
            }
            if (config.perActionMode) {
                for (const [type, mode] of Object.entries(config.perActionMode)) {
                    await heartbeat.setPerActionMode(type as ActionType, mode as ActionExecutionMode);
                }
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    ipcMain.handle('identity:heartbeat:runNow', async () => {
        if (!heartbeat) return { ok: false, error: 'Heartbeat service not initialized' };
        return await heartbeat.runNow();
    });

    ipcMain.handle('identity:heartbeat:syncJob', async () => {
        if (!heartbeat) return { ok: false, error: 'Heartbeat service not initialized' };
        try {
            await heartbeat.syncJob();
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    console.log('[Identity] IPC handlers registered');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════════════

export async function cleanupIdentityIpc(): Promise<void> {
    console.log('[Identity] Cleaning up...');

    const handlers = [
        'identity:getProfile',
        'identity:getFile',
        'identity:updateFile',
        'identity:getMutations',
        'identity:getActions',
        'identity:getActivity',
        'identity:getHeartbeatHistory',
        'identity:initialize',
        'identity:heartbeat:status',
        'identity:heartbeat:configure',
        'identity:heartbeat:runNow',
        'identity:heartbeat:syncJob',
    ];

    for (const channel of handlers) {
        ipcMain.removeHandler(channel);
    }

    service = null;
    heartbeat = null;
    console.log('[Identity] Cleanup complete');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export Service Instance (for heartbeat service)
// ═══════════════════════════════════════════════════════════════════════════════

export function getIdentityIpcService(): IdentityService | null {
    return service;
}
