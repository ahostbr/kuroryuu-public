/**
 * Columns Component
 * Flex-based column layout with configurable distribution.
 */
import React from 'react';
import { cn } from '../../../../lib/utils';

export interface ColumnsProps {
  count: 1 | 2 | 3;
  distribution?: 'equal' | 'auto';
  gap?: string;
  children: React.ReactNode;
  className?: string;
}

export function Columns({ distribution = 'equal', gap = '1rem', children, className }: ColumnsProps): React.ReactElement {
  const childArray = React.Children.toArray(children);

  return (
    <div className={cn('flex flex-col md:flex-row', className)} style={{ gap }}>
      {childArray.map((child, index) => (
        <div
          key={index}
          style={{ flex: distribution === 'equal' ? 1 : '0 1 auto' }}
          className={cn(index < childArray.length - 1 && 'md:border-r md:border-border md:pr-4')}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

export default Columns;
