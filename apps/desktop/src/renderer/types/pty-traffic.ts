/**
 * Types for PTY Traffic Flow Visualization
 * Real-time agent-to-PTY data flow monitoring
 */

// ============================================================================
// PTY Action Types
// ============================================================================

export type PTYAction =
  | 'talk'
  | 'send_line'
  | 'read'
  | 'term_read'
  | 'create'
  | 'kill'
  | 'write'
  | 'resize'
  | 'resolve'
  | 'list';

// ============================================================================
// PTY Event Types
// ============================================================================

export interface PTYEvent {
  id: string;
  session_id: string;
  action: string;
  agent_id?: string;
  timestamp: string;
  success: boolean;
  duration?: number; // milliseconds
  command_preview?: string;
  response_preview?: string;
}

export interface PTYEventDetail extends PTYEvent {
  owner_session_id?: string;
  label?: string;
  session_source?: string;
  cli_type?: string;

  // Command details
  command?: string;
  command_size: number;
  command_truncated: boolean;

  // Response details
  response?: string;
  response_size: number;
  response_truncated: boolean;

  // Timing
  timeout_ms?: number;
  timed_out: boolean;

  // Error info
  error_code?: string;
  error_message?: string;

  // Blocking
  blocked: boolean;
  blocked_pattern?: string;
}

// ============================================================================
// PTY Session Summary
// ============================================================================

export interface PTYSessionSummary {
  session_id: string;
  agent_id?: string;
  owner_session_id?: string;
  label?: string;
  cli_type?: string;
  event_count: number;
  error_count: number;
  blocked_count: number;
  error_rate: number;
  avg_duration: number;
  total_bytes_sent: number;
  total_bytes_received: number;
  first_event_time?: string;
  last_event_time?: string;
  action_breakdown: Record<string, number>;
}

// ============================================================================
// Network Graph Types (for ReactFlow visualization)
// ============================================================================

export type PTYNodeType = 'agent' | 'pty-session' | 'mcp-core';

export interface PTYNetworkNode {
  id: string;
  type: PTYNodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    agentId?: string;
    sessionId?: string;
    eventCount: number;
    errorCount: number;
    blockedCount: number;
    avgLatency: number;
    isLeader?: boolean;
    cliType?: string;
  };
}

export type PTYEdgeStatus = 'success' | 'error' | 'blocked' | 'pending';

export interface PTYTrafficEdge {
  id: string;
  source: string; // Agent node ID
  target: string; // PTY session node ID
  animated: boolean;
  data: {
    recentEvents: PTYEvent[];
    status: PTYEdgeStatus;
    color: string;
    bytesTransferred: number;
  };
}

// ============================================================================
// Filter Types
// ============================================================================

export interface PTYFilterState {
  actions: PTYAction[];
  agentIds: string[];
  sessionIds: string[];
  errorsOnly: boolean;
  blockedOnly: boolean;
  searchQuery: string;
  timeRange: [Date | null, Date | null];
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface PTYTrafficStats {
  eventsPerSecond: number;
  bytesPerSecond: number;
  avgDuration: number;
  errorRate: number;
  blockedRate: number;
  totalEvents: number;
  activeSessions: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  actionBreakdown: Record<string, number>;
  agentBreakdown: Record<string, number>;
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type PTYWebSocketMessageType =
  | 'pty_event'
  | 'stats_update'
  | 'ping'
  | 'pong'
  | 'connected'
  | 'subscribed'
  | 'unsubscribed'
  | 'paused'
  | 'resumed'
  | 'error';

export interface PTYWebSocketMessage {
  type: PTYWebSocketMessageType;
  event?: PTYEvent;
  stats?: PTYTrafficStats;
  timestamp?: string;
  message?: string;
  filters?: Partial<PTYFilterState>;
}

// ============================================================================
// Visualization Types
// ============================================================================

export type PTYVizMode = 'network' | 'timeline' | 'sankey' | 'matrix';

export type PTYVizTheme = 'cyberpunk' | 'kuroryuu' | 'retro' | 'default';

// ============================================================================
// Store State Types
// ============================================================================

export interface PTYTrafficState {
  // Raw events buffer
  events: PTYEvent[];
  maxEvents: number;

  // Derived graph data
  nodes: PTYNetworkNode[];
  edges: PTYTrafficEdge[];

  // Filters
  filters: PTYFilterState;

  // Stats
  stats: PTYTrafficStats;

  // Sessions
  sessions: PTYSessionSummary[];

  // Playback controls
  isPaused: boolean;

  // Connection state
  isConnected: boolean;

  // Visualization mode
  vizMode: PTYVizMode;

  // Theme
  vizTheme: PTYVizTheme;

  // Drawer state
  drawerOpen: boolean;
  selectedSession: string | null;
  sessionData: PTYSessionSummary | null;
  sessionEvents: PTYEventDetail[];

  // Inspector modal state
  inspectorOpen: boolean;
  selectedEvent: PTYEventDetail | null;

  // Actions
  addEvent: (event: PTYEvent) => void;
  setFilters: (filters: Partial<PTYFilterState>) => void;
  togglePause: () => void;
  clearEvents: () => void;
  updateStats: (stats: PTYTrafficStats) => void;
  setConnected: (connected: boolean) => void;
  setVizMode: (mode: PTYVizMode) => void;
  setVizTheme: (theme: PTYVizTheme) => void;

  // Drawer actions
  openDrawer: (sessionId: string) => Promise<void>;
  closeDrawer: () => void;

  // Inspector actions
  openInspector: (eventId: string) => Promise<void>;
  closeInspector: () => void;

  // Fetch actions
  fetchSessions: () => Promise<void>;
}
