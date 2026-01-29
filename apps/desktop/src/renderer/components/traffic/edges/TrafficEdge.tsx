/**
 * TrafficEdge - Custom edge with animated particles for traffic flow
 * Shows traffic flowing from gateway to endpoints with color-coded status
 */
import React from 'react';
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

export function TrafficEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = (data?.color as string) || '#00ffff';
  const animated = data?.animated !== false;

  return (
    <>
      {/* Main edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: 2,
          opacity: 0.6,
        }}
      />

      {/* Animated particle */}
      {animated && (
        <circle r="4" fill={color} className="traffic-particle">
          <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}

      {/* Glow effect */}
      {animated && (
        <circle r="8" fill={color} opacity="0.3" className="traffic-particle-glow">
          <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </>
  );
}
