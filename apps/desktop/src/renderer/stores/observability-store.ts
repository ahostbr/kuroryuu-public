/**
 * Observability Store - Zustand state management for hook event telemetry
 * Mirrors traffic-store.ts pattern with WebSocket connection
 */
import { create } from 'zustand';
import type {
  HookEvent,
  SessionInfo,
  ObservabilityTimeRange,
  ObservabilitySubTab,
  ObservabilityFilters,
  ObservabilityStats,
} from '../types/observability';
import type { TimelineStyle, TimelineColorMode } from '../components/claude-teams/timeline/timeline-types';
import { TIMELINE_STYLES, TIMELINE_COLOR_MODES } from '../components/claude-teams/timeline/timeline-types';

const GATEWAY_URL = 'http://localhost:8200';
const WS_URL = 'ws://localhost:8200/ws/observability-stream';
const MAX_EVENTS = 500;
const RECONNECT_DELAY_MS = 3000;
const HEALTH_CHECK_RETRIES = 8;
const HEALTH_CHECK_INITIAL_DELAY_MS = 500;

/**
 * Poll Gateway observability endpoint until it responds 200, with exponential backoff.
 * Uses the actual observability stats endpoint (not /v1/health) to ensure the
 * SQLite database is initialized and the observability module is ready.
 */
async function waitForGateway(): Promise<boolean> {
  let delay = HEALTH_CHECK_INITIAL_DELAY_MS;
  for (let i = 0; i < HEALTH_CHECK_RETRIES; i++) {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/observability/stats`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return true;
    } catch {
      // Gateway or observability module not ready yet
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 5000);
  }
  return false;
}

interface ObservabilityState {
  // Data
  events: HookEvent[];
  isConnected: boolean;
  error: string | null;

  // Derived
  activeSessions: Map<string, SessionInfo>;
  toolStats: Record<string, number>;
  eventTypeStats: Record<string, number>;
  stats: ObservabilityStats | null;

  // UI
  activeSubTab: ObservabilitySubTab;
  filters: ObservabilityFilters;
  selectedAgentLanes: string[];
  timeRange: ObservabilityTimeRange;
  searchQuery: string;
  isPaused: boolean;
  visualTimelineStyle: TimelineStyle;
  visualTimelineColorMode: TimelineColorMode;

  // Actions
  connect: () => void;
  disconnect: () => void;
  addEvent: (event: HookEvent) => void;
  loadRecentEvents: () => Promise<void>;
  loadStats: () => Promise<void>;
  clearEvents: () => Promise<void>;
  deleteSessionEvents: (sessionId: string) => Promise<void>;
  exportEvents: () => Promise<void>;
  exportSessionEvents: (sessionId: string) => Promise<void>;
  importEvents: (file: File) => Promise<{ imported: number; skipped: number }>;
  setFilters: (f: Partial<ObservabilityFilters>) => void;
  setActiveSubTab: (tab: ObservabilitySubTab) => void;
  toggleAgentLane: (agent: string) => void;
  setTimeRange: (range: ObservabilityTimeRange) => void;
  setSearchQuery: (query: string) => void;
  togglePause: () => void;
  cycleVisualTimelineStyle: () => void;
  cycleVisualTimelineColorMode: () => void;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;

function deriveSessionInfo(events: HookEvent[]): Map<string, SessionInfo> {
  const map = new Map<string, SessionInfo>();
  for (const event of events) {
    const key = `${event.source_app}:${event.session_id}`;
    const existing = map.get(key);
    if (existing) {
      existing.lastSeen = Math.max(existing.lastSeen, event.timestamp);
      existing.firstSeen = Math.min(existing.firstSeen, event.timestamp);
      existing.eventCount++;
    } else {
      map.set(key, {
        sessionId: event.session_id,
        sourceApp: event.source_app,
        agentId: event.agent_id || undefined,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        eventCount: 1,
      });
    }
  }
  return map;
}

function deriveToolStats(events: HookEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    if (event.tool_name) {
      counts[event.tool_name] = (counts[event.tool_name] || 0) + 1;
    }
  }
  return counts;
}

function deriveEventTypeStats(events: HookEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.hook_event_type] = (counts[event.hook_event_type] || 0) + 1;
  }
  return counts;
}

/**
 * Shared selector: filter events by filters and search query
 * Used by EventTimeline and ObservabilityVisualTimeline
 */
export function selectFilteredEvents(state: ObservabilityState): HookEvent[] {
  let result = state.events;
  if (state.filters.sourceApp) {
    result = result.filter((e) => e.source_app === state.filters.sourceApp);
  }
  if (state.filters.sessionId) {
    result = result.filter((e) => e.session_id === state.filters.sessionId);
  }
  if (state.filters.eventType) {
    result = result.filter((e) => e.hook_event_type === state.filters.eventType);
  }
  if (state.filters.toolName) {
    result = result.filter((e) => e.tool_name?.includes(state.filters.toolName));
  }
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    try {
      const regex = new RegExp(state.searchQuery, 'i');
      result = result.filter(
        (e) =>
          regex.test(e.hook_event_type) ||
          regex.test(e.tool_name || '') ||
          regex.test(JSON.stringify(e.payload))
      );
    } catch {
      result = result.filter(
        (e) =>
          e.hook_event_type.toLowerCase().includes(q) ||
          (e.tool_name || '').toLowerCase().includes(q) ||
          JSON.stringify(e.payload).toLowerCase().includes(q)
      );
    }
  }
  return result;
}

export const useObservabilityStore = create<ObservabilityState>((set, get) => ({
  events: [],
  isConnected: false,
  error: null,
  activeSessions: new Map(),
  toolStats: {},
  eventTypeStats: {},
  stats: null,
  activeSubTab: 'swimlanes',
  filters: { sourceApp: '', sessionId: '', eventType: '', toolName: '' },
  selectedAgentLanes: [],
  timeRange: '5m',
  searchQuery: '',
  isPaused: false,
  visualTimelineStyle: 'svg-spine' as TimelineStyle,
  visualTimelineColorMode: 'status' as TimelineColorMode,

  connect: () => {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    // Wait for Gateway to be ready before connecting
    waitForGateway().then((ready) => {
      if (!ready) {
        set({ error: 'Gateway not reachable after retries' });
        // Schedule a retry
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => get().connect(), RECONNECT_DELAY_MS);
        return;
      }

      try {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          set({ isConnected: true, error: null });
          // Load initial events
          get().loadRecentEvents();
          get().loadStats();

          // Start ping keep-alive
          if (pingTimer) clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000);
        };

        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (data.type === 'hook_event' && data.event && !get().isPaused) {
              get().addEvent(data.event as HookEvent);
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = () => {
          set({ isConnected: false });
          if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
          }
          // Auto-reconnect
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            get().connect();
          }, RECONNECT_DELAY_MS);
        };

        ws.onerror = () => {
          set({ error: 'WebSocket connection error' });
        };
      } catch (e) {
        set({ error: String(e) });
      }
    });
  },

  disconnect: () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (ws) {
      ws.onclose = null; // prevent auto-reconnect
      ws.close();
      ws = null;
    }
    set({ isConnected: false });
  },

  addEvent: (event: HookEvent) => {
    set((state) => {
      // Dedup: skip if event.id already exists
      if (state.events.some((e) => e.id === event.id)) return state;
      const newEvents = [event, ...state.events].slice(0, MAX_EVENTS);
      return {
        events: newEvents,
        activeSessions: deriveSessionInfo(newEvents),
        toolStats: deriveToolStats(newEvents),
        eventTypeStats: deriveEventTypeStats(newEvents),
      };
    });
  },

  loadRecentEvents: async (retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${GATEWAY_URL}/v1/observability/events/recent?limit=300`);
        if (!res.ok) {
          if (attempt < retries) { await new Promise((r) => setTimeout(r, 1000)); continue; }
          return;
        }
        const data = await res.json();
        const events: HookEvent[] = data.events || [];
        set({
          events,
          activeSessions: deriveSessionInfo(events),
          toolStats: deriveToolStats(events),
          eventTypeStats: deriveEventTypeStats(events),
        });
        return;
      } catch {
        if (attempt < retries) { await new Promise((r) => setTimeout(r, 1000)); continue; }
      }
    }
  },

  loadStats: async (retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${GATEWAY_URL}/v1/observability/stats`);
        if (!res.ok) {
          if (attempt < retries) { await new Promise((r) => setTimeout(r, 1000)); continue; }
          return;
        }
        const stats: ObservabilityStats = await res.json();
        set({ stats });
        return;
      } catch {
        if (attempt < retries) { await new Promise((r) => setTimeout(r, 1000)); continue; }
      }
    }
  },

  clearEvents: async () => {
    // Delete from Gateway first, then clear local state
    try {
      await fetch(`${GATEWAY_URL}/v1/observability/events`, { method: 'DELETE' });
    } catch {
      // Gateway may not be running — still clear locally
    }
    set({
      events: [],
      activeSessions: new Map(),
      toolStats: {},
      eventTypeStats: {},
    });
  },

  deleteSessionEvents: async (sessionId: string) => {
    try {
      await fetch(`${GATEWAY_URL}/v1/observability/events/session/${sessionId}`, { method: 'DELETE' });
    } catch {
      // Gateway may not be running
    }
    // Remove from local state
    set((state) => {
      const newEvents = state.events.filter((e) => e.session_id !== sessionId);
      return {
        events: newEvents,
        activeSessions: deriveSessionInfo(newEvents),
        toolStats: deriveToolStats(newEvents),
        eventTypeStats: deriveEventTypeStats(newEvents),
      };
    });
  },

  exportEvents: async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/observability/events/export`);
      if (!res.ok) return;
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `observability-events-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Gateway may not be running
    }
  },

  exportSessionEvents: async (sessionId: string) => {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/observability/events/session/${sessionId}/export`);
      if (!res.ok) return;
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `observability-session-${sessionId.slice(0, 8)}-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Gateway may not be running
    }
  },

  importEvents: async (file: File) => {
    const text = await file.text();
    const body = JSON.parse(text);
    const res = await fetch(`${GATEWAY_URL}/v1/observability/events/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Import failed');
    const result = await res.json();
    // Refresh events after import
    get().loadRecentEvents();
    return { imported: result.imported, skipped: result.skipped };
  },

  setFilters: (f) => {
    set((state) => ({
      filters: { ...state.filters, ...f },
    }));
  },

  setActiveSubTab: (tab) => set({ activeSubTab: tab }),

  toggleAgentLane: (agent) => {
    set((state) => {
      const lanes = state.selectedAgentLanes.includes(agent)
        ? state.selectedAgentLanes.filter((a) => a !== agent)
        : [...state.selectedAgentLanes, agent];
      return { selectedAgentLanes: lanes };
    });
  },

  setTimeRange: (range) => set({ timeRange: range }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  cycleVisualTimelineStyle: () => set((state) => {
    const idx = TIMELINE_STYLES.indexOf(state.visualTimelineStyle);
    return { visualTimelineStyle: TIMELINE_STYLES[(idx + 1) % TIMELINE_STYLES.length] };
  }),
  cycleVisualTimelineColorMode: () => set((state) => {
    const idx = TIMELINE_COLOR_MODES.indexOf(state.visualTimelineColorMode);
    return { visualTimelineColorMode: TIMELINE_COLOR_MODES[(idx + 1) % TIMELINE_COLOR_MODES.length] };
  }),
}));
