/**
 * Timeline Utilities
 *
 * Data normalization, color resolution, and adaptive layout math
 * shared by all 4 timeline renderers.
 */
import type { TeamSnapshot, TeamTask, TeamMember, TeamTaskStatus } from '../../../types/claude-teams';
import type { TeamFlowTheme } from '../../../stores/team-flow-store';
import { THEME_COLORS } from '../../../stores/team-flow-store';
import type {
  TimelineNode,
  TimelineData,
  TimelineColorMode,
  TimelineLayout,
} from './timeline-types';

// ============================================================================
// DATA NORMALIZATION
// ============================================================================

/**
 * Transform a TeamSnapshot into TimelineData for the renderers.
 *
 * TeamTask has NO timestamp field, so we derive ordering from:
 *   - Numeric task ID × 1000 + team.config.createdAt
 *   - This preserves creation order while spacing tasks ~1s apart
 *
 * Archive replay note: teammates[] may be empty — always use
 * config.members for agent data.
 */
export function normalizeToTimeline(team: TeamSnapshot): TimelineData {
  const tasks = team.tasks.filter((t) => t.status !== 'deleted');

  const members = team.config.members;
  const baseTime = team.config.createdAt;

  const nodes: TimelineNode[] = tasks.map((task) => {
    const numId = parseInt(task.id, 10) || 0;
    const timestamp = baseTime + numId * 1000;
    const agent = task.owner
      ? members.find((m) => m.name === task.owner) ?? null
      : null;

    const isCompleted = task.status === 'completed';
    const completedAt = isCompleted ? timestamp + 60_000 : null;
    const duration = isCompleted ? 60_000 : Date.now() - timestamp;

    return {
      id: `tl-${task.id}`,
      taskId: task.id,
      subject: task.subject,
      description: task.description,
      status: task.status,
      owner: task.owner ?? null,
      agent,
      blocks: task.blocks,
      blockedBy: task.blockedBy,
      timestamp,
      completedAt,
      duration,
      metadata: (task.metadata as Record<string, unknown>) ?? {},
    };
  });

  nodes.sort((a, b) => a.timestamp - b.timestamp);

  const timeRange =
    nodes.length > 0
      ? { start: nodes[0].timestamp, end: nodes[nodes.length - 1].timestamp }
      : { start: baseTime, end: baseTime };

  const stats = {
    total: nodes.length,
    pending: nodes.filter((n) => n.status === 'pending').length,
    inProgress: nodes.filter((n) => n.status === 'in_progress').length,
    completed: nodes.filter((n) => n.status === 'completed').length,
  };

  return {
    teamName: team.config.name,
    nodes,
    agents: members,
    timeRange,
    stats,
  };
}

// ============================================================================
// COLOR RESOLUTION
// ============================================================================

const STATUS_COLORS: Record<TeamTaskStatus, string> = {
  pending: '#3b82f6',     // blue
  in_progress: '#f59e0b', // amber
  completed: '#22c55e',   // green
  deleted: '#6b7280',     // gray
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#3b82f6',
};

/**
 * Resolve the display color for a timeline node based on the active color mode.
 */
export function resolveNodeColor(
  node: TimelineNode,
  mode: TimelineColorMode,
  index: number,
  total: number,
  agents: TeamMember[]
): string {
  switch (mode) {
    case 'status':
      return STATUS_COLORS[node.status] ?? STATUS_COLORS.pending;

    case 'agent': {
      if (!node.agent) return '#6b7280';
      const agentIndex = agents.findIndex((a) => a.name === node.agent?.name);
      if (agentIndex < 0) return '#6b7280';
      const hue = (agentIndex * 360) / Math.max(agents.length, 1);
      return `hsl(${hue}, 70%, 55%)`;
    }

    case 'priority': {
      const priority = (node.metadata.priority as string) ?? 'medium';
      return PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.medium;
    }

    case 'rainbow': {
      const hue = total > 1 ? (index / (total - 1)) * 360 : 180;
      return `hsl(${hue}, 80%, 55%)`;
    }

    default:
      return STATUS_COLORS[node.status] ?? '#6b7280';
  }
}

/**
 * Get theme-aware colors for backgrounds, text, borders.
 */
export function getThemeColors(theme: TeamFlowTheme) {
  return THEME_COLORS[theme] ?? THEME_COLORS.default;
}

/**
 * Map a global app theme name to a TeamFlowTheme.
 */
export function mapToFlowTheme(globalTheme: string): TeamFlowTheme {
  if (globalTheme.includes('kuroryuu')) return 'kuroryuu';
  if (globalTheme.includes('retro') || globalTheme.includes('grunge')) return 'retro';
  if (globalTheme.includes('matrix') || globalTheme.includes('neo')) return 'cyberpunk';
  return 'default';
}

/**
 * Determine if a theme warrants dramatic animations.
 */
export function isDramaticTheme(globalTheme: string): boolean {
  return ['kuroryuu', 'matrix', 'retro', 'neo', 'grunge'].some((t) =>
    globalTheme.includes(t)
  );
}

// ============================================================================
// ADAPTIVE LAYOUT
// ============================================================================

/**
 * Compute spacing/sizing based on how many tasks exist.
 * Returns layout params that renderers use for positioning.
 */
export function computeLayout(nodeCount: number): TimelineLayout {
  if (nodeCount <= 5) {
    return { spacing: 200, nodeSize: 16, fontSize: 14, showLabels: true, compactMode: false };
  }
  if (nodeCount <= 15) {
    return { spacing: 120, nodeSize: 12, fontSize: 13, showLabels: true, compactMode: false };
  }
  if (nodeCount <= 50) {
    return { spacing: 60, nodeSize: 8, fontSize: 11, showLabels: false, compactMode: true };
  }
  return { spacing: 30, nodeSize: 5, fontSize: 10, showLabels: false, compactMode: true };
}

// ============================================================================
// TIME BUCKET AGGREGATION (for high-density renderers)
// ============================================================================

export interface TimeBucket {
  startMs: number;
  endMs: number;
  nodes: TimelineNode[];
}

/**
 * Group nodes into time buckets of `bucketMs` milliseconds.
 * Returns sorted array of buckets (only non-empty ones).
 */
export function computeBuckets(nodes: TimelineNode[], bucketMs: number): TimeBucket[] {
  if (nodes.length === 0 || bucketMs <= 0) return [];

  const sorted = [...nodes].sort((a, b) => a.timestamp - b.timestamp);
  const minTs = sorted[0].timestamp;
  const maxTs = sorted[sorted.length - 1].timestamp;
  const range = maxTs - minTs;

  // If all events share the same timestamp, return a single bucket
  if (range === 0) {
    return [{ startMs: minTs, endMs: minTs + bucketMs, nodes: sorted }];
  }

  const bucketCount = Math.ceil(range / bucketMs) + 1;
  const bucketMap = new Map<number, TimelineNode[]>();

  for (const node of sorted) {
    const idx = Math.floor((node.timestamp - minTs) / bucketMs);
    const existing = bucketMap.get(idx);
    if (existing) {
      existing.push(node);
    } else {
      bucketMap.set(idx, [node]);
    }
  }

  const buckets: TimeBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const nodesInBucket = bucketMap.get(i);
    if (nodesInBucket && nodesInBucket.length > 0) {
      buckets.push({
        startMs: minTs + i * bucketMs,
        endMs: minTs + (i + 1) * bucketMs,
        nodes: nodesInBucket,
      });
    }
  }

  return buckets;
}

// ============================================================================
// PATH GENERATORS (for SVG/Canvas renderers)
// ============================================================================

/**
 * Generate an SVG path string for a vertical spine with branches.
 */
export function verticalSpinePath(
  nodeCount: number,
  spacing: number,
  padding: number = 40
): string {
  if (nodeCount === 0) return '';
  const totalHeight = (nodeCount - 1) * spacing;
  return `M ${padding} 0 L ${padding} ${totalHeight}`;
}

/**
 * Generate control points for a rainbow arc (quadratic bezier).
 * Returns [startX, startY, cpX, cpY, endX, endY].
 */
export function rainbowArcPoints(
  width: number,
  height: number,
  padding: number = 60
): [number, number, number, number, number, number] {
  const startX = padding;
  const startY = height - padding;
  const endX = width - padding;
  const endY = height - padding;
  const cpX = width / 2;
  const cpY = padding;
  return [startX, startY, cpX, cpY, endX, endY];
}

/**
 * Get a point along a quadratic bezier curve at parameter t (0..1).
 */
export function quadraticBezierPoint(
  t: number,
  startX: number,
  startY: number,
  cpX: number,
  cpY: number,
  endX: number,
  endY: number
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * startX + 2 * mt * t * cpX + t * t * endX,
    y: mt * mt * startY + 2 * mt * t * cpY + t * t * endY,
  };
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format a duration in ms to a human-readable string.
 */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return '--';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Format a timestamp to a short time string.
 */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
