import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-foreground',
        primary: 'border-transparent bg-primary/20 text-primary border-primary/30',
        secondary: 'border-transparent bg-muted text-foreground',
        success: 'border-transparent bg-green-500/20 text-green-400 border-green-500/30',
        warning: 'border-transparent bg-primary/20 text-primary border-primary/30',
        error: 'border-transparent bg-red-500/20 text-red-400 border-red-500/30',
        info: 'border-transparent bg-blue-500/20 text-blue-400 border-blue-500/30',
        outline: 'border-border text-muted-foreground',
        // Task status variants
        backlog: 'border-transparent bg-muted text-muted-foreground',
        active: 'border-transparent bg-primary/20 text-primary border-primary/30',
        delayed: 'border-transparent bg-amber-500/20 text-amber-400 border-amber-500/30',
        done: 'border-transparent bg-green-500/20 text-green-400 border-green-500/30',
        // Agent status variants
        idle: 'border-transparent bg-muted text-muted-foreground',
        running: 'border-transparent bg-blue-500/20 text-blue-400 border-blue-500/30',
        paused: 'border-transparent bg-primary/20 text-primary border-primary/30',
        failed: 'border-transparent bg-red-500/20 text-red-400 border-red-500/30',
      },
      size: {
        default: 'px-2 py-0.5 text-xs',
        sm: 'px-1.5 py-0 text-[10px]',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
