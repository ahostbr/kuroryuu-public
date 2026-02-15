/**
 * PRD Workflow Page Component
 *
 * Main orchestrator for the workflow-first PRD experience.
 * Layout: [PRD Selector (left)] + [WorkflowGraph (center)] + [Node Detail Panel (right slide-in)]
 */
import { useCallback, useEffect, useState } from 'react';
import { usePRDStore } from '../../stores/prd-store';
import { PRDSelector } from './PRDSelector';
import { PRDGenerateDialog } from './PRDGenerateDialog';
import { PRDGenerationProgress } from './PRDGenerationProgress';
import { PRDSessionManager } from './PRDSessionManager';
import { PRDList } from './PRDList';
import { WorkflowGraph } from './workflow-graph/WorkflowGraph';
import { WorkflowNodeDetailPanel } from './workflow-graph/WorkflowNodeDetailPanel';
import type { WorkflowType, PRDStatus } from '../../types/prd';
import { cn } from '../../lib/utils';
import { Network, LayoutGrid } from 'lucide-react';

// Status badge component
function StatusBadge({ status }: { status: PRDStatus }) {
  const colors: Record<PRDStatus, string> = {
    draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    in_review: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    approved: 'bg-green-500/10 text-green-400 border-green-500/20',
    in_progress: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    complete: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };

  const labels: Record<PRDStatus, string> = {
    draft: 'Draft',
    in_review: 'In Review',
    approved: 'Approved',
    in_progress: 'In Progress',
    complete: 'Complete',
  };

  return (
    <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium border', colors[status])}>
      {labels[status]}
    </span>
  );
}

// Scope badge component
function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20 capitalize">
      {scope}
    </span>
  );
}

// PRD Status Header - floating overlay on the graph
function PRDStatusHeader() {
  const selectedPRD = usePRDStore(state => state.prds.find(p => p.id === state.selectedPrdId));

  if (!selectedPRD) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
      <div className="px-6 py-3 bg-card/90 backdrop-blur-md border border-border rounded-xl shadow-lg">
        <h2 className="text-lg font-semibold text-foreground text-center mb-2 max-w-md truncate">
          {selectedPRD.title}
        </h2>
        <div className="flex items-center justify-center gap-3">
          <StatusBadge status={selectedPRD.status} />
          <ScopeBadge scope={selectedPRD.scope} />
        </div>
      </div>
    </div>
  );
}

export function PRDWorkflowPage() {
  const {
    prds,
    selectedPrdId,
    isGenerating,
    generationProgress,
    cancelGeneration,
    selectWorkflowNode,
    executingWorkflows,
  } = usePRDStore();

  const selectedPRD = prds.find(p => p.id === selectedPrdId);
  const [viewMode, setViewMode] = useState<'graph' | 'card'>('graph');

  // Get executing workflow for selected PRD
  const executingWorkflow = selectedPrdId ? executingWorkflows[selectedPrdId] : undefined;

  // Handle node click - opens detail panel or generate dialog for generate-prd
  const handleNodeClick = useCallback((workflow: WorkflowType) => {
    if (workflow === 'generate-prd') {
      // Open generate dialog instead of detail panel
      usePRDStore.setState({ isGenerateDialogOpen: true });
    } else {
      selectWorkflowNode(workflow);
    }
  }, [selectWorkflowNode]);

  // Listen for focus-terminal events to switch to Terminals tab
  useEffect(() => {
    const handleFocusTerminal = (event: CustomEvent) => {
      const { ptyId } = event.detail;
      console.log('[PRDWorkflowPage] Switching to terminals tab:', ptyId);
      // Switch to terminals tab via custom event (Dojo listens for this)
      window.dispatchEvent(new CustomEvent('switch-dojo-tab', { detail: { tab: 'terminals' } }));
    };

    window.addEventListener('focus-terminal', handleFocusTerminal as EventListener);
    return () => {
      window.removeEventListener('focus-terminal', handleFocusTerminal as EventListener);
    };
  }, []);

  // Generation in progress - show progress overlay
  if (isGenerating) {
    return (
      <PRDGenerationProgress
        progress={generationProgress}
        onCancel={cancelGeneration}
      />
    );
  }

  // Main workflow-first layout - ALWAYS show WorkflowGraph (no empty states)
  return (
    <div className="h-full flex overflow-hidden">
      {/* Left: PRD Selector (collapsible, collapsed by default) */}
      <PRDSelector />

      {/* Center: Workflow Graph or Card View */}
      <div className="flex-1 relative overflow-hidden bg-background flex flex-col">
        {/* View Toggle Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
          {selectedPRD && (
            <div className="px-6 py-2 bg-card border border-border rounded-lg shadow-sm">
              <h2 className="text-sm font-semibold text-foreground max-w-md truncate">
                {selectedPRD.title}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={selectedPRD.status} />
                <ScopeBadge scope={selectedPRD.scope} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('graph')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                viewMode === 'graph'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground hover:bg-muted'
              )}
            >
              <Network className="w-4 h-4" />
              Graph View
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                viewMode === 'card'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground hover:bg-muted'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
              Card View
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'graph' ? (
            <WorkflowGraph
              prdId={selectedPRD?.id}
              currentStatus={selectedPRD?.status}
              onWorkflowExecute={handleNodeClick}
              isExecuting={!!executingWorkflow}
              executingWorkflow={executingWorkflow?.workflow || null}
            />
          ) : (
            <PRDList />
          )}
        </div>
      </div>

      {/* Right: Node Detail Panel (slide-in) */}
      <WorkflowNodeDetailPanel />

      {/* Dialogs */}
      <PRDGenerateDialog />
      <PRDSessionManager />
    </div>
  );
}
