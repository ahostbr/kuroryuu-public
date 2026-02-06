/**
 * CategoryBadge Component
 * Displays a category with color-coded background and optional icon.
 */
import React from 'react';
import { Badge } from '../../../ui/badge';

export type CategorySize = 'sm' | 'md' | 'lg';

export interface CategoryBadgeProps {
  category: string;
  color?: string;
  icon?: string | React.ReactNode;
  size?: CategorySize;
  removable?: boolean;
  onRemove?: () => void;
}

export function CategoryBadge({ category, color, icon, size = 'md', removable = false, onRemove }: CategoryBadgeProps): React.ReactElement {
  const badgeColor = color || 'bg-secondary text-foreground border-border';
  const sizeClasses = { sm: 'text-xs px-2 py-0.5', md: 'text-sm px-2.5 py-1', lg: 'text-base px-3 py-1.5' };

  return (
    <Badge variant="outline" className={`${badgeColor} ${sizeClasses[size]} font-medium flex items-center gap-1.5 w-fit`}>
      {icon && <span className="flex-shrink-0">{typeof icon === 'string' ? icon : icon}</span>}
      <span>{category}</span>
      {removable && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
          className="ml-0.5 hover:bg-primary/20 rounded-full p-0.5 transition-colors"
          aria-label="Remove category"
        >
          {'\u00D7'}
        </button>
      )}
    </Badge>
  );
}

export default CategoryBadge;
