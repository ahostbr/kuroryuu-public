import { BaseEdge, EdgeProps, getSmoothStepPath } from '@xyflow/react';

export function WorkflowGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16
  });

  const isPrimary = data?.isPrimary || false;
  const isCompleted = data?.isCompleted || false;
  const isActive = data?.isActive || false;

  // Color based on state
  const strokeColor = isCompleted
    ? '#22c55e' // green
    : isActive
      ? '#3b82f6' // blue
      : '#475569'; // gray

  const strokeWidth = isPrimary ? 3 : 2;

  return (
    <>
      {/* Base path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          opacity: 0.6
        }}
      />

      {/* Animated glow */}
      {(isPrimary || isActive) && (
        <path
          d={edgePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth + 4}
          opacity={0.3}
          className="animate-pulse-slow"
          style={{ filter: 'blur(4px)' }}
        />
      )}

      {/* Flowing particle (CSS animation) */}
      {isActive && (
        <circle r="4" fill="#60a5fa">
          <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </>
  );
}
