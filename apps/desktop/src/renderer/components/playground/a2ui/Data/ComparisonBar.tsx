/**
 * ComparisonBar Component
 * Displays horizontal bars comparing multiple values.
 */
import React from 'react';

interface ComparisonItem {
  label: string;
  value: number;
  color?: string;
}

export interface ComparisonBarProps {
  label: string;
  items?: ComparisonItem[];
  max_value?: number;
  maxValue?: number;
  value_a?: number;
  value_b?: number;
  label_a?: string;
  label_b?: string;
}

const BAR_COLORS = [
  'from-primary to-primary/70',
  'from-accent to-primary/70',
  'from-purple-500 to-primary/70',
  'from-teal-500 to-accent',
  'from-indigo-500 to-primary/70',
];

export function ComparisonBar({
  label,
  items,
  max_value,
  maxValue,
  value_a,
  value_b,
  label_a,
  label_b,
}: ComparisonBarProps): React.ReactElement {
  const displayItems: ComparisonItem[] = items && items.length > 0
    ? items
    : [
        ...(value_a !== undefined && label_a ? [{ label: label_a, value: value_a }] : []),
        ...(value_b !== undefined && label_b ? [{ label: label_b, value: value_b }] : []),
      ];

  const calculatedMax = max_value || maxValue || Math.max(...displayItems.map(item => item.value), 1);

  if (displayItems.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-secondary/30 border border-border">
        <div className="text-sm text-muted-foreground">No data to display</div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 rounded-xl bg-secondary/30 border border-border">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      {displayItems.map((item, index) => {
        const percent = (item.value / calculatedMax) * 100;
        const colorClass = BAR_COLORS[index % BAR_COLORS.length];
        return (
          <div key={item.label || index} className="flex items-center gap-2">
            <span className="text-xs w-24 text-right text-muted-foreground truncate" title={item.label}>
              {item.label}
            </span>
            <div className="flex-1 h-6 bg-secondary rounded-full overflow-hidden flex">
              <div
                className={`bg-gradient-to-r ${colorClass} h-full transition-all duration-500`}
                style={{ width: `${Math.min(percent, 100)}%` }}
              />
            </div>
            <span className="text-xs w-14 font-semibold text-foreground text-right">{item.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export default ComparisonBar;
