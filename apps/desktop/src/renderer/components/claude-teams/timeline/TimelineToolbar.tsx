/**
 * TimelineToolbar — Two cycle buttons for style and color mode
 *
 * [⟳ SVG Spine] [⟳ Status Colors]
 *
 * Each click cycles to the next value and persists to the store.
 */
import React from 'react';
import { RotateCw, Palette } from 'lucide-react';
import { useTeamFlowStore } from '../../../stores/team-flow-store';
import {
  TIMELINE_STYLE_LABELS,
  TIMELINE_COLOR_MODE_LABELS,
} from './timeline-types';

export function TimelineToolbar() {
  const timelineStyle = useTeamFlowStore((s) => s.timelineStyle);
  const timelineColorMode = useTeamFlowStore((s) => s.timelineColorMode);
  const cycleTimelineStyle = useTeamFlowStore((s) => s.cycleTimelineStyle);
  const cycleTimelineColorMode = useTeamFlowStore((s) => s.cycleTimelineColorMode);

  return (
    <div className="flex items-center gap-2 p-2">
      {/* Style cycle button */}
      <button
        onClick={cycleTimelineStyle}
        className="
          flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium
          border border-border bg-card/80 hover:bg-accent
          transition-colors duration-150 select-none
        "
        title={`Timeline style: ${TIMELINE_STYLE_LABELS[timelineStyle]}. Click to cycle.`}
      >
        <RotateCw size={12} className="opacity-60" />
        <span>{TIMELINE_STYLE_LABELS[timelineStyle]}</span>
      </button>

      {/* Color mode cycle button */}
      <button
        onClick={cycleTimelineColorMode}
        className="
          flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium
          border border-border bg-card/80 hover:bg-accent
          transition-colors duration-150 select-none
        "
        title={`Color mode: ${TIMELINE_COLOR_MODE_LABELS[timelineColorMode]}. Click to cycle.`}
      >
        <Palette size={12} className="opacity-60" />
        <span>{TIMELINE_COLOR_MODE_LABELS[timelineColorMode]}</span>
      </button>
    </div>
  );
}
