/**
 * StatCard Component — Imperial metric display
 * Dramatic stat visualization with gold accents and trend indicators.
 */
import React from 'react';

export interface StatCardProps {
  label?: string;
  title?: string;
  value: string | number;
  unit?: string;
  trend?: string;
  change?: number;
  changeType?: string;
  trendValue?: string | number;
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
  trendValue,
  icon,
  highlight,
}: StatCardProps): React.ReactElement {
  const displayLabel = label || title || 'Metric';

  const displayTrend = trend || (trendValue !== undefined ? String(trendValue) : undefined);

  const isUp = displayTrend === 'up' || (typeof displayTrend === 'string' && displayTrend.startsWith('+'));
  const isDown = displayTrend === 'down' || (typeof displayTrend === 'string' && displayTrend.startsWith('-'));

  return (
    <div
      className="genui-metric rounded-md p-4 group cursor-default"
      style={{
        minHeight: '100px',
        ...(highlight ? { boxShadow: '0 0 0 1px color-mix(in srgb, var(--g-accent) 30%, transparent)' } : {}),
      }}
    >
      {/* Label */}
      <div
        className="genui-label mb-3"
        style={{ color: 'color-mix(in srgb, var(--g-accent) 50%, transparent)', fontSize: '0.6rem' }}
      >
        {displayLabel}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-2">
        <span
          className="text-3xl font-bold tracking-tight"
          style={{
            color: 'var(--foreground)',
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            textShadow: highlight ? '0 0 20px color-mix(in srgb, var(--g-accent) 15%, transparent)' : 'none',
          }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-sm" style={{ color: 'color-mix(in srgb, var(--g-muted) 50%, transparent)' }}>
            {unit}
          </span>
        )}
      </div>

      {/* Trend */}
      {displayTrend && (
        <div className="flex items-center gap-1.5 mt-2">
          <span
            style={{
              color: isUp ? '#34d399' : isDown ? '#f87171' : 'color-mix(in srgb, var(--g-accent) 50%, transparent)',
              fontSize: '0.75rem',
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            }}
          >
            {isUp ? '\u25B2' : isDown ? '\u25BC' : '\u25C6'}{' '}
            {displayTrend !== 'up' && displayTrend !== 'down' && displayTrend !== 'neutral' ? displayTrend : ''}
          </span>
        </div>
      )}

      {/* Hover glow line at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] transition-opacity duration-300 opacity-0 group-hover:opacity-100"
        style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--g-accent) 40%, transparent), transparent)' }}
      />
    </div>
  );
}

export default StatCard;
