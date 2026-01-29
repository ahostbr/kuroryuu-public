/**
 * PRD List Component - Main Orchestrator
 *
 * Manages PRD grid display, generation flow, and detail panel
 * Follows the pattern from Ideation.tsx
 */
import { useState } from 'react';
import { FileText, Plus, Filter, Archive } from 'lucide-react';
import { usePRDStore } from '../../stores/prd-store';
import { PRDCard } from './PRDCard';
import { PRDEmptyState } from './PRDEmptyState';
import { PRDGenerateDialog } from './PRDGenerateDialog';
import { PRDGenerationProgress } from './PRDGenerationProgress';
import { PRDDetailPanel } from './PRDDetailPanel';
import { PRDSessionManager } from './PRDSessionManager';
import type { PRDStatus } from '../../types/prd';
import { toast } from '../ui/toast';

interface PRDListProps {
  onExecuteWithFormula?: (prdId: string) => void;
}

export function PRDList({ onExecuteWithFormula }: PRDListProps) {
  const {
    prds,
    selectedPrdId,
    isGenerating,
    generationProgress,
    isDetailPanelOpen,
    selectPRD,
    dismissPRD,
    dismissAll,
    cancelGeneration,
    executePRDWithFormula,
    updatePRDStatus,
    openSessionManager,
  } = usePRDStore();

  const [statusFilter, setStatusFilter] = useState<PRDStatus | 'all'>('all');

  // Filter PRDs
  const activePRDs = prds.filter(prd => !prd.is_archived);
  const filteredPRDs = statusFilter === 'all'
    ? activePRDs
    : activePRDs.filter(prd => prd.status === statusFilter);

  const selectedPRD = prds.find(p => p.id === selectedPrdId);

  // Handle new PRD button
  const handleGenerateClick = () => {
    usePRDStore.setState({ isGenerateDialogOpen: true });
  };

  // Handle PRD dismiss
  const handleDismiss = (id: string) => {
    dismissPRD(id);
  };

  // Handle PRD select
  const handleSelect = (id: string) => {
    selectPRD(selectedPrdId === id ? null : id);
  };

  // Handle execute with formula
  const handleExecute = (prdId: string) => {
    if (onExecuteWithFormula) {
      onExecuteWithFormula(prdId);
    } else {
      executePRDWithFormula(prdId);
    }
  };

  // Handle export
  const handleExport = async (prdId: string, format: 'markdown' | 'pdf') => {
    const prd = prds.find(p => p.id === prdId);
    if (!prd) {
      toast.error('PRD not found');
      return;
    }

    if (format === 'pdf') {
      toast.info('PDF export not yet implemented');
      return;
    }

    try {
      // Export as markdown
      const lines: string[] = [];
      lines.push(`# ${prd.title}`);
      lines.push('');
      lines.push(`**Scope**: ${prd.scope}`);
      lines.push(`**Status**: ${prd.status}`);
      lines.push(`**Created**: ${new Date(prd.created_at).toLocaleString()}`);
      lines.push(`**Updated**: ${new Date(prd.updated_at).toLocaleString()}`);
      if (prd.metadata?.author) {
        lines.push(`**Author**: ${prd.metadata.author}`);
      }
      if (prd.metadata?.tags && prd.metadata.tags.length > 0) {
        lines.push(`**Tags**: ${prd.metadata.tags.join(', ')}`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(prd.content);

      const markdown = lines.join('\n');
      await navigator.clipboard.writeText(markdown);
      toast.success('PRD exported to clipboard as Markdown');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export PRD');
    }
  };

  // Empty state
  if (prds.length === 0 && !isGenerating) {
    return (
      <>
        <PRDEmptyState onGenerate={handleGenerateClick} />
        <PRDGenerateDialog />
      </>
    );
  }

  // Generation in progress
  if (isGenerating) {
    return (
      <PRDGenerationProgress
        progress={generationProgress}
        onCancel={cancelGeneration}
      />
    );
  }

  // PRD grid view
  return (
    <div className={`h-full flex ${isDetailPanelOpen ? 'gap-4' : ''}`}>
      {/* Main Content */}
      <div className={`flex-1 ${isDetailPanelOpen ? 'overflow-hidden' : ''}`}>
        <div className="space-y-4 p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-foreground">Product Requirements</h2>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-sm font-medium">
                {filteredPRDs.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Session Manager Button */}
              <button
                onClick={openSessionManager}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-muted transition-colors"
                title="Manage saved sessions"
              >
                <Archive className="w-4 h-4" />
                Sessions
              </button>

              {/* Status Filter */}
              <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg p-1">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-blue-500 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter('draft')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    statusFilter === 'draft'
                      ? 'bg-blue-500 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Draft
                </button>
                <button
                  onClick={() => setStatusFilter('approved')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    statusFilter === 'approved'
                      ? 'bg-blue-500 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Approved
                </button>
              </div>

              {/* Dismiss All */}
              {activePRDs.length > 0 && (
                <button
                  onClick={dismissAll}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Archive all PRDs"
                >
                  <Archive className="w-4 h-4" />
                  Archive All
                </button>
              )}

              {/* New PRD Button */}
              <button
                onClick={handleGenerateClick}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New PRD
              </button>
            </div>
          </div>

          {/* PRD Grid */}
          {filteredPRDs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                <Filter className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No PRDs Found</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {statusFilter === 'all'
                  ? 'All PRDs have been archived. Click "New PRD" to create one.'
                  : `No ${statusFilter} PRDs found. Try a different filter.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredPRDs.map(prd => (
                <PRDCard
                  key={prd.id}
                  prd={prd}
                  isSelected={selectedPrdId === prd.id}
                  onClick={() => handleSelect(prd.id)}
                  onDismiss={() => handleDismiss(prd.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {isDetailPanelOpen && selectedPRD && (
        <PRDDetailPanel
          prd={selectedPRD}
          onClose={() => selectPRD(null)}
          onExecuteWithFormula={handleExecute}
          onUpdateStatus={updatePRDStatus}
          onExport={handleExport}
        />
      )}

      {/* Dialogs */}
      <PRDGenerateDialog />
      <PRDSessionManager />
    </div>
  );
}
