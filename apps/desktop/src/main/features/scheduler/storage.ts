/**
 * Scheduler Storage
 * 
 * Handles persistence of scheduled jobs to disk.
 * Uses atomic writes with backup rotation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    SchedulerData,
    ScheduledJob,
    ScheduledEvent,
    SchedulerSettings,
    DEFAULT_SCHEDULER_SETTINGS,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const SCHEDULER_DIR = path.join(os.homedir(), '.claude', 'kuroryuu');
const SCHEDULER_FILE = path.join(SCHEDULER_DIR, 'schedules.json');
const BACKUP_DIR = path.join(SCHEDULER_DIR, 'schedule_backups');
const MAX_BACKUPS = 10;
const CURRENT_VERSION = 2;

// ═══════════════════════════════════════════════════════════════════════════════
// Storage Class
// ═══════════════════════════════════════════════════════════════════════════════

export class SchedulerStorage {
    private data: SchedulerData;
    private writeLock: Promise<void> = Promise.resolve();

    constructor() {
        this.data = this.getDefaultData();
    }

    private getDefaultData(): SchedulerData {
        return {
            version: CURRENT_VERSION,
            jobs: [],
            events: [],
            settings: { ...DEFAULT_SCHEDULER_SETTINGS },
        };
    }

    // ---------------------------------------------------------------------------
    // Initialization
    // ---------------------------------------------------------------------------

    async initialize(): Promise<void> {
        // Ensure directories exist
        await fs.promises.mkdir(SCHEDULER_DIR, { recursive: true });
        await fs.promises.mkdir(BACKUP_DIR, { recursive: true });

        // One-time cleanup of legacy PID directory (replaced by SDK AbortController)
        const pidsDir = path.join(SCHEDULER_DIR, 'pids');
        try {
            const pidFiles = await fs.promises.readdir(pidsDir);
            if (pidFiles.length >= 0) {
                await fs.promises.rm(pidsDir, { recursive: true, force: true });
                console.log('[Scheduler] Cleaned up legacy pids/ directory');
            }
        } catch {
            // Directory doesn't exist, nothing to clean up
        }

        // Load existing data
        await this.load();
    }

    // ---------------------------------------------------------------------------
    // Load
    // ---------------------------------------------------------------------------

    async load(): Promise<SchedulerData> {
        try {
            const content = await fs.promises.readFile(SCHEDULER_FILE, 'utf-8');
            const parsed = JSON.parse(content) as SchedulerData;

            // Validate version
            if (parsed.version !== CURRENT_VERSION) {
                console.log(`[Scheduler] Migrating data from version ${parsed.version} to ${CURRENT_VERSION}`);
                this.data = this.migrate(parsed);
            } else {
                this.data = parsed;
            }

            // Ensure settings exist
            if (!this.data.settings) {
                this.data.settings = { ...DEFAULT_SCHEDULER_SETTINGS };
            }
            if (!this.data.events) {
                this.data.events = [];
            }

            return this.data;
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                // File doesn't exist, use defaults
                this.data = this.getDefaultData();
                await this.save();
            } else {
                console.error('[Scheduler] Failed to load schedules:', err);
                this.data = this.getDefaultData();
            }
            return this.data;
        }
    }

    // ---------------------------------------------------------------------------
    // Save
    // ---------------------------------------------------------------------------

    async save(): Promise<void> {
        // Queue writes to prevent concurrent file access
        this.writeLock = this.writeLock.then(() => this.doSave());
        await this.writeLock;
    }

    private async doSave(): Promise<void> {
        try {
            // Create backup before writing
            await this.createBackup();

            // Write to temp file first
            const tempFile = SCHEDULER_FILE + '.tmp';
            const content = JSON.stringify(this.data, null, 2);
            await fs.promises.writeFile(tempFile, content, 'utf-8');

            // Atomic rename
            await fs.promises.rename(tempFile, SCHEDULER_FILE);
        } catch (err) {
            console.error('[Scheduler] Failed to save schedules:', err);
            throw err;
        }
    }

    // ---------------------------------------------------------------------------
    // Backup
    // ---------------------------------------------------------------------------

    private async createBackup(): Promise<void> {
        try {
            // Check if source exists
            await fs.promises.access(SCHEDULER_FILE);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `schedules_${timestamp}.json`);

            await fs.promises.copyFile(SCHEDULER_FILE, backupFile);
            await this.rotateBackups();
        } catch {
            // Source doesn't exist, skip backup
        }
    }

    private async rotateBackups(): Promise<void> {
        try {
            const files = await fs.promises.readdir(BACKUP_DIR);
            const backups = files
                .filter(f => f.startsWith('schedules_') && f.endsWith('.json'))
                .sort()
                .reverse();

            // Remove old backups
            for (let i = MAX_BACKUPS; i < backups.length; i++) {
                await fs.promises.unlink(path.join(BACKUP_DIR, backups[i]));
            }
        } catch (err) {
            console.error('[Scheduler] Failed to rotate backups:', err);
        }
    }

    // ---------------------------------------------------------------------------
    // Migration
    // ---------------------------------------------------------------------------

    private migrate(data: SchedulerData): SchedulerData {
        // v1 → v2: Schema is additive (new optional fields on PromptAction/JobRun), no data migration needed
        return {
            ...data,
            version: CURRENT_VERSION,
        };
    }

    // ---------------------------------------------------------------------------
    // Job CRUD
    // ---------------------------------------------------------------------------

    getJobs(): ScheduledJob[] {
        return [...this.data.jobs];
    }

    getJob(id: string): ScheduledJob | undefined {
        return this.data.jobs.find(j => j.id === id);
    }

    async addJob(job: ScheduledJob): Promise<void> {
        this.data.jobs.push(job);
        await this.save();
    }

    async updateJob(id: string, updates: Partial<ScheduledJob>): Promise<ScheduledJob | undefined> {
        const index = this.data.jobs.findIndex(j => j.id === id);
        if (index === -1) return undefined;

        this.data.jobs[index] = {
            ...this.data.jobs[index],
            ...updates,
            updatedAt: Date.now(),
        };
        await this.save();
        return this.data.jobs[index];
    }

    async deleteJob(id: string): Promise<boolean> {
        const index = this.data.jobs.findIndex(j => j.id === id);
        if (index === -1) return false;

        this.data.jobs.splice(index, 1);
        await this.save();
        return true;
    }

    // ---------------------------------------------------------------------------
    // Event CRUD
    // ---------------------------------------------------------------------------

    getEvents(): ScheduledEvent[] {
        return [...this.data.events];
    }

    getEvent(id: string): ScheduledEvent | undefined {
        return this.data.events.find(e => e.id === id);
    }

    async addEvent(event: ScheduledEvent): Promise<void> {
        this.data.events.push(event);
        await this.save();
    }

    async updateEvent(id: string, updates: Partial<ScheduledEvent>): Promise<ScheduledEvent | undefined> {
        const index = this.data.events.findIndex(e => e.id === id);
        if (index === -1) return undefined;

        this.data.events[index] = {
            ...this.data.events[index],
            ...updates,
            updatedAt: Date.now(),
        };
        await this.save();
        return this.data.events[index];
    }

    async deleteEvent(id: string): Promise<boolean> {
        const index = this.data.events.findIndex(e => e.id === id);
        if (index === -1) return false;

        this.data.events.splice(index, 1);
        await this.save();
        return true;
    }

    // ---------------------------------------------------------------------------
    // Settings
    // ---------------------------------------------------------------------------

    getSettings(): SchedulerSettings {
        return { ...this.data.settings };
    }

    async updateSettings(updates: Partial<SchedulerSettings>): Promise<void> {
        this.data.settings = {
            ...this.data.settings,
            ...updates,
        };
        await this.save();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton
// ═══════════════════════════════════════════════════════════════════════════════

let _storage: SchedulerStorage | null = null;

export function getSchedulerStorage(): SchedulerStorage {
    if (!_storage) {
        _storage = new SchedulerStorage();
    }
    return _storage;
}

export function resetSchedulerStorage(): void {
    _storage = null;
}
