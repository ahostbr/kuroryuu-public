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
            // Kill any running background process first
            await this.killBackgroundJob(id);
            
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
            // Kill any running background process first
            await this.killBackgroundJob(id);
            
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
     * Kill a background job process if it's currently running
     */
    private async killBackgroundJob(jobId: string): Promise<void> {
        const os = await import('os');
        const fs = await import('fs/promises');
        const path = await import('path');
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const pidDir = path.join(os.homedir(), '.claude', 'kuroryuu', 'pids');
        const pidFile = path.join(pidDir, `job_${jobId}.pid`);

        try {
            // Check if PID file exists
            const pidStr = await fs.readFile(pidFile, 'utf-8');
            const pid = parseInt(pidStr.trim(), 10);

            if (isNaN(pid)) {
                console.log(`[Scheduler] Invalid PID in file for job ${jobId}`);
                await fs.unlink(pidFile).catch(() => {});
                return;
            }

            console.log(`[Scheduler] Attempting to kill background job ${jobId} with PID ${pid}`);

            const isWindows = os.platform() === 'win32';

            if (isWindows) {
                // Windows: Use taskkill to terminate process tree
                try {
                    await execAsync(`taskkill /F /T /PID ${pid}`);
                    console.log(`[Scheduler] Successfully killed job ${jobId} (PID ${pid})`);
                } catch (killErr) {
                    // Process might already be dead
                    console.log(`[Scheduler] Process ${pid} may already be terminated`);
                }
            } else {
                // Unix: Try to kill the process
                try {
                    process.kill(pid, 'SIGTERM');
                    console.log(`[Scheduler] Sent SIGTERM to job ${jobId} (PID ${pid})`);
                    
                    // Wait a bit, then force kill if still alive
                    setTimeout(() => {
                        try {
                            process.kill(pid, 'SIGKILL');
                            console.log(`[Scheduler] Sent SIGKILL to job ${jobId} (PID ${pid})`);
                        } catch {
                            // Process already dead
                        }
                    }, 2000);
                } catch (killErr) {
                    console.log(`[Scheduler] Process ${pid} may already be terminated`);
                }
            }

            // Clean up PID file
            await fs.unlink(pidFile).catch(() => {});
        } catch (err) {
            // PID file doesn't exist or can't be read - job not running
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.error(`[Scheduler] Error killing background job ${jobId}:`, err);
            }
        }
    }

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

    private async executePromptAction(job: ScheduledJob, action: { type: 'prompt'; prompt: string; workdir?: string; model?: string; executionMode?: 'background' | 'interactive' }): Promise<void> {
        console.log(`[Scheduler] Executing prompt for job ${job.id}: "${action.prompt.substring(0, 50)}..."`);

        const { exec, spawn } = await import('child_process');
        const os = await import('os');
        const fs = await import('fs/promises');
        const path = await import('path');

        const workdir = action.workdir || os.homedir();
        const isWindows = os.platform() === 'win32';
        const executionMode = action.executionMode || 'background';

        // PID file location
        const pidDir = path.join(os.homedir(), '.claude', 'kuroryuu', 'pids');
        const pidFile = path.join(pidDir, `job_${job.id}.pid`);

        // Ensure PID directory exists
        await fs.mkdir(pidDir, { recursive: true });

        if (isWindows) {
            if (executionMode === 'interactive') {
                // INTERACTIVE MODE: Visible PowerShell window, stays alive after completion
                // Proper PowerShell escaping for special characters
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
                // BACKGROUND MODE: Spawn Claude properly
                // On Windows, claude.ps1 needs to be called via PowerShell
                // Build argument array properly
                const promptArgs = [action.prompt, '--dangerously-skip-permissions'];
                if (action.model) {
                    promptArgs.push('--model', action.model);
                }

                console.log(`[Scheduler] Running BACKGROUND mode for job ${job.id}`);
                console.log(`[Scheduler] Args:`, promptArgs);

                return new Promise<void>((resolve, reject) => {
                    // Spawn via PowerShell to properly execute .ps1 scripts
                    // Use -Command with & to invoke the script
                    const psArgs = ['-NoProfile', '-Command', '&', 'claude', ...promptArgs];
                    
                    const proc = spawn('powershell.exe', psArgs, {
                        cwd: workdir,
                        detached: true,
                        stdio: 'ignore',
                        windowsHide: true,
                    });

                    const pid = proc.pid;
                    if (pid) {
                        // Write PID file for tracking and later termination
                        fs.writeFile(pidFile, pid.toString(), 'utf-8').then(() => {
                            console.log(`[Scheduler] Background job ${job.id} started with PID: ${pid}`);
                        }).catch(err => {
                            console.error(`[Scheduler] Failed to write PID file:`, err);
                        });
                    }

                    proc.unref();

                    // Clean up PID file when process exits
                    proc.on('exit', (code) => {
                        console.log(`[Scheduler] Background job ${job.id} exited with code: ${code}`);
                        fs.unlink(pidFile).catch(() => { });
                    });

                    proc.on('error', (err) => {
                        console.error(`[Scheduler] Failed to spawn background job:`, err);
                        fs.unlink(pidFile).catch(() => { });
                        reject(err);
                    });

                    // Resolve immediately after spawn (don't wait for completion)
                    resolve();
                });
            }
        } else {
            // Unix: run in background or foreground based on mode
            if (executionMode === 'interactive') {
                // Open new terminal window (try common terminals)
                const args = [action.prompt, '--dangerously-skip-permissions'];
                if (action.model) {
                    args.push('--model', action.model);
                }
                
                // Escape for shell
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
            } else {
                // Background mode - direct spawn
                const args = [action.prompt, '--dangerously-skip-permissions'];
                if (action.model) {
                    args.push('--model', action.model);
                }

                return new Promise<void>((resolve, reject) => {
                    const proc = spawn('claude', args, {
                        cwd: workdir,
                        detached: true,
                        stdio: 'ignore',
                    });

                    const pid = proc.pid;
                    if (pid) {
                        // Write PID file
                        fs.writeFile(pidFile, String(pid), 'utf-8').then(() => {
                            console.log(`[Scheduler] Background job ${job.id} started with PID: ${pid}`);
                        }).catch(() => { });
                    }

                    proc.unref();

                    proc.on('exit', async () => {
                        await fs.unlink(pidFile).catch(() => { });
                    });

                    proc.on('error', (err) => {
                        fs.unlink(pidFile).catch(() => { });
                        reject(err);
                    });

                    resolve();
                });
            }
        }
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
