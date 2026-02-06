/**
 * TimelineView — Wrapper component that renders the active timeline renderer.
 *
 * Reads store state, normalizes team data, and dispatches to the correct renderer.
 * Also manages expanded node state and renders the toolbar.
 */
import React, { useMemo, useState, useCallback } from 'react';
import { useTeamFlowStore } from '../../../stores/team-flow-store';
import type { TeamSnapshot } from '../../../types/claude-teams';
import { normalizeToTimeline } from './timeline-utils';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineSVG } from './TimelineSVG';
import { TimelineReactFlow } from './TimelineReactFlow';
import { TimelineECharts } from './TimelineECharts';
import { TimelineCanvas } from './TimelineCanvas';
import type { TimelineRendererProps } from './timeline-types';

interface TimelineViewProps {
  team: TeamSnapshot | null;
  readOnly?: boolean;
}

export function TimelineView({ team, readOnly = false }: TimelineViewProps) {
  const timelineStyle = useTeamFlowStore((s) => s.timelineStyle);
  const timelineColorMode = useTeamFlowStore((s) => s.timelineColorMode);
  const theme = useTeamFlowStore((s) => s.theme);

  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  const data = useMemo(
    () => (team ? normalizeToTimeline(team) : null),
    [team]
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (readOnly) return;
      setExpandedNodeId((prev) => (prev === nodeId ? null : nodeId));
    },
    [readOnly]
  );

  if (!team || !data) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
        No team selected
      </div>
    );
  }

  if (data.nodes.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col">
        <TimelineToolbar />
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No tasks to display
        </div>
      </div>
    );
  }

  const rendererProps: TimelineRendererProps = {
    data,
    colorMode: timelineColorMode,
    theme,
    onNodeClick: readOnly ? undefined : handleNodeClick,
    expandedNodeId,
  };

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
      default:
        return <TimelineSVG {...rendererProps} />;
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <TimelineToolbar />
      <div className="flex-1 overflow-hidden relative">
        {renderTimeline()}
      </div>
    </div>
  );
}
