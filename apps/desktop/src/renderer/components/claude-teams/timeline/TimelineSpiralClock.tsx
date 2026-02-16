import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import type { TimelineRendererProps, TimelineNode } from './timeline-types';
import { TimelineTaskCard } from './TimelineTaskCard';
import {
  resolveNodeColor,
  formatTime,
  isDramaticTheme,
  mapToFlowTheme,
  getThemeColors,
} from './timeline-utils';

interface PolarCell {
  r: number;
  theta: number;
  nodes: TimelineNode[];
  count: number;
}

export function TimelineSpiralClock({
  data,
  colorMode,
  theme,
  onNodeClick,
  expandedNodeId,
  className,
}: TimelineRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const [rotation, setRotation] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredCell, setHoveredCell] = useState<PolarCell | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const flowTheme = mapToFlowTheme(theme);
  const themeColors = getThemeColors(flowTheme);
  const isDramatic = isDramaticTheme(theme);

  // Spiral parameters
  const spiralParams = useMemo(() => {
    const minRadius = 30;
    const maxTheta = 6 * Math.PI; // 3 full rotations
    const availableRadius = (Math.min(dimensions.width, dimensions.height) / 2) * 0.85;
    const b = (availableRadius - minRadius) / maxTheta;
    return { minRadius, maxTheta, b };
  }, [dimensions]);

  // Density binning into polar cells
  const polarCells = useMemo(() => {
    if (data.nodes.length === 0) return [];

    const angleBuckets = 72;
    const radiusBuckets = 10;
    const cellMap = new Map<string, PolarCell>();
    const { start, end } = data.timeRange;
    const range = end - start || 1;

    data.nodes.forEach((node) => {
      const frac = (node.timestamp - start) / range;
      const theta = frac * spiralParams.maxTheta;
      const r = spiralParams.minRadius + spiralParams.b * theta;

      const angleBucket = Math.floor((theta / (2 * Math.PI)) * angleBuckets) % angleBuckets;
      const maxR = spiralParams.minRadius + spiralParams.b * spiralParams.maxTheta;
      const rFrac = (r - spiralParams.minRadius) / (maxR - spiralParams.minRadius || 1);
      const radiusBucket = Math.min(radiusBuckets - 1, Math.floor(rFrac * radiusBuckets));

      const key = `${angleBucket}-${radiusBucket}`;
      if (!cellMap.has(key)) {
        cellMap.set(key, { r, theta, nodes: [], count: 0 });
      }
      const cell = cellMap.get(key)!;
      cell.nodes.push(node);
      cell.count++;
    });

    return Array.from(cellMap.values());
  }, [data.nodes, data.timeRange, spiralParams]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Dramatic rotation animation — uses state to trigger redraws
  useEffect(() => {
    if (!isDramatic || data.nodes.length === 0) {
      setRotation(0);
      return;
    }
    let lastTime = performance.now();
    const animate = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setRotation((prev) => prev + dt * (Math.PI / 360)); // ~0.5 deg/sec
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isDramatic, data.nodes.length]);

  // Draw spiral
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const rot = isDramatic ? rotation : 0;

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    if (data.nodes.length === 0) {
      ctx.fillStyle = themeColors.nodeText;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No events', cx, cy);
      return;
    }

    // Draw guide spiral (faint)
    ctx.strokeStyle = themeColors.nodeText + '26';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = 0; t <= spiralParams.maxTheta; t += 0.1) {
      const r = spiralParams.minRadius + spiralParams.b * t;
      const angle = t + rot;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw polar cells
    polarCells.forEach((cell) => {
      const angle = cell.theta + rot;
      const x = cx + cell.r * Math.cos(angle);
      const y = cy + cell.r * Math.sin(angle);

      let color: string;
      if (colorMode === 'rainbow') {
        const hue = (cell.theta / spiralParams.maxTheta) * 360;
        color = `hsl(${hue}, 70%, 60%)`;
      } else {
        color = resolveNodeColor(cell.nodes[0], colorMode, 0, data.nodes.length, data.agents);
      }

      if (cell.count === 1) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        const lineWidth = Math.min(8, 2 + cell.count * 0.5);
        const opacity = Math.min(1, 0.4 + cell.count * 0.05);
        const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
        ctx.strokeStyle = color.startsWith('#') ? color + alphaHex : color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        const arcSpan = (2 * Math.PI) / 72;
        ctx.arc(cx, cy, cell.r, angle - arcSpan / 2, angle + arcSpan / 2);
        ctx.stroke();
      }
    });

    // Cardinal time labels
    const cardinalAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    const maxR = spiralParams.minRadius + spiralParams.b * spiralParams.maxTheta + 20;
    ctx.fillStyle = themeColors.nodeText;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    cardinalAngles.forEach((baseAngle, i) => {
      const angle = baseAngle + rot;
      const lx = cx + maxR * Math.cos(angle);
      const ly = cy + maxR * Math.sin(angle);
      const frac = (baseAngle / (2 * Math.PI)) / 3;
      const ts = data.timeRange.start + frac * (data.timeRange.end - data.timeRange.start);
      ctx.fillText(formatTime(ts), lx, ly);
    });

    // Center label
    ctx.fillStyle = themeColors.nodeText;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${data.nodes.length}`, cx, cy - 10);
    ctx.font = '11px sans-serif';
    ctx.fillText('events', cx, cy + 8);
  }, [dimensions, data, polarCells, spiralParams, colorMode, themeColors, isDramatic]);

  // Mouse hover
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x: e.clientX, y: e.clientY });

      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;
      const rot = isDramatic ? rotation : 0;

      let nearest: PolarCell | null = null;
      let minDist = Infinity;
      polarCells.forEach((cell) => {
        const angle = cell.theta + rot;
        const cellX = cx + cell.r * Math.cos(angle);
        const cellY = cy + cell.r * Math.sin(angle);
        const dist = Math.sqrt((x - cellX) ** 2 + (y - cellY) ** 2);
        if (dist < minDist && dist < 15) {
          minDist = dist;
          nearest = cell;
        }
      });
      setHoveredCell(nearest);
    },
    [dimensions, polarCells, isDramatic]
  );

  const handleMouseLeave = useCallback(() => setHoveredCell(null), []);

  const handleClick = useCallback(() => {
    if (hoveredCell && onNodeClick) onNodeClick(hoveredCell.nodes[0].id);
  }, [hoveredCell, onNodeClick]);

  // Expanded node
  const expandedNode = expandedNodeId ? data.nodes.find((n) => n.id === expandedNodeId) : undefined;
  const expandedColor = useMemo(() => {
    if (!expandedNode) return '#888';
    const idx = data.nodes.indexOf(expandedNode);
    return resolveNodeColor(expandedNode, colorMode, idx, data.nodes.length, data.agents);
  }, [expandedNode, data, colorMode]);

  return (
    <div ref={containerRef} className={`absolute inset-0 overflow-hidden ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ width: '100%', height: '100%', cursor: hoveredCell ? 'pointer' : 'default' }}
      />

      {hoveredCell && (
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 10,
            top: mousePos.y + 10,
            padding: '8px 12px',
            background: 'rgba(15,15,25,0.95)',
            color: '#e5e5e5',
            borderRadius: 6,
            fontSize: 12,
            pointerEvents: 'none',
            zIndex: 9999,
            maxWidth: 250,
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
            {hoveredCell.count} event{hoveredCell.count > 1 ? 's' : ''}
          </div>
          <div style={{ opacity: 0.9 }}>{formatTime(hoveredCell.nodes[0].timestamp)}</div>
          {hoveredCell.count === 1 && (
            <div style={{ marginTop: 4, opacity: 0.8 }}>{hoveredCell.nodes[0].subject}</div>
          )}
        </div>
      )}

      {expandedNode && (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1000, pointerEvents: 'auto' }}>
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
