/**
 * ProConItem Component
 * Displays a pro or con item with icon, text, and optional weight/importance.
 */
import React from 'react';
import { Badge } from '../../../ui/badge';

export interface ProConItemProps {
  type: 'pro' | 'con';
  label: string;
  description?: string;
  weight?: string | number;
}

export function ProConItem({ type, label, description, weight }: ProConItemProps): React.ReactElement {
  const isPro = type === 'pro';
  const bgColor = isPro ? 'bg-emerald-500/10' : 'bg-red-500/10';
  const borderColor = isPro ? 'border-emerald-500/30' : 'border-red-500/30';
  const textColor = isPro ? 'text-emerald-400' : 'text-red-400';
  const icon = isPro ? '\u2713' : '\u2717';

  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg ${bgColor} border ${borderColor} hover:border-opacity-60 transition-all duration-200`}>
      <span className={`text-lg ${textColor} shrink-0 mt-0.5 font-bold`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm block text-foreground font-medium">{label}</span>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
      {weight !== undefined && weight !== null && (
        <Badge variant="secondary" className="shrink-0 bg-primary/10 text-primary">{weight}</Badge>
      )}
    </div>
  );
}

export default ProConItem;
