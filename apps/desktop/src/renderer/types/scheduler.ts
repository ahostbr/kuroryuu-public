/**
 * Scheduler Types
 * 
 * Type definitions for the scheduler feature in the renderer.
 * These mirror the main process types from features/scheduler/types.ts
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Schedule Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface CronSchedule {
    type: 'cron';
    expression: string;
    timezone?: string;
}

export interface IntervalSchedule {
    type: 'interval';
    every: number;
    unit: 'minutes' | 'hours' | 'days' | 'weeks';
    startAt?: number;
}

export interface OneTimeSchedule {
    type: 'once';
    at: number;
}

export type Schedule = CronSchedule | IntervalSchedule | OneTimeSchedule;

// ═══════════════════════════════════════════════════════════════════════════════
// Action Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface PromptAction {
    type: 'prompt';
    prompt: string;
    workdir?: string;
    model?: string;
}

export interface TeamAction {
    type: 'team';
    teamId: string;
    taskIds?: string[];
}

export interface ScriptAction {
    type: 'script';
    scriptPath: string;
    args?: string[];
}

export type JobAction = PromptAction | TeamAction | ScriptAction;

// ═══════════════════════════════════════════════════════════════════════════════
// Job Types
// ═══════════════════════════════════════════════════════════════════════════════

export type JobStatus = 'idle' | 'running' | 'paused';

export interface ScheduledJob {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    schedule: Schedule;
    action: JobAction;
    status: JobStatus;
    lastRun?: number;
    nextRun?: number;
    createdAt: number;
    updatedAt: number;
    tags?: string[];
    notifyOnStart?: boolean;
    notifyOnComplete?: boolean;
    notifyOnError?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Job Run / History
// ═══════════════════════════════════════════════════════════════════════════════

export type JobRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobRun {
    id: string;
    jobId: string;
    startedAt: number;
    completedAt?: number;
    status: JobRunStatus;
    output?: string;
    error?: string;
    triggeredBy: 'schedule' | 'manual';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════════════════════════

export interface SchedulerSettings {
    enabled: boolean;
    maxConcurrentJobs: number;
    historyRetentionDays: number;
    defaultNotifyOnError: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Request Types
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
    status?: JobRunStatus;
    since?: number;
    limit?: number;
}
