/**
 * PRD Detail Panel Component
 *
 * Side panel for viewing and managing PRD details
 * Includes markdown rendering, status management, and formula execution
 */
import { useState } from 'react';
import {
  X,
  ChevronRight,
  FileText,
  Calendar,
  Tag,
  Download,
  Copy,
  Check,
  ChevronDown,
  Network,
  List,
} from 'lucide-react';
import type { PRD, PRDStatus, WorkflowType } from '../../types/prd';
import { MarkdownRenderer } from '../code-editor/MarkdownRenderer';
import { EditorPane } from '../editdoc/EditorPane';
import { WorkflowGraph } from './workflow-graph/WorkflowGraph';
import { QuizmasterPlanDialog } from './QuizmasterPlanDialog';
import { cn } from '../../lib/utils';
import { toast } from '../ui/toast';
import { usePRDStore } from '../../stores/prd-store';
import { useSpawnTerminalAgent } from '../../hooks/useSpawnTerminalAgent';

interface PRDDetailPanelProps {
  prd: PRD;
  onClose: () => void;
  onExecuteWithFormula: (prdId: string) => void;
  onUpdateStatus?: (prdId: string, status: PRDStatus) => void;
  onExport?: (prdId: string, format: 'markdown' | 'pdf') => void;
  onExecuteWorkflow?: (prdId: string, workflow: WorkflowType) => void;
}

// Status configuration with colors and labels
const STATUS_OPTIONS: { value: PRDStatus; label: string; color: string; description: string }[] = [
  {
    value: 'draft',
    label: 'Draft',
    color: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    description: 'Work in progress',
  },
  {
    value: 'in_review',
    label: 'In Review',
    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    description: 'Awaiting approval',
  },
  {
    value: 'approved',
    label: 'Approved',
    color: 'bg-green-500/10 text-green-400 border-green-500/20',
    description: 'Ready for implementation',
  },
  {
    value: 'in_progress',
    label: 'In Progress',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    description: 'Being implemented',
  },
  {
    value: 'complete',
    label: 'Complete',
    color: 'bg-green-600/10 text-green-300 border-green-600/20',
    description: 'Implementation done',
  },
];

export function PRDDetailPanel({
  prd,
  onClose,
  onExecuteWithFormula,
  onUpdateStatus,
  onExport,
  onExecuteWorkflow,
}: PRDDetailPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [isExecutingWorkflow, setIsExecutingWorkflow] = useState(false);
  const [executingWorkflowType, setExecutingWorkflowType] = useState<WorkflowType | null>(null);
  const [showQuizmasterDialog, setShowQuizmasterDialog] = useState(false);
  const [pendingWorkflow, setPendingWorkflow] = useState<WorkflowType | null>(null);

  const { spawn } = useSpawnTerminalAgent();
  const currentStatus = STATUS_OPTIONS.find(s => s.value === prd.status) || STATUS_OPTIONS[0];

  // Handle copy PRD content
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prd.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Handle status change
  const handleStatusChange = (newStatus: PRDStatus) => {
    if (onUpdateStatus) {
      onUpdateStatus(prd.id, newStatus);
    }
    setShowStatusDropdown(false);
  };

  // Handle export
  const handleExport = (format: 'markdown' | 'pdf') => {
    if (onExport) {
      onExport(prd.id, format);
    }
  };

  // Handle workflow execution
  const handleWorkflowExecute = (workflow: WorkflowType) => {
    if (onExecuteWorkflow && !isExecutingWorkflow) {
      // Check if this is a planning workflow - offer quizmaster option
      const isPlanningWorkflow = workflow === 'plan-feature' || workflow === 'plan';

      if (isPlanningWorkflow) {
        setPendingWorkflow(workflow);
        setShowQuizmasterDialog(true);
      } else {
        executeWorkflowDirect(workflow);
      }
    }
  };

  // Execute workflow directly (without quizmaster)
  const executeWorkflowDirect = (workflow: WorkflowType) => {
    if (onExecuteWorkflow) {
      setIsExecutingWorkflow(true);
      setExecutingWorkflowType(workflow);
      onExecuteWorkflow(prd.id, workflow);

      // Simulate workflow completion (replace with actual workflow status tracking)
      setTimeout(() => {
        setIsExecutingWorkflow(false);
        setExecutingWorkflowType(null);
      }, 3000);
    }
    setShowQuizmasterDialog(false);
    setPendingWorkflow(null);
  };

  // Launch quizmaster planning session — uses unified spawn hook (Wave 3)
  // Registers in agent-config-store + Gateway heartbeat, visible in TerminalGrid
  const handleLaunchQuizmaster = async () => {
    try {
      const result = await window.electronAPI.quizmaster.getPromptPath();
      if (!result.ok || !result.promptPath) {
        toast.error('Failed to get quizmaster prompt path');
        return;
      }

      const agent = await spawn({
        name: 'Quizmaster Planning',
        capabilities: ['prd', 'quizmaster'],
        promptPath: result.promptPath,
        env: {
          KURORYUU_PRD_ID: prd.id,
        },
        onReady: (ptyId) => {
          // Send context about the PRD after Claude starts
          setTimeout(() => {
            const contextPrompt = `I'm planning: ${prd.title}\n\nCurrent PRD content:\n${prd.content.substring(0, 500)}...\n\nHelp me clarify requirements for this feature.`;
            window.electronAPI.pty.write(ptyId, contextPrompt);
            window.electronAPI.pty.write(ptyId, '\r');
          }, 3000);
        },
      });

      toast.success('Quizmaster planning session started', {
        action: {
          label: 'View Terminal',
          onClick: () => {
            window.dispatchEvent(new CustomEvent('focus-terminal', { detail: { ptyId: agent.ptyId } }));
          },
        },
      });
      setShowQuizmasterDialog(false);
      setPendingWorkflow(null);
    } catch (err) {
      console.error('[Quizmaster] Failed to launch from PRD:', err);
      toast.error('Failed to launch quizmaster');
    }
  };

  // ----- DEPRECATED: Raw PTY quizmaster launch (pre-Wave 3) -----
  // KEY REVERT POINT: If useSpawnTerminalAgent causes issues with quizmaster,
  // revert handleLaunchQuizmaster above back to this version.
  // This bypasses agent-config-store and Gateway heartbeat but is battle-tested.
  // const handleLaunchQuizmaster_DEPRECATED = async () => {
  //   try {
  //     const result = await window.electronAPI.quizmaster.getPromptPath();
  //     if (!result.ok || !result.promptPath) {
  //       toast.error('Failed to get quizmaster prompt path');
  //       return;
  //     }
  //     const projectRoot = process.env.KURORYUU_PROJECT_ROOT || process.env.KURORYUU_ROOT || process.cwd();
  //     const quizmasterId = `quizmaster_${Date.now()}`;
  //     const pty = await window.electronAPI.pty.create({
  //       cwd: projectRoot, cols: 120, rows: 30, cmd: 'claude',
  //       args: [`@${result.promptPath}`],
  //       env: {
  //         KURORYUU_AGENT_ID: quizmasterId,
  //         KURORYUU_AGENT_NAME: 'Quizmaster Planning',
  //         KURORYUU_AGENT_ROLE: 'worker',
  //       },
  //       ownerAgentId: quizmasterId, ownerRole: 'worker',
  //       label: 'Quizmaster Planning Session'
  //     });
  //     setTimeout(() => {
  //       const contextPrompt = `I'm planning: ${prd.title}\n\nCurrent PRD content:\n${prd.content.substring(0, 500)}...\n\nHelp me clarify requirements for this feature.`;
  //       window.electronAPI.pty.write(pty.id, contextPrompt);
  //       window.electronAPI.pty.write(pty.id, '\r');
  //     }, 3000);
  //     toast.success('Quizmaster planning session started - check terminal');
  //     setShowQuizmasterDialog(false);
  //     setPendingWorkflow(null);
  //   } catch (err) {
  //     console.error('[Quizmaster] Failed to launch from PRD:', err);
  //     toast.error('Failed to launch quizmaster');
  //   }
  // };
  // ----- END DEPRECATED -----

  return (
    <>
      {/* Quizmaster Planning Dialog */}
      {pendingWorkflow && (
        <QuizmasterPlanDialog
          isOpen={showQuizmasterDialog}
          workflow={pendingWorkflow}
          onClose={() => {
            setShowQuizmasterDialog(false);
            setPendingWorkflow(null);
          }}
          onProceedDirect={() => executeWorkflowDirect(pendingWorkflow)}
          onLaunchQuizmaster={handleLaunchQuizmaster}
        />
      )}

      <div className="w-[400px] h-full flex flex-col bg-card border-l border-border overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-border">
        {/* Title Bar */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-400" />
            </div>
            <span className="text-sm font-medium text-foreground">PRD Details</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
            title="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PRD Title */}
        <div className="px-4 pb-3">
          <h2 className="text-base font-semibold text-foreground mb-2 line-clamp-2">
            {prd.title}
          </h2>

          {/* Metadata Row */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {prd.scope}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(prd.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Status & Actions */}
        <div className="px-4 pb-4 space-y-2">
          {/* Status Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${currentStatus.color}`}
            >
              <span className="text-sm font-medium">{currentStatus.label}</span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* Dropdown Menu */}
            {showStatusDropdown && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowStatusDropdown(false)}
                />
                {/* Menu */}
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleStatusChange(option.value)}
                      className={`w-full px-3 py-2.5 text-left transition-colors ${
                        option.value === prd.status
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'text-foreground hover:bg-secondary'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium">{option.label}</span>
                        {option.value === prd.status && (
                          <Check className="w-3.5 h-3.5 text-blue-400" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Execute with Formula Button */}
          <button
            onClick={() => onExecuteWithFormula(prd.id)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors"
          >
            <span>Execute with Formula</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-muted transition-colors"
              title="Copy PRD content"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span className="text-xs">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-xs">Copy</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleExport('markdown')}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-muted transition-colors"
              title="Export as Markdown"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="text-xs">Export</span>
            </button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="px-4 pb-4 flex items-center gap-2">
          <button
            onClick={() => setViewMode('graph')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              viewMode === 'graph'
                ? 'bg-blue-500 text-white'
                : 'bg-secondary text-foreground hover:bg-muted'
            )}
          >
            <Network className="w-4 h-4" />
            Workflow Graph
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              viewMode === 'list'
                ? 'bg-blue-500 text-white'
                : 'bg-secondary text-foreground hover:bg-muted'
            )}
          >
            <List className="w-4 h-4" />
            PRD Content
          </button>
        </div>
      </div>

      {/* Main Content Area - Conditional */}
      {viewMode === 'graph' ? (
        /* Workflow Graph View */
        <div className="flex-1 overflow-hidden">
          <WorkflowGraph
            prdId={prd.id}
            currentStatus={prd.status}
            onWorkflowExecute={handleWorkflowExecute}
            isExecuting={isExecutingWorkflow}
            executingWorkflow={executingWorkflowType}
          />
        </div>
      ) : (
        /* PRD Content - Editable */
        <div className="flex-1 overflow-hidden">
          <EditorPane
            content={prd.content}
            onChange={(newContent: string) => usePRDStore.getState().updatePRDContent(prd.id, newContent)}
            language="markdown"
            readOnly={false}
          />
        </div>
      )}

      {/* Footer - Metadata */}
      {prd.metadata && (
        <div className="flex-shrink-0 border-t border-border p-4 bg-secondary/30">
          <div className="text-xs space-y-1">
            {prd.metadata.author && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Author:</span>
                <span className="text-foreground">{prd.metadata.author}</span>
              </div>
            )}
            {prd.metadata.estimated_effort && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Effort:</span>
                <span className="text-foreground">{prd.metadata.estimated_effort}</span>
              </div>
            )}
            {prd.metadata.tags && prd.metadata.tags.length > 0 && (
              <div className="flex items-start justify-between">
                <span className="text-muted-foreground">Tags:</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {prd.metadata.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
}
