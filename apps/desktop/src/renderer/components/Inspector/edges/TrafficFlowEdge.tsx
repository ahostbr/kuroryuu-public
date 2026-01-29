/**
 * TrafficFlowEdge - Animated edge for network traffic visualization
 * Shows traffic flow with animated particles and color-coded status
 */
import React, { useMemo } from 'react';
import { BaseEdge, EdgeProps, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';

export interface TrafficFlowEdgeData {
  requestCount: number;
  errorCount: number;
  avgLatency?: number;
  isActive: boolean;
  lastEventTime?: string;
}

// Traffic status colors
const STATUS_COLORS = {
  success: '#22c55e',  // green
  error: '#ef4444',    // red
  normal: '#00ffff',   // cyan
  idle: '#64748b',     // slate
};

function formatLatency(ms?: number): string {
  if (!ms) return '';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCount(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1000000).toFixed(1)}M`;
}

export function TrafficFlowEdge({
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

  const edgeData = data as TrafficFlowEdgeData | undefined;

  // Determine color based on traffic status
  const color = useMemo(() => {
    if (!edgeData) return STATUS_COLORS.idle;
    if (edgeData.errorCount > 0) return STATUS_COLORS.error;
    if (edgeData.isActive) return STATUS_COLORS.success;
    return STATUS_COLORS.normal;
  }, [edgeData]);

  // Calculate stroke width based on traffic volume (1-5px)
  const strokeWidth = useMemo(() => {
    if (!edgeData?.requestCount) return 1;
    const scale = Math.min(Math.log10(edgeData.requestCount + 1) / 3, 1);
    return 1 + scale * 4;
  }, [edgeData?.requestCount]);

  const isActive = edgeData?.isActive || false;
  const opacity = isActive ? 0.8 : 0.4;
  const hasTraffic = edgeData?.requestCount && edgeData.requestCount > 0;

  // Animation speed based on activity
  const animDuration = isActive ? '1s' : '2s';

  return (
    <>
      {/* Glow effect for active edges */}
      {isActive && (
        <defs>
          <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}

      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth,
          opacity,
          filter: isActive ? `url(#glow-${id})` : undefined,
        }}
      />

      {/* Animated particles when active */}
      {isActive && (
        <>
          {/* Primary particle */}
          <circle r="4" fill={color}>
            <animateMotion dur={animDuration} repeatCount="indefinite" path={edgePath} />
          </circle>
          {/* Glow particle */}
          <circle r="8" fill={color} opacity="0.3">
            <animateMotion dur={animDuration} repeatCount="indefinite" path={edgePath} />
          </circle>
          {/* Secondary particle (offset) */}
          <circle r="3" fill={color}>
            <animateMotion dur={animDuration} repeatCount="indefinite" path={edgePath} begin="0.5s" />
          </circle>
        </>
      )}

      {/* Edge label with stats */}
      {hasTraffic && (
        <EdgeLabelRenderer>
          <div
            className="absolute pointer-events-auto nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <div
              className={`
                px-2 py-1 rounded text-[9px] font-mono
                bg-zinc-900/90 backdrop-blur border
                ${edgeData?.errorCount && edgeData.errorCount > 0
                  ? 'border-red-500/50 text-red-400'
                  : 'border-cyan-500/30 text-cyan-300'}
              `}
            >
              <div className="flex items-center gap-2">
                <span>{formatCount(edgeData?.requestCount || 0)}</span>
                {edgeData?.avgLatency && (
                  <span className="opacity-70">{formatLatency(edgeData.avgLatency)}</span>
                )}
              </div>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default TrafficFlowEdge;
