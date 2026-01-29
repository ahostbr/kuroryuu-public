/**
 * KPICard - Individual metric card for the KPI dashboard row
 * Features:
 * - Big numeric value with unit
 * - Trend indicator (up/down/flat)
 * - Sparkline visualization
 * - Health status styling (normal/warning/error)
 */
import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { SparkLine } from './SparkLine';

export type KPITrend = 'up' | 'down' | 'flat';
export type KPIStatus = 'normal' | 'warning' | 'error';

interface KPICardProps {
  /** Metric label (e.g., "REQ/SEC", "LATENCY") */
  label: string;
  /** Current value to display */
  value: number;
  /** Unit string (e.g., "ms", "%", "live") */
  unit?: string;
  /** Historical data for sparkline (last N values) */
  history?: number[];
  /** Trend direction */
  trend?: KPITrend;
  /** Trend percentage change */
  trendValue?: number;
  /** Health status affecting visual styling */
  status?: KPIStatus;
  /** Format function for the value */
  formatValue?: (value: number) => string;
  /** Optional click handler */
  onClick?: () => void;
}

/**
 * Default value formatter - shows up to 1 decimal for floats
 */
function defaultFormat(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  if (value < 10) {
    return value.toFixed(2);
  }
  if (value < 100) {
    return value.toFixed(1);
  }
  return Math.round(value).toString();
}

/**
 * Get trend icon component
 */
function TrendIcon({ trend }: { trend: KPITrend }) {
  const iconProps = { size: 12, strokeWidth: 2.5 };

  switch (trend) {
    case 'up':
      return <TrendingUp {...iconProps} />;
    case 'down':
      return <TrendingDown {...iconProps} />;
    default:
      return <Minus {...iconProps} />;
  }
}

export function KPICard({
  label,
  value,
  unit,
  history = [],
  trend = 'flat',
  trendValue,
  status = 'normal',
  formatValue = defaultFormat,
  onClick,
}: KPICardProps) {
  // Compute status class
  const statusClass = useMemo(() => {
    switch (status) {
      case 'error':
        return 'graphiti-kpi-card--error';
      case 'warning':
        return 'graphiti-kpi-card--warning';
      default:
        return '';
    }
  }, [status]);

  // Compute trend class
  const trendClass = useMemo(() => {
    switch (trend) {
      case 'up':
        return 'graphiti-kpi-trend--up';
      case 'down':
        return 'graphiti-kpi-trend--down';
      default:
        return 'graphiti-kpi-trend--flat';
    }
  }, [trend]);

  // Format the displayed value
  const displayValue = formatValue(value);

  // Format trend percentage
  const trendDisplay = trendValue !== undefined
    ? `${trendValue > 0 ? '+' : ''}${trendValue.toFixed(1)}%`
    : null;

  return (
    <div
      className={`graphiti-kpi-card ${statusClass}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {/* Header: Label + Trend */}
      <div className="graphiti-kpi-header">
        <span className="graphiti-kpi-label">{label}</span>
        {(trend !== 'flat' || trendDisplay) && (
          <div className={`graphiti-kpi-trend ${trendClass}`}>
            <TrendIcon trend={trend} />
            {trendDisplay && <span>{trendDisplay}</span>}
          </div>
        )}
      </div>

      {/* Value + Unit */}
      <div className="graphiti-kpi-value-row">
        <span className="graphiti-kpi-value">{displayValue}</span>
        {unit && <span className="graphiti-kpi-unit">{unit}</span>}
      </div>

      {/* Sparkline */}
      <div className="graphiti-kpi-sparkline">
        <SparkLine
          data={history}
          width={120}
          height={24}
          showDot={history.length > 0}
          showFill={true}
          animate={false}
        />
      </div>
    </div>
  );
}

export default KPICard;
