/**
 * TimelineReactFlow -- "Swimlane Flow" timeline renderer
 *
 * One of 4 bake-off renderers. Renders a horizontal swimlane grid using
 * ReactFlow where time flows left-to-right and agents are stacked vertically.
 * Tasks are positioned by chronological index on the X axis and agent lane
 * on the Y axis. A continuous smoothstep edge path connects tasks in order.
 * Dependency edges (blocks/blockedBy) are shown as dashed lines.
 *
 * ReactFlow provides zoom/pan/minimap natively. Custom nodes render the
 * task cards and swimlane labels within the flow canvas.
 */
import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  CheckCircle,
  Clock,
  Pause,
  AlertCircle,
  User,
  Link2,
  ArrowRight,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { TimelineRendererProps, TimelineNode } from './timeline-types';
import {
  resolveNodeColor,
  computeLayout,
  formatDuration,
  formatTime,
  isDramaticTheme,
  getThemeColors,
  mapToFlowTheme,
} from './timeline-utils';

// ============================================================================
// CONSTANTS
// ============================================================================

const LANE_HEIGHT = 120;
const LANE_LABEL_WIDTH = 160;
const X_PADDING = 180; // space for lane labels
const NODE_WIDTH = 220;
const NODE_HEIGHT_COLLAPSED = 60;
const NODE_HEIGHT_EXPANDED = 180;

// ============================================================================
// HELPER: Model badge
// ============================================================================

function getModelBadge(model: string): string {
  if (model.includes('opus')) return 'OPUS';
  if (model.includes('sonnet')) return 'SONNET';
  if (model.includes('haiku')) return 'HAIKU';
  return model.split('-').pop()?.toUpperCase() ?? 'MODEL';
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

const STATUS_ICONS: Record<string, React.ElementType> = {
  completed: CheckCircle,
  in_progress: Clock,
  pending: Pause,
  deleted: AlertCircle,
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  pending: 'Pending',
  deleted: 'Deleted',
};

// ============================================================================
// CUSTOM NODE: SwimlaneLabelNode
// ============================================================================

interface SwimlaneLabelData {
  label: string;
  member: {
    name: string;
    model: string;
    color?: string;
    agentType: string;
  } | null;
  color: string;
  laneHeight: number;
  laneIndex: number;
  totalLanes: number;
  [key: string]: unknown;
}

const SwimlaneLabelNode = React.memo(function SwimlaneLabelNode({
  data,
}: NodeProps) {
  const nodeData = data as unknown as SwimlaneLabelData;
  const { label, member, color, laneHeight } = nodeData;
  const agentColor = member?.color ?? color;

  return (
    <div
      className="flex flex-col items-start justify-center gap-1 px-3 select-none"
      style={{
        width: LANE_LABEL_WIDTH - 20,
        height: laneHeight - 20,
        background: 'rgba(30, 30, 40, 0.6)',
        borderRight: `2px solid ${agentColor}40`,
        borderRadius: '6px 0 0 6px',
      }}
    >
      {/* Agent color dot + name */}
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{
            backgroundColor: agentColor,
            boxShadow: `0 0 6px ${agentColor}80`,
          }}
        />
        <span
          className="text-xs font-bold truncate max-w-[100px]"
          style={{ color: '#e5e5e5' }}
          title={label}
        >
          {label}
        </span>
      </div>

      {/* Model badge */}
      {member && (
        <span
          className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ml-5"
          style={{
            backgroundColor: `${agentColor}20`,
            color: agentColor,
            border: `1px solid ${agentColor}30`,
          }}
        >
          {getModelBadge(member.model)}
        </span>
      )}
    </div>
  );
});

// ============================================================================
// CUSTOM NODE: SwimlaneBandNode (background band for lane separation)
// ============================================================================

interface SwimlaneBandData {
  laneWidth: number;
  laneHeight: number;
  isEven: boolean;
  [key: string]: unknown;
}

const SwimlaneBandNode = React.memo(function SwimlaneBandNode({
  data,
}: NodeProps) {
  const nodeData = data as unknown as SwimlaneBandData;
  const { laneWidth, laneHeight, isEven } = nodeData;

  return (
    <div
      style={{
        width: laneWidth,
        height: laneHeight,
        background: isEven
          ? 'rgba(255, 255, 255, 0.02)'
          : 'rgba(0, 0, 0, 0.15)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        pointerEvents: 'none',
      }}
    />
  );
});

// ============================================================================
// CUSTOM NODE: TimelineFlowNode
// ============================================================================

interface TimelineFlowNodeData {
  node: TimelineNode;
  color: string;
  isExpanded: boolean;
  [key: string]: unknown;
}

const TimelineFlowNode = React.memo(function TimelineFlowNode({
  data,
}: NodeProps) {
  const nodeData = data as unknown as TimelineFlowNodeData;
  const { node, color, isExpanded } = nodeData;
  const StatusIcon = STATUS_ICONS[node.status] ?? Pause;

  return (
    <div
      className="rounded-lg backdrop-blur-sm select-none cursor-pointer"
      style={{
        width: NODE_WIDTH,
        minHeight: isExpanded ? NODE_HEIGHT_EXPANDED : NODE_HEIGHT_COLLAPSED,
        background: 'var(--card, rgba(30, 30, 40, 0.95))',
        color: 'var(--card-foreground, #e5e5e5)',
        borderLeft: `3px solid ${color}`,
        border: `1px solid ${color}40`,
        borderLeftWidth: 3,
        borderLeftColor: color,
        boxShadow: `0 2px 8px rgba(0,0,0,0.3), inset 0 0 0 1px ${color}15`,
      }}
    >
      {/* Left handle for incoming edges */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !border-[1.5px]"
        style={{
          backgroundColor: color,
          borderColor: 'rgba(30, 30, 40, 0.95)',
          left: -5,
        }}
      />

      {/* Right handle for outgoing edges */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !border-[1.5px]"
        style={{
          backgroundColor: color,
          borderColor: 'rgba(30, 30, 40, 0.95)',
          right: -5,
        }}
      />

      {/* Header row: ID badge + subject + status icon */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{ background: color, color: '#000' }}
        >
          #{node.taskId}
        </span>
        <span className="text-xs font-medium truncate flex-1" title={node.subject}>
          {node.subject}
        </span>
        <StatusIcon size={14} style={{ color, flexShrink: 0 }} />
        {isExpanded ? (
          <ChevronDown size={12} className="shrink-0 opacity-40" />
        ) : (
          <ChevronRight size={12} className="shrink-0 opacity-40" />
        )}
      </div>

      {/* Owner + duration row */}
      <div className="flex items-center gap-2 px-3 pb-2 text-[11px]" style={{ color: '#aaa' }}>
        {node.owner && (
          <span className="flex items-center gap-1">
            <User size={10} />
            {node.owner}
          </span>
        )}
        <span className="ml-auto">
          {formatDuration(node.duration)}
        </span>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div
          className="border-t px-3 py-2 space-y-1.5"
          style={{ borderColor: `${color}33` }}
        >
          {/* Status */}
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: '#888' }}>Status:</span>
            <span className="font-medium" style={{ color }}>
              {STATUS_LABELS[node.status] ?? node.status}
            </span>
          </div>

          {/* Agent model */}
          {node.agent && (
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: '#888' }}>Model:</span>
              <span
                className="text-[10px] font-bold px-1 py-0.5 rounded"
                style={{
                  background: `${color}22`,
                  color,
                  border: `1px solid ${color}44`,
                }}
              >
                {getModelBadge(node.agent.model)}
              </span>
            </div>
          )}

          {/* Timestamp */}
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: '#888' }}>Created:</span>
            <span>{formatTime(node.timestamp)}</span>
          </div>

          {/* Description */}
          {node.description && (
            <div className="text-xs mt-1" style={{ color: '#888' }}>
              <div className="line-clamp-3">{node.description}</div>
            </div>
          )}

          {/* Dependencies: blocks */}
          {node.blocks.length > 0 && (
            <div className="flex items-center gap-1 text-[11px]" style={{ color: '#888' }}>
              <Link2 size={10} />
              <span>Blocks:</span>
              {node.blocks.map((id) => (
                <span key={id} className="font-mono">#{id}</span>
              ))}
            </div>
          )}

          {/* Dependencies: blocked by */}
          {node.blockedBy.length > 0 && (
            <div className="flex items-center gap-1 text-[11px]" style={{ color: '#888' }}>
              <ArrowRight size={10} />
              <span>Blocked by:</span>
              {node.blockedBy.map((id) => (
                <span key={id} className="font-mono">#{id}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// NODE TYPES REGISTRY
// ============================================================================

const timelineNodeTypes: NodeTypes = {
  'timeline-task': TimelineFlowNode,
  'swimlane-label': SwimlaneLabelNode,
  'swimlane-band': SwimlaneBandNode,
};

// ============================================================================
// LAYOUT: buildSwimlaneLayout()
// ============================================================================

interface SwimlaneLayoutResult {
  rfNodes: Node[];
  rfEdges: Edge[];
  totalWidth: number;
  totalHeight: number;
}

function buildSwimlaneLayout(
  data: TimelineRendererProps['data'],
  colorMode: TimelineRendererProps['colorMode'],
  expandedNodeId: string | null,
  layout: ReturnType<typeof computeLayout>,
): SwimlaneLayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Derive unique agent lanes (preserving order of first appearance)
  const agentOrder: string[] = [];
  for (const n of data.nodes) {
    const owner = n.owner ?? 'Unassigned';
    if (!agentOrder.includes(owner)) {
      agentOrder.push(owner);
    }
  }

  // If there are no agents yet, create a single "Unassigned" lane
  if (agentOrder.length === 0) {
    agentOrder.push('Unassigned');
  }

  const xSpacing = layout.spacing;
  const totalWidth = X_PADDING + data.nodes.length * xSpacing + 100;
  const totalHeight = agentOrder.length * LANE_HEIGHT;

  // ── Swimlane background bands ──────────────────────────────────────
  agentOrder.forEach((agent, laneIdx) => {
    nodes.push({
      id: `band-${agent}`,
      type: 'swimlane-band',
      position: { x: 0, y: laneIdx * LANE_HEIGHT },
      data: {
        laneWidth: Math.max(totalWidth, 1200),
        laneHeight: LANE_HEIGHT,
        isEven: laneIdx % 2 === 0,
      } as SwimlaneBandData,
      draggable: false,
      selectable: false,
      style: { zIndex: -2 },
    });
  });

  // ── Swimlane labels ────────────────────────────────────────────────
  agentOrder.forEach((agent, laneIdx) => {
    const member = data.agents.find((a) => a.name === agent) ?? null;

    // Derive a color for this agent lane
    const agentIndex = data.agents.findIndex((a) => a.name === agent);
    const agentColor =
      agentIndex >= 0
        ? `hsl(${(agentIndex * 360) / Math.max(data.agents.length, 1)}, 70%, 55%)`
        : '#6b7280';

    nodes.push({
      id: `lane-${agent}`,
      type: 'swimlane-label',
      position: { x: 8, y: laneIdx * LANE_HEIGHT + 10 },
      data: {
        label: agent,
        member: member
          ? {
              name: member.name,
              model: member.model,
              color: member.color,
              agentType: member.agentType,
            }
          : null,
        color: agentColor,
        laneHeight: LANE_HEIGHT,
        laneIndex: laneIdx,
        totalLanes: agentOrder.length,
      } as SwimlaneLabelData,
      draggable: false,
      selectable: false,
    });
  });

  // ── Task nodes ─────────────────────────────────────────────────────
  // Map from timeline node ID to resolved color for edge coloring
  const colorMap = new Map<string, string>();

  data.nodes.forEach((node, i) => {
    const agent = node.owner ?? 'Unassigned';
    const laneIdx = agentOrder.indexOf(agent);
    const color = resolveNodeColor(node, colorMode, i, data.nodes.length, data.agents);
    colorMap.set(node.id, color);

    const isExpanded = expandedNodeId === node.id;
    const nodeHeight = isExpanded ? NODE_HEIGHT_EXPANDED : NODE_HEIGHT_COLLAPSED;

    nodes.push({
      id: node.id,
      type: 'timeline-task',
      position: {
        x: X_PADDING + i * xSpacing,
        y: laneIdx * LANE_HEIGHT + (LANE_HEIGHT - nodeHeight) / 2,
      },
      data: {
        node,
        color,
        isExpanded,
      } as TimelineFlowNodeData,
      draggable: false,
    });
  });

  // ── Chronological edges (task N -> task N+1) ───────────────────────
  for (let i = 0; i < data.nodes.length - 1; i++) {
    const sourceNode = data.nodes[i];
    const targetNode = data.nodes[i + 1];
    const sourceColor = colorMap.get(sourceNode.id) ?? '#666';
    const isAnimated = sourceNode.status === 'in_progress';

    edges.push({
      id: `chrono-${sourceNode.id}-${targetNode.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      type: 'smoothstep',
      animated: isAnimated,
      style: {
        stroke: sourceColor,
        strokeWidth: 2,
        opacity: 0.7,
      },
    });
  }

  // ── Dependency edges (blocks/blockedBy) ────────────────────────────
  const nodeIdSet = new Set(data.nodes.map((n) => n.id));
  const taskIdToTimelineId = new Map<string, string>();
  data.nodes.forEach((n) => {
    taskIdToTimelineId.set(n.taskId, n.id);
  });

  data.nodes.forEach((node) => {
    // "blocks" edges: this node -> nodes it blocks
    for (const blockedTaskId of node.blocks) {
      const targetId = taskIdToTimelineId.get(blockedTaskId);
      if (targetId && nodeIdSet.has(targetId)) {
        edges.push({
          id: `dep-${node.id}-blocks-${targetId}`,
          source: node.id,
          target: targetId,
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: '#f97316',
            strokeWidth: 1.5,
            strokeDasharray: '5 5',
            opacity: 0.5,
          },
          label: 'blocks',
          labelStyle: {
            fontSize: 9,
            fill: '#f9731680',
          },
        });
      }
    }
  });

  return { rfNodes: nodes, rfEdges: edges, totalWidth, totalHeight };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TimelineReactFlow({
  data,
  colorMode,
  theme,
  onNodeClick,
  expandedNodeId,
  className,
}: TimelineRendererProps) {
  const layout = useMemo(() => computeLayout(data.nodes.length), [data.nodes.length]);
  const dramatic = isDramaticTheme(theme);
  const flowTheme = mapToFlowTheme(theme);
  const themeColors = getThemeColors(flowTheme);

  // Build swimlane layout
  const { rfNodes, rfEdges } = useMemo(
    () => buildSwimlaneLayout(data, colorMode, expandedNodeId, layout),
    [data, colorMode, expandedNodeId, layout],
  );

  // Handle node clicks -- toggle expansion
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'timeline-task') {
        onNodeClick?.(node.id);
      }
    },
    [onNodeClick],
  );

  // MiniMap node color resolver
  const minimapNodeColor = useCallback(
    (node: Node): string => {
      if (node.type === 'timeline-task') {
        const nd = node.data as unknown as TimelineFlowNodeData;
        return nd.color ?? '#666';
      }
      if (node.type === 'swimlane-label') {
        return 'transparent';
      }
      return 'transparent';
    },
    [],
  );

  // ── Empty state ──────────────────────────────────────────────────────
  if (data.nodes.length === 0) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className ?? ''}`}>
        <div className="text-center space-y-2">
          <div
            className="text-lg font-semibold opacity-40"
            style={{ color: themeColors.nodeText }}
          >
            No tasks to display
          </div>
          <div className="text-xs opacity-25" style={{ color: themeColors.nodeText }}>
            Tasks will appear as swimlane cards when created
          </div>
        </div>
      </div>
    );
  }

  // Determine background color based on theme
  const bgColor = dramatic ? '#0a0a0f' : '#1a1a24';
  const gridColor = dramatic ? `${themeColors.hub}15` : 'rgba(255,255,255,0.04)';

  return (
    <div
      className={`absolute inset-0 ${className ?? ''}`}
      style={{ background: bgColor }}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={timelineNodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.5 }}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnScroll={true}
        zoomOnScroll={true}
        defaultEdgeOptions={{
          style: { strokeWidth: 2 },
        }}
      >
        <Background
          color={gridColor}
          gap={20}
          size={1}
        />
        <Controls
          showZoom
          showFitView
          showInteractive={false}
          style={{
            background: 'rgba(30, 30, 40, 0.9)',
            border: `1px solid ${themeColors.hub}30`,
            borderRadius: 8,
          }}
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(0, 0, 0, 0.8)"
          style={{
            background: 'rgba(20, 20, 30, 0.9)',
            border: `1px solid ${themeColors.hub}20`,
            borderRadius: 6,
          }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
