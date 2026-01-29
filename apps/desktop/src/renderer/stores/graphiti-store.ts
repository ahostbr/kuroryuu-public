/**
 * Graphiti Store - Central event store for unified observability hub
 * OPT-IN ONLY: All operations check graphitiEnabled before executing
 *
 * Features:
 * - Ring buffer for events (max 10,000)
 * - Correlation map for linking related events
 * - Rolling metrics computation
 * - Debounced graph rebuild
 * - IndexedDB persistence with configurable retention
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  GraphitiEvent,
  GraphitiEventCategory,
  GraphitiFilters,
  GraphitiMetrics,
  GraphitiMetricsSnapshot,
  GraphitiConfig,
  GraphitiNode,
  GraphitiEdge,
  GraphitiTheme,
  GraphitiViewMode,
  GraphitiViewState,
} from '../types/graphiti-event';
import {
  DEFAULT_GRAPHITI_FILTERS,
  DEFAULT_GRAPHITI_CONFIG,
} from '../types/graphiti-event';
import {
  archiveGraphitiEvents,
  pruneByRetention,
  pruneOldGraphitiBatches,
  clearGraphitiArchive,
  getArchivedGraphitiBatchCount,
} from './graphiti-persistence';

// ============================================================================
// Constants
// ============================================================================

const ARCHIVE_BATCH_SIZE = 100;
const MAX_EVENTS_IN_MEMORY = 10000;
const GRAPH_REBUILD_DEBOUNCE_MS = 200;
const METRICS_UPDATE_INTERVAL_MS = 1000;
const METRICS_HISTORY_MAX = 300; // 5 minutes at 1-second intervals

// Debounce timer
let graphRebuildTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// Store State Type
// ============================================================================

interface GraphitiState {
  // === Config (opt-in) ===
  config: GraphitiConfig;
  setConfig: (config: Partial<GraphitiConfig>) => void;
  setEnabled: (enabled: boolean) => void;

  // === Events ===
  events: GraphitiEvent[];
  correlationMap: Map<string, Set<string>>; // correlationKey → eventIds

  // === Metrics ===
  metrics: GraphitiMetrics;
  metricsHistory: GraphitiMetricsSnapshot[];

  // === View State ===
  viewState: GraphitiViewState;
  setViewMode: (mode: GraphitiViewMode) => void;
  setTheme: (theme: GraphitiTheme) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  setFocusedCorrelation: (key: string | null) => void;

  // === Filters ===
  filters: GraphitiFilters;
  setFilters: (filters: Partial<GraphitiFilters>) => void;
  resetFilters: () => void;

  // === Graph Data (derived) ===
  nodes: GraphitiNode[];
  edges: GraphitiEdge[];

  // === Drilldown ===
  drilldownEvents: GraphitiEvent[];

  // === Archival ===
  archivedBatchCount: number;

  // === Actions ===
  ingestEvent: (event: GraphitiEvent) => void;
  ingestBatch: (events: GraphitiEvent[]) => void;
  clearEvents: () => void;
  rebuildGraph: () => void;

  // === Correlation ===
  getCorrelatedEvents: (key: string) => GraphitiEvent[];
  getCorrelatedEventsByNode: (nodeId: string) => GraphitiEvent[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Add event to correlation map
 */
function addToCorrelationMap(
  map: Map<string, Set<string>>,
  event: GraphitiEvent
): void {
  const keys: string[] = [];

  if (event.sessionId) keys.push(`session:${event.sessionId}`);
  if (event.threadId) keys.push(`thread:${event.threadId}`);
  if (event.runId) keys.push(`run:${event.runId}`);
  if (event.taskId) keys.push(`task:${event.taskId}`);
  if (event.agentId) keys.push(`agent:${event.agentId}`);
  if (event.correlationId) keys.push(`corr:${event.correlationId}`);

  keys.forEach((key) => {
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    map.get(key)!.add(event.id);
  });
}

/**
 * Compute rolling metrics from events
 */
function computeMetrics(events: GraphitiEvent[]): GraphitiMetrics {
  const now = Date.now();
  const oneSecondAgo = now - 1000;
  const thirtySecondsAgo = now - 30000;

  // Events in last second for req/sec
  const recentEvents = events.filter(e => {
    const ts = new Date(e.timestamp).getTime();
    return ts >= oneSecondAgo;
  });

  // All events for other metrics
  const trafficEvents = events.filter(e => e.category === 'traffic');
  const eventsWithDuration = trafficEvents.filter(e => e.duration !== undefined);
  const errorEvents = trafficEvents.filter(e => e.status !== undefined && e.status >= 400);

  // Active agents (events in last 30 seconds)
  const recentAgentEvents = events.filter(e => {
    const ts = new Date(e.timestamp).getTime();
    return ts >= thirtySecondsAgo && e.agentId;
  });
  const activeAgentIds = new Set(recentAgentEvents.map(e => e.agentId).filter(Boolean));

  // Active tasks (in_progress status)
  const taskEvents = events.filter(e => e.category === 'task');
  const activeTasks = new Set(
    taskEvents
      .filter(e => e.payload?.status === 'in_progress')
      .map(e => e.taskId)
      .filter(Boolean)
  );

  return {
    requestsPerSecond: recentEvents.length,
    avgLatency: eventsWithDuration.length > 0
      ? eventsWithDuration.reduce((sum, e) => sum + (e.duration || 0), 0) / eventsWithDuration.length
      : 0,
    errorRate: trafficEvents.length > 0
      ? errorEvents.length / trafficEvents.length
      : 0,
    activeAgents: activeAgentIds.size,
    activeTasks: activeTasks.size,
    totalEvents: events.length,
  };
}

/**
 * Build graph nodes and edges from events
 */
function buildGraph(
  events: GraphitiEvent[],
  filters: GraphitiFilters,
  focusedCorrelationKey: string | null,
  correlationMap: Map<string, Set<string>>
): { nodes: GraphitiNode[]; edges: GraphitiEdge[] } {
  if (events.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Apply filters
  let filtered = events;

  if (filters.categories.length > 0) {
    filtered = filtered.filter(e => filters.categories.includes(e.category));
  }

  if (filters.severities.length > 0) {
    filtered = filtered.filter(e => filters.severities.includes(e.severity));
  }

  if (filters.sources.length > 0) {
    filtered = filtered.filter(e => filters.sources.includes(e.source));
  }

  if (filters.agents.length > 0) {
    filtered = filtered.filter(e => e.agentId && filters.agents.includes(e.agentId));
  }

  if (filters.tasks.length > 0) {
    filtered = filtered.filter(e => e.taskId && filters.tasks.includes(e.taskId));
  }

  if (filters.timeWindow) {
    const [start, end] = filters.timeWindow;
    filtered = filtered.filter(e => {
      const ts = new Date(e.timestamp);
      return ts >= start && ts <= end;
    });
  }

  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    filtered = filtered.filter(e =>
      e.type.toLowerCase().includes(query) ||
      e.agentId?.toLowerCase().includes(query) ||
      e.taskId?.toLowerCase().includes(query) ||
      JSON.stringify(e.payload).toLowerCase().includes(query)
    );
  }

  if (filters.showErrors) {
    filtered = filtered.filter(e => e.severity === 'error' || e.severity === 'critical');
  }

  // If focused on a correlation key, only show related events
  if (focusedCorrelationKey && correlationMap.has(focusedCorrelationKey)) {
    const correlatedIds = correlationMap.get(focusedCorrelationKey)!;
    filtered = filtered.filter(e => correlatedIds.has(e.id));
  }

  // Group events by entity for node creation
  const agentStats = new Map<string, { count: number; errors: number; latencies: number[]; lastTime: string }>();
  const taskStats = new Map<string, { count: number; errors: number; status: string; lastTime: string }>();
  const toolStats = new Map<string, { count: number; errors: number; latencies: number[]; lastTime: string }>();

  filtered.forEach(event => {
    // Agent nodes
    if (event.agentId) {
      if (!agentStats.has(event.agentId)) {
        agentStats.set(event.agentId, { count: 0, errors: 0, latencies: [], lastTime: event.timestamp });
      }
      const stats = agentStats.get(event.agentId)!;
      stats.count++;
      if (event.severity === 'error' || event.severity === 'critical') stats.errors++;
      if (event.duration) stats.latencies.push(event.duration);
      if (event.timestamp > stats.lastTime) stats.lastTime = event.timestamp;
    }

    // Task nodes
    if (event.taskId) {
      if (!taskStats.has(event.taskId)) {
        taskStats.set(event.taskId, { count: 0, errors: 0, status: 'pending', lastTime: event.timestamp });
      }
      const stats = taskStats.get(event.taskId)!;
      stats.count++;
      if (event.severity === 'error' || event.severity === 'critical') stats.errors++;
      if (event.payload?.status) stats.status = event.payload.status as string;
      if (event.timestamp > stats.lastTime) stats.lastTime = event.timestamp;
    }

    // Tool nodes (from tool category events)
    if (event.category === 'tool') {
      const toolName = (event.payload?.toolName as string) || event.type;
      if (!toolStats.has(toolName)) {
        toolStats.set(toolName, { count: 0, errors: 0, latencies: [], lastTime: event.timestamp });
      }
      const stats = toolStats.get(toolName)!;
      stats.count++;
      if (event.severity === 'error' || event.severity === 'critical') stats.errors++;
      if (event.duration) stats.latencies.push(event.duration);
      if (event.timestamp > stats.lastTime) stats.lastTime = event.timestamp;
    }
  });

  // Create nodes
  const nodes: GraphitiNode[] = [];
  let nodeIndex = 0;

  // Agent nodes (circles) - positioned in top arc
  agentStats.forEach((stats, agentId) => {
    const angle = -Math.PI / 2 + (nodeIndex / Math.max(agentStats.size - 1, 1)) * Math.PI;
    const radius = 250;
    nodes.push({
      id: `agent:${agentId}`,
      type: 'agent',
      label: agentId,
      status: stats.errors > 0 ? 'error' : 'active',
      category: 'agent',
      eventCount: stats.count,
      errorCount: stats.errors,
      lastEventTime: stats.lastTime,
      avgLatency: stats.latencies.length > 0
        ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
        : undefined,
      correlationKeys: [`agent:${agentId}`],
      position: {
        x: 400 + radius * Math.cos(angle),
        y: 300 + radius * Math.sin(angle),
      },
    });
    nodeIndex++;
  });

  // Task nodes (rectangles) - positioned in bottom arc
  nodeIndex = 0;
  taskStats.forEach((stats, taskId) => {
    const angle = Math.PI / 2 + (nodeIndex / Math.max(taskStats.size - 1, 1)) * Math.PI;
    const radius = 250;

    let status: GraphitiNode['status'] = 'pending';
    if (stats.status === 'completed') status = 'success';
    else if (stats.status === 'failed') status = 'error';
    else if (stats.status === 'in_progress') status = 'active';
    else if (stats.status === 'blocked') status = 'blocked';

    nodes.push({
      id: `task:${taskId}`,
      type: 'task',
      label: taskId.length > 20 ? taskId.substring(0, 20) + '...' : taskId,
      status,
      category: 'task',
      eventCount: stats.count,
      errorCount: stats.errors,
      lastEventTime: stats.lastTime,
      correlationKeys: [`task:${taskId}`],
      position: {
        x: 400 + radius * Math.cos(angle),
        y: 300 + radius * Math.sin(angle),
      },
    });
    nodeIndex++;
  });

  // Tool nodes (hexagons) - positioned on left
  nodeIndex = 0;
  toolStats.forEach((stats, toolName) => {
    const y = 100 + (nodeIndex * 80);
    nodes.push({
      id: `tool:${toolName}`,
      type: 'tool',
      label: toolName,
      status: stats.errors > 0 ? 'error' : 'active',
      category: 'tool',
      eventCount: stats.count,
      errorCount: stats.errors,
      lastEventTime: stats.lastTime,
      avgLatency: stats.latencies.length > 0
        ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
        : undefined,
      correlationKeys: [],
      position: { x: 50, y },
    });
    nodeIndex++;
  });

  // Create edges based on correlations
  const edges: GraphitiEdge[] = [];
  const edgeSet = new Set<string>();

  // Agent → Task edges (assigned_to relationship)
  filtered.forEach(event => {
    if (event.agentId && event.taskId) {
      const edgeId = `agent:${event.agentId}->task:${event.taskId}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        const relatedEvents = filtered.filter(
          e => e.agentId === event.agentId && e.taskId === event.taskId
        );
        edges.push({
          id: edgeId,
          source: `agent:${event.agentId}`,
          target: `task:${event.taskId}`,
          type: 'assigned_to',
          label: 'assigned',
          eventCount: relatedEvents.length,
          errorCount: relatedEvents.filter(e => e.severity === 'error').length,
          animated: true,
          status: relatedEvents.some(e => e.severity === 'error') ? 'error' : 'active',
        });
      }
    }
  });

  // Agent → Tool edges (uses relationship)
  filtered.forEach(event => {
    if (event.agentId && event.category === 'tool') {
      const toolName = (event.payload?.toolName as string) || event.type;
      const edgeId = `agent:${event.agentId}->tool:${toolName}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        const relatedEvents = filtered.filter(
          e => e.agentId === event.agentId && e.category === 'tool' &&
               ((e.payload?.toolName as string) || e.type) === toolName
        );
        edges.push({
          id: edgeId,
          source: `agent:${event.agentId}`,
          target: `tool:${toolName}`,
          type: 'triggers',
          label: 'uses',
          eventCount: relatedEvents.length,
          errorCount: relatedEvents.filter(e => e.severity === 'error').length,
          avgLatency: relatedEvents.filter(e => e.duration).length > 0
            ? relatedEvents.reduce((sum, e) => sum + (e.duration || 0), 0) / relatedEvents.filter(e => e.duration).length
            : undefined,
          animated: true,
          status: relatedEvents.some(e => e.severity === 'error') ? 'error' : 'active',
        });
      }
    }
  });

  return { nodes, edges };
}

// ============================================================================
// Store Creation
// ============================================================================

export const useGraphitiStore = create<GraphitiState>()(
  subscribeWithSelector((set, get) => ({
    // === Config ===
    config: { ...DEFAULT_GRAPHITI_CONFIG },
    setConfig: (updates) => {
      set((state) => ({
        config: { ...state.config, ...updates },
      }));
      // Persist to electron-store
      const newConfig = { ...get().config, ...updates };
      window.electronAPI?.settings?.set?.('graphiti.enabled', newConfig.enabled).catch(console.error);
      window.electronAPI?.settings?.set?.('graphiti.retention', newConfig.retention).catch(console.error);
    },
    setEnabled: (enabled) => {
      set((state) => ({
        config: { ...state.config, enabled },
      }));
      window.electronAPI?.settings?.set?.('graphiti.enabled', enabled).catch(console.error);
    },

    // === Events ===
    events: [],
    correlationMap: new Map(),

    // === Metrics ===
    metrics: {
      requestsPerSecond: 0,
      avgLatency: 0,
      errorRate: 0,
      activeAgents: 0,
      activeTasks: 0,
      totalEvents: 0,
    },
    metricsHistory: [],

    // === View State ===
    viewState: {
      mode: 'unified',
      theme: 'cyberpunk',
      selectedNodeId: null,
      selectedEdgeId: null,
      focusedCorrelationKey: null,
      zoomLevel: 1,
      panPosition: { x: 0, y: 0 },
    },
    setViewMode: (mode) => set((state) => ({
      viewState: { ...state.viewState, mode },
    })),
    setTheme: (theme) => set((state) => ({
      viewState: { ...state.viewState, theme },
    })),
    selectNode: (nodeId) => {
      const state = get();
      if (!state.config.enabled) return;

      set((state) => ({
        viewState: { ...state.viewState, selectedNodeId: nodeId, selectedEdgeId: null },
      }));

      // Populate drilldown events
      if (nodeId) {
        const node = state.nodes.find(n => n.id === nodeId);
        if (node && node.correlationKeys.length > 0) {
          const drilldown = state.getCorrelatedEvents(node.correlationKeys[0]);
          set({ drilldownEvents: drilldown });
        }
      } else {
        set({ drilldownEvents: [] });
      }
    },
    selectEdge: (edgeId) => set((state) => ({
      viewState: { ...state.viewState, selectedEdgeId: edgeId, selectedNodeId: null },
      drilldownEvents: [],
    })),
    setFocusedCorrelation: (key) => {
      set((state) => ({
        viewState: { ...state.viewState, focusedCorrelationKey: key },
      }));
      // Rebuild graph with focus
      get().rebuildGraph();
    },

    // === Filters ===
    filters: { ...DEFAULT_GRAPHITI_FILTERS },
    setFilters: (updates) => {
      const state = get();
      if (!state.config.enabled) return;

      set((state) => ({
        filters: { ...state.filters, ...updates },
      }));
      // Rebuild graph with new filters
      get().rebuildGraph();
    },
    resetFilters: () => {
      set({ filters: { ...DEFAULT_GRAPHITI_FILTERS } });
      get().rebuildGraph();
    },

    // === Graph Data ===
    nodes: [],
    edges: [],

    // === Drilldown ===
    drilldownEvents: [],

    // === Archival ===
    archivedBatchCount: 0,

    // === Actions ===
    ingestEvent: (event) => {
      const state = get();
      if (!state.config.enabled) return;

      set((currentState) => {
        const newEvents = [...currentState.events, event];
        const newCorrelationMap = new Map(currentState.correlationMap);
        addToCorrelationMap(newCorrelationMap, event);

        // Archive when buffer is 2x batch size
        if (newEvents.length >= ARCHIVE_BATCH_SIZE * 2) {
          const toArchive = newEvents.slice(0, ARCHIVE_BATCH_SIZE);
          const remaining = newEvents.slice(ARCHIVE_BATCH_SIZE);

          // Fire-and-forget archival
          archiveGraphitiEvents(toArchive).then(() => {
            const { config } = get();
            if (config.retention !== 'unlimited') {
              pruneByRetention(config.retention);
            } else {
              pruneOldGraphitiBatches(100);
            }
          }).catch(err => {
            console.error('[graphiti-store] Archive failed:', err);
          });

          // Rebuild graph immediately when archiving
          const { nodes, edges } = buildGraph(
            remaining,
            currentState.filters,
            currentState.viewState.focusedCorrelationKey,
            newCorrelationMap
          );

          return {
            events: remaining,
            correlationMap: newCorrelationMap,
            nodes,
            edges,
            archivedBatchCount: currentState.archivedBatchCount + 1,
          };
        }

        return {
          events: newEvents,
          correlationMap: newCorrelationMap,
        };
      });

      // Debounce graph rebuild
      if (graphRebuildTimer) clearTimeout(graphRebuildTimer);
      graphRebuildTimer = setTimeout(() => {
        const s = get();
        const { nodes, edges } = buildGraph(
          s.events,
          s.filters,
          s.viewState.focusedCorrelationKey,
          s.correlationMap
        );
        const metrics = computeMetrics(s.events);
        const metricsSnapshot: GraphitiMetricsSnapshot = {
          timestamp: new Date().toISOString(),
          metrics,
        };
        set({
          nodes,
          edges,
          metrics,
          metricsHistory: [...s.metricsHistory.slice(-METRICS_HISTORY_MAX + 1), metricsSnapshot],
        });
      }, GRAPH_REBUILD_DEBOUNCE_MS);
    },

    ingestBatch: (events) => {
      const state = get();
      if (!state.config.enabled) return;

      events.forEach(event => state.ingestEvent(event));
    },

    clearEvents: () => {
      clearGraphitiArchive().catch(err => {
        console.error('[graphiti-store] Clear archive failed:', err);
      });

      set({
        events: [],
        correlationMap: new Map(),
        nodes: [],
        edges: [],
        metrics: {
          requestsPerSecond: 0,
          avgLatency: 0,
          errorRate: 0,
          activeAgents: 0,
          activeTasks: 0,
          totalEvents: 0,
        },
        metricsHistory: [],
        drilldownEvents: [],
        archivedBatchCount: 0,
      });
    },

    rebuildGraph: () => {
      const state = get();
      if (!state.config.enabled) return;

      const { nodes, edges } = buildGraph(
        state.events,
        state.filters,
        state.viewState.focusedCorrelationKey,
        state.correlationMap
      );
      set({ nodes, edges });
    },

    // === Correlation ===
    getCorrelatedEvents: (key) => {
      const state = get();
      if (!state.correlationMap.has(key)) return [];

      const eventIds = state.correlationMap.get(key)!;
      return state.events.filter(e => eventIds.has(e.id));
    },

    getCorrelatedEventsByNode: (nodeId) => {
      const state = get();
      const node = state.nodes.find(n => n.id === nodeId);
      if (!node || node.correlationKeys.length === 0) return [];

      const allEventIds = new Set<string>();
      node.correlationKeys.forEach(key => {
        const eventIds = state.correlationMap.get(key);
        if (eventIds) {
          eventIds.forEach(id => allEventIds.add(id));
        }
      });

      return state.events.filter(e => allEventIds.has(e.id));
    },
  }))
);

// ============================================================================
// Selectors (for memoization)
// ============================================================================

export const useGraphitiEnabled = () => useGraphitiStore(state => state.config.enabled);
export const useGraphitiNodes = () => useGraphitiStore(state => state.nodes);
export const useGraphitiEdges = () => useGraphitiStore(state => state.edges);
export const useGraphitiMetrics = () => useGraphitiStore(state => state.metrics);
export const useGraphitiMetricsHistory = () => useGraphitiStore(state => state.metricsHistory);
export const useGraphitiViewState = () => useGraphitiStore(state => state.viewState);
export const useGraphitiFilters = () => useGraphitiStore(state => state.filters);
export const useGraphitiDrilldown = () => useGraphitiStore(state => state.drilldownEvents);
