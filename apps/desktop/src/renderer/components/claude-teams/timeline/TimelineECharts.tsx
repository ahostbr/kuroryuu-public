/**
 * TimelineECharts -- "Horizontal Dots" timeline renderer
 *
 * One of 4 bake-off renderers. Renders a horizontal time axis with colored
 * scatter dots as milestones. Info cards alternate above and below the axis
 * line in a zigzag pattern. ECharts handles zoom/pan/tooltip natively via
 * its built-in dataZoom and rich tooltip system.
 *
 * Dramatic themes (kuroryuu, matrix, retro, neo, grunge) get bounceOut
 * easing and longer animation durations.
 */
import React, { useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import type { EChartsOption } from 'echarts';
import type { TimelineRendererProps } from './timeline-types';
import {
  resolveNodeColor,
  computeLayout,
  formatDuration,
  formatTime,
  isDramaticTheme,
} from './timeline-utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALTERNATE_Y_UPPER = 1.2;
const ALTERNATE_Y_LOWER = -1.2;
const CONNECTOR_LINE_Y = 0;
const MIN_SYMBOL_SIZE = 18;
const GLOW_BLUR = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an rgba shadow string for a dot glow effect.
 * ECharts itemStyle.shadowColor accepts CSS color strings.
 */
function toGlowShadow(hexOrHsl: string, alpha: number = 0.6): string {
  // For HSL colors, wrap with alpha
  if (hexOrHsl.startsWith('hsl(')) {
    return hexOrHsl.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
  }
  // For hex colors, convert to rgba
  if (hexOrHsl.startsWith('#') && hexOrHsl.length >= 7) {
    const r = parseInt(hexOrHsl.slice(1, 3), 16);
    const g = parseInt(hexOrHsl.slice(3, 5), 16);
    const b = parseInt(hexOrHsl.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hexOrHsl;
}

/**
 * Escape HTML entities for safe tooltip rendering.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimelineECharts({
  data,
  colorMode,
  theme,
  onNodeClick,
  expandedNodeId,
  className,
}: TimelineRendererProps) {
  const chartRef = useRef<ReactECharts>(null);
  const [showDetails, setShowDetails] = useState(false);

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

  // ── Build ECharts option ─────────────────────────────────────────────
  const option: EChartsOption = useMemo(() => {
    if (data.nodes.length === 0) return {};

    const nodeCount = data.nodes.length;
    const symbolSize = Math.max(layout.nodeSize * 3, MIN_SYMBOL_SIZE);

    // Category labels for X axis
    const categories = data.nodes.map((_, i) => `#${i + 1}`);

    // Build scatter data with alternating Y positions
    const scatterData = data.nodes.map((node, i) => {
      const yVal = i % 2 === 0 ? ALTERNATE_Y_UPPER : ALTERNATE_Y_LOWER;
      const color = colors[i];
      const isExpanded = node.id === expandedNodeId;

      return {
        value: [i, yVal],
        itemStyle: {
          color,
          borderColor: isExpanded ? '#fff' : 'rgba(0, 0, 0, 0.3)',
          borderWidth: isExpanded ? 3 : 2,
          shadowColor: toGlowShadow(color, isExpanded ? 0.8 : 0.5),
          shadowBlur: isExpanded ? GLOW_BLUR * 1.5 : GLOW_BLUR,
          shadowOffsetY: 2,
        },
        symbolSize: isExpanded ? symbolSize * 1.3 : symbolSize,
      };
    });

    // Build a line series that runs through all dots at Y=0 to form
    // the connecting horizontal axis
    const connectorData = data.nodes.map((_, i) => [i, CONNECTOR_LINE_Y]);

    // Label data — task subjects shown near each dot
    const labelData = data.nodes.map((node, i) => {
      const yVal = i % 2 === 0 ? ALTERNATE_Y_UPPER : ALTERNATE_Y_LOWER;
      const labelPos = i % 2 === 0 ? 'top' : 'bottom';
      return {
        value: [i, yVal],
        label: {
          show: layout.showLabels,
          position: labelPos as 'top' | 'bottom',
          formatter: () => {
            const subject =
              node.subject.length > 20
                ? node.subject.slice(0, 18) + '...'
                : node.subject;
            return `{id|#${node.taskId}} {subject|${subject}}`;
          },
          rich: {
            id: {
              fontSize: layout.fontSize - 2,
              fontWeight: 'bold' as const,
              color: colors[i],
              padding: [0, 4, 0, 0],
            },
            subject: {
              fontSize: layout.fontSize - 1,
              color: 'rgba(200, 200, 210, 0.85)',
            },
          },
          distance: 14,
        },
      };
    });

    // Vertical drop lines from each dot to the axis (Y=0)
    const dropLines = data.nodes.map((_, i) => {
      const yVal = i % 2 === 0 ? ALTERNATE_Y_UPPER : ALTERNATE_Y_LOWER;
      return [
        { xAxis: i, yAxis: yVal, symbol: 'none' },
        { xAxis: i, yAxis: CONNECTOR_LINE_Y, symbol: 'none' },
      ];
    });

    return {
      backgroundColor: 'transparent',

      animation: true,
      animationDuration: dramatic ? 1000 : 500,
      animationEasing: dramatic ? 'bounceOut' : 'cubicOut',
      animationDelay: (idx: number) => idx * (dramatic ? 80 : 40),

      grid: {
        top: 60,
        bottom: 60,
        left: 40,
        right: 40,
        containLabel: true,
      },

      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: 'rgba(15, 15, 25, 0.92)',
        borderColor: 'rgba(100, 100, 120, 0.3)',
        borderWidth: 1,
        textStyle: { color: '#ccc', fontSize: 11 },
        extraCssText: 'border-radius: 6px; padding: 4px 8px; pointer-events: none;',
        formatter: (params: any) => {
          if (params.seriesType !== 'scatter') return '';
          const idx = params.dataIndex;
          if (idx === undefined || idx >= data.nodes.length) return '';
          const node = data.nodes[idx];
          return `<span style="color:${colors[idx]};font-weight:bold">#${escapeHtml(node.taskId)}</span> ${escapeHtml(node.subject.length > 30 ? node.subject.slice(0, 28) + '...' : node.subject)}`;
        },
      },

      xAxis: {
        type: 'category',
        data: categories,
        axisLine: {
          show: true,
          lineStyle: {
            color: 'rgba(120, 120, 140, 0.4)',
            width: 2,
          },
        },
        axisTick: {
          show: true,
          lineStyle: { color: 'rgba(120, 120, 140, 0.3)' },
          alignWithLabel: true,
        },
        axisLabel: {
          show: true,
          color: 'rgba(180, 180, 200, 0.7)',
          fontSize: layout.fontSize - 1,
        },
        splitLine: { show: false },
      },

      yAxis: {
        type: 'value',
        show: false,
        min: -2.5,
        max: 2.5,
        splitLine: { show: false },
      },

      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: 0,
          bottom: 8,
          height: 18,
          borderColor: 'rgba(100, 100, 120, 0.3)',
          backgroundColor: 'rgba(30, 30, 50, 0.4)',
          fillerColor: 'rgba(100, 100, 200, 0.15)',
          handleStyle: { color: 'rgba(150, 150, 200, 0.6)' },
          textStyle: { color: 'rgba(180, 180, 200, 0.7)', fontSize: 10 },
          // Show slider only when there are enough nodes to scroll
          show: nodeCount > 8,
        },
        {
          type: 'inside',
          xAxisIndex: 0,
        },
      ],

      series: [
        // Series 0: Horizontal connector line at Y=0
        {
          name: 'connector',
          type: 'line',
          data: connectorData,
          symbol: 'none',
          lineStyle: {
            color: 'rgba(120, 120, 140, 0.25)',
            width: 2,
            type: 'solid',
          },
          silent: true,
          z: 1,
          animation: false,
        },

        // Series 1: Scatter dots (milestones)
        {
          name: 'milestones',
          type: 'scatter',
          data: scatterData,
          z: 3,
          emphasis: {
            scale: 1.3,
            itemStyle: {
              borderColor: '#fff',
              borderWidth: 3,
              shadowBlur: GLOW_BLUR * 2,
            },
          },
          // Vertical drop lines from each dot to the axis
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            lineStyle: {
              color: 'rgba(120, 120, 140, 0.2)',
              width: 1,
              type: 'dashed',
            },
            data: dropLines,
            animation: false,
          },
        },

        // Series 2: Invisible scatter to carry rich labels
        // (separate series so labels don't interfere with scatter tooltips)
        {
          name: 'labels',
          type: 'scatter',
          data: labelData,
          symbolSize: 0,
          silent: true,
          z: 2,
        },
      ],
    } as EChartsOption;
  }, [data, colors, layout, dramatic, expandedNodeId]);

  // ── Event handlers ───────────────────────────────────────────────────
  const onEvents = useMemo(
    () => ({
      click: (params: any) => {
        if (
          params.dataIndex !== undefined &&
          params.seriesType === 'scatter' &&
          params.seriesName === 'milestones'
        ) {
          onNodeClick?.(data.nodes[params.dataIndex].id);
        }
      },
    }),
    [onNodeClick, data]
  );

  // ── Empty state ──────────────────────────────────────────────────────
  if (data.nodes.length === 0) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center text-muted-foreground text-sm ${className ?? ''}`}
      >
        No tasks to display
      </div>
    );
  }

  // ── Expanded node lookup ─────────────────────────────────────────────
  const expandedNode = expandedNodeId
    ? data.nodes.find((n) => n.id === expandedNodeId)
    : null;
  const expandedColor = expandedNode
    ? colors[data.nodes.indexOf(expandedNode)]
    : '#888';

  const statusLabel = (s: string) =>
    s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className={`absolute inset-0 ${className ?? ''}`}>
      <ReactECharts
        ref={chartRef}
        option={option}
        onEvents={onEvents}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
      />

      {/* ── Collapsible info card (click a dot to open) ────────────── */}
      {expandedNode && (
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            left: 12,
            right: 12,
            zIndex: 50,
            maxWidth: 420,
          }}
        >
          <div
            style={{
              background: 'rgba(12, 12, 22, 0.96)',
              border: `1px solid ${expandedColor}50`,
              borderRadius: 10,
              padding: '10px 14px',
              boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 12px ${expandedColor}20`,
            }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: expandedColor, fontWeight: 'bold', fontSize: 13 }}>
                  #{expandedNode.taskId} {expandedNode.subject}
                </div>
                <div style={{ color: '#aaa', fontSize: 11, marginTop: 3 }}>
                  {statusLabel(expandedNode.status)} | {expandedNode.owner ?? 'Unassigned'} | {formatDuration(expandedNode.duration)} | {formatTime(expandedNode.timestamp)}
                </div>
              </div>
              <button
                onClick={() => { setShowDetails(false); onNodeClick?.(expandedNode.id); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  padding: 2,
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Blocks / BlockedBy */}
            {(expandedNode.blocks.length > 0 || expandedNode.blockedBy.length > 0) && (
              <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                {expandedNode.blocks.length > 0 && (
                  <span>Blocks: {expandedNode.blocks.map((b) => '#' + b).join(', ')} </span>
                )}
                {expandedNode.blockedBy.length > 0 && (
                  <span>Blocked by: {expandedNode.blockedBy.map((b) => '#' + b).join(', ')}</span>
                )}
              </div>
            )}

            {/* Collapsible description */}
            {expandedNode.description && (
              <div style={{ marginTop: 6 }}>
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {showDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Description
                </button>
                {showDetails && (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#777',
                      marginTop: 4,
                      lineHeight: 1.5,
                      maxHeight: 120,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {expandedNode.description}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
