/**
 * Identity Store
 *
 * Zustand store for the Personal Assistant identity system.
 * Manages profile, activity, heartbeat config, and editor state.
 */

import { create } from 'zustand';
import type {
    IdentityProfile,
    IdentityFileKey,
    ActivityEntry,
    HeartbeatRun,
    HeartbeatConfig,
    HeartbeatNotificationMode,
    ActionType,
    ActionExecutionMode,
    DailyMemoryEntry,
    BootstrapStatus,
    MemorySyncStatus,
} from '../types/identity';
import { toast } from '../components/ui/toast';

// ═══════════════════════════════════════════════════════════════════════════════
// Store Interface
// ═══════════════════════════════════════════════════════════════════════════════

type ActiveView = 'dashboard' | 'editor' | 'activity' | 'prompt';
type ActivityTimeWindow = '24h' | '7d' | '30d';

interface IdentityStore {
    // State
    profile: IdentityProfile | null;
    activity: ActivityEntry[];
    heartbeatHistory: HeartbeatRun[];
    heartbeatConfig: HeartbeatConfig | null;
    heartbeatStatus: {
        jobExists: boolean;
        jobStatus: string | null;
        lastRun: number | null;
        nextRun: number | null;
        ghAvailable: boolean;
    } | null;
    activeView: ActiveView;
    activeFile: IdentityFileKey;
    editContent: string;
    isDirty: boolean;
    activityTimeWindow: ActivityTimeWindow;
    isLoading: boolean;
    error: string | null;
    newActionCount: number;

    // Daily Memory state
    dailyMemory: DailyMemoryEntry | null;
    dailyMemoryDates: string[];
    dailySelectedDate: string | null;

    // Bootstrap state
    bootstrapStatus: BootstrapStatus | null;
    bootstrapRunning: boolean;

    // Memory Sync state
    memorySyncStatus: MemorySyncStatus | null;

    // Prompt Preview state
    heartbeatPromptPreview: string | null;

    // Profile Actions
    loadProfile: () => Promise<void>;
    loadFile: (key: IdentityFileKey) => Promise<void>;
    saveFile: (key: IdentityFileKey) => Promise<void>;

    // Activity Actions
    loadActivity: (timeWindow?: ActivityTimeWindow) => Promise<void>;

    // Daily Memory Actions
    loadDailyMemory: (date?: string) => Promise<void>;
    loadDailyMemoryDates: () => Promise<void>;

    // Bootstrap Actions
    checkBootstrap: () => Promise<void>;
    runBootstrap: () => Promise<void>;
    skipBootstrap: () => Promise<void>;
    resetBootstrap: () => Promise<void>;

    // Memory Sync Actions
    syncClaudeMemory: () => Promise<void>;
    loadMemorySyncStatus: () => Promise<void>;

    // Heartbeat Actions
    loadHeartbeatConfig: () => Promise<void>;
    setHeartbeatEnabled: (enabled: boolean) => Promise<void>;
    setHeartbeatInterval: (minutes: number) => Promise<void>;
    setNotificationMode: (mode: HeartbeatNotificationMode) => Promise<void>;
    setPerActionMode: (type: ActionType, mode: ActionExecutionMode) => Promise<void>;
    setAgentName: (name: string) => Promise<void>;
    setMaxLinesPerFile: (lines: number) => Promise<void>;
    setMaxTurns: (turns: number) => Promise<void>;
    setTimeoutMinutes: (minutes: number) => Promise<void>;
    loadHeartbeatPrompt: () => Promise<void>;
    runHeartbeatNow: () => Promise<void>;

    // UI Actions
    setActiveView: (view: ActiveView) => void;
    setActiveFile: (key: IdentityFileKey) => void;
    setEditContent: (content: string) => void;
    setActivityTimeWindow: (window: ActivityTimeWindow) => void;
    clearNewActionCount: () => void;
    incrementNewActionCount: (count: number) => void;
    refresh: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Time window helpers
// ═══════════════════════════════════════════════════════════════════════════════

function getTimeWindowMs(window: ActivityTimeWindow): number {
    switch (window) {
        case '24h': return 24 * 60 * 60 * 1000;
        case '7d': return 7 * 24 * 60 * 60 * 1000;
        case '30d': return 30 * 24 * 60 * 60 * 1000;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Store Implementation
// ═══════════════════════════════════════════════════════════════════════════════

export const useIdentityStore = create<IdentityStore>((set, get) => ({
    // Initial state
    profile: null,
    activity: [],
    heartbeatHistory: [],
    heartbeatConfig: null,
    heartbeatStatus: null,
    activeView: 'dashboard',
    activeFile: 'soul',
    editContent: '',
    isDirty: false,
    activityTimeWindow: '7d',
    isLoading: false,
    error: null,
    newActionCount: 0,
    dailyMemory: null,
    dailyMemoryDates: [],
    dailySelectedDate: null,
    bootstrapStatus: null,
    bootstrapRunning: false,
    memorySyncStatus: null,
    heartbeatPromptPreview: null,

    // ---------------------------------------------------------------------------
    // Profile
    // ---------------------------------------------------------------------------

    loadProfile: async () => {
        set({ isLoading: true, error: null });
        try {
            const profile = await window.electronAPI.identity.getProfile() as IdentityProfile;
            const { activeFile } = get();
            set({
                profile,
                editContent: profile[activeFile]?.content ?? '',
                isDirty: false,
                isLoading: false,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            set({ error: msg, isLoading: false });
            toast.error(`Failed to load identity profile: ${msg}`);
        }
    },

    loadFile: async (key) => {
        try {
            const file = await window.electronAPI.identity.getFile(key) as { key: string; content: string; lastModified: number };
            set((state) => {
                const profile = state.profile;
                if (profile) {
                    return {
                        profile: { ...profile, [key]: file },
                        editContent: file.content,
                        isDirty: false,
                        activeFile: key,
                    };
                }
                return { editContent: file.content, isDirty: false, activeFile: key };
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to load ${key}: ${msg}`);
        }
    },

    saveFile: async (key) => {
        const { editContent } = get();
        try {
            const result = await window.electronAPI.identity.updateFile(key, editContent);
            if (!result.ok) {
                toast.error(`Failed to save ${key}: ${result.error}`);
                return;
            }
            set({ isDirty: false });
            // Reload to get updated lastModified
            await get().loadFile(key);
            toast.success(`Saved ${key}.md`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to save ${key}: ${msg}`);
        }
    },

    // ---------------------------------------------------------------------------
    // Activity
    // ---------------------------------------------------------------------------

    loadActivity: async (timeWindow) => {
        const tw = timeWindow ?? get().activityTimeWindow;
        const since = Date.now() - getTimeWindowMs(tw);
        try {
            const activity = await window.electronAPI.identity.getActivity(since) as ActivityEntry[];
            set({ activity, activityTimeWindow: tw });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to load activity: ${msg}`);
        }
    },

    // ---------------------------------------------------------------------------
    // Heartbeat
    // ---------------------------------------------------------------------------

    loadHeartbeatConfig: async () => {
        try {
            const status = await window.electronAPI.identity.heartbeat.status() as {
                config: HeartbeatConfig;
                jobExists: boolean;
                jobStatus: string | null;
                lastRun: number | null;
                nextRun: number | null;
                ghAvailable: boolean;
            };
            if (status) {
                set({
                    heartbeatConfig: status.config,
                    heartbeatStatus: {
                        jobExists: status.jobExists,
                        jobStatus: status.jobStatus,
                        lastRun: status.lastRun,
                        nextRun: status.nextRun,
                        ghAvailable: status.ghAvailable,
                    },
                });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to load heartbeat config: ${msg}`);
        }
    },

    setHeartbeatEnabled: async (enabled) => {
        const { heartbeatConfig } = get();
        if (heartbeatConfig) {
            set({ heartbeatConfig: { ...heartbeatConfig, enabled } });
        }
        try {
            const result = await window.electronAPI.identity.heartbeat.configure({ enabled });
            if (!result.ok) {
                if (heartbeatConfig) set({ heartbeatConfig });
                toast.error(`Failed to ${enabled ? 'enable' : 'disable'} heartbeat: ${result.error}`);
                return;
            }
            toast.success(`Heartbeat ${enabled ? 'enabled' : 'disabled'}`);
            await get().loadHeartbeatConfig();
        } catch (err) {
            if (heartbeatConfig) set({ heartbeatConfig });
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to toggle heartbeat: ${msg}`);
        }
    },

    setHeartbeatInterval: async (minutes) => {
        const { heartbeatConfig } = get();
        if (heartbeatConfig) {
            set({ heartbeatConfig: { ...heartbeatConfig, intervalMinutes: minutes } });
        }
        try {
            const result = await window.electronAPI.identity.heartbeat.configure({ intervalMinutes: minutes });
            if (!result.ok) {
                if (heartbeatConfig) set({ heartbeatConfig });
                toast.error(`Failed to set interval: ${result.error}`);
                return;
            }
            toast.success(`Heartbeat interval set to ${minutes} minutes`);
        } catch (err) {
            if (heartbeatConfig) set({ heartbeatConfig });
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to set interval: ${msg}`);
        }
    },

    setNotificationMode: async (mode) => {
        const { heartbeatConfig } = get();
        if (heartbeatConfig) {
            set({ heartbeatConfig: { ...heartbeatConfig, notificationMode: mode } });
        }
        try {
            const result = await window.electronAPI.identity.heartbeat.configure({ notificationMode: mode });
            if (!result.ok) {
                if (heartbeatConfig) set({ heartbeatConfig });
                toast.error(`Failed to set notification mode: ${result.error}`);
                return;
            }
            toast.success(`Notification mode: ${mode}`);
        } catch (err) {
            if (heartbeatConfig) set({ heartbeatConfig });
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to set notification mode: ${msg}`);
        }
    },

    setPerActionMode: async (type, mode) => {
        try {
            const result = await window.electronAPI.identity.heartbeat.configure({
                perActionMode: { [type]: mode },
            });
            if (!result.ok) {
                toast.error(`Failed to set action mode: ${result.error}`);
                return;
            }
            await get().loadHeartbeatConfig();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to set action mode: ${msg}`);
        }
    },

    setAgentName: async (name) => {
        const { heartbeatConfig } = get();
        if (heartbeatConfig) {
            set({ heartbeatConfig: { ...heartbeatConfig, agentName: name } });
        }
        try {
            const result = await window.electronAPI.identity.heartbeat.configure({ agentName: name });
            if (!result.ok) {
                if (heartbeatConfig) set({ heartbeatConfig });
                toast.error(`Failed to set agent name: ${result.error}`);
                return;
            }
            toast.success(`Agent name: ${name || 'Kuroryuu'}`);
        } catch (err) {
            if (heartbeatConfig) set({ heartbeatConfig });
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to set agent name: ${msg}`);
        }
    },

    setMaxLinesPerFile: async (lines) => {
        const { heartbeatConfig } = get();
        if (heartbeatConfig) {
            set({ heartbeatConfig: { ...heartbeatConfig, maxLinesPerFile: lines } });
        }
        try {
            const result = await window.electronAPI.identity.heartbeat.configure({ maxLinesPerFile: lines });
            if (!result.ok) {
                if (heartbeatConfig) set({ heartbeatConfig });
                toast.error(`Failed to set max lines: ${result.error}`);
            }
        } catch (err) {
            if (heartbeatConfig) set({ heartbeatConfig });
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to set max lines: ${msg}`);
        }
    },

    setMaxTurns: async (turns) => {
        const { heartbeatConfig } = get();
        if (heartbeatConfig) {
            set({ heartbeatConfig: { ...heartbeatConfig, maxTurns: turns } });
        }
        try {
            const result = await window.electronAPI.identity.heartbeat.configure({ maxTurns: turns });
            if (!result.ok) {
                if (heartbeatConfig) set({ heartbeatConfig });
                toast.error(`Failed to set max turns: ${result.error}`);
            }
        } catch (err) {
            if (heartbeatConfig) set({ heartbeatConfig });
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to set max turns: ${msg}`);
        }
    },

    setTimeoutMinutes: async (minutes) => {
        const { heartbeatConfig } = get();
        if (heartbeatConfig) {
            set({ heartbeatConfig: { ...heartbeatConfig, timeoutMinutes: minutes } });
        }
        try {
            const result = await window.electronAPI.identity.heartbeat.configure({ timeoutMinutes: minutes });
            if (!result.ok) {
                if (heartbeatConfig) set({ heartbeatConfig });
                toast.error(`Failed to set timeout: ${result.error}`);
            }
        } catch (err) {
            if (heartbeatConfig) set({ heartbeatConfig });
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to set timeout: ${msg}`);
        }
    },

    loadHeartbeatPrompt: async () => {
        try {
            const result = await window.electronAPI.identity.heartbeat.getPrompt() as { ok: boolean; prompt?: string; error?: string };
            if (result.ok && result.prompt) {
                set({ heartbeatPromptPreview: result.prompt });
            } else {
                toast.error(`Failed to load prompt: ${result.error ?? 'Unknown error'}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to load prompt: ${msg}`);
        }
    },

    runHeartbeatNow: async () => {
        try {
            toast.success('Starting heartbeat...');
            const result = await window.electronAPI.identity.heartbeat.runNow();
            if (!result.ok) {
                toast.error(`Heartbeat failed: ${result.error}`);
                return;
            }
            toast.success('Heartbeat started');
            await get().loadHeartbeatConfig();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Heartbeat failed: ${msg}`);
        }
    },

    // ---------------------------------------------------------------------------
    // Daily Memory
    // ---------------------------------------------------------------------------

    loadDailyMemory: async (date) => {
        try {
            const daily = await window.electronAPI.identity.getDailyMemory(date) as DailyMemoryEntry;
            set({ dailyMemory: daily, dailySelectedDate: date ?? null });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to load daily memory: ${msg}`);
        }
    },

    loadDailyMemoryDates: async () => {
        try {
            const dates = await window.electronAPI.identity.listDailyMemories();
            set({ dailyMemoryDates: dates });
        } catch { /* ignore */ }
    },

    // ---------------------------------------------------------------------------
    // Bootstrap
    // ---------------------------------------------------------------------------

    checkBootstrap: async () => {
        try {
            const status = await window.electronAPI.identity.isBootstrapped();
            set({ bootstrapStatus: status });
        } catch { /* ignore */ }
    },

    runBootstrap: async () => {
        set({ bootstrapRunning: true });
        try {
            const result = await window.electronAPI.identity.runBootstrap();
            if (!result.ok) {
                toast.error(`Bootstrap failed: ${result.error}`);
                set({ bootstrapRunning: false });
            }
            // bootstrapRunning stays true until onBootstrapCompleted fires
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Bootstrap failed: ${msg}`);
            set({ bootstrapRunning: false });
        }
    },

    skipBootstrap: async () => {
        try {
            const result = await window.electronAPI.identity.skipBootstrap();
            if (result.ok) {
                set({ bootstrapStatus: { bootstrapped: true, skipped: true } });
                toast.success('Bootstrap skipped — using default identity');
            } else {
                toast.error(`Skip failed: ${result.error}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Skip failed: ${msg}`);
        }
    },

    resetBootstrap: async () => {
        try {
            const result = await window.electronAPI.identity.resetBootstrap();
            if (result.ok) {
                set({ bootstrapStatus: { bootstrapped: false } });
                toast.success('Bootstrap reset — identity files restored to seeds');
                await get().loadProfile();
            } else {
                toast.error(`Reset failed: ${result.error}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Reset failed: ${msg}`);
        }
    },

    // ---------------------------------------------------------------------------
    // Claude Memory Sync
    // ---------------------------------------------------------------------------

    syncClaudeMemory: async () => {
        try {
            const result = await window.electronAPI.identity.syncClaudeMemory();
            if (result.ok) {
                const count = result.sectionsImported ?? 0;
                if (count > 0) {
                    toast.success(`Synced ${count} lines from Claude Memory`);
                } else {
                    toast.success('Claude Memory already in sync');
                }
                await get().loadMemorySyncStatus();
            } else {
                toast.error(`Sync failed: ${result.error}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Sync failed: ${msg}`);
        }
    },

    loadMemorySyncStatus: async () => {
        try {
            const status = await window.electronAPI.identity.getMemorySyncStatus() as MemorySyncStatus | null;
            if (status) {
                set({ memorySyncStatus: status });
            }
        } catch { /* ignore */ }
    },

    // ---------------------------------------------------------------------------
    // UI Actions
    // ---------------------------------------------------------------------------

    setActiveView: (view) => {
        set({ activeView: view });
        if (view === 'activity') {
            set({ newActionCount: 0 });
            get().loadActivity();
        }
        if (view === 'prompt') {
            get().loadHeartbeatPrompt();
        }
    },

    setActiveFile: (key) => {
        const { profile, isDirty, activeFile } = get();
        if (isDirty) {
            // Auto-save before switching
            get().saveFile(activeFile);
        }
        if (profile && profile[key]) {
            set({ activeFile: key, editContent: profile[key].content, isDirty: false });
        } else {
            set({ activeFile: key });
            get().loadFile(key);
        }
    },

    setEditContent: (content) => {
        set({ editContent: content, isDirty: true });
    },

    setActivityTimeWindow: (window) => {
        set({ activityTimeWindow: window });
        get().loadActivity(window);
    },

    clearNewActionCount: () => set({ newActionCount: 0 }),

    incrementNewActionCount: (count) =>
        set((state) => ({ newActionCount: state.newActionCount + count })),

    refresh: async () => {
        const { loadProfile, loadActivity, loadHeartbeatConfig } = get();
        await Promise.all([loadProfile(), loadActivity(), loadHeartbeatConfig()]);
    },
}));
