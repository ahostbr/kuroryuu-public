/**
 * Identity System Types
 *
 * Types for the Kuroryuu Personal Assistant identity system.
 * Covers identity files, mutations, actions, heartbeat runs, and activity.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Identity Files
// ═══════════════════════════════════════════════════════════════════════════════

export type IdentityFileKey = 'soul' | 'user' | 'memory' | 'heartbeat';

export interface IdentityFile {
    key: IdentityFileKey;
    content: string;
    lastModified: number;
}

export interface IdentityProfile {
    soul: IdentityFile;
    user: IdentityFile;
    memory: IdentityFile;
    heartbeat: IdentityFile;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mutations
// ═══════════════════════════════════════════════════════════════════════════════

export interface IdentityMutation {
    timestamp: number;
    file: IdentityFileKey;
    section: string;
    change: string;
    reason: string;
    source: 'heartbeat' | 'user' | 'system';
    confidence: number; // 0-1
}

// ═══════════════════════════════════════════════════════════════════════════════
// Actions
// ═══════════════════════════════════════════════════════════════════════════════

export type ActionType = 'create_task' | 'update_identity' | 'memory_update' | 'scheduler_job';
export type ActionExecutionMode = 'direct' | 'proposal_first';
export type ActionStatus = 'executed' | 'failed' | 'skipped';

export interface ActionRecord {
    id: string;
    createdAt: number;
    completedAt?: number;
    status: ActionStatus;
    title: string;
    summary: string;
    type: ActionType;
    result?: string;
    error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Heartbeat
// ═══════════════════════════════════════════════════════════════════════════════

export type HeartbeatStatus = 'running' | 'completed' | 'failed';

/** How to notify on heartbeat completion */
export type HeartbeatNotificationMode = 'none' | 'toast' | 'os' | 'tts';

export interface HeartbeatRun {
    id: string;
    startedAt: number;
    completedAt?: number;
    status: HeartbeatStatus;
    actionsGenerated: number;
    error?: string;
    sessionId?: string;
}

export interface HeartbeatConfig {
    enabled: boolean;
    intervalMinutes: number;
    notificationMode: HeartbeatNotificationMode;
    perActionMode: Record<ActionType, ActionExecutionMode>;
    agentName: string;
    maxLinesPerFile: number;
    maxTurns: number;
    timeoutMinutes: number;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
    enabled: false,
    intervalMinutes: 30,
    notificationMode: 'toast',
    perActionMode: {
        create_task: 'proposal_first',
        update_identity: 'direct',
        memory_update: 'direct',
        scheduler_job: 'proposal_first',
    },
    agentName: 'Kuroryuu',
    maxLinesPerFile: 50,
    maxTurns: 10,
    timeoutMinutes: 5,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Activity (Unified Timeline)
// ═══════════════════════════════════════════════════════════════════════════════

export type ActivityEntryType = 'mutation' | 'action' | 'heartbeat';

export interface ActivityEntryBase {
    timestamp: number;
}

export interface MutationActivity extends ActivityEntryBase {
    entryType: 'mutation';
    data: IdentityMutation;
}

export interface ActionActivity extends ActivityEntryBase {
    entryType: 'action';
    data: ActionRecord;
}

export interface HeartbeatActivity extends ActivityEntryBase {
    entryType: 'heartbeat';
    data: HeartbeatRun;
}

export type ActivityEntry = MutationActivity | ActionActivity | HeartbeatActivity;

// ═══════════════════════════════════════════════════════════════════════════════
// Daily Memory
// ═══════════════════════════════════════════════════════════════════════════════

export interface DailyMemoryEntry {
    date: string;       // YYYY-MM-DD
    content: string;
    lastModified: number;
}

export interface DailyMemoryIndexDay {
    entries: number;
    bytes: number;
}

export interface DailyMemoryIndex {
    days: Record<string, DailyMemoryIndexDay>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════════════════

export interface BootstrapStatus {
    bootstrapped: boolean;
    skipped?: boolean;
    completedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Claude Memory Sync
// ═══════════════════════════════════════════════════════════════════════════════

export interface MemorySyncStatus {
    lastSyncAt: number | null;
    lastHash: string | null;
    sectionsImported: number;
}
