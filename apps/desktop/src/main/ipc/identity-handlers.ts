/**
 * Identity IPC Handlers
 *
 * Registers IPC handlers for the identity/personal assistant system.
 * Follows scheduler-handlers.ts pattern.
 */

import { ipcMain, BrowserWindow } from 'electron';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { IdentityService, getIdentityService } from '../services/identity-service';
import { HeartbeatService, getHeartbeatService } from '../services/heartbeat-service';
import { MemorySyncService, getMemorySyncService } from '../services/memory-sync-service';
import type { IdentityFileKey, ActionType, ActionExecutionMode, HeartbeatNotificationMode } from '../../renderer/types/identity';

// ═══════════════════════════════════════════════════════════════════════════════
// Module Instance
// ═══════════════════════════════════════════════════════════════════════════════

let service: IdentityService | null = null;
let heartbeat: HeartbeatService | null = null;
let memorySync: MemorySyncService | null = null;
let identityWatcher: ReturnType<typeof import('chokidar').watch> | null = null;

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
        notificationMode: string;
        perActionMode: Record<string, string>;
        agentName: string;
        maxLinesPerFile: number;
        maxTurns: number;
        timeoutMinutes: number;
        executionBackend: 'cli' | 'sdk';
        executionRendering: 'pty' | 'jsonl';
    }>) => {
        if (!heartbeat) return { ok: false, error: 'Heartbeat service not initialized' };
        try {
            if (config.enabled !== undefined) {
                await heartbeat.setEnabled(config.enabled);
            }
            if (config.intervalMinutes !== undefined) {
                await heartbeat.setInterval(config.intervalMinutes);
            }
            if (config.notificationMode !== undefined) {
                await heartbeat.setNotificationMode(config.notificationMode as HeartbeatNotificationMode);
            }
            if (config.perActionMode) {
                for (const [type, mode] of Object.entries(config.perActionMode)) {
                    await heartbeat.setPerActionMode(type as ActionType, mode as ActionExecutionMode);
                }
            }
            if (config.agentName !== undefined) {
                await heartbeat.setAgentName(config.agentName);
            }
            if (config.maxLinesPerFile !== undefined) {
                await heartbeat.setMaxLinesPerFile(config.maxLinesPerFile);
            }
            if (config.maxTurns !== undefined) {
                await heartbeat.setMaxTurns(config.maxTurns);
            }
            if (config.timeoutMinutes !== undefined) {
                await heartbeat.setTimeoutMinutes(config.timeoutMinutes);
            }
            if (config.executionBackend !== undefined) {
                await heartbeat.setExecutionBackend(config.executionBackend);
            }
            if (config.executionRendering !== undefined) {
                await heartbeat.setExecutionRendering(config.executionRendering);
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    ipcMain.handle('identity:heartbeat:getPrompt', async () => {
        if (!heartbeat) return { ok: false, error: 'Heartbeat service not initialized' };
        try {
            const prompt = await heartbeat.buildHeartbeatPrompt();
            return { ok: true, prompt };
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

    // ---------------------------------------------------------------------------
    // Daily Memory
    // ---------------------------------------------------------------------------

    ipcMain.handle('identity:getDailyMemory', async (_event, date?: string) => {
        if (!service) return null;
        return await service.getDailyMemory(date);
    });

    ipcMain.handle('identity:appendDailyMemory', async (_event, entry: string, section: string, date?: string) => {
        if (!service) return { ok: false, error: 'Identity service not initialized' };
        try {
            await service.appendDailyMemory(entry, section, date);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    ipcMain.handle('identity:listDailyMemories', async (_event, limit?: number) => {
        if (!service) return [];
        return await service.listDailyMemories(limit);
    });

    ipcMain.handle('identity:promoteToMemory', async (_event, content: string) => {
        if (!service) return { ok: false, error: 'Identity service not initialized' };
        try {
            await service.promoteToMemory(content);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    // ---------------------------------------------------------------------------
    // Bootstrap
    // ---------------------------------------------------------------------------

    ipcMain.handle('identity:isBootstrapped', async () => {
        if (!service) return { bootstrapped: false };
        return await service.isBootstrapped();
    });

    ipcMain.handle('identity:runBootstrap', async () => {
        if (!service) return { ok: false, error: 'Identity service not initialized' };
        try {
            const prompt = await service.getBootstrapPrompt();
            const identityDir = service.getIdentityDir();
            const workdir = path.resolve(identityDir, '..', '..');
            const isWindows = os.platform() === 'win32';

            if (isWindows) {
                const escapePowerShell = (str: string): string =>
                    str.replace(/'/g, "''").replace(/`/g, "``").replace(/\$/g, "`$").replace(/\r?\n/g, "`n");

                const escapedPrompt = escapePowerShell(prompt);
                const escapedWorkdir = escapePowerShell(workdir);
                const cmd = `cmd /c start powershell -NoExit -Command "cd '${escapedWorkdir}'; Write-Host '=== Kuroryuu First Book ===' -ForegroundColor Cyan; Write-Host 'Your personal assistant wants to get to know you.' -ForegroundColor Yellow; Start-Sleep -Seconds 1; claude '${escapedPrompt}' --model claude-sonnet-4-5-20250929; Write-Host ''; Write-Host '=== First Book Complete ===' -ForegroundColor Green"`;

                await new Promise<void>((resolve, reject) => {
                    exec(cmd, { cwd: workdir }, (error) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        resolve();
                    });
                });
            } else {
                const escapedPrompt = prompt.replace(/'/g, "'\\''");
                const cmd = `gnome-terminal -- bash -c "claude '${escapedPrompt}' --model claude-sonnet-4-5-20250929; exec bash" || xterm -e "claude '${escapedPrompt}'; exec bash"`;

                await new Promise<void>((resolve, reject) => {
                    exec(cmd, { cwd: workdir }, (error) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        resolve();
                    });
                });
            }

            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    ipcMain.handle('identity:skipBootstrap', async () => {
        if (!service) return { ok: false, error: 'Identity service not initialized' };
        try {
            await service.completeBootstrapSkip();
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    ipcMain.handle('identity:resetBootstrap', async () => {
        if (!service) return { ok: false, error: 'Identity service not initialized' };
        try {
            await service.resetBootstrap();
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    // ---------------------------------------------------------------------------
    // Claude Memory Sync
    // ---------------------------------------------------------------------------

    memorySync = getMemorySyncService();

    ipcMain.handle('identity:syncClaudeMemory', async () => {
        if (!memorySync) return { ok: false, error: 'Memory sync service not initialized' };
        try {
            const result = await memorySync.syncFromClaude();
            return { ok: true, ...result };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    ipcMain.handle('identity:getMemorySyncStatus', async () => {
        if (!memorySync) return null;
        return await memorySync.getLastSyncState();
    });

    // ---------------------------------------------------------------------------
    // Identity File Watcher (for bootstrap completion detection)
    // ---------------------------------------------------------------------------

    try {
        const chokidar = require('chokidar');
        const identityDir = service.getIdentityDir();
        const watcher = chokidar.watch(identityDir, {
            ignoreInitial: true,
            depth: 0,
        });
        identityWatcher = watcher;
        watcher.on('add', (filePath: string) => {
            if (path.basename(filePath) === '.bootstrap_complete') {
                const windows = BrowserWindow.getAllWindows();
                for (const win of windows) {
                    if (!win.isDestroyed()) {
                        win.webContents.send('identity:bootstrap:completed');
                    }
                }
            }
        });
        watcher.on('change', (filePath: string) => {
            const basename = path.basename(filePath);
            if (basename.endsWith('.md')) {
                const windows = BrowserWindow.getAllWindows();
                for (const win of windows) {
                    if (!win.isDestroyed()) {
                        win.webContents.send('identity:filesChanged', basename);
                    }
                }
            }
        });
    } catch (err) {
        console.warn('[Identity] Could not start file watcher:', err);
    }

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
        'identity:heartbeat:getPrompt',
        'identity:heartbeat:runNow',
        'identity:heartbeat:syncJob',
        'identity:getDailyMemory',
        'identity:appendDailyMemory',
        'identity:listDailyMemories',
        'identity:promoteToMemory',
        'identity:isBootstrapped',
        'identity:runBootstrap',
        'identity:skipBootstrap',
        'identity:resetBootstrap',
        'identity:syncClaudeMemory',
        'identity:getMemorySyncStatus',
    ];

    for (const channel of handlers) {
        ipcMain.removeHandler(channel);
    }

    if (identityWatcher) {
        identityWatcher.close();
        identityWatcher = null;
    }

    service = null;
    heartbeat = null;
    memorySync = null;
    console.log('[Identity] Cleanup complete');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export Service Instance (for heartbeat service)
// ═══════════════════════════════════════════════════════════════════════════════

export function getIdentityIpcService(): IdentityService | null {
    return service;
}
