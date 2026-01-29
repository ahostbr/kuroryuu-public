import React from 'react';
import { GitBranch } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { ArchitectureDiagram } from '../architecture';

interface ArchitectureSectionProps {
  className?: string;
}

export function ArchitectureSection({ className }: ArchitectureSectionProps) {
  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <GitBranch className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">System Architecture</h2>
          <p className="text-sm text-muted-foreground">
            Interactive diagram of Kuroryuu&apos;s components
          </p>
        </div>
      </div>

      {/* Architecture diagram */}
      <ArchitectureDiagram />
    </div>
  );
}
