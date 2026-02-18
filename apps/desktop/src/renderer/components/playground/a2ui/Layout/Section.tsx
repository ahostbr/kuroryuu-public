/**
 * Section Component
 * A layout container/wrapper with optional header (title and subtitle).
 */
import React from 'react';
import { cn } from '../../../../lib/utils';

export interface SectionProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  fullWidth?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Section({ title, subtitle, children, fullWidth = false, maxWidth = 'lg', className }: SectionProps): React.ReactElement {
  const maxWidthClasses = { sm: 'max-w-2xl', md: 'max-w-4xl', lg: 'max-w-6xl', xl: 'max-w-7xl' };

  return (
    <section className={cn('space-y-4 p-6 rounded-lg bg-card border border-border', !fullWidth && maxWidthClasses[maxWidth], !fullWidth && 'mx-auto', className)}>
      {(title || subtitle) && (
        <div className="space-y-2 border-b border-border pb-4">
          {title && <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>}
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default Section;
