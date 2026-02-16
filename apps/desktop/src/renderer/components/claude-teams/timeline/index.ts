/**
 * Timeline barrel exports
 */
export { TimelineView } from './TimelineView';
export { TimelineToolbar } from './TimelineToolbar';
export { TimelineTaskCard } from './TimelineTaskCard';
export { TimelineDensityRidge } from './TimelineDensityRidge';
export { TimelineCompactStrip } from './TimelineCompactStrip';
export { TimelineSpiralClock } from './TimelineSpiralClock';
export { TimelineFlameStack } from './TimelineFlameStack';

export type {
  TimelineStyle,
  TimelineColorMode,
  TimelineNode,
  TimelineData,
  TimelineRendererProps,
  TimelineLayout,
} from './timeline-types';

export {
  TIMELINE_STYLES,
  TIMELINE_STYLE_LABELS,
  TIMELINE_COLOR_MODES,
  TIMELINE_COLOR_MODE_LABELS,
} from './timeline-types';

export {
  normalizeToTimeline,
  resolveNodeColor,
  computeLayout,
  computeBuckets,
  formatDuration,
  formatTime,
  getThemeColors,
  mapToFlowTheme,
  isDramaticTheme,
  verticalSpinePath,
  rainbowArcPoints,
  quadraticBezierPoint,
} from './timeline-utils';

export type { TimeBucket } from './timeline-utils';
