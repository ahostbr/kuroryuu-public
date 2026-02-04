/**
 * Agent Flow Store - Zustand state management for Coding Agents flow visualization
 * Builds a network graph from coding agent sessions for ReactFlow rendering
 */
import { create } from 'zustand';
import type { CodingAgentSession } from './coding-agents-store';

// Types for the flow visualization
export type AgentFlowTheme = 'cyberpunk' | 'kuroryuu' | 'retro' | 'default';

export interface AgentFlowNode {
  id: string;
  type: 'session-manager' | 'agent-session';
  position: { x: number; y: number };
  data: SessionManagerNodeData | AgentSessionNodeData;
}

export interface SessionManagerNodeData {
  label: string;
  totalSessions: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}

export interface AgentSessionNodeData {
  label: string;
  sessionId: string;
  command: string;
  workdir: string;
  status: 'running' | 'completed' | 'failed';
  outputLines: number;
  duration: string;
  exitCode: number | null;
  pty: boolean;
}

export interface AgentFlowEdge {
  id: string;
  source: string;
  target: string;
  animated: boolean;
  data: {
    status: 'active' | 'idle' | 'error';
    color: string;
  };
}

interface AgentFlowState {
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
  theme: AgentFlowTheme;
  isPaused: boolean;
  isConnected: boolean;

  // Actions
  buildGraphFromSessions: (sessions: CodingAgentSession[]) => void;
  setTheme: (theme: AgentFlowTheme) => void;
  togglePause: () => void;
  setConnected: (connected: boolean) => void;
  clearGraph: () => void;
}

// Color palette for different themes
const THEME_COLORS: Record<AgentFlowTheme, {
  success: string;
  error: string;
  running: string;
  hub: string;
  nodeBg: string;
  nodeText: string;
}> = {
  cyberpunk: {
    success: '#00ff88',
    error: '#ff3366',
    running: '#00ffff',
    hub: '#ff00ff',
    nodeBg: 'rgba(0, 0, 0, 0.85)',
    nodeText: '#ffffff',
  },
  kuroryuu: {
    success: '#c9a227',
    error: '#8b1e1e',
    running: '#c9a227',
    hub: '#c9a227',
    nodeBg: 'rgba(20, 10, 5, 0.95)',
    nodeText: '#c9a227',
  },
  retro: {
    success: '#33ff00',
    error: '#ff0000',
    running: '#33ff00',
    hub: '#33ff00',
    nodeBg: 'rgba(0, 10, 0, 0.95)',
    nodeText: '#33ff00',
  },
  default: {
    success: '#22c55e',
    error: '#ef4444',
    running: '#06b6d4',
    hub: '#a855f7',
    nodeBg: 'rgba(30, 30, 40, 0.95)',
    nodeText: '#e5e5e5',
  },
};

// Debounce timer for graph rebuilding
let graphRebuildTimer: ReturnType<typeof setTimeout> | null = null;
const GRAPH_REBUILD_DEBOUNCE_MS = 200;

/**
 * Calculate duration string from started_at timestamp
 */
function calculateDuration(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const ms = now - start;

  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Build network graph from coding agent sessions
 * Creates a hub-and-spoke layout with Session Manager at center
 */
function buildGraph(
  sessions: CodingAgentSession[],
  theme: AgentFlowTheme
): { nodes: AgentFlowNode[]; edges: AgentFlowEdge[] } {
  const colors = THEME_COLORS[theme];
  const nodes: AgentFlowNode[] = [];
  const edges: AgentFlowEdge[] = [];

  // Count session states
  const activeCount = sessions.filter(s => s.running).length;
  const completedCount = sessions.filter(s => !s.running && s.exit_code === 0).length;
  const failedCount = sessions.filter(s => !s.running && s.exit_code !== 0 && s.exit_code !== null).length;

  // Create central hub node
  nodes.push({
    id: 'session-manager',
    type: 'session-manager',
    position: { x: 400, y: 300 },
    data: {
      label: 'SESSION MANAGER',
      totalSessions: sessions.length,
      activeCount,
      completedCount,
      failedCount,
    },
  });

  if (sessions.length === 0) {
    return { nodes, edges };
  }

  // Calculate radial positions for session nodes
  const radius = 280;
  const angleStep = (2 * Math.PI) / sessions.length;

  sessions.forEach((session, index) => {
    const angle = index * angleStep - Math.PI / 2; // Start from top
    const x = 400 + radius * Math.cos(angle);
    const y = 300 + radius * Math.sin(angle);

    // Determine session status
    let status: 'running' | 'completed' | 'failed' = 'completed';
    if (session.running) {
      status = 'running';
    } else if (session.exit_code !== 0 && session.exit_code !== null) {
      status = 'failed';
    }

    // Extract short command label
    const cmdParts = session.command.split(' ');
    const shortCmd = cmdParts[0].split('/').pop() || cmdParts[0];
    const label = shortCmd.length > 12 ? shortCmd.substring(0, 12) + '...' : shortCmd;

    nodes.push({
      id: `session-${session.id}`,
      type: 'agent-session',
      position: { x, y },
      data: {
        label,
        sessionId: session.id,
        command: session.command,
        workdir: session.workdir,
        status,
        outputLines: session.output_lines,
        duration: calculateDuration(session.started_at),
        exitCode: session.exit_code,
        pty: session.pty,
      },
    });

    // Create edge from hub to session
    let edgeColor = colors.success;
    let edgeStatus: 'active' | 'idle' | 'error' = 'idle';

    if (status === 'running') {
      edgeColor = colors.running;
      edgeStatus = 'active';
    } else if (status === 'failed') {
      edgeColor = colors.error;
      edgeStatus = 'error';
    }

    edges.push({
      id: `edge-${session.id}`,
      source: 'session-manager',
      target: `session-${session.id}`,
      animated: status === 'running',
      data: {
        status: edgeStatus,
        color: edgeColor,
      },
    });
  });

  return { nodes, edges };
}

// Create the store
export const useAgentFlowStore = create<AgentFlowState>((set, get) => ({
  nodes: [],
  edges: [],
  theme: 'cyberpunk',
  isPaused: false,
  isConnected: true,

  buildGraphFromSessions: (sessions: CodingAgentSession[]) => {
    if (get().isPaused) return;

    // Debounce graph rebuilding
    if (graphRebuildTimer) clearTimeout(graphRebuildTimer);
    graphRebuildTimer = setTimeout(() => {
      const { nodes, edges } = buildGraph(sessions, get().theme);
      set({ nodes, edges });
    }, GRAPH_REBUILD_DEBOUNCE_MS);
  },

  setTheme: (theme: AgentFlowTheme) => {
    set({ theme });
    // Rebuild graph with new theme colors would require sessions
    // This will be triggered by the parent component
  },

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  setConnected: (connected: boolean) => set({ isConnected: connected }),

  clearGraph: () => {
    set({
      nodes: [{
        id: 'session-manager',
        type: 'session-manager',
        position: { x: 400, y: 300 },
        data: {
          label: 'SESSION MANAGER',
          totalSessions: 0,
          activeCount: 0,
          completedCount: 0,
          failedCount: 0,
        },
      }],
      edges: [],
    });
  },
}));

// Export theme colors for use in node components
export { THEME_COLORS };
