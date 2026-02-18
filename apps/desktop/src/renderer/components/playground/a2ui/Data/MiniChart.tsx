/**
 * MiniChart Component
 * Displays a simple inline SVG chart (line or bar type).
 */
import React from 'react';

export interface MiniChartProps {
  data: number[];
  label?: string;
  type?: 'line' | 'bar';
  color?: string;
  height?: number;
}

export function MiniChart({
  data,
  label,
  type = 'bar',
  height = 48,
}: MiniChartProps): React.ReactElement {
  if (!data || data.length === 0) {
    return (
      <div className="space-y-1">
        {label && <div className="text-xs text-muted-foreground">{label}</div>}
        <div className="text-xs text-muted-foreground">No data</div>
      </div>
    );
  }

  const maxValue = Math.max(...data);
  const minValue = Math.min(...data);
  const range = maxValue - minValue || 1;

  const renderBarChart = () => (
    <div className="flex items-end gap-1 p-2 rounded-lg bg-secondary/30" style={{ height }}>
      {data.map((value: number, idx: number) => {
        const heightPercent = ((value - minValue) / range) * 100;
        return (
          <div
            key={idx}
            className="flex-1 bg-gradient-to-t from-primary to-primary/70 rounded-t transition-all hover:from-primary/80 hover:to-primary/60 shadow-sm"
            style={{ height: `${heightPercent}%`, minHeight: '2px' }}
            title={`${value}`}
          />
        );
      })}
    </div>
  );

  const renderLineChart = () => {
    const width = 200;
    const padding = 4;
    const segmentWidth = (width - padding * 2) / (data.length - 1 || 1);
    const points = data.map((value, idx) => {
      const x = padding + idx * segmentWidth;
      const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="p-2 rounded-lg bg-secondary/30">
        <svg width={width} height={height} className="w-full">
          <polyline
            points={points}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {data.map((value, idx) => {
            const x = padding + idx * segmentWidth;
            const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
            return (
              <circle key={idx} cx={x} cy={y} r="3" fill="var(--primary)">
                <title>{value}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {label && <div className="text-xs text-muted-foreground">{label}</div>}
      {type === 'bar' ? renderBarChart() : renderLineChart()}
    </div>
  );
}

export default MiniChart;
