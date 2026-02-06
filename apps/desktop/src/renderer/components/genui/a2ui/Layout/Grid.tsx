/**
 * Grid Component
 * A responsive grid layout with configurable columns and gap spacing.
 */
import React from 'react';
import { cn } from '../../../../lib/utils';

export interface GridProps {
  columns?: 1 | 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

export function Grid({ columns = 2, gap = 'md', children, className }: GridProps): React.ReactElement {
  const gapClasses = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };
  const columnClasses = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' };

  return (
    <div className={cn('grid', 'grid-cols-1', columnClasses[columns], gapClasses[gap], className)}>
      {children}
    </div>
  );
}

export default Grid;
