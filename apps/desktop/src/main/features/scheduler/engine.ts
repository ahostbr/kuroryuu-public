/**
 * Scheduler Engine
 * 
 * Timer management, next-run calculation, and job execution.
 */

import { EventEmitter } from 'events';
import { Notification } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import {
    ScheduledJob,
    JobRun,
    Schedule,
    CronSchedule,
    IntervalSchedule,
    OneTimeSchedule,
    JobAction,
} from './types';
import { getSchedulerStorage } from './storage';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds
const MAX_HISTORY_PER_JOB = 50;

// ═══════════════════════════════════════════════════════════════════════════════
// Cron Parser (simplified)
// ═══════════════════════════════════════════════════════════════════════════════

function parseCronField(field: string, min: number, max: number): number[] {
    if (field === '*') {
        return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    }

    const values: number[] = [];
    const parts = field.split(',');

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            for (let i = start; i <= end; i++) {
                if (i >= min && i <= max) values.push(i);
            }
        } else if (part.includes('/')) {
            const [, step] = part.split('/');
            const stepNum = parseInt(step, 10);
            for (let i = min; i <= max; i += stepNum) {
                values.push(i);
            }
        } else {
            const num = parseInt(part, 10);
            if (num >= min && num <= max) values.push(num);
        }
    }

    return values.sort((a, b) => a - b);
}

function getNextCronTime(expression: string, after: Date = new Date()): Date | null {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const [minField, hourField, domField, monField, dowField] = parts;

    const minutes = parseCronField(minField, 0, 59);
    const hours = parseCronField(hourField, 0, 23);
    const daysOfMonth = parseCronField(domField, 1, 31);
    const months = parseCronField(monField, 1, 12);
    const daysOfWeek = parseCronField(dowField, 0, 6);

    const start = new Date(after.getTime() + 60000); // Start at least 1 minute ahead
    start.setSeconds(0, 0);

    // Search up to 1 year ahead
    const maxDate = new Date(after.getTime() + 365 * 24 * 60 * 60 * 1000);

    const current = new Date(start);
    while (current < maxDate) {
        const month = current.getMonth() + 1;
        const dom = current.getDate();
        const dow = current.getDay();
        const hour = current.getHours();
        const minute = current.getMinutes();

        if (
            months.includes(month) &&
            daysOfMonth.includes(dom) &&
            daysOfWeek.includes(dow) &&
            hours.includes(hour) &&
            minutes.includes(minute)
        ) {
            return current;
        }

        current.setMinutes(current.getMinutes() + 1);
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Schedule Calculations
// ═══════════════════════════════════════════════════════════════════════════════

export function calculateNextRun(schedule: Schedule, after: Date = new Date()): number | null {
    switch (schedule.type) {
        case 'cron': {
            const next = getNextCronTime(schedule.expression, after);
            return next ? next.getTime() : null;
        }

        case 'interval': {
            const ms = getIntervalMs(schedule);
            const nextTime = after.getTime() + ms;
            return nextTime;
        }

        case 'once': {
            return schedule.at > after.getTime() ? schedule.at : null;
        }

        default:
            return null;
    }
}

function getIntervalMs(schedule: IntervalSchedule): number {
    const multipliers: Record<IntervalSchedule['unit'], number> = {
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000,
    };
    return schedule.every * multipliers[schedule.unit];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scheduler Engine
// ═══════════════════════════════════════════════════════════════════════════════

export class SchedulerEngine extends EventEmitter {
    private checkTimer: NodeJS.Timeout | null = null;
    private runningJobs: Map<string, JobRun> = new Map();
    private isRunning = false;

    // Job execution callback (set by scheduler.ts)
    // Returns optional output/metadata to merge into the JobRun record
    public executeJobAction: ((job: ScheduledJob) => Promise<{ output?: string; metadata?: Record<string, unknown> } | void>) | null = null;

    // ---------------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------------

    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log('[Scheduler] Engine starting...');

        // Calculate next run times for all jobs
        await this.recalculateNextRuns();

        // Start periodic check
        this.checkTimer = setInterval(() => this.checkAndExecute(), CHECK_INTERVAL_MS);

        // Immediate check
        await this.checkAndExecute();

        console.log('[Scheduler] Engine started');
    }

    async stop(): Promise<void> {
        if (!this.isRunning) return;
        this.isRunning = false;

        console.log('[Scheduler] Engine stopping...');

        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }

        console.log('[Scheduler] Engine stopped');
    }

    // ---------------------------------------------------------------------------
    // Check and Execute
    // ---------------------------------------------------------------------------

    private async checkAndExecute(): Promise<void> {
        if (!this.isRunning) return;

        const storage = getSchedulerStorage();
        const settings = storage.getSettings();

        if (!settings.enabled) return;

        const now = Date.now();
        const jobs = storage.getJobs();

        for (const job of jobs) {
            // Skip disabled, paused, or already running jobs
            if (!job.enabled || job.status === 'paused' || job.status === 'running') {
                continue;
            }

            // Check concurrent limit
            if (this.runningJobs.size >= settings.maxConcurrentJobs) {
                break;
            }

            // Check if due
            if (job.nextRun && job.nextRun <= now) {
                await this.executeJob(job);
            }
        }

        await this.checkAndAdvanceEvents(now);
    }

    // ---------------------------------------------------------------------------
    // Job Execution
    // ---------------------------------------------------------------------------

    async executeJob(job: ScheduledJob): Promise<void> {
        const storage = getSchedulerStorage();

        // Create run record
        const run: JobRun = {
            id: uuidv4(),
            startedAt: Date.now(),
            status: 'running',
        };

        // Update job status
        await storage.updateJob(job.id, {
            status: 'running',
            lastRun: run.startedAt,
        });

        this.runningJobs.set(job.id, run);
        this.emit('job:started', { jobId: job.id, runId: run.id });

        // Notify if enabled
        if (job.notifyOnStart) {
            this.showNotification(`Starting: ${job.name}`, 'Scheduled job is starting...');
        }

        try {
            // Execute the action
            if (this.executeJobAction) {
                const result = await this.executeJobAction(job);
                // Merge returned output/metadata into the run record
                if (result) {
                    if (result.output) run.output = result.output;
                    if (result.metadata) run.metadata = result.metadata;
                }
            } else {
                console.warn('[Scheduler] No job executor configured');
            }

            // Mark as completed
            run.status = 'completed';
            run.completedAt = Date.now();

            if (job.notifyOnComplete) {
                this.showNotification(`Completed: ${job.name}`, 'Scheduled job finished successfully.');
            }
        } catch (err) {
            // Mark as failed
            run.status = 'failed';
            run.completedAt = Date.now();
            run.error = err instanceof Error ? err.message : String(err);

            console.error(`[Scheduler] Job ${job.id} failed:`, err);

            if (job.notifyOnError) {
                this.showNotification(`Failed: ${job.name}`, run.error, 'critical');
            }
        }

        this.runningJobs.delete(job.id);

        // Update job with run history
        const currentJob = storage.getJob(job.id);
        if (currentJob) {
            const history = [run, ...currentJob.history].slice(0, MAX_HISTORY_PER_JOB);
            const nextRun = calculateNextRun(job.schedule);

            await storage.updateJob(job.id, {
                status: 'idle',
                history,
                nextRun: nextRun ?? undefined,
            });
        }

        this.emit('job:completed', { jobId: job.id, runId: run.id, status: run.status });
    }

    // ---------------------------------------------------------------------------
    // Run Now (manual trigger)
    // ---------------------------------------------------------------------------

    async runNow(jobId: string): Promise<{ ok: boolean; error?: string }> {
        const storage = getSchedulerStorage();
        const job = storage.getJob(jobId);

        if (!job) {
            return { ok: false, error: 'Job not found' };
        }

        if (this.runningJobs.has(jobId)) {
            return { ok: false, error: 'Job is already running' };
        }

        await this.executeJob(job);
        return { ok: true };
    }

    private async checkAndAdvanceEvents(now: number): Promise<void> {
        const storage = getSchedulerStorage();
        const events = storage.getEvents();

        for (const event of events) {
            if (!event.enabled || !event.nextRun || event.nextRun > now) {
                continue;
            }

            if (event.notify) {
                this.showNotification(
                    `Event: ${event.title}`,
                    event.location ? `Now • ${event.location}` : 'Scheduled event is due now.'
                );
            }

            const nextRun = calculateNextRun(event.schedule, new Date(now));
            await storage.updateEvent(event.id, {
                lastRun: now,
                nextRun: nextRun ?? undefined,
            });

            this.emit('event:triggered', { eventId: event.id, at: now });
        }
    }

    // ---------------------------------------------------------------------------
    // Recalculate Next Runs
    // ---------------------------------------------------------------------------

    async recalculateNextRuns(): Promise<void> {
        const storage = getSchedulerStorage();
        const jobs = storage.getJobs();

        for (const job of jobs) {
            if (job.enabled && job.status !== 'paused') {
                const nextRun = calculateNextRun(job.schedule);
                if (nextRun !== job.nextRun) {
                    await storage.updateJob(job.id, { nextRun: nextRun ?? undefined });
                }
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Notifications
    // ---------------------------------------------------------------------------

    private showNotification(title: string, body: string, urgency?: 'normal' | 'critical'): void {
        try {
            const notification = new Notification({
                title,
                body,
                urgency: urgency ?? 'normal',
            });
            notification.show();
        } catch (err) {
            console.error('[Scheduler] Failed to show notification:', err);
        }
    }

    // ---------------------------------------------------------------------------
    // Status
    // ---------------------------------------------------------------------------

    getRunningJobs(): string[] {
        return Array.from(this.runningJobs.keys());
    }

    isJobRunning(jobId: string): boolean {
        return this.runningJobs.has(jobId);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton
// ═══════════════════════════════════════════════════════════════════════════════

let _engine: SchedulerEngine | null = null;

export function getSchedulerEngine(): SchedulerEngine {
    if (!_engine) {
        _engine = new SchedulerEngine();
    }
    return _engine;
}

export function resetSchedulerEngine(): void {
    if (_engine) {
        _engine.stop();
        _engine = null;
    }
}
