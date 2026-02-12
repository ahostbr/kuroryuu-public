/**
 * Agent Flow Store - Zustand state management for Coding Agents flow visualization
 * Builds a network graph from coding agent sessions for ReactFlow rendering
 */
import { create } from 'zustand';
import type { SDKAgentSessionSummary } from '../types/sdk-agent';

/** Legacy session format used by the graph builder and coding-agents store */
export interface CodingAgentSession {
  id: string;
  command: string;
  workdir: string;
  running: boolean;
  exit_code: number | null;
  output_lines: number;
  started_at: string;
  pty: boolean;
  wave_id?: string;
  dependency_ids?: string[];
  // Optional SDK-enriched fields
  model?: string;
  role?: string;
  cwd?: string;
  prompt?: string;
  totalCostUsd?: number;
  numTurns?: number;
  currentTool?: string;
  toolCallCount?: number;
}

// Types for the flow visualization
export type AgentFlowTheme = 'cyberpunk' | 'kuroryuu' | 'retro' | 'default';

export interface AgentFlowNode {
  id: string;
  type: 'session-manager' | 'agent-session' | 'wave-group';
  position: { x: number; y: number };
  data: SessionManagerNodeData | AgentSessionNodeData | WaveGroupNodeData;
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
  waveId?: string;
  // SDK-enriched fields
  model?: string;
  role?: string;
  totalCostUsd?: number;
  numTurns?: number;
  currentTool?: string;
  toolCallCount?: number;
}

export interface WaveGroupNodeData {
  label: string;
  waveId: string;
  sessionCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
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
  buildGraphFromSessions: (sessions: CodingAgentSession[] | SDKAgentSessionSummary[] | readonly CodingAgentSession[]) => void;
  buildGraphFromSdkSessions: (sessions: SDKAgentSessionSummary[]) => void;
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
 * When sessions have wave_id, groups them by wave with flow visualization
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
    position: { x: 400, y: 50 },
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

  // Check if any sessions have wave_id for wave grouping
  const sessionsWithWaves = sessions.filter(s => s.wave_id);
  const sessionsWithoutWaves = sessions.filter(s => !s.wave_id);

  if (sessionsWithWaves.length > 0) {
    // Wave-based layout: group sessions by wave_id
    return buildWaveGraph(sessions, sessionsWithWaves, sessionsWithoutWaves, colors, nodes, edges);
  }

  // Default: radial hub-and-spoke layout
  const radius = 280;
  const angleStep = (2 * Math.PI) / sessions.length;
  const centerY = 300;

  sessions.forEach((session, index) => {
    const angle = index * angleStep - Math.PI / 2; // Start from top
    const x = 400 + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    // Determine session status
    let status: 'running' | 'completed' | 'failed' = 'completed';
    if (session.running) {
      status = 'running';
    } else if (session.exit_code !== 0 && session.exit_code !== null) {
      status = 'failed';
    }

    // Use role as label if available, else extract from command
    let label: string;
    if (session.role) {
      label = session.role.length > 12 ? session.role.substring(0, 12) + '...' : session.role;
    } else {
      const cmdParts = session.command.split(' ');
      const shortCmd = cmdParts[0].split('/').pop() || cmdParts[0];
      label = shortCmd.length > 12 ? shortCmd.substring(0, 12) + '...' : shortCmd;
    }

    nodes.push({
      id: `session-${session.id}`,
      type: 'agent-session',
      position: { x, y },
      data: {
        label,
        sessionId: session.id,
        command: session.command,
        workdir: session.cwd || session.workdir || '',
        status,
        outputLines: session.output_lines,
        duration: calculateDuration(session.started_at),
        exitCode: session.exit_code,
        pty: session.pty,
        model: session.model,
        role: session.role,
        totalCostUsd: session.totalCostUsd,
        numTurns: session.numTurns,
        currentTool: session.currentTool,
        toolCallCount: session.toolCallCount,
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

/**
 * Build wave-based graph layout for /max-subagents-parallel sessions
 * Waves flow left-to-right: wave1 -> wave2 -> wave3
 */
function buildWaveGraph(
  allSessions: CodingAgentSession[],
  sessionsWithWaves: CodingAgentSession[],
  sessionsWithoutWaves: CodingAgentSession[],
  colors: typeof THEME_COLORS['default'],
  nodes: AgentFlowNode[],
  edges: AgentFlowEdge[]
): { nodes: AgentFlowNode[]; edges: AgentFlowEdge[] } {
  // Group sessions by wave_id
  const waveGroups = new Map<string, CodingAgentSession[]>();
  sessionsWithWaves.forEach(session => {
    const waveId = session.wave_id!;
    if (!waveGroups.has(waveId)) {
      waveGroups.set(waveId, []);
    }
    waveGroups.get(waveId)!.push(session);
  });

  // Sort waves by name (wave1, wave2, etc.)
  const sortedWaveIds = Array.from(waveGroups.keys()).sort();

  // Layout constants
  const waveSpacingX = 300;
  const sessionSpacingY = 120;
  const startX = 150;
  const startY = 180;

  // Create wave group nodes and their sessions
  sortedWaveIds.forEach((waveId, waveIndex) => {
    const waveSessions = waveGroups.get(waveId)!;
    const waveX = startX + waveIndex * waveSpacingX;
    const waveY = startY;

    // Count states for this wave
    const waveActive = waveSessions.filter(s => s.running).length;
    const waveCompleted = waveSessions.filter(s => !s.running && s.exit_code === 0).length;
    const waveFailed = waveSessions.filter(s => !s.running && s.exit_code !== 0 && s.exit_code !== null).length;

    // Create wave group node
    nodes.push({
      id: `wave-${waveId}`,
      type: 'wave-group',
      position: { x: waveX, y: waveY },
      data: {
        label: waveId.toUpperCase(),
        waveId,
        sessionCount: waveSessions.length,
        activeCount: waveActive,
        completedCount: waveCompleted,
        failedCount: waveFailed,
      },
    });

    // Edge from session manager to wave group
    const waveHasActive = waveActive > 0;
    const waveHasFailed = waveFailed > 0;
    edges.push({
      id: `edge-manager-${waveId}`,
      source: 'session-manager',
      target: `wave-${waveId}`,
      animated: waveHasActive,
      data: {
        status: waveHasActive ? 'active' : waveHasFailed ? 'error' : 'idle',
        color: waveHasActive ? colors.running : waveHasFailed ? colors.error : colors.success,
      },
    });

    // Create session nodes under this wave
    waveSessions.forEach((session, sessionIndex) => {
      const sessionX = waveX;
      const sessionY = waveY + 100 + sessionIndex * sessionSpacingY;

      let status: 'running' | 'completed' | 'failed' = 'completed';
      if (session.running) {
        status = 'running';
      } else if (session.exit_code !== 0 && session.exit_code !== null) {
        status = 'failed';
      }

      const cmdParts = session.command.split(' ');
      const shortCmd = cmdParts[0].split('/').pop() || cmdParts[0];
      const label = shortCmd.length > 12 ? shortCmd.substring(0, 12) + '...' : shortCmd;

      nodes.push({
        id: `session-${session.id}`,
        type: 'agent-session',
        position: { x: sessionX, y: sessionY },
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
          waveId: session.wave_id,
        },
      });

      // Edge from wave group to session
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
        id: `edge-wave-${session.id}`,
        source: `wave-${waveId}`,
        target: `session-${session.id}`,
        animated: status === 'running',
        data: {
          status: edgeStatus,
          color: edgeColor,
        },
      });
    });

    // Create wave-to-wave edges (wave1 -> wave2, etc.)
    if (waveIndex > 0) {
      const prevWaveId = sortedWaveIds[waveIndex - 1];
      const prevWaveSessions = waveGroups.get(prevWaveId)!;
      const prevWaveCompleted = prevWaveSessions.every(s => !s.running);

      edges.push({
        id: `edge-wave-${prevWaveId}-${waveId}`,
        source: `wave-${prevWaveId}`,
        target: `wave-${waveId}`,
        animated: prevWaveCompleted && waveActive > 0,
        data: {
          status: prevWaveCompleted ? 'idle' : 'active',
          color: colors.hub,
        },
      });
    }
  });

  // Handle sessions without waves (legacy radial layout offset to the right)
  if (sessionsWithoutWaves.length > 0) {
    const offsetX = startX + sortedWaveIds.length * waveSpacingX + 150;
    sessionsWithoutWaves.forEach((session, index) => {
      const x = offsetX;
      const y = startY + index * sessionSpacingY;

      let status: 'running' | 'completed' | 'failed' = 'completed';
      if (session.running) {
        status = 'running';
      } else if (session.exit_code !== 0 && session.exit_code !== null) {
        status = 'failed';
      }

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
  }

  return { nodes, edges };
}

/**
 * Adapt SDK session summaries to the legacy format used by graph builders
 */
export function adaptSdkSessions(sessions: SDKAgentSessionSummary[]): CodingAgentSession[] {
  return sessions.map(s => ({
    ...s,
    command: s.prompt,
    workdir: s.cwd,
    running: s.status === 'starting' || s.status === 'running',
    exit_code: s.status === 'completed' ? 0 : s.status === 'error' ? 1 : null,
    output_lines: s.numTurns,
    started_at: new Date(s.startedAt).toISOString(),
    pty: false,
  }));
}

// Create the store
export const useAgentFlowStore = create<AgentFlowState>((set, get) => ({
  nodes: [],
  edges: [],
  theme: 'cyberpunk',
  isPaused: false,
  isConnected: true,

  buildGraphFromSessions: (sessions: CodingAgentSession[] | SDKAgentSessionSummary[] | readonly CodingAgentSession[]) => {
    if (get().isPaused) return;

    // Check if these are SDK sessions (have 'prompt' field but no 'command') and adapt
    const adapted = (sessions.length > 0 && 'prompt' in sessions[0] && !('command' in sessions[0]))
      ? adaptSdkSessions(sessions as SDKAgentSessionSummary[])
      : [...sessions] as CodingAgentSession[];

    // Debounce graph rebuilding
    if (graphRebuildTimer) clearTimeout(graphRebuildTimer);
    graphRebuildTimer = setTimeout(() => {
      const { nodes, edges } = buildGraph(adapted, get().theme);
      set({ nodes, edges });
    }, GRAPH_REBUILD_DEBOUNCE_MS);
  },

  buildGraphFromSdkSessions: (sessions: SDKAgentSessionSummary[]) => {
    if (get().isPaused) return;
    const adapted = adaptSdkSessions(sessions);
    if (graphRebuildTimer) clearTimeout(graphRebuildTimer);
    graphRebuildTimer = setTimeout(() => {
      const { nodes, edges } = buildGraph(adapted, get().theme);
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
