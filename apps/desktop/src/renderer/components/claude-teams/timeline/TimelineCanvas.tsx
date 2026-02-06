/**
 * TimelineCanvas — "Rainbow Arc" timeline renderer
 *
 * One of 4 bake-off renderers. Draws a sweeping quadratic bezier arc
 * across the canvas with a progressive HSL rainbow gradient. Task markers
 * sit along the curve and expand into TimelineTaskCard overlays on click.
 *
 * Dramatic themes get a progressive draw animation with a trailing glow;
 * default themes render immediately.
 */
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import type { TimelineRendererProps } from './timeline-types';
import { TimelineTaskCard } from './TimelineTaskCard';
import {
  resolveNodeColor,
  computeLayout,
  rainbowArcPoints,
  quadraticBezierPoint,
  isDramaticTheme,
  formatDuration,
} from './timeline-utils';

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  pending: 'Pending',
  deleted: 'Deleted',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARC_SEGMENTS = 120;
const ARC_LINE_WIDTH = 3;
const GLOW_LINE_WIDTH = 8;
const GLOW_ALPHA = 0.25;
const ANIMATION_DURATION_MS = 1800;
const LABEL_OFFSET_Y = 8;
const HIT_RADIUS_EXTRA = 4; // extra pixels beyond nodeSize for easier clicks

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimelineCanvas({
  data,
  colorMode,
  theme,
  onNodeClick,
  expandedNodeId,
  className,
}: TimelineRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markerPositions = useRef<{ x: number; y: number }[]>([]);
  const animFrameRef = useRef<number>(0);
  const animStartRef = useRef<number>(0);

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [size, setSize] = useState({ width: 800, height: 400 });
  const [drawProgress, setDrawProgress] = useState(1); // 0..1

  // ── Pre-computed values ──────────────────────────────────────────────
  const colors = useMemo(
    () =>
      data.nodes.map((node, i) =>
        resolveNodeColor(node, colorMode, i, data.nodes.length, data.agents)
      ),
    [data, colorMode]
  );

  const layout = useMemo(
    () => computeLayout(data.nodes.length),
    [data.nodes.length]
  );

  const dramatic = isDramaticTheme(theme);

  // ── Marker t-values for each node ────────────────────────────────────
  const markerTs = useMemo(() => {
    const count = data.nodes.length;
    if (count === 0) return [];
    if (count === 1) return [0.5];
    return data.nodes.map((_, i) => i / (count - 1));
  }, [data.nodes.length]);

  // ── ResizeObserver ───────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setSize({
          width: Math.max(width, 200),
          height: Math.max(height, 200),
        });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Dramatic animation driver ────────────────────────────────────────
  useEffect(() => {
    if (!dramatic || data.nodes.length === 0) {
      setDrawProgress(1);
      return;
    }

    // Reset and start animation
    setDrawProgress(0);
    animStartRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - animStartRef.current;
      const t = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
      // ease-out cubic for a satisfying deceleration
      const eased = 1 - Math.pow(1 - t, 3);
      setDrawProgress(eased);
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [dramatic, data.nodes.length, size]);

  // ── Canvas draw ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = size;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);

    if (data.nodes.length === 0) {
      // Draw a subtle message for empty state
      ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No tasks to display', width / 2, height / 2);
      markerPositions.current = [];
      return;
    }

    const arcPts = rainbowArcPoints(width, height);
    const [sx, sy, cpx, cpy, ex, ey] = arcPts;

    // Determine how many segments to actually draw based on progress
    const visibleSegments = Math.floor(drawProgress * ARC_SEGMENTS);

    // ── Draw rainbow arc ───────────────────────────────────────────────
    // Glow pass (dramatic themes only)
    if (dramatic && visibleSegments > 0) {
      for (let i = 0; i < visibleSegments; i++) {
        const t0 = i / ARC_SEGMENTS;
        const t1 = (i + 1) / ARC_SEGMENTS;
        const p0 = quadraticBezierPoint(t0, sx, sy, cpx, cpy, ex, ey);
        const p1 = quadraticBezierPoint(t1, sx, sy, cpx, cpy, ex, ey);

        const hue = (t0 * 360) % 360;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = `hsla(${hue}, 80%, 55%, ${GLOW_ALPHA})`;
        ctx.lineWidth = GLOW_LINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // Main arc pass
    for (let i = 0; i < visibleSegments; i++) {
      const t0 = i / ARC_SEGMENTS;
      const t1 = (i + 1) / ARC_SEGMENTS;
      const p0 = quadraticBezierPoint(t0, sx, sy, cpx, cpy, ex, ey);
      const p1 = quadraticBezierPoint(t1, sx, sy, cpx, cpy, ex, ey);

      const hue = (t0 * 360) % 360;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = `hsl(${hue}, 80%, 55%)`;
      ctx.lineWidth = ARC_LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // ── Leading glow dot for dramatic animation ────────────────────────
    if (dramatic && drawProgress > 0 && drawProgress < 1) {
      const leadT = drawProgress;
      const leadPt = quadraticBezierPoint(leadT, sx, sy, cpx, cpy, ex, ey);
      const leadHue = (leadT * 360) % 360;

      const gradient = ctx.createRadialGradient(
        leadPt.x, leadPt.y, 0,
        leadPt.x, leadPt.y, 18
      );
      gradient.addColorStop(0, `hsla(${leadHue}, 90%, 70%, 0.9)`);
      gradient.addColorStop(0.5, `hsla(${leadHue}, 80%, 55%, 0.3)`);
      gradient.addColorStop(1, `hsla(${leadHue}, 80%, 55%, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(leadPt.x, leadPt.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Draw task markers ──────────────────────────────────────────────
    const positions: { x: number; y: number }[] = [];
    const nodeRadius = layout.nodeSize;

    for (let i = 0; i < data.nodes.length; i++) {
      const t = markerTs[i];
      const pos = quadraticBezierPoint(t, sx, sy, cpx, cpy, ex, ey);
      positions.push(pos);

      // Only show marker if the arc has reached this point
      if (t > drawProgress) continue;

      const color = colors[i];
      const isHovered = hoveredIdx === i;
      const isExpanded = data.nodes[i].id === expandedNodeId;
      const radius = isHovered || isExpanded ? nodeRadius * 1.4 : nodeRadius;

      // Marker outer glow
      if (isHovered || isExpanded) {
        const glow = ctx.createRadialGradient(
          pos.x, pos.y, radius * 0.5,
          pos.x, pos.y, radius * 2.5
        );
        glow.addColorStop(0, color.replace(')', ', 0.4)').replace('hsl(', 'hsla(').replace('rgb(', 'rgba('));
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Marker fill
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Marker border
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.stroke();

      // Inner highlight
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - radius * 0.2, radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fill();

      // ── Label ────────────────────────────────────────────────────────
      if (layout.showLabels) {
        const label = data.nodes[i].subject;
        const maxLabelWidth = Math.min(layout.spacing - 10, 140);
        ctx.font = `${layout.fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(220, 220, 230, 0.85)';

        // Task ID above
        ctx.font = `bold ${layout.fontSize - 2}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(
          `#${data.nodes[i].taskId}`,
          pos.x,
          pos.y + radius + LABEL_OFFSET_Y
        );

        // Subject below ID
        ctx.font = `${layout.fontSize - 1}px system-ui, -apple-system, sans-serif`;
        const truncated = truncateText(ctx, label, maxLabelWidth);
        ctx.fillText(
          truncated,
          pos.x,
          pos.y + radius + LABEL_OFFSET_Y + layout.fontSize
        );
      }
    }

    markerPositions.current = positions;
  }, [data, colors, layout, size, drawProgress, dramatic, hoveredIdx, expandedNodeId, markerTs]);

  // ── Mouse move — hit detection ───────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const hitRadius = layout.nodeSize + HIT_RADIUS_EXTRA;
      let found: number | null = null;

      for (let i = 0; i < markerPositions.current.length; i++) {
        const pos = markerPositions.current[i];
        const dx = mx - pos.x;
        const dy = my - pos.y;
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          found = i;
          break;
        }
      }

      setHoveredIdx(found);
    },
    [layout.nodeSize]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIdx(null);
  }, []);

  // ── Click ────────────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (hoveredIdx !== null && hoveredIdx < data.nodes.length) {
      onNodeClick?.(data.nodes[hoveredIdx].id);
    }
  }, [hoveredIdx, data, onNodeClick]);

  // ── Cleanup animation on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden ${className ?? ''}`}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: size.width,
          height: size.height,
          cursor: hoveredIdx !== null ? 'pointer' : 'default',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />

      {/* Hover tooltip */}
      {hoveredIdx !== null && hoveredIdx < data.nodes.length && expandedNodeId !== data.nodes[hoveredIdx].id && (() => {
        const node = data.nodes[hoveredIdx];
        const color = colors[hoveredIdx];
        const pos = markerPositions.current[hoveredIdx];
        if (!pos) return null;

        const tooltipWidth = 240;
        let left = pos.x - tooltipWidth / 2;
        left = Math.max(8, Math.min(left, size.width - tooltipWidth - 8));
        const above = pos.y > size.height / 2;
        const top = above ? pos.y - layout.nodeSize - 80 : pos.y + layout.nodeSize + 12;

        return (
          <div style={{ position: 'absolute', left, top, zIndex: 40, pointerEvents: 'none', width: tooltipWidth }}>
            <div style={{ background: 'rgba(15,15,25,0.95)', border: `1px solid ${color}40`, borderRadius: 8, padding: '8px 10px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
              <div style={{ color, fontWeight: 'bold', fontSize: 13 }}>#{node.taskId} {node.subject}</div>
              <div style={{ color: '#aaa', fontSize: 11, marginTop: 4 }}>
                {STATUS_LABELS[node.status] ?? node.status} | {node.owner ?? 'Unassigned'} | {formatDuration(node.duration)}
              </div>
              {node.description && (
                <div style={{ color: '#777', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
                  {node.description.length > 120 ? node.description.slice(0, 118) + '...' : node.description}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Expanded card overlay */}
      {expandedNodeId &&
        (() => {
          const idx = data.nodes.findIndex((n) => n.id === expandedNodeId);
          if (idx < 0) return null;
          const pos = markerPositions.current[idx];
          if (!pos) return null;
          const node = data.nodes[idx];
          const color = colors[idx];

          // Position the card above the marker, clamped to stay within bounds
          const cardWidth = 260;
          const cardHeight = 140;
          let left = pos.x - cardWidth / 2;
          let top = pos.y - cardHeight - layout.nodeSize - 12;

          // Clamp horizontally
          left = Math.max(8, Math.min(left, size.width - cardWidth - 8));
          // If card would go above canvas, place below instead
          if (top < 8) {
            top = pos.y + layout.nodeSize + 12;
          }

          return (
            <div
              style={{
                position: 'absolute',
                left,
                top,
                zIndex: 50,
                pointerEvents: 'auto',
              }}
            >
              <TimelineTaskCard
                node={node}
                color={color}
                isExpanded={true}
                onClick={() => onNodeClick?.(node.id)}
              />
            </div>
          );
        })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncate text to fit within maxWidth, appending ellipsis if needed.
 */
function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '\u2026').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '\u2026';
}
