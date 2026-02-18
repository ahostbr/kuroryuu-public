/**
 * CategoryBadge Component — Imperial category label
 * Terminal-style badge with gold accent.
 */
import React from 'react';

export type CategorySize = 'sm' | 'md' | 'lg';

export interface CategoryBadgeProps {
  category: string;
  color?: string;
  icon?: string | React.ReactNode;
  size?: CategorySize;
  removable?: boolean;
  onRemove?: () => void;
}

const SIZE_STYLES: Record<CategorySize, React.CSSProperties> = {
  sm: { fontSize: '0.6rem', padding: '2px 8px' },
  md: { fontSize: '0.65rem', padding: '3px 10px' },
  lg: { fontSize: '0.75rem', padding: '4px 12px' },
};

export function CategoryBadge({ category, icon, size = 'md', removable = false, onRemove }: CategoryBadgeProps): React.ReactElement {
  return (
    <span
      className="genui-tag inline-flex items-center gap-1.5"
      style={SIZE_STYLES[size]}
    >
      {icon && <span className="flex-shrink-0">{typeof icon === 'string' ? icon : icon}</span>}
      <span>{category}</span>
      {removable && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
          className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Remove category"
        >
          {'\u00D7'}
        </button>
      )}
    </span>
  );
}

export default CategoryBadge;
