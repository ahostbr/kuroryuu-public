/**
 * ExecutiveSummary Component — Imperial briefing panel
 * Comprehensive summary with metrics grid and recommendations.
 */
import React from 'react';

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
  key_metrics?: SummaryMetric[];
}

export function ExecutiveSummary({
  title = 'Executive Summary',
  summary,
  metrics,
  recommendations,
  key_metrics,
}: ExecutiveSummaryProps): React.ReactElement {
  const displayMetrics = metrics || key_metrics;

  return (
    <div className="genui-card genui-accent-left rounded-md overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3" style={{ borderBottom: '1px solid color-mix(in srgb, var(--g-accent) 8%, transparent)' }}>
        <h3 className="text-sm font-semibold tracking-wide" style={{ color: 'color-mix(in srgb, var(--g-accent) 75%, transparent)' }}>
          {title}
        </h3>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Summary text */}
        <p className="text-sm leading-relaxed" style={{ color: 'color-mix(in srgb, var(--g-fg) 85%, transparent)' }}>
          {summary}
        </p>

        {/* Metrics grid */}
        {displayMetrics && displayMetrics.length > 0 && (
          <div>
            <div className="genui-zone-header mb-3">
              <span className="genui-label">Key Metrics</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {displayMetrics.map((metric, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded"
                  style={{
                    background: 'color-mix(in srgb, var(--g-card) 60%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--g-accent) 8%, transparent)',
                  }}
                >
                  <div className="genui-label mb-1" style={{ fontSize: '0.55rem' }}>{metric.label}</div>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-lg font-bold"
                      style={{
                        color: 'var(--foreground)',
                        fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                      }}
                    >
                      {metric.value}
                    </span>
                    {metric.unit && (
                      <span className="text-xs" style={{ color: 'color-mix(in srgb, var(--g-muted) 50%, transparent)' }}>{metric.unit}</span>
                    )}
                    {metric.trend && (
                      <span style={{
                        color: metric.trend === 'up' ? '#34d399' : metric.trend === 'down' ? '#f87171' : 'color-mix(in srgb, var(--g-accent) 50%, transparent)',
                        fontSize: '0.7rem',
                      }}>
                        {metric.trend === 'up' ? '\u25B2' : metric.trend === 'down' ? '\u25BC' : '\u25C6'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations && recommendations.length > 0 && (
          <div>
            <div className="genui-zone-header mb-3">
              <span className="genui-label">Recommendations</span>
            </div>
            <div className="space-y-2">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <span
                    className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-xs font-bold"
                    style={{
                      background: 'color-mix(in srgb, var(--g-crimson) 20%, transparent)',
                      color: 'color-mix(in srgb, var(--g-accent) 70%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--g-crimson) 30%, transparent)',
                      fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                      fontSize: '0.6rem',
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-sm leading-relaxed" style={{ color: 'color-mix(in srgb, var(--g-fg) 75%, transparent)' }}>
                    {rec}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExecutiveSummary;
