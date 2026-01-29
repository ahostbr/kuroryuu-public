/**
 * PTY Traffic Store - Zustand state management for PTY traffic flow visualization
 */
import { create } from 'zustand';
import type {
  PTYEvent,
  PTYEventDetail,
  PTYSessionSummary,
  PTYNetworkNode,
  PTYTrafficEdge,
  PTYFilterState,
  PTYTrafficStats,
  PTYTrafficState,
  PTYVizMode,
  PTYVizTheme,
} from '../types/pty-traffic';

// Gateway URL for API calls
const GATEWAY_URL = 'http://localhost:8200';

// Debounce timer for graph rebuilding
let graphRebuildTimer: ReturnType<typeof setTimeout> | null = null;
const GRAPH_REBUILD_DEBOUNCE_MS = 200;

// Default filter state
const defaultFilters: PTYFilterState = {
  actions: [],
  agentIds: [],
  sessionIds: [],
  errorsOnly: false,
  blockedOnly: false,
  searchQuery: '',
  timeRange: [null, null],
};

// Default stats
const defaultStats: PTYTrafficStats = {
  eventsPerSecond: 0,
  bytesPerSecond: 0,
  avgDuration: 0,
  errorRate: 0,
  blockedRate: 0,
  totalEvents: 0,
  activeSessions: 0,
  totalBytesSent: 0,
  totalBytesReceived: 0,
  actionBreakdown: {},
  agentBreakdown: {},
};

// Color palette for different statuses
const COLORS = {
  success: '#00ff88', // Neon green
  error: '#ff3366', // Neon red
  blocked: '#ff9900', // Neon orange
  pending: '#00ccff', // Neon cyan
  agent: '#9966ff', // Neon purple
  pty: '#00ffff', // Neon cyan
  leader: '#ffcc00', // Neon gold
};

/**
 * Build network graph from PTY events
 * Creates nodes for agents and PTY sessions
 * Creates edges representing data flow
 */
function buildGraphFromEvents(
  events: PTYEvent[],
  filters: PTYFilterState
): { nodes: PTYNetworkNode[]; edges: PTYTrafficEdge[] } {
  if (events.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Apply filters
  let filteredEvents = events;

  if (filters.actions.length > 0) {
    filteredEvents = filteredEvents.filter((e) =>
      filters.actions.includes(e.action as any)
    );
  }

  if (filters.agentIds.length > 0) {
    filteredEvents = filteredEvents.filter(
      (e) => e.agent_id && filters.agentIds.includes(e.agent_id)
    );
  }

  if (filters.sessionIds.length > 0) {
    filteredEvents = filteredEvents.filter((e) =>
      filters.sessionIds.includes(e.session_id)
    );
  }

  if (filters.errorsOnly) {
    filteredEvents = filteredEvents.filter((e) => !e.success);
  }

  if (filters.blockedOnly) {
    filteredEvents = filteredEvents.filter((e) => (e as any).blocked);
  }

  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    filteredEvents = filteredEvents.filter(
      (e) =>
        e.session_id.toLowerCase().includes(query) ||
        e.agent_id?.toLowerCase().includes(query) ||
        e.command_preview?.toLowerCase().includes(query)
    );
  }

  // Group by agent and session
  const agentStats = new Map<
    string,
    { eventCount: number; errorCount: number; blockedCount: number; durations: number[] }
  >();
  const sessionStats = new Map<
    string,
    { eventCount: number; errorCount: number; blockedCount: number; durations: number[]; agentId?: string }
  >();
  const agentToSessions = new Map<string, Set<string>>();

  filteredEvents.forEach((event) => {
    const agentId = event.agent_id || 'unknown';
    const sessionId = event.session_id;

    // Agent stats
    if (!agentStats.has(agentId)) {
      agentStats.set(agentId, { eventCount: 0, errorCount: 0, blockedCount: 0, durations: [] });
    }
    const aStats = agentStats.get(agentId)!;
    aStats.eventCount++;
    if (!event.success) aStats.errorCount++;
    if ((event as any).blocked) aStats.blockedCount++;
    if (event.duration) aStats.durations.push(event.duration);

    // Session stats
    if (!sessionStats.has(sessionId)) {
      sessionStats.set(sessionId, { eventCount: 0, errorCount: 0, blockedCount: 0, durations: [], agentId });
    }
    const sStats = sessionStats.get(sessionId)!;
    sStats.eventCount++;
    if (!event.success) sStats.errorCount++;
    if ((event as any).blocked) sStats.blockedCount++;
    if (event.duration) sStats.durations.push(event.duration);

    // Track agent-to-session connections
    if (!agentToSessions.has(agentId)) {
      agentToSessions.set(agentId, new Set());
    }
    agentToSessions.get(agentId)!.add(sessionId);
  });

  // Create nodes
  const nodes: PTYNetworkNode[] = [];
  const edges: PTYTrafficEdge[] = [];

  // MCP Core node (center)
  nodes.push({
    id: 'mcp-core',
    type: 'mcp-core',
    position: { x: 400, y: 300 },
    data: {
      label: 'MCP CORE',
      eventCount: filteredEvents.length,
      errorCount: filteredEvents.filter((e) => !e.success).length,
      blockedCount: filteredEvents.filter((e) => (e as any).blocked).length,
      avgLatency: 0,
    },
  });

  // Agent nodes (left side)
  const agentRadius = 250;
  const agentAngleStep = Math.PI / (agentStats.size + 1);
  let agentAngle = Math.PI / 2 + agentAngleStep;

  agentStats.forEach((stats, agentId) => {
    const x = 400 - agentRadius * Math.cos(agentAngle);
    const y = 300 - agentRadius * Math.sin(agentAngle);

    const avgLatency =
      stats.durations.length > 0
        ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length
        : 0;

    const isLeader = agentId.toLowerCase().includes('leader');

    nodes.push({
      id: `agent-${agentId}`,
      type: 'agent',
      position: { x, y },
      data: {
        label: agentId.length > 15 ? agentId.substring(0, 15) + '...' : agentId,
        agentId,
        eventCount: stats.eventCount,
        errorCount: stats.errorCount,
        blockedCount: stats.blockedCount,
        avgLatency,
        isLeader,
      },
    });

    // Edge from agent to MCP Core
    edges.push({
      id: `agent-${agentId}-mcp`,
      source: `agent-${agentId}`,
      target: 'mcp-core',
      animated: true,
      data: {
        recentEvents: filteredEvents.filter((e) => e.agent_id === agentId).slice(-5),
        status: stats.errorCount > 0 ? 'error' : stats.blockedCount > 0 ? 'blocked' : 'success',
        color: stats.errorCount > 0 ? COLORS.error : stats.blockedCount > 0 ? COLORS.blocked : COLORS.success,
        bytesTransferred: 0,
      },
    });

    agentAngle += agentAngleStep;
  });

  // PTY session nodes (right side)
  const sessionRadius = 250;
  const sessionAngleStep = Math.PI / (sessionStats.size + 1);
  let sessionAngle = -Math.PI / 2 + sessionAngleStep;

  sessionStats.forEach((stats, sessionId) => {
    const x = 400 + sessionRadius * Math.cos(sessionAngle);
    const y = 300 - sessionRadius * Math.sin(sessionAngle);

    const avgLatency =
      stats.durations.length > 0
        ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length
        : 0;

    const shortId = sessionId.length > 12 ? sessionId.substring(0, 12) + '...' : sessionId;

    nodes.push({
      id: `pty-${sessionId}`,
      type: 'pty-session',
      position: { x, y },
      data: {
        label: shortId,
        sessionId,
        eventCount: stats.eventCount,
        errorCount: stats.errorCount,
        blockedCount: stats.blockedCount,
        avgLatency,
      },
    });

    // Edge from MCP Core to PTY session
    edges.push({
      id: `mcp-pty-${sessionId}`,
      source: 'mcp-core',
      target: `pty-${sessionId}`,
      animated: true,
      data: {
        recentEvents: filteredEvents.filter((e) => e.session_id === sessionId).slice(-5),
        status: stats.errorCount > 0 ? 'error' : stats.blockedCount > 0 ? 'blocked' : 'success',
        color: stats.errorCount > 0 ? COLORS.error : stats.blockedCount > 0 ? COLORS.blocked : COLORS.pty,
        bytesTransferred: 0,
      },
    });

    sessionAngle += sessionAngleStep;
  });

  return { nodes, edges };
}

// Create the store
export const usePTYTrafficStore = create<PTYTrafficState>((set, get) => ({
  // State
  events: [],
  maxEvents: 500,
  nodes: [],
  edges: [],
  filters: defaultFilters,
  stats: defaultStats,
  sessions: [],
  isPaused: false,
  isConnected: false,
  vizMode: 'network' as PTYVizMode,
  vizTheme: 'cyberpunk' as PTYVizTheme,

  // Drawer state
  drawerOpen: false,
  selectedSession: null,
  sessionData: null,
  sessionEvents: [],

  // Inspector modal state
  inspectorOpen: false,
  selectedEvent: null,

  // Actions
  addEvent: (event: PTYEvent) => {
    if (get().isPaused) return;

    set((state) => {
      let events = [...state.events, event];

      // Trim to max events
      if (events.length > state.maxEvents) {
        events = events.slice(-state.maxEvents);
      }

      return { events };
    });

    // Debounce graph rebuilding
    if (graphRebuildTimer) clearTimeout(graphRebuildTimer);
    graphRebuildTimer = setTimeout(() => {
      const state = get();
      const { nodes, edges } = buildGraphFromEvents(state.events, state.filters);
      set({ nodes, edges });
    }, GRAPH_REBUILD_DEBOUNCE_MS);
  },

  setFilters: (filters: Partial<PTYFilterState>) => {
    set((state) => {
      const newFilters = { ...state.filters, ...filters };
      const { nodes, edges } = buildGraphFromEvents(state.events, newFilters);
      return { filters: newFilters, nodes, edges };
    });
  },

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  clearEvents: () => {
    set({
      events: [],
      nodes: [],
      edges: [],
      stats: defaultStats,
    });
  },

  updateStats: (stats: PTYTrafficStats) => set({ stats }),

  setConnected: (connected: boolean) => set({ isConnected: connected }),

  setVizMode: (mode: PTYVizMode) => set({ vizMode: mode }),

  setVizTheme: (theme: PTYVizTheme) => set({ vizTheme: theme }),

  // Drawer actions
  openDrawer: async (sessionId: string) => {
    set({ drawerOpen: true, selectedSession: sessionId, sessionData: null, sessionEvents: [] });

    try {
      const response = await fetch(`${GATEWAY_URL}/v1/pty-traffic/sessions/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        set({
          sessionData: data.summary as PTYSessionSummary,
          sessionEvents: data.recent_events as PTYEventDetail[],
        });
      }
    } catch (error) {
      console.error('Failed to fetch PTY session data:', error);
    }
  },

  closeDrawer: () =>
    set({
      drawerOpen: false,
      selectedSession: null,
      sessionData: null,
      sessionEvents: [],
    }),

  // Inspector actions
  openInspector: async (eventId: string) => {
    set({ inspectorOpen: true, selectedEvent: null });

    try {
      const response = await fetch(`${GATEWAY_URL}/v1/pty-traffic/events/${eventId}`);
      if (response.ok) {
        const data = await response.json();
        set({ selectedEvent: data as PTYEventDetail });
      }
    } catch (error) {
      console.error('Failed to fetch PTY event details:', error);
    }
  },

  closeInspector: () => set({ inspectorOpen: false, selectedEvent: null }),

  // Fetch sessions
  fetchSessions: async () => {
    try {
      const response = await fetch(`${GATEWAY_URL}/v1/pty-traffic/sessions`);
      if (response.ok) {
        const data = await response.json();
        set({ sessions: data.sessions as PTYSessionSummary[] });
      }
    } catch (error) {
      console.error('Failed to fetch PTY sessions:', error);
    }
  },
}));
