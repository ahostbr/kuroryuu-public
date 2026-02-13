import React from 'react';

interface CompletionRingProps {
  percentage: number; // 0-100
  size?: number;      // default 36
}

export function CompletionRing({ percentage, size = 36 }: CompletionRingProps) {
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <div
        className="td-completion-ring absolute inset-0"
        style={{ '--td-completion': `${Math.min(100, Math.max(0, percentage))}%`, width: size, height: size } as React.CSSProperties}
      />
      <span className="relative text-[10px] font-bold text-foreground">
        {Math.round(percentage)}%
      </span>
    </div>
  );
}
