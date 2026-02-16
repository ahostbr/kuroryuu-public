import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { FixedSizeList } from 'react-window';
import type { TimelineRendererProps, TimelineNode } from './timeline-types';
import { TimelineTaskCard } from './TimelineTaskCard';
import {
  resolveNodeColor,
  formatTime,
  mapToFlowTheme,
  getThemeColors,
} from './timeline-utils';

interface Cluster {
  x: number;
  width: number;
  count: number;
  color: string;
  opacity: number;
  firstNodeId: string;
  startTime: number;
  endTime: number;
}

interface Lane {
  label: string;
  clusters: Cluster[];
  count: number;
}

const LANE_HEIGHT = 24;
const GUTTER_WIDTH = 80;
const HEADER_HEIGHT = 24;
const MIN_CLUSTER_GAP = 2;
const CLUSTER_OPACITY_DIVISOR = 5;

interface LaneRowData {
  lanes: Lane[];
  themeColors: ReturnType<typeof getThemeColors>;
  onNodeClick?: (nodeId: string) => void;
}

export function TimelineCompactStrip({
  data,
  colorMode,
  theme,
  onNodeClick,
  expandedNodeId,
  className = '',
}: TimelineRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const nodes = data.nodes;

  // Time bounds
  const { minTime, timeRange } = useMemo(() => {
    if (nodes.length === 0) return { minTime: 0, timeRange: 1 };
    const min = data.timeRange.start;
    const max = data.timeRange.end;
    return { minTime: min, timeRange: max - min || 1 };
  }, [nodes, data.timeRange]);

  // Timestamp to X coordinate
  const timeToX = useCallback(
    (timestamp: number): number => {
      const chartWidth = dimensions.width - GUTTER_WIDTH;
      return GUTTER_WIDTH + ((timestamp - minTime) / timeRange) * chartWidth;
    },
    [minTime, timeRange, dimensions.width]
  );

  // Build lanes with clustering
  const lanes = useMemo(() => {
    if (nodes.length === 0) return [];

    // Group events by lane key
    const laneMap = new Map<string, TimelineNode[]>();
    nodes.forEach((node) => {
      const key = colorMode === 'agent'
        ? (node.agent?.name ?? 'Unassigned')
        : (node.owner ?? 'Unassigned');
      if (!laneMap.has(key)) laneMap.set(key, []);
      laneMap.get(key)!.push(node);
    });

    const result: Lane[] = [];
    laneMap.forEach((laneNodes, label) => {
      const sorted = [...laneNodes].sort((a, b) => a.timestamp - b.timestamp);
      const clusters: Cluster[] = [];
      let current: { nodes: TimelineNode[]; startX: number; endX: number } | null = null;

      sorted.forEach((node) => {
        const x = timeToX(node.timestamp);
        if (!current) {
          current = { nodes: [node], startX: x, endX: x };
        } else if (x - current.endX < MIN_CLUSTER_GAP) {
          current.nodes.push(node);
          current.endX = x;
        } else {
          clusters.push(buildCluster(current));
          current = { nodes: [node], startX: x, endX: x };
        }
      });
      if (current) clusters.push(buildCluster(current));

      result.push({ label, clusters, count: laneNodes.length });
    });

    return result;

    function buildCluster(c: { nodes: TimelineNode[]; startX: number; endX: number }): Cluster {
      const first = c.nodes[0];
      const last = c.nodes[c.nodes.length - 1];
      const idx = nodes.indexOf(first);
      const color = resolveNodeColor(first, colorMode, idx >= 0 ? idx : 0, nodes.length, data.agents);
      return {
        x: c.startX,
        width: Math.max(2, c.endX - c.startX),
        count: c.nodes.length,
        color,
        opacity: Math.min(1, c.nodes.length / CLUSTER_OPACITY_DIVISOR),
        firstNodeId: first.id,
        startTime: first.timestamp,
        endTime: last.timestamp,
      };
    }
  }, [nodes, colorMode, timeToX, data.agents]);

  // Time axis labels
  const timeLabels = useMemo(() => {
    const chartWidth = dimensions.width - GUTTER_WIDTH;
    const labelCount = Math.max(3, Math.floor(chartWidth / 100));
    const labels: { x: number; text: string }[] = [];
    for (let i = 0; i <= labelCount; i++) {
      const fraction = i / labelCount;
      labels.push({
        x: GUTTER_WIDTH + chartWidth * fraction,
        text: formatTime(minTime + timeRange * fraction),
      });
    }
    return labels;
  }, [minTime, timeRange, dimensions.width]);

  const themeColors = getThemeColors(mapToFlowTheme(theme));

  // Expanded node
  const expandedNode = expandedNodeId ? nodes.find((n) => n.id === expandedNodeId) : undefined;
  const expandedColor = useMemo(() => {
    if (!expandedNode) return '#888';
    const idx = nodes.indexOf(expandedNode);
    return resolveNodeColor(expandedNode, colorMode, idx, nodes.length, data.agents);
  }, [expandedNode, nodes, colorMode, data.agents]);

  if (nodes.length === 0) {
    return (
      <div ref={containerRef} className={`absolute inset-0 flex items-center justify-center ${className}`}>
        <div className="text-sm text-muted-foreground opacity-60">No events to display</div>
      </div>
    );
  }

  if (lanes.length === 0) {
    return (
      <div ref={containerRef} className={`absolute inset-0 flex items-center justify-center ${className}`}>
        <div className="text-sm text-muted-foreground opacity-60">No lanes to display</div>
      </div>
    );
  }

  const laneRowData: LaneRowData = { lanes, themeColors, onNodeClick };

  return (
    <div ref={containerRef} className={`absolute inset-0 ${className}`}>
      {/* Time axis header */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{ height: HEADER_HEIGHT, borderBottom: `1px solid ${themeColors.hub}` }}
      >
        {timeLabels.map((label, i) => (
          <div
            key={i}
            className="absolute text-xs text-muted-foreground opacity-70"
            style={{ left: label.x, top: 4, transform: 'translateX(-50%)' }}
          >
            {label.text}
          </div>
        ))}
      </div>

      {/* Virtualized lanes */}
      <div className="absolute left-0 right-0 bottom-0" style={{ top: HEADER_HEIGHT }}>
        <FixedSizeList
          height={dimensions.height - HEADER_HEIGHT}
          itemCount={lanes.length}
          itemSize={LANE_HEIGHT}
          width={dimensions.width}
          itemData={laneRowData}
        >
          {LaneRow}
        </FixedSizeList>
      </div>

      {/* Expanded card overlay */}
      {expandedNode && (
        <div
          className="absolute z-50"
          style={{ left: Math.min(timeToX(expandedNode.timestamp), dimensions.width - 320), top: HEADER_HEIGHT + 8 }}
        >
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

function LaneRow({
  index,
  style,
  data,
}: {
  index: number;
  style: React.CSSProperties;
  data: LaneRowData;
}) {
  const { lanes, themeColors, onNodeClick } = data;
  const lane = lanes[index];

  return (
    <div
      style={{ ...style, borderBottom: `1px solid ${themeColors.hub}` }}
      className="flex items-center relative"
    >
      <div
        className="shrink-0 text-xs truncate px-2 opacity-80"
        style={{ width: GUTTER_WIDTH }}
        title={`${lane.label} (${lane.count})`}
      >
        {lane.label}
      </div>
      <div className="flex-1 relative h-full">
        {lane.clusters.map((cluster, i) => (
          <div
            key={i}
            className="absolute top-1 bottom-1 rounded-sm cursor-pointer transition-opacity hover:opacity-100"
            style={{
              left: cluster.x,
              width: cluster.width,
              backgroundColor: cluster.color,
              opacity: cluster.opacity,
            }}
            title={`${cluster.count} event${cluster.count > 1 ? 's' : ''} (${formatTime(cluster.startTime)}${cluster.count > 1 ? ` - ${formatTime(cluster.endTime)}` : ''})`}
            onClick={() => onNodeClick?.(cluster.firstNodeId)}
          />
        ))}
      </div>
    </div>
  );
}
