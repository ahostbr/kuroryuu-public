/**
 * MetricRow Component
 * Displays multiple metrics in a horizontal row with labels, values, and optional units.
 */
import React from 'react';
import { Badge } from '../../../ui/badge';

export interface Metric {
  label: string;
  value: string | number;
  unit?: string;
}

export interface MetricRowProps {
  label?: string;
  metrics?: Metric[];
  value?: string | number;
  previous_value?: string | number;
  unit?: string;
  change_percentage?: number;
}

export function MetricRow({
  label,
  metrics,
  value,
  previous_value,
  unit,
  change_percentage,
}: MetricRowProps): React.ReactElement {
  if (value !== undefined && !metrics) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-primary/10 border border-border hover:border-primary/30 transition-all duration-200">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-3">
          {previous_value !== undefined && (
            <span className="text-xs text-muted-foreground line-through">
              {previous_value}{unit}
            </span>
          )}
          <span className="text-lg font-bold text-foreground">{value}{unit}</span>
          {change_percentage !== undefined && (
            <Badge variant={change_percentage > 0 ? 'default' : 'error'}>
              {change_percentage > 0 ? '+' : ''}{change_percentage}%
            </Badge>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6 p-3 rounded-lg bg-secondary/30 hover:bg-primary/10 border border-border hover:border-primary/30 transition-all duration-200">
      {label && <span className="text-sm font-medium text-muted-foreground mr-2">{label}</span>}
      <div className="flex flex-1 items-center gap-6 justify-around">
        {metrics?.map((metric: Metric, idx: number) => (
          <div key={idx} className="flex flex-col items-center gap-1">
            <span className="text-xs text-muted-foreground">{metric.label}</span>
            <span className="text-lg font-bold text-foreground">
              {metric.value}
              {metric.unit && <span className="text-sm text-muted-foreground ml-1">{metric.unit}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MetricRow;
