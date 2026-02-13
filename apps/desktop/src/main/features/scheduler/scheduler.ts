/**
 * Scheduler Feature Module
 * 
 * Feature module for the scheduling system, following the FeatureManager pattern.
 * Provides actions for job CRUD, execution, and history queries.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    IFeatureModule,
    FeatureResponse,
    FeatureErrorCode,
} from '../base';
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
} from './types';
import { getSchedulerStorage, SchedulerStorage } from './storage';
import { getSchedulerEngine, SchedulerEngine, calculateNextRun } from './engine';
import { getClaudeSDKService } from '../../services/claude-sdk-service';
import { getCliExecutionService } from '../../services/cli-execution-service';
import { getApiKey } from '../../integrations/token-store';
import type { ExecutionBackend } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Module Metadata
// ═══════════════════════════════════════════════════════════════════════════════

const SCHEDULER_ID = 'scheduler';
const SCHEDULER_NAME = 'Job Scheduler';
const SCHEDULER_VERSION = '1.0.0';
const SCHEDULER_ACTIONS = [
    'listJobs',
    'getJob',
    'createJob',
    'updateJob',
    'deleteJob',
    'listEvents',
    'getEvent',
    'createEvent',
    'updateEvent',
    'deleteEvent',
    'runJobNow',
    'pauseJob',
    'resumeJob',
    'getJobHistory',
    'getSettings',
    'updateSettings',
];

// ═══════════════════════════════════════════════════════════════════════════════
// Scheduler Feature Module
// ═══════════════════════════════════════════════════════════════════════════════

export class SchedulerFeature implements IFeatureModule {
    readonly id = SCHEDULER_ID;
    readonly name = SCHEDULER_NAME;
    readonly version = SCHEDULER_VERSION;

    private _isInitialized = false;
    private storage: SchedulerStorage;
    private engine: SchedulerEngine;
    /** Maps jobId → SDK sessionId for running background jobs */
    private sdkSessions = new Map<string, string>();

    constructor() {
        this.storage = getSchedulerStorage();
        this.engine = getSchedulerEngine();
    }

    get isInitialized(): boolean {
        return this._isInitialized;
    }

    getSupportedActions(): string[] {
        return [...SCHEDULER_ACTIONS];
    }

    // ---------------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------------

    async initialize(): Promise<FeatureResponse<void>> {
        try {
            // Initialize storage
            await this.storage.initialize();

            // Configure engine executor
            this.engine.executeJobAction = async (job: ScheduledJob) => {
                await this.executeJobAction(job);
            };

            // Start engine
            await this.engine.start();

            this._isInitialized = true;
            return { ok: true };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to initialize scheduler',
                errorCode: FeatureErrorCode.INITIALIZATION_FAILED,
            };
        }
    }

    async shutdown(): Promise<FeatureResponse<void>> {
        try {
            // Cancel all running sessions (CLI + SDK)
            const cli = getCliExecutionService();
            for (const [jobId, sessionId] of this.sdkSessions.entries()) {
                console.log(`[Scheduler] Shutdown: cancelling session ${sessionId} for job ${jobId}`);
                try {
                    if (cli.hasSession(sessionId)) {
                        await cli.stopAgent(sessionId);
                    } else {
                        await getClaudeSDKService().stopAgent(sessionId);
                    }
                } catch { /* best-effort */ }
            }
            this.sdkSessions.clear();
            await cli.shutdown();

            await this.engine.stop();
            this._isInitialized = false;
            return { ok: true };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to shutdown scheduler',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    // ---------------------------------------------------------------------------
    // Action Router
    // ---------------------------------------------------------------------------

    async execute<T>(action: string, params: Record<string, unknown>): Promise<FeatureResponse<T>> {
        if (!this._isInitialized) {
            return {
                ok: false,
                error: 'Scheduler not initialized',
                errorCode: FeatureErrorCode.MODULE_NOT_INITIALIZED,
            };
        }

        switch (action) {
            case 'listJobs':
                return this.listJobs() as Promise<FeatureResponse<T>>;
            case 'getJob':
                return this.getJob(params.id as string) as Promise<FeatureResponse<T>>;
            case 'createJob':
                return this.createJob(params as unknown as CreateJobParams) as Promise<FeatureResponse<T>>;
            case 'updateJob':
                return this.updateJob(params as unknown as UpdateJobParams) as Promise<FeatureResponse<T>>;
            case 'deleteJob':
                return this.deleteJob(params.id as string) as Promise<FeatureResponse<T>>;
            case 'listEvents':
                return this.listEvents() as Promise<FeatureResponse<T>>;
            case 'getEvent':
                return this.getEvent(params.id as string) as Promise<FeatureResponse<T>>;
            case 'createEvent':
                return this.createEvent(params as unknown as CreateEventParams) as Promise<FeatureResponse<T>>;
            case 'updateEvent':
                return this.updateEvent(params as unknown as UpdateEventParams) as Promise<FeatureResponse<T>>;
            case 'deleteEvent':
                return this.deleteEvent(params.id as string) as Promise<FeatureResponse<T>>;
            case 'runJobNow':
                return this.runJobNow(params.id as string) as Promise<FeatureResponse<T>>;
            case 'pauseJob':
                return this.pauseJob(params.id as string) as Promise<FeatureResponse<T>>;
            case 'resumeJob':
                return this.resumeJob(params.id as string) as Promise<FeatureResponse<T>>;
            case 'getJobHistory':
                return this.getJobHistory(params as unknown as JobHistoryQuery) as Promise<FeatureResponse<T>>;
            case 'getSettings':
                return this.getSettings() as Promise<FeatureResponse<T>>;
            case 'updateSettings':
                return this.updateSettings(params as unknown as Partial<SchedulerSettings>) as Promise<FeatureResponse<T>>;
            default:
                return {
                    ok: false,
                    error: `Unknown action: ${action}`,
                    errorCode: FeatureErrorCode.ACTION_NOT_SUPPORTED,
                };
        }
    }

    // ---------------------------------------------------------------------------
    // Job CRUD
    // ---------------------------------------------------------------------------

    async listJobs(): Promise<FeatureResponse<ScheduledJob[]>> {
        try {
            const jobs = this.storage.getJobs();
            return { ok: true, result: jobs };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to list jobs',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    async getJob(id: string): Promise<FeatureResponse<ScheduledJob | null>> {
        try {
            const job = this.storage.getJob(id);
            return { ok: true, result: job ?? null };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to get job',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    async createJob(params: CreateJobParams): Promise<FeatureResponse<ScheduledJob>> {
        try {
            const now = Date.now();
            const nextRun = calculateNextRun(params.schedule);

            const job: ScheduledJob = {
                id: uuidv4(),
                name: params.name,
                description: params.description,
                enabled: params.enabled ?? true,
                schedule: params.schedule,
                action: params.action,
                status: 'idle',
                nextRun: nextRun ?? undefined,
                history: [],
                createdAt: now,
                updatedAt: now,
                tags: params.tags,
                notifyOnStart: params.notifyOnStart,
                notifyOnComplete: params.notifyOnComplete,
                notifyOnError: params.notifyOnError ?? this.storage.getSettings().defaultNotifyOnError,
            };

            await this.storage.addJob(job);
            return { ok: true, result: job };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to create job',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    async updateJob(params: UpdateJobParams): Promise<FeatureResponse<ScheduledJob | null>> {
        try {
            const updates: Partial<ScheduledJob> = {};

            if (params.name !== undefined) updates.name = params.name;
            if (params.description !== undefined) updates.description = params.description;
            if (params.enabled !== undefined) updates.enabled = params.enabled;
            if (params.action !== undefined) updates.action = params.action;
            if (params.tags !== undefined) updates.tags = params.tags;
            if (params.notifyOnStart !== undefined) updates.notifyOnStart = params.notifyOnStart;
            if (params.notifyOnComplete !== undefined) updates.notifyOnComplete = params.notifyOnComplete;
            if (params.notifyOnError !== undefined) updates.notifyOnError = params.notifyOnError;

            if (params.schedule !== undefined) {
                updates.schedule = params.schedule;
                const nextRun = calculateNextRun(params.schedule);
                updates.nextRun = nextRun ?? undefined;
            }

            const job = await this.storage.updateJob(params.id, updates);
            return { ok: true, result: job ?? null };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to update job',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    async deleteJob(id: string): Promise<FeatureResponse<boolean>> {
        try {
            // Cancel any running SDK session first
            await this.cancelJob(id);

            const deleted = await this.storage.deleteJob(id);
            return { ok: true, result: deleted };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to delete job',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    // ---------------------------------------------------------------------------
    // Event CRUD
    // ---------------------------------------------------------------------------

    async listEvents(): Promise<FeatureResponse<ScheduledEvent[]>> {
        try {
            const events = this.storage.getEvents();
            return { ok: true, result: events };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to list events',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    async getEvent(id: string): Promise<FeatureResponse<ScheduledEvent | null>> {
        try {
            const event = this.storage.getEvent(id);
            return { ok: true, result: event ?? null };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to get event',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    async createEvent(params: CreateEventParams): Promise<FeatureResponse<ScheduledEvent>> {
        try {
            const now = Date.now();
            const nextRun = calculateNextRun(params.schedule);

            const event: ScheduledEvent = {
                id: uuidv4(),
                title: params.title,
                description: params.description,
                enabled: params.enabled ?? true,
                schedule: params.schedule,
                nextRun: nextRun ?? undefined,
                location: params.location,
                allDay: params.allDay,
                tags: params.tags,
                notify: params.notify ?? true,
                color: params.color,
                createdAt: now,
                updatedAt: now,
            };

            await this.storage.addEvent(event);
            return { ok: true, result: event };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to create event',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    async updateEvent(params: UpdateEventParams): Promise<FeatureResponse<ScheduledEvent | null>> {
        try {
            const updates: Partial<ScheduledEvent> = {};

            if (params.title !== undefined) updates.title = params.title;
            if (params.description !== undefined) updates.description = params.description;
            if (params.enabled !== undefined) updates.enabled = params.enabled;
            if (params.location !== undefined) updates.location = params.location;
            if (params.allDay !== undefined) updates.allDay = params.allDay;
            if (params.tags !== undefined) updates.tags = params.tags;
            if (params.notify !== undefined) updates.notify = params.notify;
            if (params.color !== undefined) updates.color = params.color;

            if (params.schedule !== undefined) {
                updates.schedule = params.schedule;
                const nextRun = calculateNextRun(params.schedule);
                updates.nextRun = nextRun ?? undefined;
            }

            const event = await this.storage.updateEvent(params.id, updates);
            return { ok: true, result: event ?? null };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to update event',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    async deleteEvent(id: string): Promise<FeatureResponse<boolean>> {
        try {
            const deleted = await this.storage.deleteEvent(id);
            return { ok: true, result: deleted };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to delete event',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    // ---------------------------------------------------------------------------
    // Job Control
    // ---------------------------------------------------------------------------

    async runJobNow(id: string): Promise<FeatureResponse<{ ok: boolean; error?: string }>> {
        try {
            const result = await this.engine.runNow(id);
            return { ok: true, result };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to run job',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    async pauseJob(id: string): Promise<FeatureResponse<boolean>> {
        try {
            // Cancel any running SDK session first
            await this.cancelJob(id);

            const job = await this.storage.updateJob(id, { status: 'paused' });
            return { ok: true, result: !!job };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to pause job',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    async resumeJob(id: string): Promise<FeatureResponse<boolean>> {
        try {
            const currentJob = this.storage.getJob(id);
            if (!currentJob) {
                return { ok: true, result: false };
            }

            const nextRun = calculateNextRun(currentJob.schedule);
            const job = await this.storage.updateJob(id, {
                status: 'idle',
                nextRun: nextRun ?? undefined,
            });
            return { ok: true, result: !!job };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to resume job',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    // ---------------------------------------------------------------------------
    // History
    // ---------------------------------------------------------------------------

    async getJobHistory(query: JobHistoryQuery): Promise<FeatureResponse<JobRun[]>> {
        try {
            let runs: JobRun[] = [];

            if (query.jobId) {
                const job = this.storage.getJob(query.jobId);
                runs = job?.history ?? [];
            } else {
                // All jobs
                const jobs = this.storage.getJobs();
                for (const job of jobs) {
                    runs.push(...job.history);
                }
                runs.sort((a, b) => b.startedAt - a.startedAt);
            }

            // Apply filters
            if (query.status) {
                runs = runs.filter(r => r.status === query.status);
            }
            if (query.since) {
                runs = runs.filter(r => r.startedAt >= (query.since as number));
            }
            if (query.limit) {
                runs = runs.slice(0, query.limit);
            }

            return { ok: true, result: runs };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to get history',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    // ---------------------------------------------------------------------------
    // Settings
    // ---------------------------------------------------------------------------

    async getSettings(): Promise<FeatureResponse<SchedulerSettings>> {
        try {
            const settings = this.storage.getSettings();
            return { ok: true, result: settings };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to get settings',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    async updateSettings(updates: Partial<SchedulerSettings>): Promise<FeatureResponse<SchedulerSettings>> {
        try {
            await this.storage.updateSettings(updates);
            const settings = this.storage.getSettings();
            return { ok: true, result: settings };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to update settings',
                errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            };
        }
    }

    // ---------------------------------------------------------------------------
    // Job Execution Implementation
    // ---------------------------------------------------------------------------

    /**
     * Cancel a running SDK background job
     */
    async cancelJob(jobId: string): Promise<void> {
        const sessionId = this.sdkSessions.get(jobId);
        if (sessionId) {
            console.log(`[Scheduler] Cancelling session ${sessionId} for job ${jobId}`);
            try {
                const cli = getCliExecutionService();
                if (cli.hasSession(sessionId)) {
                    await cli.stopAgent(sessionId);
                } else {
                    await getClaudeSDKService().stopAgent(sessionId);
                }
            } catch (err) {
                console.log(`[Scheduler] Session may already be stopped:`, err);
            }
            this.sdkSessions.delete(jobId);
        }
    }

    private async executeJobAction(job: ScheduledJob): Promise<{ output?: string; metadata?: Record<string, unknown> } | void> {
        const action = job.action;

        switch (action.type) {
            case 'prompt':
                return this.executePromptAction(job, action);
            case 'team':
                return this.executeTeamAction(job, action);
            case 'script':
                await this.executeScriptAction(job, action);
                return;
            default:
                throw new Error(`Unknown action type: ${(action as { type: string }).type}`);
        }
    }

    private async executePromptAction(
        job: ScheduledJob,
        action: { type: 'prompt'; prompt: string; workdir?: string; model?: string; executionMode?: 'background' | 'interactive'; systemPrompt?: string; permissionMode?: string; maxTurns?: number; maxBudgetUsd?: number; timeoutMinutes?: number; executionBackend?: ExecutionBackend; executionRendering?: 'jsonl' | 'pty' },
    ): Promise<{ output?: string; metadata?: Record<string, unknown> } | void> {
        console.log(`[Scheduler] Executing prompt for job ${job.id}: "${action.prompt.substring(0, 50)}..."`);

        const os = await import('os');
        const workdir = action.workdir || os.homedir();
        const executionMode = action.executionMode || 'background';

        if (executionMode === 'interactive') {
            // INTERACTIVE MODE: Visible terminal window with CLI (SDK has no terminal UI)
            await this.executePromptInteractive(job, action, workdir);
            return;
        }

        // Determine backend (default: cli)
        const backend: ExecutionBackend = action.executionBackend || 'cli';

        if (backend === 'cli') {
            return this.executePromptViaCli(job, action, workdir);
        }

        // BACKGROUND MODE via SDK: requires API key
        return this.executePromptViaSdk(job, action, workdir);
    }

    /**
     * Execute a background prompt via CLI (--output-format stream-json or PTY)
     */
    private async executePromptViaCli(
        job: ScheduledJob,
        action: { prompt: string; model?: string; permissionMode?: string; maxTurns?: number; timeoutMinutes?: number; executionRendering?: 'jsonl' | 'pty' },
        workdir: string,
    ): Promise<{ output?: string; metadata?: Record<string, unknown> } | void> {
        const cli = getCliExecutionService();
        const timeoutMinutes = action.timeoutMinutes ?? 60;
        const usePty = action.executionRendering === 'pty';

        console.log(`[Scheduler] Running CLI ${usePty ? 'PTY' : 'BACKGROUND'} mode for job ${job.id}`);

        const cliConfig = {
            prompt: action.prompt,
            model: action.model,
            cwd: workdir,
            maxTurns: action.maxTurns,
            timeoutMinutes,
            dangerouslySkipPermissions: action.permissionMode === 'bypassPermissions' || !action.permissionMode || action.permissionMode === 'default',
        };

        let startResult: { ok: boolean; sessionId?: string; error?: string };

        if (usePty) {
            startResult = await cli.startAgentPty(cliConfig);
            // Fallback to JSONL if PTY manager not available (e.g. daemon mode)
            if (!startResult.ok && startResult.error?.includes('PTY manager')) {
                console.log(`[Scheduler] PTY not available, falling back to JSONL for job ${job.id}`);
                startResult = await cli.startAgent(cliConfig);
            }
        } else {
            startResult = await cli.startAgent(cliConfig);
        }

        if (!startResult.ok || !startResult.sessionId) {
            throw new Error(startResult.error || 'Failed to start CLI session');
        }

        const sessionId = startResult.sessionId;
        this.sdkSessions.set(job.id, sessionId);
        console.log(`[Scheduler] CLI session ${sessionId} started for job ${job.id}`);

        // Emit navigate event
        const { BrowserWindow: BW } = await import('electron');
        const win = BW.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
            win.webContents.send('cli:session-spawned', sessionId);
        }

        // Poll for completion
        return this.pollSessionCompletion(job.id, sessionId, 'cli');
    }

    /**
     * Execute a background prompt via SDK (API key required)
     */
    private async executePromptViaSdk(
        job: ScheduledJob,
        action: { prompt: string; model?: string; systemPrompt?: string; permissionMode?: string; maxTurns?: number; maxBudgetUsd?: number; timeoutMinutes?: number },
        workdir: string,
    ): Promise<{ output?: string; metadata?: Record<string, unknown> } | void> {
        // Guard: SDK requires API key
        const apiKey = getApiKey('anthropic') || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error(
                'SDK backend requires an Anthropic API key. Set one in Settings > Integrations, or switch to CLI backend.'
            );
        }

        console.log(`[Scheduler] Running SDK BACKGROUND mode for job ${job.id}`);

        const sdk = getClaudeSDKService();
        const timeoutMinutes = action.timeoutMinutes ?? 60;

        const sessionId = await sdk.startAgent({
            prompt: action.prompt,
            model: action.model || 'claude-sonnet-4-5-20250929',
            cwd: workdir,
            permissionMode: (action.permissionMode as 'bypassPermissions' | 'acceptEdits' | 'default' | 'plan') || 'bypassPermissions',
            maxTurns: action.maxTurns,
            maxBudgetUsd: action.maxBudgetUsd,
            appendSystemPrompt: action.systemPrompt,
            persistSession: false,
        });

        // Track session for cancellation
        this.sdkSessions.set(job.id, sessionId);
        console.log(`[Scheduler] SDK session ${sessionId} started for job ${job.id}`);

        return this.pollSessionCompletion(job.id, sessionId, 'sdk', timeoutMinutes);
    }

    /**
     * Poll a session (CLI or SDK) for completion
     */
    private async pollSessionCompletion(
        jobId: string,
        sessionId: string,
        backend: ExecutionBackend,
        timeoutMinutes?: number,
    ): Promise<{ output?: string; metadata?: Record<string, unknown> }> {
        const getSession = backend === 'cli'
            ? () => getCliExecutionService().getSession(sessionId)
            : () => getClaudeSDKService().getSession(sessionId);
        const stopAgent = backend === 'cli'
            ? () => getCliExecutionService().stopAgent(sessionId)
            : () => getClaudeSDKService().stopAgent(sessionId);

        const timeout = timeoutMinutes ?? 60;

        return new Promise<{ output?: string; metadata?: Record<string, unknown> }>((resolve, reject) => {
            let timeoutHandle: NodeJS.Timeout | null = null;

            const checkCompletion = () => {
                const session = getSession();
                if (!session) {
                    cleanup();
                    reject(new Error(`${backend.toUpperCase()} session disappeared`));
                    return;
                }

                if (session.status === 'completed' || session.status === 'error' || session.status === 'cancelled') {
                    cleanup();

                    if (session.status === 'error') {
                        reject(new Error(session.errors?.join('; ') || `${backend.toUpperCase()} agent failed`));
                        return;
                    }

                    resolve({
                        output: session.result || `Agent completed in ${session.numTurns} turns`,
                        metadata: {
                            sessionId,
                            backend,
                            costUsd: session.totalCostUsd,
                            usage: session.usage,
                            numTurns: session.numTurns,
                            stopReason: session.stopReason,
                        },
                    });
                }
            };

            const pollTimer = setInterval(checkCompletion, 2000);

            const cleanup = () => {
                clearInterval(pollTimer);
                if (timeoutHandle) clearTimeout(timeoutHandle);
                this.sdkSessions.delete(jobId);
            };

            // Timeout
            if (timeout > 0) {
                timeoutHandle = setTimeout(async () => {
                    console.log(`[Scheduler] Job ${jobId} timed out after ${timeout} minutes`);
                    try {
                        await stopAgent();
                    } catch { /* may already be done */ }
                    cleanup();
                    reject(new Error(`${backend.toUpperCase()} agent timed out after ${timeout} minute(s)`));
                }, timeout * 60 * 1000);
            }

            // Immediate check in case it completed very fast
            checkCompletion();
        });
    }

    /**
     * Interactive mode: Spawn visible terminal window with CLI (preserved from legacy)
     */
    private async executePromptInteractive(
        job: ScheduledJob,
        action: { prompt: string; workdir?: string; model?: string },
        workdir: string,
    ): Promise<void> {
        const { exec, spawn } = await import('child_process');
        const os = await import('os');
        const isWindows = os.platform() === 'win32';

        if (isWindows) {
            const escapePowerShell = (str: string): string => {
                return str
                    .replace(/'/g, "''")
                    .replace(/`/g, "``")
                    .replace(/\$/g, "`$")
                    .replace(/\r?\n/g, "`n");
            };

            const escapedPrompt = escapePowerShell(action.prompt);
            const escapedWorkdir = escapePowerShell(workdir);
            const escapedJobName = escapePowerShell(job.name);
            const modelCmd = action.model ? `--model ${action.model} ` : '';

            const cmd = `cmd /c start powershell -NoExit -Command "cd '${escapedWorkdir}'; Write-Host '=== Kuroryuu Scheduler ===' -ForegroundColor Cyan; Write-Host 'Job: ${escapedJobName}' -ForegroundColor Yellow; Write-Host 'Mode: Interactive' -ForegroundColor Gray; Start-Sleep -Seconds 1; claude '${escapedPrompt}' ${modelCmd}--dangerously-skip-permissions; Write-Host ''; Write-Host '=== Job Complete ===' -ForegroundColor Green; Write-Host 'CLI is still active - you can continue working' -ForegroundColor Gray"`;

            console.log(`[Scheduler] Running INTERACTIVE mode for job ${job.id}`);

            return new Promise<void>((resolve, reject) => {
                exec(cmd, { cwd: workdir }, (error) => {
                    if (error) {
                        console.error(`[Scheduler] exec error:`, error);
                        reject(error);
                        return;
                    }
                    console.log(`[Scheduler] Interactive PowerShell spawned for job ${job.id}`);
                    resolve();
                });
            });
        } else {
            const args = [action.prompt, '--dangerously-skip-permissions'];
            if (action.model) {
                args.push('--model', action.model);
            }

            const escapedArgs = args.map(arg => `'${arg.replace(/'/g, "'\\''")}''`).join(' ');
            const terminalCmd = `gnome-terminal -- bash -c "claude ${escapedArgs}; exec bash" || xterm -e "claude ${escapedArgs}; exec bash" || open -a Terminal.app "claude ${escapedArgs}"`;

            return new Promise<void>((resolve, reject) => {
                exec(terminalCmd, { cwd: workdir }, (error) => {
                    if (error) {
                        console.error(`[Scheduler] exec error:`, error);
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        }
    }





    private async executeTeamAction(job: ScheduledJob, action: { type: 'team'; teamId: string; taskIds?: string[]; executionStrategy?: 'direct' | 'prompt'; prompt?: string; workdir?: string; model?: string; executionMode?: 'background' | 'interactive' }): Promise<{ output?: string; metadata?: Record<string, unknown> } | void> {
        const strategy = action.executionStrategy || 'prompt';
        console.log(`[Scheduler] Executing team ${action.teamId} for job ${job.id} (strategy: ${strategy})`);

        if (strategy === 'direct') {
            // Direct IPC: create team via claude-teams:create-team handler
            const { BrowserWindow } = await import('electron');
            const win = BrowserWindow.getAllWindows()[0];
            if (!win) {
                throw new Error('No Electron window available for IPC');
            }

            // Create the team
            const createResult = await win.webContents.executeJavaScript(
                `window.electronAPI?.claudeTeams?.createTeam?.({ name: ${JSON.stringify(action.teamId)}, description: ${JSON.stringify(`Scheduled job: ${job.name}`)} })`
            );
            if (createResult && !createResult.ok) {
                throw new Error(`Failed to create team: ${createResult.error || 'unknown error'}`);
            }
            console.log(`[Scheduler] Team ${action.teamId} created via direct IPC`);

        } else {
            // Prompt strategy: spawn claude CLI with /k-spawnteam instructions
            const taskList = action.taskIds?.length
                ? `\nWork on these tasks: ${action.taskIds.join(', ')}`
                : '';
            const teamPrompt = action.prompt
                || `/k-spawnteam ${action.teamId}${taskList}`;

            // Delegate to executePromptAction with the team prompt
            return this.executePromptAction(job, {
                type: 'prompt',
                prompt: teamPrompt,
                workdir: action.workdir,
                model: action.model,
                executionMode: action.executionMode,
            });
        }
    }

    private async executeScriptAction(job: ScheduledJob, action: { type: 'script'; scriptPath: string; args?: string[]; timeoutMinutes?: number }): Promise<void> {
        console.log(`[Scheduler] Executing script ${action.scriptPath} for job ${job.id}`);

        const { spawn } = await import('child_process');
        const os = await import('os');
        const path = await import('path');
        const fs = await import('fs/promises');

        // Verify script exists
        try {
            await fs.access(action.scriptPath, fs.constants.F_OK);
        } catch {
            throw new Error(`Script not found: ${action.scriptPath}`);
        }

        // Determine how to run the script based on extension
        const ext = path.extname(action.scriptPath).toLowerCase();
        let cmd: string;
        let args: string[];

        if (os.platform() === 'win32') {
            if (ext === '.ps1') {
                cmd = 'powershell.exe';
                args = ['-ExecutionPolicy', 'Bypass', '-File', action.scriptPath, ...(action.args ?? [])];
            } else if (ext === '.bat' || ext === '.cmd') {
                cmd = 'cmd.exe';
                args = ['/c', action.scriptPath, ...(action.args ?? [])];
            } else {
                // Assume node script or default executable
                cmd = action.scriptPath;
                args = action.args ?? [];
            }
        } else {
            // Unix - use the script directly if executable, otherwise try sh
            cmd = action.scriptPath;
            args = action.args ?? [];
        }

        const timeoutMinutes = action.timeoutMinutes ?? 60;
        const timeoutMs = timeoutMinutes > 0 ? timeoutMinutes * 60 * 1000 : 0;

        return new Promise<void>((resolve, reject) => {
            let completed = false;
            let timeoutHandle: NodeJS.Timeout | null = null;

            const finish = (fn: () => void) => {
                if (completed) return;
                completed = true;
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                    timeoutHandle = null;
                }
                fn();
            };

            const proc = spawn(cmd, args, {
                cwd: path.dirname(action.scriptPath),
                shell: true,
                env: { ...process.env },
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            let stderr = '';

            proc.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    console.log(`[Scheduler] Script job ${job.id} completed successfully`);
                    finish(resolve);
                } else {
                    console.error(`[Scheduler] Script job ${job.id} failed with code ${code}`);
                    finish(() => reject(new Error(`Script exited with code ${code}: ${stderr.substring(0, 200)}`)));
                }
            });

            proc.on('error', (err) => {
                finish(() => reject(err));
            });

            // Per-job timeout; 0 disables timeout.
            if (timeoutMs > 0) {
                timeoutHandle = setTimeout(() => {
                    proc.kill();
                    finish(() => reject(new Error(`Script execution timed out after ${timeoutMinutes} minute(s)`)));
                }, timeoutMs);
            }
        });
    }

}

// ═══════════════════════════════════════════════════════════════════════════════
// Module Factory
// ═══════════════════════════════════════════════════════════════════════════════

export function createSchedulerModule(): SchedulerFeature {
    return new SchedulerFeature();
}
