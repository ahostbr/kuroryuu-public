/**
 * Claude Teams Types
 *
 * TypeScript types for Claude Code's official Agent Teams feature.
 * Based on Phase 0 discovery of actual disk schemas at:
 *   ~/.claude/teams/{name}/config.json
 *   ~/.claude/tasks/{name}/{id}.json
 *   ~/.claude/teams/{name}/inboxes/{agent}.json
 */

// ============================================================================
// TEAM CONFIG (disk: ~/.claude/teams/{name}/config.json)
// ============================================================================

export interface TeamMember {
  agentId: string;          // "team-lead@team-name" or "worker-1@team-name"
  name: string;             // Human-readable: "team-lead", "researcher"
  agentType: string;        // Role/type: "team-lead", "researcher", etc.
  model: string;            // "claude-opus-4-6", "claude-sonnet-4-5-20250929"
  joinedAt: number;         // Epoch milliseconds
  tmuxPaneId: string;       // Pane ID or "" for in-process
  cwd: string;              // Working directory
  subscriptions: string[];  // Event subscriptions
  // Teammate-only fields (not present on lead):
  prompt?: string;          // System prompt text
  color?: string;           // Display color: "blue", "green", etc.
  planModeRequired?: boolean;
  backendType?: string;     // "in-process" | "tmux"
}

export interface TeamConfig {
  name: string;
  description: string;
  createdAt: number;        // Epoch milliseconds
  leadAgentId: string;      // "team-lead@team-name"
  leadSessionId: string;    // UUID
  members: TeamMember[];
}

// ============================================================================
// TASK (disk: ~/.claude/tasks/{name}/{id}.json)
// ============================================================================

export type TeamTaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';

export interface TeamTaskMetadata {
  _internal?: boolean;      // Auto-created teammate tracker tasks
  [key: string]: unknown;
}

export interface TeamTask {
  id: string;               // Sequential string: "1", "2", "3"
  subject: string;
  description: string;
  status: TeamTaskStatus;
  blocks: string[];         // Task IDs this task blocks
  blockedBy: string[];      // Task IDs blocking this task
  activeForm?: string;      // Present-continuous form for spinner: "Running tests"
  owner?: string;           // Agent name who claimed the task
  metadata?: TeamTaskMetadata;
}

// ============================================================================
// INBOX MESSAGES (disk: ~/.claude/teams/{name}/inboxes/{agent}.json)
// ============================================================================

export interface InboxMessage {
  from: string;             // Sender name
  text: string;             // Plain text OR JSON-encoded system message
  timestamp: string;        // ISO 8601: "2026-02-05T21:24:45.834Z"
  read: boolean;
  summary?: string;         // Short preview text
  color?: string;           // Sender color
}

// ============================================================================
// SYSTEM MESSAGES (JSON strings inside InboxMessage.text)
// ============================================================================

export interface IdleNotification {
  type: 'idle_notification';
  from: string;
  timestamp: string;
  idleReason: string;       // "available", etc.
}

export interface ShutdownApproved {
  type: 'shutdown_approved';
  requestId: string;
  from: string;
  paneId: string;           // "in-process" or tmux pane ID
  backendType: string;      // "in-process" | "tmux"
}

export interface ShutdownRequest {
  type: 'shutdown_request';
  requestId: string;
  from: string;
  content?: string;
}

export interface TaskCompleted {
  type: 'task_completed';
  taskId: string;
  from: string;
}

export type SystemMessage =
  | IdleNotification
  | ShutdownApproved
  | ShutdownRequest
  | TaskCompleted;

export type SystemMessageType = SystemMessage['type'];

/**
 * Attempt to parse a JSON system message from an inbox message text field.
 * Returns the parsed SystemMessage if valid, or null for plain text messages.
 */
export function parseSystemMessage(text: string): SystemMessage | null {
  try {
    const parsed = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.type === 'string' &&
      ['idle_notification', 'shutdown_approved', 'shutdown_request', 'task_completed'].includes(
        parsed.type
      )
    ) {
      return parsed as SystemMessage;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// TEAMMATE STATUS (derived, not on disk)
// ============================================================================

export type TeammateStatus = 'active' | 'idle' | 'stopped' | 'presumed_dead';

export interface TeammateState {
  member: TeamMember;
  status: TeammateStatus;
  lastActivity?: string;    // ISO 8601
  unreadMessages: number;
  currentTask?: string;     // Task ID if working on something
}

// ============================================================================
// AGGREGATED TEAM STATE (for display)
// ============================================================================

export interface TeamSnapshot {
  config: TeamConfig;
  tasks: TeamTask[];
  inboxes: Record<string, InboxMessage[]>; // keyed by agent name
  teammates: TeammateState[];
  lastUpdated: number;      // Epoch ms of last file change
}

// ============================================================================
// IPC EVENTS (main -> renderer)
// ============================================================================

export type ClaudeTeamsIpcEvent =
  | { type: 'team-config-changed'; teamName: string; config: TeamConfig }
  | { type: 'tasks-changed'; teamName: string; tasks: TeamTask[] }
  | { type: 'inbox-changed'; teamName: string; agentName: string; messages: InboxMessage[] }
  | { type: 'team-created'; teamName: string; config: TeamConfig }
  | { type: 'team-deleted'; teamName: string }
  | { type: 'team-stale'; teamName: string; lastActivity: number }
  | { type: 'watcher-error'; error: string };

// ============================================================================
// TEAM HISTORY / ARCHIVES (disk: {projectRoot}/ai/team-history/)
// ============================================================================

export interface ArchivedTeamStats {
  memberCount: number;
  taskCount: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  messageCount: number;
}

export interface ArchivedTeamSession {
  schema: 'kuroryuu_team_archive_v1';
  id: string;
  archivedAt: string;
  teamName: string;
  createdAt: number;
  duration: number;
  stats: ArchivedTeamStats;
  config: TeamConfig;
  tasks: TeamTask[];
  inboxes: Record<string, InboxMessage[]>;
}

export interface TeamHistoryEntry {
  id: string;
  teamName: string;
  archivedAt: string;
  createdAt: number;
  duration: number;
  stats: ArchivedTeamStats;
  filePath: string;
}

// ============================================================================
// CLI COMMANDS (renderer -> main, fire-and-forget)
// ============================================================================

export interface CreateTeamParams {
  name: string;
  description: string;
  teammates?: {
    name: string;
    prompt: string;
    model?: string;
    color?: string;
    planModeRequired?: boolean;
  }[];
}

export interface MessageTeammateParams {
  teamName: string;
  recipient: string;
  content: string;
  summary?: string;
}

export interface ShutdownTeammateParams {
  teamName: string;
  recipient: string;
  content?: string;
}

export interface CleanupTeamParams {
  teamName: string;
}

// ============================================================================
// ZUSTAND STORE INTERFACE
// ============================================================================

export interface ClaudeTeamsState {
  // Data
  teams: TeamSnapshot[];
  selectedTeamId: string | null; // team name
  isWatching: boolean;
  isLoading: boolean;
  error: string | null;

  // Derived from selected team
  selectedTeam: TeamSnapshot | null;
  selectedTeamTasks: TeamTask[];
  selectedTeamMessages: InboxMessage[];

  // History (archived sessions)
  history: TeamHistoryEntry[];
  isLoadingHistory: boolean;

  // Templates (saved team configurations)
  templates: TeamTemplate[];
  isLoadingTemplates: boolean;

  // Health (derived teammate responsiveness)
  teammateHealth: Record<string, TeammateHealthInfo>;

  // Analytics (derived metrics)
  teamAnalytics: TeamAnalytics | null;
  taskFirstSeen: Record<string, number>;  // taskId → epoch ms when first observed

  // Actions - data
  setTeams: (teams: TeamSnapshot[]) => void;
  selectTeam: (teamName: string | null) => void;
  updateTeamConfig: (teamName: string, config: TeamConfig) => void;
  updateTeamTasks: (teamName: string, tasks: TeamTask[]) => void;
  updateTeamInbox: (teamName: string, agentName: string, messages: InboxMessage[]) => void;
  addTeam: (snapshot: TeamSnapshot) => void;
  removeTeam: (teamName: string) => void;
  setError: (error: string | null) => void;

  // Actions - lifecycle
  startWatching: () => Promise<void>;
  stopWatching: () => void;
  createTeam: (params: CreateTeamParams) => Promise<boolean>;
  messageTeammate: (params: MessageTeammateParams) => Promise<boolean>;
  shutdownTeammate: (params: ShutdownTeammateParams) => Promise<boolean>;
  cleanupTeam: (params: CleanupTeamParams) => Promise<boolean>;
  refreshTeam: (teamName: string) => Promise<void>;

  // Actions - history
  loadHistory: () => Promise<void>;
  deleteArchive: (archiveId: string) => Promise<boolean>;

  // Actions - templates
  loadTemplates: () => Promise<void>;
  saveTemplate: (template: Omit<TeamTemplate, 'id' | 'createdAt'>) => Promise<boolean>;
  deleteTemplate: (templateId: string) => Promise<boolean>;
  toggleTemplateFavorite: (templateId: string) => Promise<boolean>;

  // Actions - health & analytics
  checkTeammateHealth: () => void;
  computeAnalytics: () => void;
  markInboxRead: (teamName: string, agentName: string) => Promise<void>;

  // Actions - bulk operations
  shutdownAllTeammates: (teamName: string) => Promise<boolean>;
  broadcastToTeammates: (teamName: string, content: string) => Promise<boolean>;
}

// ============================================================================
// TEAM ANALYTICS (derived metrics)
// ============================================================================

export interface TeamAnalytics {
  velocity: number;            // completed tasks per minute
  completionPct: number;       // completed / total tasks * 100
  totalMessages: number;       // sum of all inbox messages
  avgResponseLatency: number;  // ms avg across all teammates
  messageRate: number;         // messages per minute team-wide
  bottleneckTaskIds: string[]; // task IDs with most blockedBy or longest in_progress
  teamUptime: number;          // ms since team.config.createdAt
}

// ============================================================================
// TEAM TEMPLATES (disk: {projectRoot}/ai/team-templates.json)
// ============================================================================

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  createdAt: string;          // ISO 8601
  isFavorite: boolean;
  config: {
    teammates: Array<{
      name: string;
      prompt: string;
      model?: string;
      color?: string;
      planModeRequired?: boolean;
    }>;
  };
}

// ============================================================================
// TEAMMATE HEALTH (derived, not on disk)
// ============================================================================

export interface TeammateHealthInfo {
  lastActivity: number;       // Epoch ms of last inbox activity
  isUnresponsive: boolean;    // True if >5min with active task and no activity
  exitedAt?: number;          // Epoch ms when member was removed from config (definitive exit)
  uptime: number;             // ms since joinedAt (or exitedAt - joinedAt if exited)
  messageCount: number;       // total messages from this agent
  avgResponseTime?: number;   // ms avg between human msg → agent response
}

// ============================================================================
// REACTFLOW NODE TYPES (for graph visualization)
// ============================================================================

export type FlowViewMode = 'hub-spokes' | 'hierarchy' | 'timeline' | 'observability';

export interface TeamNodeData {
  label: string;
  agentId: string;
  agentType: string;
  status: TeammateStatus;
  model: string;
  color?: string;
  isLead: boolean;
  taskCount: number;
  unreadCount: number;
  activeForm?: string;        // Present-continuous spinner text for active tasks
  backendType?: string;       // "in-process" | "tmux"
}

export interface TaskEdgeData {
  taskId: string;
  subject: string;
  status: TeamTaskStatus;
}

// ============================================================================
// TIMELINE VISUALIZATION (re-exported from timeline module)
// ============================================================================

export type { TimelineStyle, TimelineColorMode } from '../components/claude-teams/timeline/timeline-types';
