/**
 * Types for Traffic Flow Visualization
 * Real-time network traffic monitoring for gateway and MCP server
 */

// ============================================================================
// Traffic Event Types
// ============================================================================

export type TrafficEventType =
  | 'http_request'
  | 'http_response'
  | 'websocket_connect'
  | 'websocket_message'
  | 'mcp_call'
  | 'tool_execution';

export interface TrafficEvent {
  id: string; // Unique event ID (UUID)
  type: TrafficEventType;
  timestamp: string; // ISO 8601 timestamp
  source: string; // Source identifier (client, gateway, mcp_core)
  destination: string; // Destination identifier (endpoint path)
  endpoint: string; // Full API endpoint path
  method?: string; // HTTP method (GET, POST, etc.)
  status?: number; // HTTP status code (200, 404, 500, etc.)
  duration?: number; // Request duration in milliseconds
  payloadSize?: number; // Payload size in bytes
  metadata?: Record<string, any>; // Additional context
}

/**
 * Extended traffic event with full request/response data
 */
export interface TrafficEventDetail extends TrafficEvent {
  // Request details
  request_headers?: Record<string, string>;
  request_body?: string;
  request_body_size?: number;
  request_body_truncated?: boolean;
  query_params?: Record<string, string>;

  // Response details
  response_headers?: Record<string, string>;
  response_body?: string;
  response_body_size?: number;
  response_body_truncated?: boolean;

  // Context
  client_ip?: string;
  user_agent?: string;
  correlation_id?: string;

  // Error info
  error_type?: string;
  error_message?: string;
}

/**
 * Summary statistics for a single endpoint
 */
export interface EndpointSummary {
  endpoint: string;
  category: string;
  request_count: number;
  error_count: number;
  error_rate: number;
  avg_latency: number;
  p95_latency: number;
  min_latency?: number;
  max_latency?: number;
  last_request_time?: string;
  status_breakdown: Record<number, number>;
  methods_used: string[];
}

// ============================================================================
// Network Graph Types
// ============================================================================

export type NodeType = 'gateway' | 'endpoint' | 'mcp-tool' | 'external';

export interface NetworkNode {
  id: string; // Unique node ID
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label: string; // Display name
    category: string; // Grouping category (agents, chat, mcp, etc.)
    requestCount: number; // Total requests
    errorCount: number; // Total errors
    avgLatency: number; // Average latency in ms
  };
}

export type TrafficStatus = 'success' | 'error' | 'pending';

export interface TrafficEdge {
  id: string; // Unique edge ID
  source: string; // Source node ID
  target: string; // Target node ID
  animated: boolean; // Enable particle animation
  data: {
    recentEvents: TrafficEvent[]; // Last N events on this edge
    status: TrafficStatus;
    color: string; // Neon color for edge
  };
}

// ============================================================================
// Filter Types
// ============================================================================

export interface FilterState {
  endpointGroups: string[]; // Filter by endpoint category
  statuses: number[]; // Filter by HTTP status codes
  timeRange: [Date | null, Date | null]; // Time range filter
  searchQuery: string; // Search query for endpoints
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface TrafficStats {
  requestsPerSecond: number; // Current req/sec rate
  avgLatency: number; // Average latency in ms
  errorRate: number; // Error rate (0-1)
  totalRequests: number; // Total requests in window
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type WebSocketMessageType = 'traffic_event' | 'stats_update' | 'ping' | 'pong' | 'connected';

export interface TrafficWebSocketMessage {
  type: WebSocketMessageType;
  event?: TrafficEvent;
  stats?: TrafficStats;
  timestamp?: string;
}

// ============================================================================
// Visualization Theme Types
// ============================================================================

export type TrafficVizTheme = 'cyberpunk' | 'kuroryuu' | 'retro' | 'default';

export type TrafficViewMode = 'graph' | 'split';

export type GraphLayout = 'flat' | 'hierarchical';

export type LogFilterLevel = 'all' | 'errors' | 'warnings';

// ============================================================================
// Store State Types
// ============================================================================

export interface TrafficState {
  // Raw events buffer
  events: TrafficEvent[];
  maxEvents: number;

  // Derived graph data
  nodes: NetworkNode[];
  edges: TrafficEdge[];

  // Filters
  filters: FilterState;

  // Stats
  stats: TrafficStats;

  // Playback controls
  isPaused: boolean;
  playbackSpeed: number; // 0.5x, 1x, 2x

  // Connection state
  isConnected: boolean;

  // Visualization theme
  vizTheme: TrafficVizTheme;

  // View mode
  viewMode: TrafficViewMode;

  // Graph layout
  graphLayout: GraphLayout;

  // Drawer state
  drawerOpen: boolean;
  selectedEndpoint: string | null;
  endpointData: EndpointSummary | null;
  endpointEvents: TrafficEventDetail[];

  // Inspector modal state
  inspectorOpen: boolean;
  selectedEvent: TrafficEventDetail | null;

  // Log stream state
  logAutoScroll: boolean;
  logFilterLevel: LogFilterLevel;

  // Archival state
  archivedBatchCount: number;

  // Security defense mode
  defenseMode: boolean;
  threatEvent: {
    ip: string;
    timestamp: string;
    endpoint: string;
    method: string;
    userAgent: string;
  } | null;
  blockedIPs: string[];

  // Actions
  addEvent: (event: TrafficEvent) => void;
  addEvents: (events: TrafficEvent[]) => void; // HP-3: Batch add for event batching
  setFilters: (filters: Partial<FilterState>) => void;
  togglePause: () => void;
  setPlaybackSpeed: (speed: number) => void;
  clearEvents: () => void;
  updateStats: (stats: TrafficStats) => void;
  setConnected: (connected: boolean) => void;
  setVizTheme: (theme: TrafficVizTheme) => void;
  setViewMode: (mode: TrafficViewMode) => void;
  setGraphLayout: (layout: GraphLayout) => void;

  // Drawer actions
  openDrawer: (endpoint: string) => Promise<void>;
  closeDrawer: () => void;

  // Inspector actions
  openInspector: (eventId: string) => Promise<void>;
  closeInspector: () => void;

  // Log actions
  toggleLogAutoScroll: () => void;
  setLogFilterLevel: (level: LogFilterLevel) => void;

  // Defense mode actions
  setDefenseMode: (mode: boolean) => void;
  setThreatEvent: (event: TrafficState['threatEvent']) => void;
  addBlockedIP: (ip: string) => void;
  removeBlockedIP: (ip: string) => void;
  clearDefenseMode: () => void;
}
