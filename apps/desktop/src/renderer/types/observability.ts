/**
 * Observability Types
 * TypeScript interfaces for hook event telemetry
 */

// All 12 Claude Code hook event types
export type HookEventType =
  | 'SessionStart'
  | 'SessionEnd'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PermissionRequest'
  | 'Notification'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact';

export interface HookEvent {
  id: number;
  source_app: string;
  session_id: string;
  agent_id?: string | null;
  hook_event_type: HookEventType;
  tool_name?: string | null;
  payload: Record<string, unknown>;
  chat_transcript?: string | null;
  summary?: string | null;
  model_name?: string | null;
  timestamp: number; // Unix milliseconds
}

export interface SessionInfo {
  sessionId: string;
  sourceApp: string;
  agentId?: string;
  firstSeen: number;
  lastSeen: number;
  eventCount: number;
}

export type ObservabilityTimeRange = '1m' | '3m' | '5m' | '10m' | '30m' | '1h' | '6h' | '24h';

export type ObservabilitySubTab = 'timeline' | 'pulse' | 'tools' | 'swimlanes';

export interface ObservabilityFilters {
  sourceApp: string;
  sessionId: string;
  eventType: string;
  toolName: string;
}

export interface ObservabilityStats {
  total_events: number;
  events_per_minute: number;
  active_sessions: number;
  tool_counts: Record<string, number>;
  event_type_counts: Record<string, number>;
  websocket_clients: number;
  storage: {
    db_path: string;
    max_events: number;
    retention_hours: number;
  };
}

// Emoji mapping for hook event types
export const HOOK_EVENT_EMOJIS: Record<HookEventType, string> = {
  SessionStart: '\u{1F7E2}',   // green circle
  SessionEnd: '\u{1F534}',     // red circle
  UserPromptSubmit: '\u{1F4AC}', // speech bubble
  PreToolUse: '\u{1F527}',     // wrench
  PostToolUse: '\u{2705}',     // check mark
  PostToolUseFailure: '\u{274C}', // cross mark
  PermissionRequest: '\u{1F512}', // lock
  Notification: '\u{1F514}',   // bell
  Stop: '\u{1F6D1}',           // stop sign
  SubagentStart: '\u{1F680}',  // rocket
  SubagentStop: '\u{1F3C1}',   // chequered flag
  PreCompact: '\u{1F4E6}',     // package
};

// Emoji mapping for common tool names
export const TOOL_EMOJIS: Record<string, string> = {
  Bash: '\u{1F4BB}',           // laptop
  Read: '\u{1F4D6}',           // book
  Write: '\u{270D}\uFE0F',     // writing hand
  Edit: '\u{270F}\uFE0F',      // pencil
  Grep: '\u{1F50D}',           // magnifying glass
  Glob: '\u{1F4C2}',           // folder
  WebFetch: '\u{1F310}',       // globe
  WebSearch: '\u{1F50E}',      // magnifying glass right
  Task: '\u{1F4CB}',           // clipboard
  AskUserQuestion: '\u{2753}', // question mark
  NotebookEdit: '\u{1F4D3}',   // notebook
};

// Session color palette for visual distinction (20 colors)
export const SESSION_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-lime-500',
  'bg-fuchsia-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-red-500',
  'bg-slate-400',
  'bg-zinc-400',
  'bg-stone-500',
  'bg-yellow-500',
];
