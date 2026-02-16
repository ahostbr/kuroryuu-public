import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import type { TimelineRendererProps, TimelineNode } from './timeline-types';
import { TimelineTaskCard } from './TimelineTaskCard';
import {
  resolveNodeColor,
  computeBuckets,
  formatTime,
  isDramaticTheme,
  mapToFlowTheme,
  getThemeColors,
} from './timeline-utils';

/**
 * Canvas 2D heatmap timeline renderer - "Density Ridge" (seismograph/EEG readout)
 * Time flows left-to-right, rows = grouping key (status/agent/priority), cell intensity = event count
 */
export function TimelineDensityRidge({
  data,
  colorMode,
  theme,
  onNodeClick,
  expandedNodeId,
  className,
}: TimelineRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [hoveredCell, setHoveredCell] = useState<{
    row: number;
    col: number;
    events: TimelineNode[];
    x: number;
    y: number;
  } | null>(null);

  // Track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Compute rows based on color mode
  const rows = useMemo(() => {
    switch (colorMode) {
      case 'status':
        return ['pending', 'in_progress', 'completed'];
      case 'agent':
      case 'rainbow': {
        const names = data.agents.map((a) => a.name);
        return names.length > 0 ? names : ['Unassigned'];
      }
      case 'priority':
        return ['critical', 'high', 'medium', 'low'];
      default:
        return ['pending', 'in_progress', 'completed'];
    }
  }, [data.agents, colorMode]);

  // Compute time buckets and grid data
  const gridData = useMemo(() => {
    const nodes = data.nodes;
    if (nodes.length === 0) return { buckets: [] as ReturnType<typeof computeBuckets>, grid: new Map<string, TimelineNode[]>() };

    const timeRange = data.timeRange.end - data.timeRange.start || 1;
    const bucketMs = Math.max(1000, timeRange / Math.max(dimensions.width - 80, 100));
    const buckets = computeBuckets(nodes, bucketMs);

    // Build grid: Map<"row,col" -> nodes>
    const grid = new Map<string, TimelineNode[]>();
    buckets.forEach((bucket, colIdx) => {
      bucket.nodes.forEach((node) => {
        let rowKey: string;
        switch (colorMode) {
          case 'status':
            rowKey = node.status || 'pending';
            break;
          case 'agent':
          case 'rainbow':
            rowKey = node.owner || 'Unassigned';
            break;
          case 'priority':
            rowKey = (node.metadata.priority as string) || 'medium';
            break;
          default:
            rowKey = node.status || 'pending';
        }
        const rowIdx = rows.indexOf(rowKey);
        if (rowIdx === -1) return;
        const cellKey = `${rowIdx},${colIdx}`;
        const existing = grid.get(cellKey);
        if (existing) existing.push(node);
        else grid.set(cellKey, [node]);
      });
    });

    return { buckets, grid };
  }, [data, colorMode, rows, dimensions.width]);

  // Find max count for normalization
  const maxCount = useMemo(() => {
    let max = 1;
    gridData.grid.forEach((events) => { max = Math.max(max, events.length); });
    return max;
  }, [gridData]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const leftMargin = 80;
    const bottomMargin = 30;
    const chartWidth = width - leftMargin;
    const chartHeight = height - bottomMargin;
    const rowHeight = rows.length > 0 ? Math.max(24, chartHeight / rows.length) : 24;
    const colCount = gridData.buckets.length;
    const cellWidth = colCount > 0 ? chartWidth / colCount : 1;

    const themeColors = getThemeColors(mapToFlowTheme(theme));
    const isDramatic = isDramaticTheme(theme);

    ctx.clearRect(0, 0, width, height);

    if (data.nodes.length === 0 || colCount === 0) {
      ctx.fillStyle = themeColors.nodeText;
      ctx.font = '14px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No events to display', width / 2, height / 2);
      return;
    }

    // Draw row labels
    ctx.fillStyle = themeColors.nodeText;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    rows.forEach((label, rowIdx) => {
      ctx.fillText(label, leftMargin - 8, rowIdx * rowHeight + rowHeight / 2);
    });

    // Draw grid cells
    gridData.buckets.forEach((_bucket, colIdx) => {
      rows.forEach((_label, rowIdx) => {
        const events = gridData.grid.get(`${rowIdx},${colIdx}`);
        if (!events || events.length === 0) return;

        const alpha = Math.min(1, events.length / maxCount);
        let baseColor: string;
        if (colorMode === 'rainbow') {
          const hue = (colIdx / colCount) * 360;
          baseColor = `hsl(${hue}, 70%, 50%)`;
        } else {
          baseColor = resolveNodeColor(events[0], colorMode, 0, 1, data.agents);
        }

        const rgb = parseColorToRgb(baseColor);
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        ctx.fillRect(leftMargin + colIdx * cellWidth, rowIdx * rowHeight, cellWidth, rowHeight - 1);
      });
    });

    // Time axis labels
    const numLabels = Math.min(8, colCount);
    const labelStep = Math.max(1, Math.floor(colCount / numLabels));
    ctx.fillStyle = themeColors.nodeText;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i < numLabels; i++) {
      const colIdx = i * labelStep;
      if (colIdx >= colCount) continue;
      const bucket = gridData.buckets[colIdx];
      ctx.fillText(formatTime(bucket.startMs), leftMargin + colIdx * cellWidth + cellWidth / 2, chartHeight + 4);
    }

    // Dramatic scanline overlay
    if (isDramatic) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      for (let y = 0; y < chartHeight; y += 4) {
        ctx.fillRect(leftMargin, y, chartWidth, 2);
      }
    }
  }, [dimensions, gridData, rows, maxCount, colorMode, theme, data]);

  // Mouse hover detection
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const leftMargin = 80;
      const chartHeight = dimensions.height - 30;
      if (x < leftMargin || y > chartHeight || gridData.buckets.length === 0) {
        setHoveredCell(null);
        return;
      }

      const rowHeight = Math.max(24, chartHeight / rows.length);
      const cellWidth = (dimensions.width - leftMargin) / gridData.buckets.length;
      const rowIdx = Math.floor(y / rowHeight);
      const colIdx = Math.floor((x - leftMargin) / cellWidth);

      if (rowIdx < 0 || rowIdx >= rows.length || colIdx < 0 || colIdx >= gridData.buckets.length) {
        setHoveredCell(null);
        return;
      }

      const events = gridData.grid.get(`${rowIdx},${colIdx}`) || [];
      if (events.length === 0) {
        setHoveredCell(null);
        return;
      }
      setHoveredCell({ row: rowIdx, col: colIdx, events, x: e.clientX, y: e.clientY });
    },
    [dimensions, rows, gridData]
  );

  const handleMouseLeave = useCallback(() => setHoveredCell(null), []);

  const handleClick = useCallback(() => {
    if (hoveredCell && hoveredCell.events.length > 0 && onNodeClick) {
      onNodeClick(hoveredCell.events[0].id);
    }
  }, [hoveredCell, onNodeClick]);

  // Find expanded node
  const expandedNode = useMemo(() => {
    if (!expandedNodeId) return null;
    return data.nodes.find((n) => n.id === expandedNodeId) ?? null;
  }, [expandedNodeId, data.nodes]);

  const expandedColor = useMemo(() => {
    if (!expandedNode) return '#888';
    const idx = data.nodes.indexOf(expandedNode);
    return resolveNodeColor(expandedNode, colorMode, idx, data.nodes.length, data.agents);
  }, [expandedNode, data, colorMode]);

  return (
    <div ref={containerRef} className={`absolute inset-0 overflow-hidden ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height, cursor: hoveredCell ? 'pointer' : 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />

      {hoveredCell && (
        <div
          className="fixed z-50 px-3 py-2 text-xs rounded shadow-lg pointer-events-none"
          style={{
            left: hoveredCell.x + 12,
            top: hoveredCell.y + 12,
            background: 'rgba(15,15,25,0.95)',
            color: '#e5e5e5',
            border: '1px solid rgba(100,100,130,0.3)',
            borderRadius: 8,
          }}
        >
          <div className="font-semibold">{rows[hoveredCell.row]}</div>
          <div className="opacity-80">
            {hoveredCell.events.length} event{hoveredCell.events.length !== 1 ? 's' : ''}
          </div>
          {gridData.buckets[hoveredCell.col] && (
            <div className="text-[10px] opacity-60">
              {formatTime(gridData.buckets[hoveredCell.col].startMs)} -{' '}
              {formatTime(gridData.buckets[hoveredCell.col].endMs)}
            </div>
          )}
        </div>
      )}

      {expandedNode && (
        <div className="absolute z-20 top-4 right-4" style={{ pointerEvents: 'auto' }}>
          <TimelineTaskCard
            node={expandedNode}
            color={expandedColor}
            isExpanded={true}
            onClick={() => onNodeClick?.(expandedNode.id)}
          />
        </div>
      )}
    </div>
  );
}

// Parse hex (#rrggbb) or hsl(h, s%, l%) to RGB
function parseColorToRgb(color: string): { r: number; g: number; b: number } {
  if (color.startsWith('hsl')) {
    const match = color.match(/hsl[a]?\(\s*(\d+)(?:deg)?\s*,?\s*(\d+)%\s*,?\s*(\d+)%/);
    if (match) {
      const h = parseInt(match[1]) / 360;
      const s = parseInt(match[2]) / 100;
      const l = parseInt(match[3]) / 100;
      const [r, g, b] = hslToRgb(h, s, l);
      return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }
  }
  const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (hex) {
    return { r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16) };
  }
  return { r: 100, g: 100, b: 200 };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}
