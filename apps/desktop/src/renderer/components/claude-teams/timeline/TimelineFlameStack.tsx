import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { FixedSizeList } from 'react-window';
import type { ListChildComponentProps } from 'react-window';
import type { TimelineRendererProps, TimelineNode } from './timeline-types';
import type { TimelineColorMode } from './timeline-types';
import type { TeamMember } from '../../../types/claude-teams';
import { TimelineTaskCard } from './TimelineTaskCard';
import {
  resolveNodeColor,
  computeBuckets,
  formatTime,
  mapToFlowTheme,
  getThemeColors,
} from './timeline-utils';

// Status sort order for coherent color banding
const STATUS_ORDER: Record<string, number> = {
  completed: 0,
  in_progress: 1,
  pending: 2,
  deleted: 3,
};

interface BucketData {
  buckets: Array<{ startMs: number; endMs: number; nodes: TimelineNode[] }>;
  onNodeClick?: (id: string) => void;
  colorMode: TimelineColorMode;
  agents: TeamMember[];
  allNodes: TimelineNode[];
}

function FlameColumn({ index, style, data }: ListChildComponentProps<BucketData>) {
  const { buckets, onNodeClick, colorMode, agents, allNodes } = data;
  const bucket = buckets[index];
  const cellHeight = 12;
  const maxVisible = 20;

  const sorted = useMemo(
    () => [...bucket.nodes].sort((a, b) => (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4)),
    [bucket.nodes]
  );

  const visibleEvents = sorted.slice(0, maxVisible);
  const overflow = sorted.length - maxVisible;
  const stackHeight = visibleEvents.length * cellHeight;
  const svgHeight = stackHeight + (overflow > 0 ? 14 : 0);

  return (
    <div style={style} className="relative flex flex-col justify-end pb-2">
      <div className="text-[9px] text-center text-muted-foreground truncate px-0.5 mb-1">
        {formatTime(bucket.startMs)}
      </div>
      <svg width={46} height={svgHeight} className="mx-auto" style={{ display: 'block' }}>
        {overflow > 0 && (
          <text x={23} y={10} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.6}>
            +{overflow}
          </text>
        )}
        {visibleEvents.map((node, i) => {
          const globalIdx = allNodes.indexOf(node);
          const color = resolveNodeColor(node, colorMode, globalIdx >= 0 ? globalIdx : i, allNodes.length, agents);
          return (
            <g key={node.id}>
              <rect
                x={1}
                y={(overflow > 0 ? 14 : 0) + i * cellHeight}
                width={44}
                height={cellHeight - 1}
                rx={2}
                fill={color}
                opacity={0.85}
                className="cursor-pointer hover:opacity-100 transition-opacity"
                onClick={() => onNodeClick?.(node.id)}
              >
                <title>{node.subject}{'\n'}{node.status}{'\n'}{formatTime(node.timestamp)}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface MinimapProps {
  buckets: BucketData['buckets'];
  viewportStart: number;
  viewportEnd: number;
  onSeek: (index: number) => void;
  theme: string;
}

function Minimap({ buckets, viewportStart, viewportEnd, onSeek, theme }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const themeColors = useMemo(() => getThemeColors(mapToFlowTheme(theme)), [theme]);
  const maxCount = useMemo(() => Math.max(...buckets.map((b) => b.nodes.length), 1), [buckets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const barWidth = width / buckets.length;

    ctx.fillStyle = themeColors.nodeBg;
    ctx.fillRect(0, 0, width, height);

    buckets.forEach((bucket, i) => {
      const barHeight = (bucket.nodes.length / maxCount) * height * 0.8;
      ctx.fillStyle = i === hoveredIndex ? themeColors.active : 'rgba(100, 100, 100, 0.4)';
      ctx.fillRect(i * barWidth, height - barHeight, Math.max(barWidth - 1, 1), barHeight);
    });

    // Viewport overlay
    const startX = viewportStart * barWidth;
    const endX = viewportEnd * barWidth;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.fillRect(startX, 0, endX - startX, height);
    ctx.strokeStyle = themeColors.active;
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, 0, endX - startX, height);
  }, [buckets, viewportStart, viewportEnd, hoveredIndex, themeColors, maxCount]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const idx = Math.floor(((e.clientX - rect.left) / rect.width) * buckets.length);
      onSeek(Math.max(0, Math.min(idx, buckets.length - 1)));
    },
    [buckets.length, onSeek]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHoveredIndex(Math.floor(((e.clientX - rect.left) / rect.width) * buckets.length));
    },
    [buckets.length]
  );

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={20}
      className="w-full h-full cursor-pointer"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredIndex(null)}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

export function TimelineFlameStack({
  data,
  colorMode,
  theme,
  onNodeClick,
  expandedNodeId,
  className = '',
}: TimelineRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<FixedSizeList>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [viewportRange, setViewportRange] = useState({ start: 0, end: 10 });

  const nodes = data.nodes;

  // Compute buckets
  const buckets = useMemo(() => {
    if (nodes.length === 0) return [];
    const range = data.timeRange.end - data.timeRange.start;
    const targetColumns = Math.max(20, Math.min(200, Math.ceil(range / 5000)));
    const ms = Math.max(1000, Math.ceil(range / targetColumns));
    return computeBuckets(nodes, ms);
  }, [nodes, data.timeRange]);

  // Expanded node
  const expandedNode = expandedNodeId ? nodes.find((n) => n.id === expandedNodeId) : undefined;
  const expandedColor = useMemo(() => {
    if (!expandedNode) return '#888';
    const idx = nodes.indexOf(expandedNode);
    return resolveNodeColor(expandedNode, colorMode, idx, nodes.length, data.agents);
  }, [expandedNode, nodes, colorMode, data.agents]);

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

  const handleScroll = useCallback(
    ({ scrollOffset }: { scrollOffset: number }) => {
      const itemWidth = 48;
      const visibleCount = Math.ceil(dimensions.width / itemWidth);
      const startIndex = Math.floor(scrollOffset / itemWidth);
      setViewportRange({ start: startIndex, end: Math.min(startIndex + visibleCount, buckets.length) });
    },
    [dimensions.width, buckets.length]
  );

  const handleMinimapSeek = useCallback((index: number) => {
    listRef.current?.scrollToItem(index, 'start');
  }, []);

  if (nodes.length === 0 || buckets.length === 0) {
    return (
      <div ref={containerRef} className={`absolute inset-0 flex items-center justify-center ${className}`}>
        <p className="text-muted-foreground text-sm">No timeline events</p>
      </div>
    );
  }

  const listHeight = dimensions.height - 44;
  const bucketData: BucketData = { buckets, onNodeClick, colorMode, agents: data.agents, allNodes: nodes };

  return (
    <div ref={containerRef} className={`absolute inset-0 overflow-hidden flex flex-col ${className}`}>
      <div className="flex-1 relative">
        <FixedSizeList
          ref={listRef}
          height={listHeight > 0 ? listHeight : 100}
          width={dimensions.width}
          itemCount={buckets.length}
          itemSize={48}
          layout="horizontal"
          itemData={bucketData}
          onScroll={handleScroll}
        >
          {FlameColumn}
        </FixedSizeList>
      </div>

      <div className="h-5 border-t border-border/50 bg-background/50">
        <Minimap
          buckets={buckets}
          viewportStart={viewportRange.start}
          viewportEnd={viewportRange.end}
          onSeek={handleMinimapSeek}
          theme={theme}
        />
      </div>

      {expandedNode && (
        <div className="absolute z-50 top-4 right-4" style={{ pointerEvents: 'auto' }}>
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
