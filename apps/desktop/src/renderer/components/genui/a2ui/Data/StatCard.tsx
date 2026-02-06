/**
 * StatCard Component
 * Displays a single statistic with label, value, optional unit and trend indicator.
 */
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '../../../ui/card';

export interface StatCardProps {
  label?: string;
  title?: string;
  value: string | number;
  unit?: string;
  trend?: string;
  change?: number;
  changeType?: string;
  icon?: string;
  color?: string;
  backgroundColor?: string;
  highlight?: boolean;
}

export function StatCard({
  label,
  title,
  value,
  unit,
  trend,
  change,
  changeType,
  icon,
  highlight,
}: StatCardProps): React.ReactElement {
  const displayLabel = label || title || 'Metric';

  const computedTrend = trend || (change !== undefined && change !== null
    ? `${change >= 0 ? '+' : ''}${change}${unit === '%' ? '' : '%'}`
    : undefined);

  const getTrendColor = () => {
    if (computedTrend) {
      if (computedTrend.startsWith('+')) return 'text-emerald-400';
      if (computedTrend.startsWith('-')) return 'text-red-400';
    }
    if (changeType === 'positive') return 'text-emerald-400';
    if (changeType === 'negative') return 'text-red-400';
    return 'text-muted-foreground';
  };

  return (
    <Card className={`border-border bg-card ${highlight ? 'ring-2 ring-primary/50' : ''} group cursor-default hover:border-primary/40`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardDescription className="text-muted-foreground">{displayLabel}</CardDescription>
          {icon && <span className="text-2xl transition-transform duration-200 group-hover:scale-110">{icon}</span>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-foreground">
          {value}
          {unit && <span className="text-lg text-muted-foreground ml-1">{unit}</span>}
        </div>
        {computedTrend && (
          <p className={`text-sm mt-1 font-medium ${getTrendColor()}`}>
            {computedTrend}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default StatCard;
