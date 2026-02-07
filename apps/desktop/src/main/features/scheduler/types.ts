/**
 * Scheduler Types
 * 
 * Type definitions for the scheduling system.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Schedule Definitions
// ═══════════════════════════════════════════════════════════════════════════════

export interface CronSchedule {
    type: 'cron';
    expression: string; // e.g., "0 9 * * 1-5" = 9am weekdays
}

export interface IntervalSchedule {
    type: 'interval';
    every: number;
    unit: 'minutes' | 'hours' | 'days' | 'weeks';
}

export interface OneTimeSchedule {
    type: 'once';
    at: number; // Unix timestamp
}

export type Schedule = CronSchedule | IntervalSchedule | OneTimeSchedule;

// ═══════════════════════════════════════════════════════════════════════════════
// Job Actions
// ═══════════════════════════════════════════════════════════════════════════════

export interface PromptAction {
    type: 'prompt';
    prompt: string;
    workdir?: string;
    model?: string;
    allowedTools?: string[];
}

export interface TeamAction {
    type: 'team';
    teamId: string;
    taskIds?: string[]; // Specific tasks to run, or all if empty
}

export interface ScriptAction {
    type: 'script';
    scriptPath: string;
    args?: string[];
}

export type JobAction = PromptAction | TeamAction | ScriptAction;

// ═══════════════════════════════════════════════════════════════════════════════
// Job Run History
// ═══════════════════════════════════════════════════════════════════════════════

export interface JobRun {
    id: string;
    startedAt: number;
    completedAt?: number;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    error?: string;
    output?: string; // Summary or last lines of output
    metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scheduled Job
// ═══════════════════════════════════════════════════════════════════════════════

export interface ScheduledJob {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    schedule: Schedule;
    action: JobAction;

    // Runtime state
    status: 'idle' | 'running' | 'paused';
    lastRun?: number;
    nextRun?: number;

    // History (last N runs)
    history: JobRun[];

    // Metadata
    createdAt: number;
    updatedAt: number;
    tags?: string[];

    // Notifications
    notifyOnStart?: boolean;
    notifyOnComplete?: boolean;
    notifyOnError?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Storage Schema
// ═══════════════════════════════════════════════════════════════════════════════

export interface SchedulerData {
    version: number;
    jobs: ScheduledJob[];
    settings: SchedulerSettings;
}

export interface SchedulerSettings {
    enabled: boolean; // Global enable/disable
    maxConcurrentJobs: number;
    historyRetentionDays: number;
    defaultNotifyOnError: boolean;
}

export const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
    enabled: true,
    maxConcurrentJobs: 3,
    historyRetentionDays: 30,
    defaultNotifyOnError: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Module Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateJobParams {
    name: string;
    description?: string;
    schedule: Schedule;
    action: JobAction;
    enabled?: boolean;
    tags?: string[];
    notifyOnStart?: boolean;
    notifyOnComplete?: boolean;
    notifyOnError?: boolean;
}

export interface UpdateJobParams {
    id: string;
    name?: string;
    description?: string;
    schedule?: Schedule;
    action?: JobAction;
    enabled?: boolean;
    tags?: string[];
    notifyOnStart?: boolean;
    notifyOnComplete?: boolean;
    notifyOnError?: boolean;
}

export interface JobHistoryQuery {
    jobId?: string;
    status?: JobRun['status'];
    since?: number;
    limit?: number;
}
