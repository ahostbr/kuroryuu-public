/**
 * RankedItem Component
 * Displays a numbered/ranked list item with optional description, badge, and score.
 */
import React from 'react';
import { Badge } from '../../../ui/badge';

export interface RankedItemProps {
  rank: number;
  label: string;
  value?: string;
  color?: string;
  badge?: string;
  score?: string | number;
}

export function RankedItem({ rank, label, value, badge, score }: RankedItemProps): React.ReactElement {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/40 transition-all duration-200">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm shrink-0">
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-semibold text-foreground">{label}</span>
          {badge && <Badge variant="secondary" className="bg-primary/20 text-primary">{badge}</Badge>}
        </div>
        {value && <p className="text-sm text-muted-foreground">{value}</p>}
      </div>
      {score !== undefined && score !== null && (
        <div className="text-lg font-bold text-primary shrink-0">{score}</div>
      )}
    </div>
  );
}

export default RankedItem;
