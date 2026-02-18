/**
 * StatusIndicator Component
 * Displays status with appropriate color-coding and optional pulse animation.
 */
import React from 'react';
import { Badge } from '../../../ui/badge';

export type StatusType = 'active' | 'inactive' | 'pending' | 'completed' | 'error' | 'warning';

interface StatusConfig { label: string; color: string; dotColor: string; }

const STATUS_CONFIGS: Record<StatusType, StatusConfig> = {
  active: { label: 'Active', color: 'bg-primary/20 text-primary border-primary/40', dotColor: 'bg-primary' },
  inactive: { label: 'Inactive', color: 'bg-muted text-muted-foreground border-border', dotColor: 'bg-muted-foreground' },
  pending: { label: 'Pending', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', dotColor: 'bg-yellow-400' },
  completed: { label: 'Completed', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', dotColor: 'bg-emerald-400' },
  error: { label: 'Error', color: 'bg-red-500/20 text-red-400 border-red-500/40', dotColor: 'bg-red-400' },
  warning: { label: 'Warning', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', dotColor: 'bg-amber-400' },
};

export interface StatusIndicatorProps {
  status: StatusType;
  label?: string;
  pulse?: boolean;
  showDot?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusIndicator({ status, label, pulse = false, showDot = true, size = 'md' }: StatusIndicatorProps): React.ReactElement {
  const config = STATUS_CONFIGS[status] || STATUS_CONFIGS.inactive;
  const displayLabel = label || config.label;
  const sizeClasses = { sm: 'text-xs px-2 py-0.5', md: 'text-sm px-2.5 py-1', lg: 'text-base px-3 py-1.5' };

  return (
    <Badge variant="outline" className={`${config.color} ${sizeClasses[size]} font-medium flex items-center gap-1.5 w-fit`}>
      {showDot && (
        <span className="relative flex-shrink-0">
          <span className={`inline-block w-2 h-2 rounded-full ${config.dotColor} ${pulse && status === 'active' ? 'animate-pulse' : ''}`} />
        </span>
      )}
      <span>{displayLabel}</span>
    </Badge>
  );
}

export default StatusIndicator;
