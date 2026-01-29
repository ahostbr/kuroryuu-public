/**
 * PRD Selector Item Component
 *
 * Compact PRD item for the left sidebar selector
 */
import { FileText, Layers, Box } from 'lucide-react';
import type { PRD, PRDScope, PRDStatus } from '../../types/prd';
import { cn } from '../../lib/utils';

interface PRDSelectorItemProps {
  prd: PRD;
  isSelected: boolean;
  onClick: () => void;
}

const SCOPE_ICONS: Record<PRDScope, typeof FileText> = {
  task: FileText,
  feature: Layers,
  epic: Box,
};

const STATUS_COLORS: Record<PRDStatus, string> = {
  draft: 'bg-gray-400',
  in_review: 'bg-yellow-400',
  approved: 'bg-green-400',
  in_progress: 'bg-blue-400',
  complete: 'bg-emerald-500',
};

export function PRDSelectorItem({ prd, isSelected, onClick }: PRDSelectorItemProps) {
  const ScopeIcon = SCOPE_ICONS[prd.scope];

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-3 text-left border-l-2 transition-all duration-200',
        'hover:bg-secondary/50',
        isSelected
          ? 'bg-primary/10 border-l-primary'
          : 'border-l-transparent'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Status dot */}
        <div className="mt-1.5 flex-shrink-0">
          <div className={cn('w-2 h-2 rounded-full', STATUS_COLORS[prd.status])} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className={cn(
            'text-sm font-medium truncate',
            isSelected ? 'text-primary' : 'text-foreground'
          )}>
            {prd.title}
          </h4>

          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ScopeIcon className="w-3 h-3" />
              <span className="capitalize">{prd.scope}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(prd.updated_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
