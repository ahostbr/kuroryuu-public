/**
 * ProgressRing Component
 * Displays a circular SVG progress indicator with percentage.
 */
import React from 'react';

export interface ProgressRingProps {
  percentage: number;
  label?: string;
  color?: 'success' | 'warning' | 'danger' | string;
  size?: number;
}

export function ProgressRing({
  percentage,
  label,
  color = 'primary',
  size = 100,
}: ProgressRingProps): React.ReactElement {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percentage / 100);

  const getColorClass = () => {
    switch (color) {
      case 'success': return 'text-emerald-400';
      case 'warning': return 'text-amber-400';
      case 'danger': return 'text-red-400';
      default: return 'text-primary';
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90 drop-shadow-lg" width="100%" height="100%" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-secondary" />
          <circle
            cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="8"
            className={getColorClass()}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-foreground">{Math.round(percentage)}%</span>
        </div>
      </div>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}

export default ProgressRing;
