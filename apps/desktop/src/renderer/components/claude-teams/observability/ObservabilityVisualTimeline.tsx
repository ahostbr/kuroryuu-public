/**
 * ObservabilityVisualTimeline — Wrapper that renders the active timeline
 * renderer for observability hook events.
 *
 * Reads filtered events from observability store, adapts them via
 * eventsToTimelineData(), and dispatches to the same 4 renderers
 * used by Claude Teams timeline.
 */
import { useMemo, useState, useCallback } from 'react';
import { RotateCw, Palette } from 'lucide-react';
import { useObservabilityStore, selectFilteredEvents } from '../../../stores/observability-store';
import { eventsToTimelineData } from './observability-timeline-adapter';
import { TimelineSVG } from '../timeline/TimelineSVG';
import { TimelineReactFlow } from '../timeline/TimelineReactFlow';
import { TimelineECharts } from '../timeline/TimelineECharts';
import { TimelineCanvas } from '../timeline/TimelineCanvas';
import { TimelineDensityRidge } from '../timeline/TimelineDensityRidge';
import { TimelineCompactStrip } from '../timeline/TimelineCompactStrip';
import { TimelineSpiralClock } from '../timeline/TimelineSpiralClock';
import { TimelineFlameStack } from '../timeline/TimelineFlameStack';
import {
  TIMELINE_STYLE_LABELS,
  TIMELINE_COLOR_MODE_LABELS,
} from '../timeline/timeline-types';
import type { TimelineRendererProps } from '../timeline/timeline-types';

export function ObservabilityVisualTimeline() {
  const filteredEvents = useObservabilityStore(selectFilteredEvents);
  const timelineStyle = useObservabilityStore((s) => s.visualTimelineStyle);
  const colorMode = useObservabilityStore((s) => s.visualTimelineColorMode);
  const cycleStyle = useObservabilityStore((s) => s.cycleVisualTimelineStyle);
  const cycleColorMode = useObservabilityStore((s) => s.cycleVisualTimelineColorMode);

  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  // Adapt to timeline data
  const data = useMemo(() => eventsToTimelineData(filteredEvents), [filteredEvents]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setExpandedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  // Build renderer props
  const rendererProps: TimelineRendererProps = {
    data,
    colorMode,
    theme: 'default',
    onNodeClick: handleNodeClick,
    expandedNodeId,
  };

  // Renderer dispatch
  const renderTimeline = () => {
    switch (timelineStyle) {
      case 'svg-spine':
        return <TimelineSVG {...rendererProps} />;
      case 'reactflow-swim':
        return <TimelineReactFlow {...rendererProps} />;
      case 'echarts-dots':
        return <TimelineECharts {...rendererProps} />;
      case 'canvas-arc':
        return <TimelineCanvas {...rendererProps} />;
      case 'density-ridge':
        return <TimelineDensityRidge {...rendererProps} />;
      case 'compact-strip':
        return <TimelineCompactStrip {...rendererProps} />;
      case 'spiral-clock':
        return <TimelineSpiralClock {...rendererProps} />;
      case 'flame-stack':
        return <TimelineFlameStack {...rendererProps} />;
      default:
        return <TimelineSVG {...rendererProps} />;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <button
          onClick={cycleStyle}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-card/80 hover:bg-accent transition-colors select-none"
          title={`Style: ${TIMELINE_STYLE_LABELS[timelineStyle]}. Click to cycle.`}
        >
          <RotateCw size={12} className="opacity-60" />
          {TIMELINE_STYLE_LABELS[timelineStyle]}
        </button>
        <button
          onClick={cycleColorMode}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-card/80 hover:bg-accent transition-colors select-none"
          title={`Color: ${TIMELINE_COLOR_MODE_LABELS[colorMode]}. Click to cycle.`}
        >
          <Palette size={12} className="opacity-60" />
          {TIMELINE_COLOR_MODE_LABELS[colorMode]}
        </button>
        <span className="text-xs text-muted-foreground ml-auto">
          {data.nodes.length} events
        </span>
      </div>

      {/* Renderer area */}
      <div className="flex-1 overflow-hidden relative">
        {data.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No events to visualize. Enable observability hooks to start streaming.
          </div>
        ) : (
          renderTimeline()
        )}
      </div>
    </div>
  );
}
