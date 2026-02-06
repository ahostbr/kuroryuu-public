/**
 * ExecutiveSummary Component
 * Displays a comprehensive summary with optional title, overview text, metrics, and recommendations.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { Badge } from '../../../ui/badge';

export interface SummaryMetric {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface ExecutiveSummaryProps {
  title?: string;
  summary: string;
  metrics?: SummaryMetric[];
  recommendations?: string[];
}

export function ExecutiveSummary({
  title = 'Executive Summary',
  summary,
  metrics,
  recommendations,
}: ExecutiveSummaryProps): React.ReactElement {
  const getTrendIcon = (trend?: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up': return <span className="text-emerald-400">{'\u2191'}</span>;
      case 'down': return <span className="text-red-400">{'\u2193'}</span>;
      case 'neutral': return <span className="text-yellow-400">{'\u2192'}</span>;
      default: return null;
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-primary">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground">{summary}</p>
        {metrics && metrics.length > 0 && (
          <div>
            <h4 className="font-semibold text-sm mb-3 text-primary">Key Metrics</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {metrics.map((metric, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-secondary border border-border space-y-1">
                  <div className="text-xs text-muted-foreground">{metric.label}</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-foreground">{metric.value}</span>
                    {metric.unit && <span className="text-sm text-muted-foreground">{metric.unit}</span>}
                    {metric.trend && getTrendIcon(metric.trend)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {recommendations && recommendations.length > 0 && (
          <div>
            <h4 className="font-semibold text-sm mb-2 text-primary">Recommendations</h4>
            <ul className="space-y-2">
              {recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0 mt-0.5 border-primary/30 text-primary bg-primary/10">
                    {idx + 1}
                  </Badge>
                  <span className="text-sm text-foreground/80">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ExecutiveSummary;
