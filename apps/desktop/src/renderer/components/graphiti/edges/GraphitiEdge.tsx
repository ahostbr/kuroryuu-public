/**
 * GraphitiEdge - Custom edge with animated particles for unified graph
 * Shows data flow between nodes with color-coded status and optional labels
 */
import React from 'react';
import { BaseEdge, EdgeProps, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';
import type { GraphitiEdgeType, GraphitiTheme } from '../../../types/graphiti-event';

interface GraphitiEdgeData {
  type: GraphitiEdgeType;
  label?: string;
  eventCount: number;
  errorCount: number;
  avgLatency?: number;
  status: 'active' | 'idle' | 'error';
  theme: GraphitiTheme;
}

// Color mapping by edge type and theme
const EDGE_COLORS: Record<GraphitiTheme, Record<string, string>> = {
  cyberpunk: {
    request: '#00ffff',
    response: '#00ff00',
    triggers: '#ff00ff',
    assigned_to: '#ffff00',
    produces: '#00ffff',
    correlates: '#666666',
    error: '#ff0000',
  },
  kuroryuu: {
    request: '#c9a227',
    response: '#8b6914',
    triggers: '#d4af37',
    assigned_to: '#9a8a6a',
    produces: '#c9a227',
    correlates: '#666666',
    error: '#ff4444',
  },
  retro: {
    request: '#d97706',
    response: '#ea580c',
    triggers: '#f59e0b',
    assigned_to: '#fbbf24',
    produces: '#d97706',
    correlates: '#666666',
    error: '#ef4444',
  },
  default: {
    request: '#3b82f6',
    response: '#22c55e',
    triggers: '#a855f7',
    assigned_to: '#eab308',
    produces: '#3b82f6',
    correlates: '#666666',
    error: '#ef4444',
  },
};

function formatLatency(ms?: number): string {
  if (!ms) return '';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function GraphitiEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = data as GraphitiEdgeData | undefined;
  const theme = edgeData?.theme || 'default';
  const edgeType = edgeData?.type || 'correlates';
  const status = edgeData?.status || 'idle';
  const themeColors = EDGE_COLORS[theme] || EDGE_COLORS.default;

  // Determine edge color based on status and type
  let color = themeColors[edgeType] || themeColors.correlates;
  if (status === 'error' || (edgeData?.errorCount && edgeData.errorCount > 0)) {
    color = themeColors.error;
  }

  const animated = status === 'active';
  const strokeWidth = status === 'error' ? 3 : 2;
  const opacity = status === 'idle' ? 0.4 : 0.7;

  // Show label with stats
  const showLabel = edgeData?.label || (edgeData?.eventCount && edgeData.eventCount > 0);
  const labelText = edgeData?.label
    ? `${edgeData.label} (${edgeData.eventCount})`
    : `${edgeData?.eventCount || 0}`;

  return (
    <>
      {/* Main edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth,
          opacity,
        }}
      />

      {/* Animated particle for active edges */}
      {animated && (
        <>
          <circle r="3" fill={color} className="graphiti-particle">
            <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="6" fill={color} opacity="0.3" className="graphiti-particle-glow">
            <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
          </circle>
        </>
      )}

      {/* Edge label */}
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className="absolute pointer-events-auto nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <div
              className={`
                px-2 py-0.5 rounded text-[10px] font-medium
                bg-card/90 backdrop-blur border border-border
                ${status === 'error' ? 'text-red-400 border-red-500/50' : 'text-muted-foreground'}
              `}
            >
              {labelText}
              {edgeData?.avgLatency && (
                <span className="ml-1 opacity-70">{formatLatency(edgeData.avgLatency)}</span>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
