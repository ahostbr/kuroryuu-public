/**
 * Scheduler Store
 * 
 * Zustand store for managing scheduled jobs in the renderer.
 */

import { create } from 'zustand';
import type {
    ScheduledJob,
    JobRun,
    SchedulerSettings,
    CreateJobParams,
    UpdateJobParams,
    JobHistoryQuery,
} from '../types/scheduler';
import { toast } from '../components/ui/toast';

// ═══════════════════════════════════════════════════════════════════════════════
// Store Interface
// ═══════════════════════════════════════════════════════════════════════════════

interface SchedulerStore {
    // State
    jobs: ScheduledJob[];
    history: JobRun[];
    settings: SchedulerSettings | null;
    isLoading: boolean;
    error: string | null;
    selectedJobId: string | null;
    isEditorOpen: boolean;
    editingJob: ScheduledJob | null;

    // Job CRUD Actions
    loadJobs: () => Promise<void>;
    createJob: (params: CreateJobParams) => Promise<ScheduledJob | null>;
    updateJob: (params: UpdateJobParams) => Promise<ScheduledJob | null>;
    deleteJob: (id: string) => Promise<boolean>;

    // Job Control Actions
    runJobNow: (id: string) => Promise<boolean>;
    pauseJob: (id: string) => Promise<boolean>;
    resumeJob: (id: string) => Promise<boolean>;

    // History Actions
    loadHistory: (query?: JobHistoryQuery) => Promise<void>;

    // Settings Actions
    loadSettings: () => Promise<void>;
    updateSettings: (updates: Partial<SchedulerSettings>) => Promise<void>;

    // UI Actions
    selectJob: (id: string | null) => void;
    openEditor: (job?: ScheduledJob | null) => void;
    closeEditor: () => void;
    refresh: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Store Implementation
// ═══════════════════════════════════════════════════════════════════════════════

export const useSchedulerStore = create<SchedulerStore>((set, get) => ({
    // Initial state
    jobs: [],
    history: [],
    settings: null,
    isLoading: false,
    error: null,
    selectedJobId: null,
    isEditorOpen: false,
    editingJob: null,

    // ---------------------------------------------------------------------------
    // Job CRUD
    // ---------------------------------------------------------------------------

    loadJobs: async () => {
        set({ isLoading: true, error: null });
        try {
            const jobs = await window.electronAPI.scheduler.list();
            set({ jobs: jobs as ScheduledJob[], isLoading: false });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            set({ error: errorMsg, isLoading: false });
            toast.error(`Failed to load scheduled jobs: ${errorMsg}`);
        }
    },

    createJob: async (params) => {
        try {
            const result = await window.electronAPI.scheduler.create(params);
            if (!result.ok) {
                toast.error(`Failed to create job: ${result.error}`);
                return null;
            }
            const job = result.job as ScheduledJob;
            set((state) => ({ jobs: [...state.jobs, job] }));
            toast.success(`Created scheduled job "${params.name}"`);
            return job;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to create job: ${errorMsg}`);
            return null;
        }
    },

    updateJob: async (params) => {
        const { jobs } = get();
        const original = jobs.find((j) => j.id === params.id);
        if (!original) {
            toast.error(`Job not found: ${params.id}`);
            return null;
        }

        // Optimistic update
        const optimistic = { ...original, ...params, updatedAt: Date.now() };
        set((state) => ({
            jobs: state.jobs.map((j) => (j.id === params.id ? optimistic : j)),
        }));

        try {
            const result = await window.electronAPI.scheduler.update(params);
            if (!result.ok) {
                set((state) => ({
                    jobs: state.jobs.map((j) => (j.id === params.id ? original : j)),
                }));
                toast.error(`Failed to update job: ${result.error}`);
                return null;
            }
            const job = result.job as ScheduledJob;
            set((state) => ({
                jobs: state.jobs.map((j) => (j.id === params.id ? job : j)),
            }));
            toast.success(`Updated job "${job.name}"`);
            return job;
        } catch (err) {
            set((state) => ({
                jobs: state.jobs.map((j) => (j.id === params.id ? original : j)),
            }));
            const errorMsg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to update job: ${errorMsg}`);
            return null;
        }
    },

    deleteJob: async (id) => {
        const { jobs } = get();
        const job = jobs.find((j) => j.id === id);
        if (!job) {
            toast.error(`Job not found: ${id}`);
            return false;
        }

        // Optimistic delete
        set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) }));

        try {
            const result = await window.electronAPI.scheduler.delete(id);
            if (!result.ok) {
                set({ jobs }); // Revert
                toast.error(`Failed to delete job: ${result.error}`);
                return false;
            }
            toast.success(`Deleted job "${job.name}"`);
            return true;
        } catch (err) {
            set({ jobs }); // Revert
            const errorMsg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to delete job: ${errorMsg}`);
            return false;
        }
    },

    // ---------------------------------------------------------------------------
    // Job Control
    // ---------------------------------------------------------------------------

    runJobNow: async (id) => {
        try {
            const result = await window.electronAPI.scheduler.runNow(id);
            if (!result.ok) {
                toast.error(`Failed to run job: ${result.error}`);
                return false;
            }
            toast.success('Job started');
            // Refresh to get updated status
            await get().loadJobs();
            return true;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to run job: ${errorMsg}`);
            return false;
        }
    },

    pauseJob: async (id) => {
        const { jobs } = get();
        const job = jobs.find((j) => j.id === id);

        // Optimistic update
        if (job) {
            set((state) => ({
                jobs: state.jobs.map((j) =>
                    j.id === id ? { ...j, status: 'paused' as const } : j
                ),
            }));
        }

        try {
            const result = await window.electronAPI.scheduler.pause(id);
            if (!result.ok) {
                if (job) set({ jobs }); // Revert
                toast.error(`Failed to pause job: ${result.error}`);
                return false;
            }
            toast.success(`Job paused`);
            return true;
        } catch (err) {
            if (job) set({ jobs }); // Revert
            const errorMsg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to pause job: ${errorMsg}`);
            return false;
        }
    },

    resumeJob: async (id) => {
        const { jobs } = get();
        const job = jobs.find((j) => j.id === id);

        // Optimistic update
        if (job) {
            set((state) => ({
                jobs: state.jobs.map((j) =>
                    j.id === id ? { ...j, status: 'idle' as const } : j
                ),
            }));
        }

        try {
            const result = await window.electronAPI.scheduler.resume(id);
            if (!result.ok) {
                if (job) set({ jobs }); // Revert
                toast.error(`Failed to resume job: ${result.error}`);
                return false;
            }
            // Refresh to get updated nextRun
            await get().loadJobs();
            toast.success(`Job resumed`);
            return true;
        } catch (err) {
            if (job) set({ jobs }); // Revert
            const errorMsg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to resume job: ${errorMsg}`);
            return false;
        }
    },

    // ---------------------------------------------------------------------------
    // History
    // ---------------------------------------------------------------------------

    loadHistory: async (query = {}) => {
        try {
            const history = await window.electronAPI.scheduler.history(query);
            set({ history: history as JobRun[] });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to load history: ${errorMsg}`);
        }
    },

    // ---------------------------------------------------------------------------
    // Settings
    // ---------------------------------------------------------------------------

    loadSettings: async () => {
        try {
            const settings = await window.electronAPI.scheduler.getSettings();
            set({ settings: settings as SchedulerSettings | null });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to load settings: ${errorMsg}`);
        }
    },

    updateSettings: async (updates) => {
        const { settings } = get();
        if (!settings) return;

        const optimistic = { ...settings, ...updates };
        set({ settings: optimistic });

        try {
            const result = await window.electronAPI.scheduler.updateSettings(updates);
            if (!result.ok) {
                set({ settings }); // Revert
                toast.error(`Failed to update settings: ${result.error}`);
                return;
            }
            set({ settings: result.settings as SchedulerSettings });
            toast.success('Settings updated');
        } catch (err) {
            set({ settings }); // Revert
            const errorMsg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to update settings: ${errorMsg}`);
        }
    },

    // ---------------------------------------------------------------------------
    // UI Actions
    // ---------------------------------------------------------------------------

    selectJob: (id) => set({ selectedJobId: id }),

    openEditor: (job = null) => set({ isEditorOpen: true, editingJob: job }),

    closeEditor: () => set({ isEditorOpen: false, editingJob: null }),

    refresh: async () => {
        const { loadJobs, loadSettings } = get();
        await Promise.all([loadJobs(), loadSettings()]);
    },
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Selectors
// ═══════════════════════════════════════════════════════════════════════════════

export const selectEnabledJobs = (state: SchedulerStore) =>
    state.jobs.filter((j) => j.enabled);

export const selectPausedJobs = (state: SchedulerStore) =>
    state.jobs.filter((j) => j.status === 'paused');

export const selectRunningJobs = (state: SchedulerStore) =>
    state.jobs.filter((j) => j.status === 'running');

export const selectJobById = (id: string) => (state: SchedulerStore) =>
    state.jobs.find((j) => j.id === id);

export const selectSelectedJob = (state: SchedulerStore) =>
    state.selectedJobId ? state.jobs.find((j) => j.id === state.selectedJobId) : null;
