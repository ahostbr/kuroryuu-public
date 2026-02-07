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

export type ExecutionMode = 'background' | 'interactive';

export interface PromptAction {
    type: 'prompt';
    prompt: string;
    workdir?: string;
    model?: string;
    allowedTools?: string[];
    /**
     * Execution mode:
     * - 'background': Run invisibly, auto-kill when done (for automated scheduled jobs)
     * - 'interactive': Show visible window, leave CLI alive after completion for user interaction
     * Default: 'background'
     */
    executionMode?: ExecutionMode;
}

export interface TeamAction {
    type: 'team';
    teamId: string;
    taskIds?: string[]; // Specific tasks to run, or all if empty
    /**
     * Team execution strategy:
     * - 'direct': Use IPC handlers to create team + message teammates directly
     * - 'prompt': Spawn claude CLI with /k-spawnteam in the prompt (simpler, more flexible)
     * Default: 'prompt'
     */
    executionStrategy?: 'direct' | 'prompt';
    /** Prompt to send to claude when using 'prompt' strategy. Defaults to /k-spawnteam {teamId} */
    prompt?: string;
    /** Working directory for prompt strategy */
    workdir?: string;
    /** Model override */
    model?: string;
    /** Execution mode for prompt strategy */
    executionMode?: ExecutionMode;
}

export interface ScriptAction {
    type: 'script';
    scriptPath: string;
    args?: string[];
    /**
     * Script timeout in minutes.
     * - 0 disables timeout
     * - undefined defaults to 60
     */
    timeoutMinutes?: number;
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

export interface ScheduledEvent {
    id: string;
    title: string;
    description?: string;
    enabled: boolean;
    schedule: Schedule;
    nextRun?: number;
    lastRun?: number;
    location?: string;
    allDay?: boolean;
    tags?: string[];
    notify?: boolean;
    color?: string;
    createdAt: number;
    updatedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Storage Schema
// ═══════════════════════════════════════════════════════════════════════════════

export interface SchedulerData {
    version: number;
    jobs: ScheduledJob[];
    events: ScheduledEvent[];
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

export interface CreateEventParams {
    title: string;
    description?: string;
    schedule: Schedule;
    enabled?: boolean;
    location?: string;
    allDay?: boolean;
    tags?: string[];
    notify?: boolean;
    color?: string;
}

export interface UpdateEventParams {
    id: string;
    title?: string;
    description?: string;
    schedule?: Schedule;
    enabled?: boolean;
    location?: string;
    allDay?: boolean;
    tags?: string[];
    notify?: boolean;
    color?: string;
}

export interface JobHistoryQuery {
    jobId?: string;
    status?: JobRun['status'];
    since?: number;
    limit?: number;
}
