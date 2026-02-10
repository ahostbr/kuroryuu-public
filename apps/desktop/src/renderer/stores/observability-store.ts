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

const GATEWAY_URL = 'http://localhost:8200';
const WS_URL = 'ws://localhost:8200/ws/observability-stream';
const MAX_EVENTS = 500;
const RECONNECT_DELAY_MS = 3000;

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

  // Actions
  connect: () => void;
  disconnect: () => void;
  addEvent: (event: HookEvent) => void;
  loadRecentEvents: () => Promise<void>;
  loadStats: () => Promise<void>;
  clearEvents: () => void;
  setFilters: (f: Partial<ObservabilityFilters>) => void;
  setActiveSubTab: (tab: ObservabilitySubTab) => void;
  toggleAgentLane: (agent: string) => void;
  setTimeRange: (range: ObservabilityTimeRange) => void;
  setSearchQuery: (query: string) => void;
  togglePause: () => void;
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

export const useObservabilityStore = create<ObservabilityState>((set, get) => ({
  events: [],
  isConnected: false,
  error: null,
  activeSessions: new Map(),
  toolStats: {},
  eventTypeStats: {},
  stats: null,
  activeSubTab: 'timeline',
  filters: { sourceApp: '', sessionId: '', eventType: '', toolName: '' },
  selectedAgentLanes: [],
  timeRange: '5m',
  searchQuery: '',
  isPaused: false,

  connect: () => {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
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
      const newEvents = [event, ...state.events].slice(0, MAX_EVENTS);
      return {
        events: newEvents,
        activeSessions: deriveSessionInfo(newEvents),
        toolStats: deriveToolStats(newEvents),
        eventTypeStats: deriveEventTypeStats(newEvents),
      };
    });
  },

  loadRecentEvents: async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/observability/events/recent?limit=300`);
      if (!res.ok) return;
      const data = await res.json();
      const events: HookEvent[] = data.events || [];
      set({
        events,
        activeSessions: deriveSessionInfo(events),
        toolStats: deriveToolStats(events),
        eventTypeStats: deriveEventTypeStats(events),
      });
    } catch {
      // Gateway may not be running
    }
  },

  loadStats: async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/observability/stats`);
      if (!res.ok) return;
      const stats: ObservabilityStats = await res.json();
      set({ stats });
    } catch {
      // Gateway may not be running
    }
  },

  clearEvents: () => {
    set({
      events: [],
      activeSessions: new Map(),
      toolStats: {},
      eventTypeStats: {},
    });
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
}));
