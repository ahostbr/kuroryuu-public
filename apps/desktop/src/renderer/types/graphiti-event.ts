/**
 * Graphiti Event Types
 * Canonical event schema for unified observability hub
 * All events from traffic, agents, tasks, tools, hooks, etc. normalize to this format
 */

// ============================================================================
// Event Categories & Severities
// ============================================================================

export type GraphitiEventCategory =
  | 'traffic'   // HTTP requests, responses, WebSocket
  | 'agent'     // Agent lifecycle events
  | 'task'      // Task/subtask orchestration
  | 'tool'      // MCP tool executions
  | 'hook'      // Kuroryuu hook events
  | 'agui'      // AG-UI protocol events
  | 'session'   // Session lifecycle
  | 'memory'    // Memory/knowledge graph operations
  | 'system';   // System-level events

export type GraphitiSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export type GraphitiSource = 'gateway' | 'mcp_core' | 'desktop' | 'agent' | 'external';

// ============================================================================
// Canonical GraphitiEvent
// ============================================================================

export interface GraphitiEvent {
  // === REQUIRED ===
  id: string;                           // UUID v4
  timestamp: string;                    // ISO 8601 (e.g., 2026-01-14T22:30:00.000Z)
  category: GraphitiEventCategory;
  type: string;                         // Specific event type (e.g., 'http_request', 'tool_execution')

  // === CORRELATION IDS (optional but critical for linking) ===
  sessionId?: string;                   // CLI/Desktop session (from k_session)
  threadId?: string;                    // Conversation thread (from AG-UI)
  runId?: string;                       // Agent run (from AG-UI)
  taskId?: string;                      // Orchestration task ID
  agentId?: string;                     // Agent identifier
  correlationId?: string;               // HTTP request correlation (X-Correlation-ID)
  parentEventId?: string;               // Event hierarchy for nested events

  // === METADATA ===
  source: GraphitiSource;               // Where event originated
  severity: GraphitiSeverity;           // Event importance level
  payload: Record<string, unknown>;     // Event-specific data

  // === OPTIONAL ===
  duration?: number;                    // For request/response (milliseconds)
  status?: number;                      // HTTP status code or custom status
  tags?: string[];                      // User-defined tags for filtering
  error?: GraphitiError;                // Error details if applicable
}

// ============================================================================
// Error Structure
// ============================================================================

export interface GraphitiError {
  code: string;                         // Error code (e.g., 'TIMEOUT', 'CONNECTION_REFUSED')
  message: string;                      // Human-readable error message
  stack?: string;                       // Stack trace if available
  retryable?: boolean;                  // Whether the operation can be retried
}

// ============================================================================
// Node Types for Unified Canvas
// ============================================================================

export type GraphitiNodeType =
  | 'agent'     // Agent node (circle)
  | 'task'      // Task node (rectangle)
  | 'tool'      // Tool node (hexagon)
  | 'memory'    // Memory node (diamond)
  | 'gateway'   // Gateway node (rounded rectangle)
  | 'endpoint'  // Endpoint node (pill shape)
  | 'session';  // Session node (octagon)

export type GraphitiNodeStatus =
  | 'idle'
  | 'active'
  | 'pending'
  | 'success'
  | 'error'
  | 'blocked'
  | 'timeout';

export interface GraphitiNode {
  id: string;
  type: GraphitiNodeType;
  label: string;
  status: GraphitiNodeStatus;
  category: GraphitiEventCategory;

  // Stats for this node
  eventCount: number;
  errorCount: number;
  lastEventTime?: string;
  avgLatency?: number;

  // Correlation
  correlationKeys: string[];            // Keys to find related events

  // UI positioning (managed by ReactFlow)
  position?: { x: number; y: number };
}

// ============================================================================
// Edge Types
// ============================================================================

export type GraphitiEdgeType =
  | 'request'       // HTTP request flow
  | 'response'      // HTTP response flow
  | 'triggers'      // Event triggers another
  | 'assigned_to'   // Task assigned to agent
  | 'produces'      // Agent produces output
  | 'correlates';   // Generic correlation

export interface GraphitiEdge {
  id: string;
  source: string;                       // Source node ID
  target: string;                       // Target node ID
  type: GraphitiEdgeType;
  label?: string;

  // Traffic stats
  eventCount: number;
  errorCount: number;
  avgLatency?: number;

  // Animation state
  animated: boolean;
  status: 'active' | 'idle' | 'error';
}

// ============================================================================
// Filter Types
// ============================================================================

export interface GraphitiFilters {
  categories: GraphitiEventCategory[];  // Filter by category
  severities: GraphitiSeverity[];       // Filter by severity
  sources: GraphitiSource[];            // Filter by source
  agents: string[];                     // Filter by specific agents
  tasks: string[];                      // Filter by specific tasks
  timeWindow: [Date, Date] | null;      // Time range filter
  searchQuery: string;                  // Text search
  showErrors: boolean;                  // Quick filter for errors only
}

export const DEFAULT_GRAPHITI_FILTERS: GraphitiFilters = {
  categories: [],                       // Empty = all categories
  severities: [],                       // Empty = all severities
  sources: [],                          // Empty = all sources
  agents: [],
  tasks: [],
  timeWindow: null,
  searchQuery: '',
  showErrors: false,
};

// ============================================================================
// Metrics Types
// ============================================================================

export interface GraphitiMetrics {
  requestsPerSecond: number;
  avgLatency: number;
  errorRate: number;                    // 0-1
  activeAgents: number;
  activeTasks: number;
  totalEvents: number;
}

export interface GraphitiMetricsSnapshot {
  timestamp: string;
  metrics: GraphitiMetrics;
}

// ============================================================================
// Data Retention Config
// ============================================================================

export type GraphitiRetentionPeriod = '1h' | '24h' | '7d' | '30d' | '90d' | 'unlimited';

export interface GraphitiConfig {
  enabled: boolean;                     // Opt-in toggle
  retention: GraphitiRetentionPeriod;
  maxEventsInMemory: number;            // Ring buffer size
  archiveBatchSize: number;             // Events per IndexedDB batch
}

export const DEFAULT_GRAPHITI_CONFIG: GraphitiConfig = {
  enabled: false,                       // IMPORTANT: Default disabled
  retention: '24h',
  maxEventsInMemory: 10000,
  archiveBatchSize: 100,
};

// ============================================================================
// Theme Types (matches TrafficVizTheme)
// ============================================================================

export type GraphitiTheme = 'cyberpunk' | 'kuroryuu' | 'retro' | 'default';

// ============================================================================
// View State Types
// ============================================================================

export type GraphitiViewMode = 'unified' | 'traffic' | 'memory';

export interface GraphitiViewState {
  mode: GraphitiViewMode;
  theme: GraphitiTheme;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  focusedCorrelationKey: string | null; // For focused+collapsed view
  zoomLevel: number;
  panPosition: { x: number; y: number };
}
