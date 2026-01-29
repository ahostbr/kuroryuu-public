/**
 * PRD Selector Component
 *
 * Collapsible left sidebar for selecting PRDs in the workflow-first layout.
 * Collapsed by default to maximize graph visibility.
 */
import { useState } from 'react';
import { Plus, Archive, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePRDStore } from '../../stores/prd-store';
import { PRDSelectorItem } from './PRDSelectorItem';
import { ThemedPanel } from '../ui/ThemedPanel';
import { cn } from '../../lib/utils';

interface PRDSelectorProps {
  className?: string;
}

export function PRDSelector({ className }: PRDSelectorProps) {
  const [isCollapsed, setIsCollapsed] = useState(true); // Collapsed by default

  const {
    prds,
    selectedPrdId,
    selectPRD,
    openSessionManager,
  } = usePRDStore();

  const activePRDs = prds.filter(prd => !prd.is_archived);

  const handleGenerateClick = () => {
    usePRDStore.setState({ isGenerateDialogOpen: true });
  };

  // Collapsed view - narrow icon bar
  if (isCollapsed) {
    return (
      <ThemedPanel
        variant="sidebar"
        className={cn(
          'h-full flex flex-col w-14 flex-shrink-0 border-r border-border transition-all duration-200',
          className
        )}
      >
        {/* Expand button */}
        <div className="flex-shrink-0 p-2 border-b border-border">
          <button
            onClick={() => setIsCollapsed(false)}
            className="w-full p-2 rounded-lg hover:bg-muted transition-colors flex items-center justify-center"
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Icon buttons */}
        <div className="flex-1 flex flex-col items-center py-3 gap-2">
          {/* PRD count badge */}
          <div className="relative">
            <FileText className="w-5 h-5 text-primary" />
            {activePRDs.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
                {activePRDs.length}
              </span>
            )}
          </div>

          {/* New PRD button */}
          <button
            onClick={handleGenerateClick}
            className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            title="New PRD"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Sessions button */}
        <div className="flex-shrink-0 p-2 border-t border-border">
          <button
            onClick={openSessionManager}
            className="w-full p-2 rounded-lg hover:bg-muted transition-colors flex items-center justify-center"
            title="Sessions"
          >
            <Archive className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </ThemedPanel>
    );
  }

  // Expanded view - full sidebar
  return (
    <ThemedPanel
      variant="sidebar"
      className={cn('h-full flex flex-col w-72 flex-shrink-0 border-r border-border transition-all duration-200', className)}
    >
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">PRDs</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
              {activePRDs.length}
            </span>
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* New PRD Button */}
        <button
          onClick={handleGenerateClick}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New PRD
        </button>
      </div>

      {/* PRD List - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        {activePRDs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-primary/60" />
            </div>
            <p className="text-sm text-muted-foreground">
              No PRDs yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Create one to start
            </p>
          </div>
        ) : (
          <div className="py-2">
            {activePRDs.map(prd => (
              <PRDSelectorItem
                key={prd.id}
                prd={prd}
                isSelected={selectedPrdId === prd.id}
                onClick={() => selectPRD(selectedPrdId === prd.id ? null : prd.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-3 border-t border-border">
        <button
          onClick={openSessionManager}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm hover:bg-muted transition-colors"
        >
          <Archive className="w-4 h-4" />
          Sessions
        </button>
      </div>
    </ThemedPanel>
  );
}
