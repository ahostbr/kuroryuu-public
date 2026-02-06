/**
 * Timeline Visualization Types
 *
 * Shared types for the 4 timeline renderers (SVG Spine, ReactFlow Swim,
 * ECharts Dots, Canvas Arc) and their supporting infrastructure.
 */
import type { TeamMember, TeamTaskStatus } from '../../../types/claude-teams';

// ============================================================================
// TIMELINE STYLE & COLOR MODE
// ============================================================================

export type TimelineStyle = 'svg-spine' | 'reactflow-swim' | 'echarts-dots' | 'canvas-arc';

export const TIMELINE_STYLES: TimelineStyle[] = [
  'svg-spine',
  'reactflow-swim',
  'echarts-dots',
  'canvas-arc',
];

export const TIMELINE_STYLE_LABELS: Record<TimelineStyle, string> = {
  'svg-spine': 'SVG Spine',
  'reactflow-swim': 'Swimlane',
  'echarts-dots': 'Dot Chart',
  'canvas-arc': 'Rainbow Arc',
};

export type TimelineColorMode = 'status' | 'agent' | 'priority' | 'rainbow';

export const TIMELINE_COLOR_MODES: TimelineColorMode[] = [
  'status',
  'agent',
  'priority',
  'rainbow',
];

export const TIMELINE_COLOR_MODE_LABELS: Record<TimelineColorMode, string> = {
  status: 'Status',
  agent: 'Agent',
  priority: 'Priority',
  rainbow: 'Rainbow',
};

// ============================================================================
// TIMELINE DATA (normalized from TeamSnapshot)
// ============================================================================

export interface TimelineNode {
  id: string;
  taskId: string;
  subject: string;
  description: string;
  status: TeamTaskStatus;
  owner: string | null;
  agent: TeamMember | null;
  blocks: string[];
  blockedBy: string[];
  timestamp: number;           // Epoch ms — sort key
  completedAt: number | null;  // Epoch ms if completed
  duration: number | null;     // ms elapsed
  metadata: Record<string, unknown>;
}

export interface TimelineData {
  teamName: string;
  nodes: TimelineNode[];       // Sorted chronologically
  agents: TeamMember[];
  timeRange: { start: number; end: number };
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  };
}

// ============================================================================
// RENDERER PROPS (shared interface for all 4 renderers)
// ============================================================================

export interface TimelineRendererProps {
  data: TimelineData;
  colorMode: TimelineColorMode;
  theme: string;               // Global theme name
  onNodeClick?: (nodeId: string) => void;
  expandedNodeId: string | null;
  className?: string;
}

// ============================================================================
// LAYOUT (adaptive density)
// ============================================================================

export interface TimelineLayout {
  spacing: number;
  nodeSize: number;
  fontSize: number;
  showLabels: boolean;
  compactMode: boolean;
}
