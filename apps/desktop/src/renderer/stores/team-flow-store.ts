/**
 * Team Flow Store - Zustand state management for Claude Teams ReactFlow visualization
 * Builds a hub+spokes network graph from team config and tasks.
 */
import { create } from 'zustand';
import type { TeamSnapshot, TeamTask, TeammateStatus, TeamNodeData, TaskEdgeData, FlowViewMode } from '../types/claude-teams';
import type { TimelineStyle, TimelineColorMode } from '../components/claude-teams/timeline/timeline-types';
import { TIMELINE_STYLES, TIMELINE_COLOR_MODES } from '../components/claude-teams/timeline/timeline-types';

export type TeamFlowTheme = 'cyberpunk' | 'kuroryuu' | 'retro' | 'default';

export interface TeamFlowNode {
  id: string;
  type: 'lead' | 'teammate' | 'team-root' | 'task';
  position: { x: number; y: number };
  data: TeamNodeData;
}

export interface TeamFlowEdge {
  id: string;
  source: string;
  target: string;
  animated: boolean;
  data: {
    status: 'active' | 'idle' | 'error';
    color: string;
  };
}

interface TeamFlowState {
  nodes: TeamFlowNode[];
  edges: TeamFlowEdge[];
  theme: TeamFlowTheme;
  viewMode: FlowViewMode;
  isPaused: boolean;
  selectedTeammateId: string | null;

  // Timeline bake-off state
  timelineStyle: TimelineStyle;
  timelineColorMode: TimelineColorMode;

  // Actions
  buildGraphFromTeam: (team: TeamSnapshot) => void;
  setTheme: (theme: TeamFlowTheme) => void;
  setViewMode: (mode: FlowViewMode) => void;
  togglePause: () => void;
  selectTeammate: (id: string | null) => void;
  clearGraph: () => void;

  // Timeline actions
  cycleTimelineStyle: () => void;
  cycleTimelineColorMode: () => void;
  setTimelineStyle: (style: TimelineStyle) => void;
  setTimelineColorMode: (mode: TimelineColorMode) => void;
}

// Color palette for different themes
const THEME_COLORS: Record<TeamFlowTheme, {
  success: string;
  error: string;
  active: string;
  idle: string;
  hub: string;
  nodeBg: string;
  nodeText: string;
}> = {
  cyberpunk: {
    success: '#00ff88',
    error: '#ff3366',
    active: '#00ffff',
    idle: '#ffcc00',
    hub: '#ff00ff',
    nodeBg: 'rgba(0, 0, 0, 0.85)',
    nodeText: '#ffffff',
  },
  kuroryuu: {
    success: '#c9a227',
    error: '#8b1e1e',
    active: '#c9a227',
    idle: '#8a7a4a',
    hub: '#c9a227',
    nodeBg: 'rgba(20, 10, 5, 0.95)',
    nodeText: '#c9a227',
  },
  retro: {
    success: '#33ff00',
    error: '#ff0000',
    active: '#33ff00',
    idle: '#999900',
    hub: '#33ff00',
    nodeBg: 'rgba(0, 10, 0, 0.95)',
    nodeText: '#33ff00',
  },
  default: {
    success: '#22c55e',
    error: '#ef4444',
    active: '#06b6d4',
    idle: '#f59e0b',
    hub: '#a855f7',
    nodeBg: 'rgba(30, 30, 40, 0.95)',
    nodeText: '#e5e5e5',
  },
};

/**
 * Derive teammate status from inbox messages and task assignments.
 * If the member is the lead, they're always "active".
 * Otherwise, infer from the most recent inbox message or task state.
 */
function deriveTeammateStatus(
  memberName: string,
  inboxes: Record<string, InboxMessage[]>,
  tasks: TeamTask[],
  isLead: boolean,
): TeammateStatus {
  if (isLead) return 'active';

  // Check if teammate has an in-progress task
  const hasActiveTask = tasks.some(
    (t) => t.owner === memberName && t.status === 'in_progress'
  );
  if (hasActiveTask) return 'active';

  // Check most recent inbox message for idle signal
  const inbox = inboxes[memberName] ?? [];
  if (inbox.length > 0) {
    const latest = inbox[inbox.length - 1];
    try {
      const parsed = JSON.parse(latest.text);
      if (parsed?.type === 'idle_notification') return 'idle';
      if (parsed?.type === 'shutdown_approved') return 'stopped';
    } catch {
      // Plain text message - teammate is active
      return 'active';
    }
  }

  return 'idle';
}

// Need InboxMessage for the deriveTeammateStatus function
import type { InboxMessage } from '../types/claude-teams';

// Debounce timer for graph rebuilding
let graphRebuildTimer: ReturnType<typeof setTimeout> | null = null;
const GRAPH_REBUILD_DEBOUNCE_MS = 200;

/**
 * Build hub+spokes layout: lead at center (0,0), teammates at equal angles around radius.
 */
export function buildHubSpokesGraph(
  team: TeamSnapshot,
  theme: TeamFlowTheme
): { nodes: TeamFlowNode[]; edges: TeamFlowEdge[] } {
  const colors = THEME_COLORS[theme];
  const nodes: TeamFlowNode[] = [];
  const edges: TeamFlowEdge[] = [];

  const { config, tasks, inboxes } = team;
  const lead = config.members.find((m) => m.agentId === config.leadAgentId);

  if (!lead) return { nodes, edges };

  // Count tasks assigned to each member
  const taskCountByOwner = new Map<string, number>();
  const unreadByAgent = new Map<string, number>();
  for (const task of tasks) {
    if (task.owner) {
      taskCountByOwner.set(task.owner, (taskCountByOwner.get(task.owner) ?? 0) + 1);
    }
  }
  for (const [agentName, msgs] of Object.entries(inboxes)) {
    const unread = msgs.filter((m) => !m.read).length;
    if (unread > 0) unreadByAgent.set(agentName, unread);
  }

  // Lead node at center
  nodes.push({
    id: `lead-${lead.name}`,
    type: 'lead',
    position: { x: 0, y: 0 },
    data: {
      label: lead.name,
      agentId: lead.agentId,
      agentType: lead.agentType,
      status: 'active',
      model: lead.model,
      isLead: true,
      taskCount: taskCountByOwner.get(lead.name) ?? 0,
      unreadCount: unreadByAgent.get(lead.name) ?? 0,
    },
  });

  // Teammates around the lead in a circle
  const teammates = config.members.filter((m) => m.agentId !== config.leadAgentId);

  if (teammates.length === 0) return { nodes, edges };

  const radius = 250;
  const angleStep = (2 * Math.PI) / teammates.length;

  teammates.forEach((member, index) => {
    const angle = index * angleStep - Math.PI / 2; // Start from top
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);

    const status = deriveTeammateStatus(member.name, inboxes, tasks, false);

    const nodeId = `teammate-${member.name}`;

    nodes.push({
      id: nodeId,
      type: 'teammate',
      position: { x, y },
      data: {
        label: member.name,
        agentId: member.agentId,
        agentType: member.agentType,
        status,
        model: member.model,
        color: member.color,
        isLead: false,
        taskCount: taskCountByOwner.get(member.name) ?? 0,
        unreadCount: unreadByAgent.get(member.name) ?? 0,
      },
    });

    // Edge from lead to teammate
    let edgeColor = colors.idle;
    let edgeStatus: 'active' | 'idle' | 'error' = 'idle';

    if (status === 'active') {
      edgeColor = colors.active;
      edgeStatus = 'active';
    } else if (status === 'stopped') {
      edgeColor = colors.error;
      edgeStatus = 'error';
    }

    edges.push({
      id: `edge-${lead.name}-${member.name}`,
      source: `lead-${lead.name}`,
      target: nodeId,
      animated: status === 'active',
      data: {
        status: edgeStatus,
        color: edgeColor,
      },
    });
  });

  return { nodes, edges };
}

/**
 * Build hierarchy layout: Team Root → Lead → Teammates → Tasks (top-down tree).
 */
export function buildHierarchyGraph(
  team: TeamSnapshot,
  theme: TeamFlowTheme
): { nodes: TeamFlowNode[]; edges: TeamFlowEdge[] } {
  const colors = THEME_COLORS[theme];
  const nodes: TeamFlowNode[] = [];
  const edges: TeamFlowEdge[] = [];

  const { config, tasks, inboxes } = team;
  const lead = config.members.find((m) => m.agentId === config.leadAgentId);

  if (!lead) return { nodes, edges };

  const teammates = config.members.filter((m) => m.agentId !== config.leadAgentId);

  // Task stats
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const totalTasks = tasks.length;

  // Count tasks and unread per owner
  const taskCountByOwner = new Map<string, number>();
  const unreadByAgent = new Map<string, number>();
  for (const task of tasks) {
    if (task.owner) {
      taskCountByOwner.set(task.owner, (taskCountByOwner.get(task.owner) ?? 0) + 1);
    }
  }
  for (const [agentName, msgs] of Object.entries(inboxes)) {
    const unread = msgs.filter((m) => !m.read).length;
    if (unread > 0) unreadByAgent.set(agentName, unread);
  }

  // --- Team Root Node (y=0) ---
  const teamRootId = `team-root-${config.name}`;
  nodes.push({
    id: teamRootId,
    type: 'team-root',
    position: { x: 0, y: 0 },
    data: {
      label: config.name,
      agentId: config.leadAgentId,
      agentType: 'team',
      status: 'active',
      model: lead.model,
      isLead: false,
      taskCount: completedTasks,
      unreadCount: config.members.length,
    },
  });

  // --- Lead Node (y=150) ---
  const leadId = `lead-${lead.name}`;
  nodes.push({
    id: leadId,
    type: 'lead',
    position: { x: 0, y: 150 },
    data: {
      label: lead.name,
      agentId: lead.agentId,
      agentType: lead.agentType,
      status: 'active',
      model: lead.model,
      isLead: true,
      taskCount: taskCountByOwner.get(lead.name) ?? 0,
      unreadCount: unreadByAgent.get(lead.name) ?? 0,
    },
  });

  // Edge: team-root → lead (animated)
  edges.push({
    id: `edge-root-lead`,
    source: teamRootId,
    target: leadId,
    animated: true,
    data: { status: 'active', color: colors.hub },
  });

  // --- Teammate Nodes (y=300) ---
  const totalWidth = (teammates.length - 1) * 220;
  const startX = -totalWidth / 2;

  teammates.forEach((member, index) => {
    const x = startX + index * 220;
    const status = deriveTeammateStatus(member.name, inboxes, tasks, false);
    const nodeId = `teammate-${member.name}`;

    nodes.push({
      id: nodeId,
      type: 'teammate',
      position: { x, y: 300 },
      data: {
        label: member.name,
        agentId: member.agentId,
        agentType: member.agentType,
        status,
        model: member.model,
        color: member.color,
        isLead: false,
        taskCount: taskCountByOwner.get(member.name) ?? 0,
        unreadCount: unreadByAgent.get(member.name) ?? 0,
      },
    });

    // Edge: lead → teammate
    let edgeColor = colors.idle;
    let edgeStatus: 'active' | 'idle' | 'error' = 'idle';
    if (status === 'active') {
      edgeColor = colors.active;
      edgeStatus = 'active';
    } else if (status === 'stopped') {
      edgeColor = colors.error;
      edgeStatus = 'error';
    }

    edges.push({
      id: `edge-lead-${member.name}`,
      source: leadId,
      target: nodeId,
      animated: status === 'active',
      data: { status: edgeStatus, color: edgeColor },
    });

    // --- Task Nodes below this teammate (y=450) ---
    const memberTasks = tasks.filter((t) => t.owner === member.name);
    const taskWidth = (memberTasks.length - 1) * 160;
    const taskStartX = x - taskWidth / 2;

    memberTasks.forEach((task, tIndex) => {
      const taskId = `task-${task.id}`;
      nodes.push({
        id: taskId,
        type: 'task',
        position: { x: taskStartX + tIndex * 160, y: 450 },
        data: {
          label: task.subject,
          agentId: task.id,
          agentType: task.status,
          status: task.status === 'in_progress' ? 'active' : task.status === 'completed' ? 'stopped' : 'idle',
          model: task.owner ?? '',
          isLead: false,
          taskCount: task.blocks.length,
          unreadCount: task.blockedBy.length,
        },
      });

      edges.push({
        id: `edge-${member.name}-task-${task.id}`,
        source: nodeId,
        target: taskId,
        animated: false,
        data: { status: 'idle', color: colors.idle },
      });
    });
  });

  // --- Unassigned Tasks (pool at far right, y=300) ---
  const unassignedTasks = tasks.filter((t) => !t.owner);
  if (unassignedTasks.length > 0) {
    const poolX = startX + teammates.length * 220 + 100;
    unassignedTasks.forEach((task, tIndex) => {
      const taskId = `task-${task.id}`;
      nodes.push({
        id: taskId,
        type: 'task',
        position: { x: poolX, y: 300 + tIndex * 80 },
        data: {
          label: task.subject,
          agentId: task.id,
          agentType: task.status,
          status: 'idle',
          model: '',
          isLead: false,
          taskCount: task.blocks.length,
          unreadCount: task.blockedBy.length,
        },
      });
    });
  }

  return { nodes, edges };
}

/**
 * Build timeline layout: left-to-right chronological flow.
 * [Start] → [Teammates Column] → [Tasks by status] → [Completed]
 */
export function buildTimelineGraph(
  team: TeamSnapshot,
  theme: TeamFlowTheme
): { nodes: TeamFlowNode[]; edges: TeamFlowEdge[] } {
  const colors = THEME_COLORS[theme];
  const nodes: TeamFlowNode[] = [];
  const edges: TeamFlowEdge[] = [];

  const { config, tasks, inboxes } = team;
  const lead = config.members.find((m) => m.agentId === config.leadAgentId);

  if (!lead) return { nodes, edges };

  const teammates = config.members.filter((m) => m.agentId !== config.leadAgentId);

  const completedTasks = tasks.filter((t) => t.status === 'completed').length;

  // Count tasks per owner
  const taskCountByOwner = new Map<string, number>();
  const unreadByAgent = new Map<string, number>();
  for (const task of tasks) {
    if (task.owner) {
      taskCountByOwner.set(task.owner, (taskCountByOwner.get(task.owner) ?? 0) + 1);
    }
  }
  for (const [agentName, msgs] of Object.entries(inboxes)) {
    const unread = msgs.filter((m) => !m.read).length;
    if (unread > 0) unreadByAgent.set(agentName, unread);
  }

  // --- Start Node (team-root at x=0) ---
  const startId = `team-root-${config.name}`;
  nodes.push({
    id: startId,
    type: 'team-root',
    position: { x: 0, y: 0 },
    data: {
      label: config.name,
      agentId: config.leadAgentId,
      agentType: 'team',
      status: 'active',
      model: lead.model,
      isLead: false,
      taskCount: completedTasks,
      unreadCount: config.members.length,
    },
  });

  // --- Teammate Nodes (x=250, vertical column) ---
  teammates.forEach((member, index) => {
    const y = index * 120;
    const status = deriveTeammateStatus(member.name, inboxes, tasks, false);
    const nodeId = `teammate-${member.name}`;

    nodes.push({
      id: nodeId,
      type: 'teammate',
      position: { x: 250, y },
      data: {
        label: member.name,
        agentId: member.agentId,
        agentType: member.agentType,
        status,
        model: member.model,
        color: member.color,
        isLead: false,
        taskCount: taskCountByOwner.get(member.name) ?? 0,
        unreadCount: unreadByAgent.get(member.name) ?? 0,
      },
    });

    // Edge: start → teammate
    let edgeColor = colors.idle;
    let edgeStatus: 'active' | 'idle' | 'error' = 'idle';
    if (status === 'active') {
      edgeColor = colors.active;
      edgeStatus = 'active';
    } else if (status === 'stopped') {
      edgeColor = colors.error;
      edgeStatus = 'error';
    }

    edges.push({
      id: `edge-start-${member.name}`,
      source: startId,
      target: nodeId,
      animated: status === 'active',
      data: { status: edgeStatus, color: edgeColor },
    });

    // --- Task Nodes for this teammate, positioned by status ---
    const memberTasks = tasks.filter((t) => t.owner === member.name);
    // Track vertical stacking per status column
    const statusCounts = { pending: 0, in_progress: 0, completed: 0 };

    memberTasks.forEach((task) => {
      let taskX: number;
      switch (task.status) {
        case 'pending':
          taskX = 500;
          break;
        case 'in_progress':
          taskX = 700;
          break;
        case 'completed':
          taskX = 900;
          break;
        default:
          taskX = 500;
      }

      const statusKey = task.status === 'deleted' ? 'pending' : task.status;
      const stackOffset = (statusCounts[statusKey] ?? 0) * 80;
      statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1;

      const taskY = y + stackOffset;
      const taskId = `task-${task.id}`;

      nodes.push({
        id: taskId,
        type: 'task',
        position: { x: taskX, y: taskY },
        data: {
          label: task.subject,
          agentId: task.id,
          agentType: task.status,
          status: task.status === 'in_progress' ? 'active' : task.status === 'completed' ? 'stopped' : 'idle',
          model: task.owner ?? '',
          isLead: false,
          taskCount: task.blocks.length,
          unreadCount: task.blockedBy.length,
        },
      });

      // Edge: teammate → task
      edges.push({
        id: `edge-${member.name}-task-${task.id}`,
        source: nodeId,
        target: taskId,
        animated: task.status === 'in_progress',
        data: {
          status: task.status === 'in_progress' ? 'active' : 'idle',
          color: task.status === 'in_progress' ? colors.active : colors.idle,
        },
      });
    });
  });

  // --- Task dependency edges (blocks/blockedBy) ---
  for (const task of tasks) {
    for (const blockedId of task.blocks) {
      edges.push({
        id: `edge-dep-${task.id}-${blockedId}`,
        source: `task-${task.id}`,
        target: `task-${blockedId}`,
        animated: false,
        data: { status: 'idle', color: colors.error },
      });
    }
  }

  return { nodes, edges };
}

export const useTeamFlowStore = create<TeamFlowState>((set, get) => ({
  nodes: [],
  edges: [],
  theme: 'cyberpunk',
  viewMode: 'hub-spokes',
  isPaused: false,
  selectedTeammateId: null,
  timelineStyle: 'svg-spine' as TimelineStyle,
  timelineColorMode: 'status' as TimelineColorMode,

  buildGraphFromTeam: (team) => {
    if (get().isPaused) return;

    // Debounce graph rebuilding
    if (graphRebuildTimer) clearTimeout(graphRebuildTimer);
    graphRebuildTimer = setTimeout(() => {
      const { viewMode, theme } = get();
      let result: { nodes: TeamFlowNode[]; edges: TeamFlowEdge[] };
      switch (viewMode) {
        case 'hierarchy':
          result = buildHierarchyGraph(team, theme);
          break;
        case 'timeline':
          result = buildTimelineGraph(team, theme);
          break;
        default:
          result = buildHubSpokesGraph(team, theme);
      }
      set({ nodes: result.nodes, edges: result.edges });
    }, GRAPH_REBUILD_DEBOUNCE_MS);
  },

  setTheme: (theme) => set({ theme }),

  setViewMode: (mode) => set({ viewMode: mode }),

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  selectTeammate: (id) => set({ selectedTeammateId: id }),

  clearGraph: () => set({ nodes: [], edges: [], selectedTeammateId: null }),

  // Timeline bake-off actions
  cycleTimelineStyle: () =>
    set((state) => {
      const idx = TIMELINE_STYLES.indexOf(state.timelineStyle);
      return { timelineStyle: TIMELINE_STYLES[(idx + 1) % TIMELINE_STYLES.length] };
    }),

  cycleTimelineColorMode: () =>
    set((state) => {
      const idx = TIMELINE_COLOR_MODES.indexOf(state.timelineColorMode);
      return { timelineColorMode: TIMELINE_COLOR_MODES[(idx + 1) % TIMELINE_COLOR_MODES.length] };
    }),

  setTimelineStyle: (style) => set({ timelineStyle: style }),
  setTimelineColorMode: (mode) => set({ timelineColorMode: mode }),
}));

export { THEME_COLORS };
