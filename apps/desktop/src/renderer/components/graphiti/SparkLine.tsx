/**
 * SparkLine - Animated SVG sparkline chart for KPI cards
 * Features:
 * - Smooth path drawing animation on mount
 * - Pulsing current value dot
 * - Gradient fill area
 * - Theme-aware styling via CSS variables
 */
import React, { useMemo, useRef, useEffect, useState } from 'react';

interface SparkLineProps {
  /** Array of data points (0-100 normalized or raw values) */
  data: number[];
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Whether to animate on mount */
  animate?: boolean;
  /** Whether to show the current value dot */
  showDot?: boolean;
  /** Whether to show the fill area under the line */
  showFill?: boolean;
  /** Stroke width for the line */
  strokeWidth?: number;
  /** Optional className */
  className?: string;
  /** Min value for normalization (auto-calculated if not provided) */
  minValue?: number;
  /** Max value for normalization (auto-calculated if not provided) */
  maxValue?: number;
}

/**
 * Normalize data points to 0-1 range
 */
function normalizeData(
  data: number[],
  min?: number,
  max?: number
): { normalized: number[]; actualMin: number; actualMax: number } {
  if (data.length === 0) {
    return { normalized: [], actualMin: 0, actualMax: 0 };
  }

  const actualMin = min ?? Math.min(...data);
  const actualMax = max ?? Math.max(...data);
  const range = actualMax - actualMin || 1;

  const normalized = data.map((v) => (v - actualMin) / range);
  return { normalized, actualMin, actualMax };
}

/**
 * Generate SVG path data from normalized points
 */
function generatePath(
  normalized: number[],
  width: number,
  height: number,
  padding: number = 2
): { linePath: string; fillPath: string; lastPoint: { x: number; y: number } } {
  if (normalized.length === 0) {
    return { linePath: '', fillPath: '', lastPoint: { x: 0, y: 0 } };
  }

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const stepX = innerWidth / Math.max(normalized.length - 1, 1);

  const points = normalized.map((v, i) => ({
    x: padding + i * stepX,
    // Invert Y because SVG origin is top-left
    y: padding + innerHeight * (1 - v),
  }));

  // Build line path with smooth curves (quadratic bezier)
  let linePath = `M ${points[0].x},${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    // Control point at midpoint for smooth curve
    const cpX = (prev.x + curr.x) / 2;
    linePath += ` Q ${cpX},${prev.y} ${cpX},${(prev.y + curr.y) / 2}`;

    if (i === points.length - 1) {
      linePath += ` T ${curr.x},${curr.y}`;
    }
  }

  // Simpler line path for cleaner rendering
  linePath = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    linePath += ` L ${points[i].x},${points[i].y}`;
  }

  // Fill path closes the area under the curve
  const fillPath = `${linePath} L ${points[points.length - 1].x},${height - padding} L ${padding},${height - padding} Z`;

  const lastPoint = points[points.length - 1];

  return { linePath, fillPath, lastPoint };
}

export function SparkLine({
  data,
  width = 60,
  height = 20,
  animate = true,
  showDot = true,
  showFill = true,
  strokeWidth = 1.5,
  className = '',
  minValue,
  maxValue,
}: SparkLineProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);
  const [isAnimated, setIsAnimated] = useState(false);

  // Normalize and generate paths
  const { linePath, fillPath, lastPoint } = useMemo(() => {
    const { normalized } = normalizeData(data, minValue, maxValue);
    return generatePath(normalized, width, height);
  }, [data, width, height, minValue, maxValue]);

  // Calculate path length for animation
  useEffect(() => {
    if (pathRef.current && animate && !isAnimated) {
      const length = pathRef.current.getTotalLength();
      setPathLength(length);
      // Small delay to ensure CSS animation starts correctly
      const timer = setTimeout(() => setIsAnimated(true), 50);
      return () => clearTimeout(timer);
    }
  }, [linePath, animate, isAnimated]);

  // Reset animation when data changes significantly
  useEffect(() => {
    if (animate) {
      setIsAnimated(false);
    }
  }, [data.length, animate]);

  if (data.length === 0) {
    return (
      <svg
        className={`graphiti-sparkline ${className}`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {/* Empty state - flat line */}
        <line
          x1={2}
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.2}
          strokeDasharray="2,2"
        />
      </svg>
    );
  }

  const animationStyle: React.CSSProperties = animate && pathLength > 0
    ? {
        strokeDasharray: pathLength,
        strokeDashoffset: isAnimated ? 0 : pathLength,
        transition: isAnimated ? 'stroke-dashoffset 0.8s ease-out' : 'none',
      }
    : {};

  return (
    <svg
      className={`graphiti-sparkline ${className}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <defs>
        {/* Gradient for fill area */}
        <linearGradient id="sparkFillGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--g-spark-fill, rgba(59, 130, 246, 0.3))" />
          <stop offset="100%" stopColor="var(--g-spark-fill, rgba(59, 130, 246, 0))" stopOpacity="0" />
        </linearGradient>

        {/* Glow filter for the line */}
        <filter id="sparkGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Fill area under the curve */}
      {showFill && fillPath && (
        <path
          className="graphiti-sparkline-fill"
          d={fillPath}
          fill="url(#sparkFillGradient)"
        />
      )}

      {/* Main line with optional animation */}
      <path
        ref={pathRef}
        className={`graphiti-sparkline-line ${animate && isAnimated ? 'graphiti-sparkline-line--animate' : ''}`}
        d={linePath}
        fill="none"
        stroke="var(--g-spark-stroke, #3b82f6)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#sparkGlow)"
        style={animationStyle}
      />

      {/* Current value dot */}
      {showDot && lastPoint && (
        <circle
          className="graphiti-sparkline-dot graphiti-sparkline-dot--pulse"
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={2.5}
          fill="var(--g-spark-dot, #60a5fa)"
        >
          <animate
            attributeName="r"
            values="2;3;2"
            dur="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="1;0.7;1"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </svg>
  );
}

export default SparkLine;
