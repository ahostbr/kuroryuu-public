/**
 * PriorityBadge Component
 * Displays priority level with color-coding and optional directional icons.
 */
import React from 'react';
import { Badge } from '../../../ui/badge';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

interface PriorityConfig { label: string; color: string; icon: string; }

const PRIORITY_CONFIGS: Record<PriorityLevel, PriorityConfig> = {
  low: { label: 'Low', color: 'bg-secondary text-muted-foreground border-border', icon: '\u2193' },
  medium: { label: 'Medium', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: '\u2014' },
  high: { label: 'High', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: '\u2191' },
  critical: { label: 'Critical', color: 'bg-red-500/20 text-red-400 border-red-500/40', icon: '\u26A0' },
};

export interface PriorityBadgeProps {
  priority: PriorityLevel;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function PriorityBadge({ priority, showIcon = true, showLabel = true, size = 'md' }: PriorityBadgeProps): React.ReactElement {
  const config = PRIORITY_CONFIGS[priority] || PRIORITY_CONFIGS.medium;
  const sizeClasses = { sm: 'text-xs px-2 py-0.5', md: 'text-sm px-2.5 py-1', lg: 'text-base px-3 py-1.5' };

  return (
    <Badge variant="outline" className={`${config.color} ${sizeClasses[size]} font-medium flex items-center gap-1.5 w-fit`}>
      {showIcon && <span className="flex-shrink-0">{config.icon}</span>}
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );
}

export default PriorityBadge;
