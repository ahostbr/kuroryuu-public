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
    CreateJobParams,
    UpdateJobParams,
    JobHistoryQuery,
    JobRun,
    SchedulerSettings,
} from './types';
import { getSchedulerStorage, SchedulerStorage } from './storage';
import { getSchedulerEngine, SchedulerEngine, calculateNextRun } from './engine';

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

    private async executeJobAction(job: ScheduledJob): Promise<void> {
        const action = job.action;

        switch (action.type) {
            case 'prompt':
                await this.executePromptAction(job, action);
                break;
            case 'team':
                await this.executeTeamAction(job, action);
                break;
            case 'script':
                await this.executeScriptAction(job, action);
                break;
            default:
                throw new Error(`Unknown action type: ${(action as { type: string }).type}`);
        }
    }

    private async executePromptAction(job: ScheduledJob, action: { type: 'prompt'; prompt: string; workdir?: string; model?: string }): Promise<void> {
        console.log(`[Scheduler] Executing prompt for job ${job.id}: "${action.prompt.substring(0, 50)}..."`);

        const { spawn } = await import('child_process');
        const os = await import('os');

        // Determine the Claude CLI command
        const isWindows = os.platform() === 'win32';
        const claudeCmd = isWindows ? 'claude.cmd' : 'claude';

        // Build arguments
        const args: string[] = ['--print']; // Non-interactive mode
        if (action.model) {
            args.push('--model', action.model);
        }
        args.push(action.prompt);

        // Run the Claude CLI
        return new Promise<void>((resolve, reject) => {
            const proc = spawn(claudeCmd, args, {
                cwd: action.workdir || os.homedir(),
                shell: true,
                env: { ...process.env },
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';

            proc.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    console.log(`[Scheduler] Job ${job.id} completed successfully`);
                    resolve();
                } else {
                    console.error(`[Scheduler] Job ${job.id} failed with code ${code}: ${stderr}`);
                    reject(new Error(`Claude CLI exited with code ${code}: ${stderr.substring(0, 200)}`));
                }
            });

            proc.on('error', (err) => {
                console.error(`[Scheduler] Job ${job.id} spawn error:`, err);
                reject(err);
            });

            // Timeout after 30 minutes (configurable later)
            setTimeout(() => {
                proc.kill();
                reject(new Error('Job execution timed out after 30 minutes'));
            }, 30 * 60 * 1000);
        });
    }

    private async executeTeamAction(job: ScheduledJob, action: { type: 'team'; teamId: string; taskIds?: string[] }): Promise<void> {
        console.log(`[Scheduler] Executing team ${action.teamId} for job ${job.id}`);

        // TODO: Import and use agent-orchestrator when available
        // For now, we log the intent and return
        // This will be connected to the ClaudeTeams orchestration system

        // Placeholder - actual implementation will look something like:
        // const orchestrator = getAgentOrchestrator();
        // await orchestrator.startTeam(action.teamId, { taskIds: action.taskIds });

        console.log(`[Scheduler] Team execution not yet implemented for team: ${action.teamId}`);
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    private async executeScriptAction(job: ScheduledJob, action: { type: 'script'; scriptPath: string; args?: string[] }): Promise<void> {
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

        return new Promise<void>((resolve, reject) => {
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
                    resolve();
                } else {
                    console.error(`[Scheduler] Script job ${job.id} failed with code ${code}`);
                    reject(new Error(`Script exited with code ${code}: ${stderr.substring(0, 200)}`));
                }
            });

            proc.on('error', (err) => {
                reject(err);
            });

            // Timeout after 1 hour for scripts
            setTimeout(() => {
                proc.kill();
                reject(new Error('Script execution timed out after 1 hour'));
            }, 60 * 60 * 1000);
        });
    }

}

// ═══════════════════════════════════════════════════════════════════════════════
// Module Factory
// ═══════════════════════════════════════════════════════════════════════════════

export function createSchedulerModule(): SchedulerFeature {
    return new SchedulerFeature();
}
