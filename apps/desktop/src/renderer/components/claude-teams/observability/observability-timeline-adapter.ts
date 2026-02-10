/**
 * Observability Timeline Adapter
 *
 * Maps HookEvent[] -> TimelineData so the 4 existing timeline
 * renderers can visualize observability events without modification.
 */
import type { HookEvent, HookEventType } from '../../../types/observability';
import type { TeamMember, TeamTaskStatus } from '../../../types/claude-teams';
import type { TimelineNode, TimelineData } from '../timeline/timeline-types';

// Event type -> pseudo task status for color resolution
const EVENT_TYPE_TO_STATUS: Record<HookEventType, TeamTaskStatus> = {
  SessionStart: 'pending',
  SessionEnd: 'completed',
  UserPromptSubmit: 'in_progress',
  PreToolUse: 'in_progress',
  PostToolUse: 'completed',
  PostToolUseFailure: 'deleted',
  PermissionRequest: 'pending',
  Notification: 'pending',
  Stop: 'completed',
  SubagentStart: 'pending',
  SubagentStop: 'completed',
  PreCompact: 'in_progress',
};

/**
 * Build unique pseudo-TeamMember objects from event data.
 * Groups by (agent_id || session_id).
 */
function buildAgents(events: HookEvent[]): TeamMember[] {
  const seen = new Map<string, TeamMember>();
  for (const event of events) {
    const key = event.agent_id || event.session_id;
    if (seen.has(key)) continue;
    seen.set(key, {
      agentId: key,
      name: event.agent_id || `session-${event.session_id.slice(0, 8)}`,
      agentType: event.agent_id ? 'subagent' : 'main',
      model: event.model_name || 'unknown',
      joinedAt: event.timestamp,
      tmuxPaneId: '',
      cwd: '',
      subscriptions: [],
    });
  }
  return Array.from(seen.values());
}

/**
 * Transform HookEvent[] into TimelineData consumable by all 4 renderers.
 */
export function eventsToTimelineData(events: HookEvent[]): TimelineData {
  if (events.length === 0) {
    return {
      teamName: 'Observability',
      nodes: [],
      agents: [],
      timeRange: { start: Date.now(), end: Date.now() },
      stats: { total: 0, pending: 0, inProgress: 0, completed: 0 },
    };
  }

  const agents = buildAgents(events);
  const agentMap = new Map(agents.map((a) => [a.agentId, a]));

  // Sort chronologically (oldest first)
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  const nodes: TimelineNode[] = sorted.map((event) => {
    const agentKey = event.agent_id || event.session_id;
    const agent = agentMap.get(agentKey) ?? null;
    const status = EVENT_TYPE_TO_STATUS[event.hook_event_type] ?? 'pending';

    const subject = event.tool_name
      ? `${event.hook_event_type}: ${event.tool_name}`
      : event.hook_event_type;

    const description = event.summary
      || (event.tool_name ? `Tool: ${event.tool_name}` : '')
      || JSON.stringify(event.payload).slice(0, 200);

    return {
      id: `obs-${event.id}`,
      taskId: String(event.id),
      subject,
      description,
      status,
      owner: agent?.name ?? null,
      agent,
      blocks: [],
      blockedBy: [],
      timestamp: event.timestamp,
      completedAt: status === 'completed' ? event.timestamp : null,
      duration: null,
      metadata: {
        hook_event_type: event.hook_event_type,
        tool_name: event.tool_name,
        session_id: event.session_id,
        source_app: event.source_app,
        model_name: event.model_name,
        payload: event.payload,
      },
    };
  });

  const timeRange = {
    start: nodes[0].timestamp,
    end: nodes[nodes.length - 1].timestamp,
  };

  const stats = {
    total: nodes.length,
    pending: nodes.filter((n) => n.status === 'pending').length,
    inProgress: nodes.filter((n) => n.status === 'in_progress').length,
    completed: nodes.filter((n) => n.status === 'completed').length,
  };

  return { teamName: 'Observability', nodes, agents, timeRange, stats };
}
