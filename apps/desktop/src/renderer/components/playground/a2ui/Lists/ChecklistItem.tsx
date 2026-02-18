/**
 * ChecklistItem Component
 * Displays a checkbox with label and optional category badge.
 */
import React from 'react';
import { Badge } from '../../../ui/badge';

export interface ChecklistItemProps {
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  category?: string;
}

export function ChecklistItem({ label, checked, onChange, disabled = false, category }: ChecklistItemProps): React.ReactElement {
  const handleClick = () => {
    if (!disabled && onChange) onChange(!checked);
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border hover:border-primary/40 transition-all duration-200 hover:shadow-sm ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.01]'
      }`}
      onClick={handleClick}
    >
      <div
        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
          checked ? 'bg-primary border-primary' : 'border-muted-foreground/50 hover:border-primary'
        }`}
      >
        {checked && <span className="text-primary-foreground text-xs font-bold">{'\u2713'}</span>}
      </div>
      <span className={`flex-1 transition-all duration-200 ${checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
        {label}
      </span>
      {category && (
        <Badge variant="outline" className="text-xs shrink-0 bg-primary/10 text-primary border-primary/30">{category}</Badge>
      )}
    </div>
  );
}

export default ChecklistItem;
