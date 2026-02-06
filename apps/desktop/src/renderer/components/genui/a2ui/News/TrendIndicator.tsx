/**
 * TrendIndicator Component
 * Displays a metric with its current value, change percentage, and trend direction.
 */
import React from 'react';

export interface TrendIndicatorProps {
  metric?: string;
  label?: string;
  value: string | number;
  change?: string | number;
  trend: 'up' | 'down' | 'stable';
  period?: string;
  unit?: string;
}

export function TrendIndicator({ metric, label, value, change, trend, period, unit }: TrendIndicatorProps): React.ReactElement {
  const displayMetric = metric || label || 'Metric';

  const formatChange = () => {
    if (change === undefined || change === null) return '';
    const changeStr = typeof change === 'number' ? change.toString() : change;
    const prefix = typeof change === 'number' && change > 0 ? '+' : '';
    return `${prefix}${changeStr}${unit || ''}`;
  };

  const getTrendColor = () => {
    if (trend === 'up') return 'text-emerald-400';
    if (trend === 'down') return 'text-red-400';
    return 'text-muted-foreground';
  };

  const getTrendIcon = () => {
    if (trend === 'up') return '\u2191';
    if (trend === 'down') return '\u2193';
    return '\u2192';
  };

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border hover:border-primary/40 transition-all duration-300">
      <div className="flex-1">
        <div className="text-sm font-medium text-muted-foreground">{displayMetric}</div>
        <div className="text-2xl font-bold text-foreground">{value}{unit && <span className="text-lg text-muted-foreground ml-1">{unit}</span>}</div>
      </div>
      <div className={`flex items-center gap-1 ${getTrendColor()}`}>
        <span className="text-lg animate-pulse" aria-label={`Trend ${trend}`}>{getTrendIcon()}</span>
        {formatChange() && <span className="font-semibold">{formatChange()}</span>}
      </div>
      {period && <div className="text-xs text-muted-foreground">{period}</div>}
    </div>
  );
}

export default TrendIndicator;
