/**
 * Traffic Store - Zustand state management for traffic flow visualization
 */
import { create } from 'zustand';
import type {
  TrafficEvent,
  TrafficEventDetail,
  EndpointSummary,
  NetworkNode,
  TrafficEdge,
  FilterState,
  TrafficStats,
  TrafficState,
  TrafficVizTheme,
  TrafficViewMode,
  GraphLayout,
  LogFilterLevel,
} from '../types/traffic';
import { archiveEvents, clearArchive, pruneOldBatches } from './traffic-persistence';
import { useGraphitiStore } from './graphiti-store';
import { normalizeTrafficEvent } from '../lib/graphiti/normalizers';

// Gateway URL for API calls
const GATEWAY_URL = 'http://localhost:8200';

// Batch size for disk archival (archive every N events)
const ARCHIVE_BATCH_SIZE = 100;

// Debounce timer for graph rebuilding (performance optimization)
let graphRebuildTimer: ReturnType<typeof setTimeout> | null = null;
const GRAPH_REBUILD_DEBOUNCE_MS = 200;

// Default filter state
const defaultFilters: FilterState = {
  endpointGroups: [],
  statuses: [],
  timeRange: [null, null],
  searchQuery: '',
};

// Default stats
const defaultStats: TrafficStats = {
  requestsPerSecond: 0,
  avgLatency: 0,
  errorRate: 0,
  totalRequests: 0,
};

/**
 * Build network graph from traffic events
 * Creates nodes for gateway, endpoints, and MCP tools
 * Creates edges representing traffic flow between nodes
 * Supports flat (radial) and hierarchical layouts
 */
function buildGraphFromEvents(
  events: TrafficEvent[],
  filters: FilterState,
  graphLayout: GraphLayout = 'flat'
): { nodes: NetworkNode[]; edges: TrafficEdge[] } {
  if (events.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Filter events based on current filters
  let filteredEvents = events;

  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    filteredEvents = filteredEvents.filter(
      (e) =>
        e.endpoint.toLowerCase().includes(query) ||
        e.source.toLowerCase().includes(query) ||
        e.destination.toLowerCase().includes(query)
    );
  }

  if (filters.statuses.length > 0) {
    filteredEvents = filteredEvents.filter((e) =>
      e.status ? filters.statuses.includes(e.status) : false
    );
  }

  if (filters.timeRange[0] && filters.timeRange[1]) {
    const [start, end] = filters.timeRange;
    // QW-1: Use numeric comparison instead of creating Date objects per event
    const startMs = start.getTime();
    const endMs = end.getTime();
    filteredEvents = filteredEvents.filter((e) => {
      const ts = typeof e.timestamp === 'string'
        ? Date.parse(e.timestamp)
        : typeof e.timestamp === 'number'
          ? e.timestamp
          : new Date(e.timestamp).getTime();
      return ts >= startMs && ts <= endMs;
    });
  }

  // Group events by endpoint - single pass for both stats and event lookup (HP-1: O(n) instead of O(n²))
  const endpointStats = new Map<
    string,
    { count: number; errors: number; latencies: number[]; category: string }
  >();
  const eventsByEndpoint = new Map<string, TrafficEvent[]>();

  filteredEvents.forEach((event) => {
    const endpoint = event.endpoint;
    if (!endpointStats.has(endpoint)) {
      // Determine category from endpoint path
      let category = 'other';
      if (endpoint.includes('/agents')) category = 'agents';
      else if (endpoint.includes('/chat')) category = 'chat';
      else if (endpoint.includes('/mcp')) category = 'mcp';
      else if (endpoint.includes('/tasks')) category = 'tasks';
      else if (endpoint.includes('/formulas')) category = 'formulas';
      else if (endpoint.includes('/health')) category = 'health';

      endpointStats.set(endpoint, {
        count: 0,
        errors: 0,
        latencies: [],
        category,
      });
      eventsByEndpoint.set(endpoint, []);
    }

    const stats = endpointStats.get(endpoint)!;
    stats.count++;
    if (event.status && event.status >= 400) {
      stats.errors++;
    }
    if (event.duration) {
      stats.latencies.push(event.duration);
    }

    // Collect events for this endpoint (for recent events lookup)
    eventsByEndpoint.get(endpoint)!.push(event);
  });

  // Create nodes and edges
  const nodes: NetworkNode[] = [];
  const edges: TrafficEdge[] = [];

  // Gateway node (center)
  nodes.push({
    id: 'gateway',
    type: 'gateway',
    position: { x: 400, y: 300 }, // Center position
    data: {
      label: 'GATEWAY',
      category: 'core',
      requestCount: filteredEvents.length,
      errorCount: filteredEvents.filter((e) => e.status && e.status >= 400).length,
      avgLatency: 0,
    },
  });

  // ========== FLAT LAYOUT (radial) ==========
  if (graphLayout === 'flat') {
    const radius = 300;
    const angleStep = (2 * Math.PI) / endpointStats.size;
    let angle = 0;

    endpointStats.forEach((stats, endpoint) => {
      const x = 400 + radius * Math.cos(angle);
      const y = 300 + radius * Math.sin(angle);

      let nodeType: 'endpoint' | 'mcp-tool' = 'endpoint';
      if (stats.category === 'mcp') {
        nodeType = 'mcp-tool';
      }

      const avgLatency =
        stats.latencies.length > 0
          ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
          : 0;

      const pathParts = endpoint.split('/').filter((p) => p);
      const label = pathParts.length > 0 ? pathParts[pathParts.length - 1] : endpoint;

      nodes.push({
        id: endpoint,
        type: nodeType,
        position: { x, y },
        data: {
          label: label.length > 20 ? label.substring(0, 20) + '...' : label,
          category: stats.category,
          requestCount: stats.count,
          errorCount: stats.errors,
          avgLatency,
        },
      });

      angle += angleStep;
    });

    // Edges: gateway → each endpoint
    endpointStats.forEach((stats, endpoint) => {
      // HP-1: O(1) lookup instead of O(n) filter
      const endpointEvents = eventsByEndpoint.get(endpoint) || [];
      const recentEvents = endpointEvents.slice(-5);

      let color = '#00ffff';
      let status: 'success' | 'error' | 'pending' = 'success';

      if (stats.errors > 0) {
        color = '#ff0000';
        status = 'error';
      } else if (stats.count > 0) {
        color = '#00ff00';
      }

      if (stats.category === 'mcp') {
        color = '#ff00ff';
      }

      edges.push({
        id: `gateway-${endpoint}`,
        source: 'gateway',
        target: endpoint,
        animated: true,
        data: { recentEvents, status, color },
      });
    });
  }

  // ========== HIERARCHICAL LAYOUT ==========
  else {
    // Group endpoints by category
    const categoryGroups = new Map<
      string,
      { endpoints: string[]; totalCount: number; totalErrors: number; latencies: number[] }
    >();

    endpointStats.forEach((stats, endpoint) => {
      const category = stats.category;
      if (!categoryGroups.has(category)) {
        categoryGroups.set(category, {
          endpoints: [],
          totalCount: 0,
          totalErrors: 0,
          latencies: [],
        });
      }
      const group = categoryGroups.get(category)!;
      group.endpoints.push(endpoint);
      group.totalCount += stats.count;
      group.totalErrors += stats.errors;
      group.latencies.push(...stats.latencies);
    });

    // Create category parent nodes (inner ring)
    const innerRadius = 200;
    const categoryAngleStep = (2 * Math.PI) / categoryGroups.size;
    let categoryAngle = -Math.PI / 2; // Start from top

    categoryGroups.forEach((group, category) => {
      const categoryX = 400 + innerRadius * Math.cos(categoryAngle);
      const categoryY = 300 + innerRadius * Math.sin(categoryAngle);

      const avgLatency =
        group.latencies.length > 0
          ? group.latencies.reduce((a, b) => a + b, 0) / group.latencies.length
          : 0;

      // Category parent node
      nodes.push({
        id: `category-${category}`,
        type: category === 'mcp' ? 'mcp-tool' : 'endpoint',
        position: { x: categoryX, y: categoryY },
        data: {
          label: category.toUpperCase(),
          category: category,
          requestCount: group.totalCount,
          errorCount: group.totalErrors,
          avgLatency,
        },
      });

      // Edge: gateway → category
      let categoryColor = '#00ffff';
      let categoryStatus: 'success' | 'error' | 'pending' = 'success';

      if (group.totalErrors > 0) {
        categoryColor = '#ff0000';
        categoryStatus = 'error';
      } else if (group.totalCount > 0) {
        categoryColor = '#00ff00';
      }
      if (category === 'mcp') {
        categoryColor = '#ff00ff';
      }

      edges.push({
        id: `gateway-category-${category}`,
        source: 'gateway',
        target: `category-${category}`,
        animated: true,
        data: {
          recentEvents: [],
          status: categoryStatus,
          color: categoryColor,
        },
      });

      // Create child endpoint nodes (outer arc around this category)
      const childCount = group.endpoints.length;
      if (childCount > 0) {
        const outerRadius = 120; // Distance from category node
        const spreadAngle = Math.min(Math.PI / 3, (childCount - 1) * 0.3); // Max 60 degree spread
        const childAngleStep = childCount > 1 ? spreadAngle / (childCount - 1) : 0;
        let childAngle = categoryAngle - spreadAngle / 2;

        group.endpoints.forEach((endpoint) => {
          const stats = endpointStats.get(endpoint)!;
          const childX = categoryX + outerRadius * Math.cos(childAngle);
          const childY = categoryY + outerRadius * Math.sin(childAngle);

          const pathParts = endpoint.split('/').filter((p) => p);
          const label = pathParts.length > 0 ? pathParts[pathParts.length - 1] : endpoint;

          const avgLatency =
            stats.latencies.length > 0
              ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
              : 0;

          nodes.push({
            id: endpoint,
            type: category === 'mcp' ? 'mcp-tool' : 'endpoint',
            position: { x: childX, y: childY },
            data: {
              label: label.length > 15 ? label.substring(0, 15) + '...' : label,
              category: stats.category,
              requestCount: stats.count,
              errorCount: stats.errors,
              avgLatency,
            },
          });

          // Edge: category → endpoint (HP-1: O(1) lookup instead of O(n) filter)
          const endpointEvents = eventsByEndpoint.get(endpoint) || [];
          const recentEvents = endpointEvents.slice(-5);

          let color = '#00ffff';
          let status: 'success' | 'error' | 'pending' = 'success';

          if (stats.errors > 0) {
            color = '#ff0000';
            status = 'error';
          } else if (stats.count > 0) {
            color = '#00ff00';
          }
          if (category === 'mcp') {
            color = '#ff00ff';
          }

          edges.push({
            id: `category-${category}-${endpoint}`,
            source: `category-${category}`,
            target: endpoint,
            animated: true,
            data: { recentEvents, status, color },
          });

          childAngle += childAngleStep;
        });
      }

      categoryAngle += categoryAngleStep;
    });
  }

  return { nodes, edges };
}

// Create the store
export const useTrafficStore = create<TrafficState>((set, get) => ({
  // State
  events: [],
  maxEvents: 100,
  nodes: [],
  edges: [],
  filters: defaultFilters,
  stats: defaultStats,
  isPaused: false,
  playbackSpeed: 1,
  isConnected: false,
  vizTheme: 'cyberpunk', // Default to cyberpunk theme

  // View mode
  viewMode: 'graph' as TrafficViewMode,

  // Graph layout
  graphLayout: 'flat' as GraphLayout,

  // Drawer state
  drawerOpen: false,
  selectedEndpoint: null,
  endpointData: null,
  endpointEvents: [],

  // Inspector modal state
  inspectorOpen: false,
  selectedEvent: null,

  // Log stream state
  logAutoScroll: true,
  logFilterLevel: 'all' as LogFilterLevel,

  // Archival state
  archivedBatchCount: 0,

  // Security defense mode
  defenseMode: false,
  threatEvent: null,
  blockedIPs: [],

  // Actions
  addEvent: (event: TrafficEvent) => {
    if (get().isPaused) return;

    // Forward to Graphiti store if enabled (opt-in)
    const graphitiStore = useGraphitiStore.getState();
    if (graphitiStore.config.enabled) {
      const graphitiEvent = normalizeTrafficEvent(event);
      graphitiStore.ingestEvent(graphitiEvent);
    }

    set((state) => {
      const events = [...state.events, event];

      // Archive to disk when we have 2x batch size
      // Keeps latest ARCHIVE_BATCH_SIZE in memory, archives older ones
      if (events.length >= ARCHIVE_BATCH_SIZE * 2) {
        const toArchive = events.slice(0, ARCHIVE_BATCH_SIZE);
        const remaining = events.slice(ARCHIVE_BATCH_SIZE);

        // Fire-and-forget archival (non-blocking)
        archiveEvents(toArchive).then(() => {
          // Prune old batches to prevent unbounded disk growth
          pruneOldBatches(50); // Keep max 50 batches (5000 events)
        }).catch((err) => {
          console.error('[traffic-store] Archive failed:', err);
        });

        // Rebuild graph immediately on archive (events array changed significantly)
        const { nodes, edges } = buildGraphFromEvents(remaining, state.filters, state.graphLayout);

        return {
          events: remaining,
          nodes,
          edges,
          archivedBatchCount: state.archivedBatchCount + 1,
        };
      }

      // Normal update: just add event, debounce graph rebuild
      return { events };
    });

    // Debounce graph rebuilding for normal updates (performance optimization)
    // This prevents O(n) graph rebuild on every single event
    if (graphRebuildTimer) clearTimeout(graphRebuildTimer);
    graphRebuildTimer = setTimeout(() => {
      const state = get();
      const { nodes, edges } = buildGraphFromEvents(state.events, state.filters, state.graphLayout);
      set({ nodes, edges });
    }, GRAPH_REBUILD_DEBOUNCE_MS);
  },

  // HP-3: Batch add multiple events at once (reduces state updates)
  addEvents: (newEvents: TrafficEvent[]) => {
    if (get().isPaused || newEvents.length === 0) return;

    // Forward to Graphiti store if enabled (opt-in)
    const graphitiStore = useGraphitiStore.getState();
    if (graphitiStore.config.enabled) {
      newEvents.forEach((event) => {
        const graphitiEvent = normalizeTrafficEvent(event);
        graphitiStore.ingestEvent(graphitiEvent);
      });
    }

    set((state) => {
      const events = [...state.events, ...newEvents];

      // Archive to disk when we have 2x batch size
      if (events.length >= ARCHIVE_BATCH_SIZE * 2) {
        const toArchive = events.slice(0, ARCHIVE_BATCH_SIZE);
        const remaining = events.slice(ARCHIVE_BATCH_SIZE);

        archiveEvents(toArchive).then(() => {
          pruneOldBatches(50);
        }).catch((err) => {
          console.error('[traffic-store] Archive failed:', err);
        });

        const { nodes, edges } = buildGraphFromEvents(remaining, state.filters, state.graphLayout);
        return {
          events: remaining,
          nodes,
          edges,
          archivedBatchCount: state.archivedBatchCount + 1,
        };
      }

      return { events };
    });

    // Debounce graph rebuilding
    if (graphRebuildTimer) clearTimeout(graphRebuildTimer);
    graphRebuildTimer = setTimeout(() => {
      const state = get();
      const { nodes, edges } = buildGraphFromEvents(state.events, state.filters, state.graphLayout);
      set({ nodes, edges });
    }, GRAPH_REBUILD_DEBOUNCE_MS);
  },

  setFilters: (filters: Partial<FilterState>) => {
    set((state) => {
      const newFilters = { ...state.filters, ...filters };
      const { nodes, edges } = buildGraphFromEvents(state.events, newFilters, state.graphLayout);
      return { filters: newFilters, nodes, edges };
    });
  },

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  setPlaybackSpeed: (speed: number) => set({ playbackSpeed: speed }),

  clearEvents: () => {
    // Clear IndexedDB archive (fire-and-forget)
    clearArchive().catch((err) => {
      console.error('[traffic-store] Clear archive failed:', err);
    });

    set({
      events: [],
      nodes: [],
      edges: [],
      stats: defaultStats,
      archivedBatchCount: 0,
    });
  },

  updateStats: (stats: TrafficStats) => set({ stats }),

  setConnected: (connected: boolean) => set({ isConnected: connected }),

  setVizTheme: (theme: TrafficVizTheme) => set({ vizTheme: theme }),

  setViewMode: (mode: TrafficViewMode) => set({ viewMode: mode }),

  setGraphLayout: (layout: GraphLayout) => {
    set((state) => {
      const { nodes, edges } = buildGraphFromEvents(state.events, state.filters, layout);
      return { graphLayout: layout, nodes, edges };
    });
  },

  // Drawer actions
  openDrawer: async (endpoint: string) => {
    set({ drawerOpen: true, selectedEndpoint: endpoint, endpointData: null, endpointEvents: [] });

    try {
      // Fetch endpoint data from API
      const encodedEndpoint = encodeURIComponent(endpoint.replace(/^\//, ''));
      const response = await fetch(`${GATEWAY_URL}/v1/traffic/endpoints/${encodedEndpoint}`);

      if (response.ok) {
        const data = await response.json();
        set({
          endpointData: data.summary as EndpointSummary,
          endpointEvents: data.recent_events as TrafficEventDetail[],
        });
      }
    } catch (error) {
      console.error('Failed to fetch endpoint data:', error);
    }
  },

  closeDrawer: () =>
    set({
      drawerOpen: false,
      selectedEndpoint: null,
      endpointData: null,
      endpointEvents: [],
    }),

  // Inspector actions
  openInspector: async (eventId: string) => {
    set({ inspectorOpen: true, selectedEvent: null });

    try {
      const response = await fetch(`${GATEWAY_URL}/v1/traffic/events/${eventId}`);
      if (response.ok) {
        const data = await response.json();
        set({ selectedEvent: data as TrafficEventDetail });
      }
    } catch (error) {
      console.error('Failed to fetch event details:', error);
    }
  },

  closeInspector: () => set({ inspectorOpen: false, selectedEvent: null }),

  // Log actions
  toggleLogAutoScroll: () => set((state) => ({ logAutoScroll: !state.logAutoScroll })),

  setLogFilterLevel: (level: LogFilterLevel) => set({ logFilterLevel: level }),

  // Defense mode actions
  setDefenseMode: (mode: boolean) => set({ defenseMode: mode }),

  setThreatEvent: (event) => set({ threatEvent: event }),

  addBlockedIP: (ip: string) =>
    set((state) => ({
      blockedIPs: state.blockedIPs.includes(ip) ? state.blockedIPs : [...state.blockedIPs, ip],
    })),

  removeBlockedIP: (ip: string) =>
    set((state) => ({
      blockedIPs: state.blockedIPs.filter((blocked) => blocked !== ip),
    })),

  clearDefenseMode: () =>
    set({
      defenseMode: false,
      threatEvent: null,
    }),
}));
