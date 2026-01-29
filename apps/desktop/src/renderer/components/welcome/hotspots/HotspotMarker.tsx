import React from 'react';
import { cn } from '../../../lib/utils';

interface HotspotMarkerProps {
  x: number;      // 0-1 normalized
  y: number;      // 0-1 normalized
  w: number;      // 0-1 normalized width
  h: number;      // 0-1 normalized height
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export function HotspotMarker({
  x,
  y,
  w,
  h,
  label,
  isActive,
  onClick,
}: HotspotMarkerProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'absolute group cursor-pointer transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background',
        isActive && 'z-10'
      )}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
      }}
      aria-label={`Learn about ${label}`}
    >
      {/* Hover/Active highlight area */}
      <div
        className={cn(
          'absolute inset-0 rounded-lg border-2 transition-all duration-200',
          isActive
            ? 'border-primary bg-primary/10'
            : 'border-transparent group-hover:border-primary/50 group-hover:bg-primary/5'
        )}
      />

      {/* Pulsing ring indicator - positioned at center-top of region */}
      <div className="absolute left-1/2 top-2 -translate-x-1/2 pointer-events-none">
        {/* Outer pulsing ring */}
        <div
          className={cn(
            'absolute -inset-3 rounded-full bg-primary/20',
            !isActive && 'animate-ping'
          )}
          style={{ animationDuration: '2s' }}
        />
        {/* Inner static ring */}
        <div
          className={cn(
            'relative w-4 h-4 rounded-full border-2 transition-all duration-200',
            isActive
              ? 'bg-primary border-primary scale-125'
              : 'bg-primary/80 border-primary group-hover:scale-110'
          )}
        >
          {/* Center dot */}
          <div className="absolute inset-1 rounded-full bg-background" />
        </div>
      </div>

      {/* Tooltip on hover (when not active) */}
      {!isActive && (
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 bottom-full mb-2',
            'px-3 py-1.5 rounded-lg bg-popover text-popover-foreground text-sm',
            'border border-border shadow-lg',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
            'whitespace-nowrap pointer-events-none'
          )}
        >
          <span className="font-medium">Click to learn</span>
          <div className="text-xs text-muted-foreground">{label}</div>
          {/* Tooltip arrow */}
          <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-px">
            <div className="border-8 border-transparent border-t-border" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 border-[7px] border-transparent border-t-popover" />
          </div>
        </div>
      )}
    </button>
  );
}
