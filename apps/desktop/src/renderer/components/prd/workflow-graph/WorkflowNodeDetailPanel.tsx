/**
 * Workflow Node Detail Panel
 *
 * Right slide-in panel showing details for a selected workflow node
 * with execute controls and quizmaster integration
 */
import { useCallback, useState } from 'react';
import { X, Play, MessageCircleQuestion, Clock, CheckCircle2, AlertCircle, Terminal } from 'lucide-react';
import { usePRDStore } from '../../../stores/prd-store';
import { getWorkflowNodeMeta, WORKFLOW_NODE_META } from './workflow-graph-data';
import { WorkflowErrorModal, WorkflowError } from './WorkflowErrorModal';
import { toast } from '../../ui/toast';
import { cn } from '../../../lib/utils';
import type { WorkflowType, PRDStatus } from '../../../types/prd';

/**
 * Workflow-to-Prompt mapping
 * - Planning workflows use Quizmaster prompts
 * - Execution workflows use Specialist prompts
 */
const WORKFLOW_PROMPT_MAP: Record<string, { path: string; type: 'quizmaster' | 'specialist' }> = {
  'plan-feature': {
    path: 'ai/prompt_packs/quizmasterplanner/ULTIMATE_QUIZZER_PROMPT_small.md',
    type: 'quizmaster',
  },
  'plan': {
    path: 'ai/prompt_packs/quizmasterplanner/ULTIMATE_QUIZZER_PROMPT_small.md',
    type: 'quizmaster',
  },
  'prime': {
    path: 'ai/prompt_packs/workflow_specialists/prd_primer.md',
    type: 'specialist',
  },
  'execute': {
    path: 'ai/prompt_packs/workflow_specialists/prd_executor.md',
    type: 'specialist',
  },
  'review': {
    path: 'ai/prompt_packs/workflow_specialists/prd_reviewer.md',
    type: 'specialist',
  },
  'validate': {
    path: 'ai/prompt_packs/workflow_specialists/prd_validator.md',
    type: 'specialist',
  },
  'execution-report': {
    path: 'ai/prompt_packs/workflow_specialists/prd_reporter.md',
    type: 'specialist',
  },
  'code-review': {
    path: 'ai/prompt_packs/workflow_specialists/prd_code_reviewer.md',
    type: 'specialist',
  },
  'system-review': {
    path: 'ai/prompt_packs/workflow_specialists/prd_system_reviewer.md',
    type: 'specialist',
  },
  'hackathon-complete': {
    path: 'ai/prompt_packs/workflow_specialists/prd_hackathon_finalizer.md',
    type: 'specialist',
  },
};

interface RequirementItemProps {
  label: string;
  value: string;
  isMet: boolean;
}

function RequirementItem({ label, value, isMet }: RequirementItemProps) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-foreground">{value}</span>
        {isMet ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
        ) : (
          <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />
        )}
      </div>
    </div>
  );
}

export function WorkflowNodeDetailPanel() {
  const {
    selectedWorkflowNode,
    isNodeDetailPanelOpen,
    closeNodeDetailPanel,
    selectedPrdId,
    prds,
  } = usePRDStore();

  const [isExecuting, setIsExecuting] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [workflowError, setWorkflowError] = useState<WorkflowError | null>(null);

  const selectedPRD = prds.find(p => p.id === selectedPrdId);
  const nodeMeta = getWorkflowNodeMeta(selectedWorkflowNode);

  // Check if workflow is available based on current PRD status
  const isAvailable = useCallback((workflow: WorkflowType | null, status: PRDStatus | undefined): boolean => {
    if (!workflow || !status) return false;
    const meta = WORKFLOW_NODE_META[workflow];
    if (!meta) return false;
    return meta.requiredStatus.includes(status);
  }, []);

  const isPlanningNode = selectedWorkflowNode === 'plan-feature' || selectedWorkflowNode === 'plan';
  const workflowAvailable = isAvailable(selectedWorkflowNode, selectedPRD?.status);

  // Handle workflow execution - spawns PTY with appropriate prompt
  const handleExecute = useCallback(async () => {
    if (!selectedWorkflowNode || !selectedPRD || !workflowAvailable) return;

    // Get the prompt config for this workflow
    const promptConfig = WORKFLOW_PROMPT_MAP[selectedWorkflowNode];
    if (!promptConfig) {
      toast.error(`No prompt configured for workflow: ${selectedWorkflowNode}`);
      return;
    }

    setIsExecuting(true);
    try {
      const projectRoot = process.env.KURORYUU_PROJECT_ROOT || process.env.KURORYUU_ROOT || process.cwd();
      const workflowId = `workflow_${selectedWorkflowNode}_${Date.now()}`;

      // Create PTY with Claude CLI directly (same pattern as quizmaster)
      const pty = await window.electronAPI.pty.create({
        cwd: projectRoot,
        cols: 120,
        rows: 30,
        cmd: 'claude',
        args: [`@${promptConfig.path}`],
        env: {
          KURORYUU_AGENT_ID: workflowId,
          KURORYUU_AGENT_NAME: `${nodeMeta?.label || selectedWorkflowNode} Workflow`,
          KURORYUU_AGENT_ROLE: 'worker',
          KURORYUU_PRD_ID: selectedPRD.id,
          KURORYUU_PRD_STATUS: selectedPRD.status,
        },
        ownerAgentId: workflowId,
        ownerRole: 'worker',
        label: `${nodeMeta?.label || selectedWorkflowNode} - ${selectedPRD.title}`,
      });

      // Track the executing workflow in store
      const prdStore = usePRDStore.getState();
      prdStore.setExecutingWorkflow(selectedPRD.id, selectedWorkflowNode, pty.id);

      // Send minimal PRD context after Claude starts (configurable delay for testing)
      const contextDelayMs = parseInt(process.env.PRD_WORKFLOW_DELAY_MS || '3000', 10);
      setTimeout(() => {
        const contextPrompt = `Working on PRD: "${selectedPRD.title}"
Status: ${selectedPRD.status}
Scope: ${selectedPRD.scope}

${promptConfig.type === 'quizmaster' ? 'Help me plan the implementation.' : 'Execute this workflow step.'}`;
        window.electronAPI.pty.write(pty.id, contextPrompt);
        window.electronAPI.pty.write(pty.id, '\r');
      }, contextDelayMs);

      // Toast with "View Terminal" action
      toast.success(`Started ${nodeMeta?.label || selectedWorkflowNode}`, {
        action: {
          label: 'View Terminal',
          onClick: () => {
            // Navigate to terminals page
            window.dispatchEvent(new CustomEvent('focus-terminal', { detail: { ptyId: pty.id } }));
          },
        },
      });

      closeNodeDetailPanel();
    } catch (error) {
      console.error('Workflow execution failed:', error);

      // Show error modal with details
      setWorkflowError({
        workflow: nodeMeta?.label || selectedWorkflowNode,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
      setErrorModalOpen(true);
    } finally {
      setIsExecuting(false);
    }
  }, [selectedWorkflowNode, selectedPRD, workflowAvailable, nodeMeta, closeNodeDetailPanel]);

  // Handle quizmaster launch
  const handleLaunchQuizmaster = useCallback(async () => {
    if (!selectedPRD) return;

    try {
      // Get quizmaster prompt path (returns relative path)
      const result = await window.electronAPI.quizmaster.getPromptPath();
      if (!result.ok || !result.promptPath) {
        toast.error('Failed to get quizmaster prompt path');
        return;
      }

      const projectRoot = process.env.KURORYUU_PROJECT_ROOT || process.env.KURORYUU_ROOT || process.cwd();
      const quizmasterId = `quizmaster_${Date.now()}`;

      // Create PTY with Claude CLI directly (not shell) - avoids text garbling
      // The @ file is passed as CLI arg, not typed afterwards
      const pty = await window.electronAPI.pty.create({
        cwd: projectRoot,
        cols: 120,
        rows: 30,
        cmd: 'claude',
        args: [`@${result.promptPath}`],
        env: {
          KURORYUU_AGENT_ID: quizmasterId,
          KURORYUU_AGENT_NAME: 'Quizmaster Planning',
          KURORYUU_AGENT_ROLE: 'worker',
        },
        ownerAgentId: quizmasterId,
        ownerRole: 'worker',
        label: 'Quizmaster Planning Session'
      });

      // Send context about the PRD after Claude starts (configurable delay for testing)
      const quizmasterDelayMs = parseInt(process.env.PRD_WORKFLOW_DELAY_MS || '3000', 10);
      setTimeout(() => {
        const contextPrompt = `I'm planning: ${selectedPRD.title}\n\nCurrent PRD content:\n${selectedPRD.content.substring(0, 500)}...\n\nHelp me clarify requirements.`;
        window.electronAPI.pty.write(pty.id, contextPrompt);
        window.electronAPI.pty.write(pty.id, '\r');
      }, quizmasterDelayMs);

      toast.success('Quizmaster session started - check terminal');
      closeNodeDetailPanel();
    } catch (err) {
      console.error('[Quizmaster] Failed to launch:', err);
      toast.error('Failed to launch quizmaster');
    }
  }, [selectedPRD, closeNodeDetailPanel]);

  // Don't render if not open or no node selected
  if (!isNodeDetailPanelOpen || !selectedWorkflowNode || !nodeMeta) {
    return null;
  }

  const NodeIcon = nodeMeta.icon;

  return (
    <div
      data-testid="node-detail-panel"
      className={cn(
        'fixed right-0 top-0 bottom-0 w-[380px] z-50',
        'bg-card/95 backdrop-blur-md border-l border-border shadow-2xl',
        'animate-slide-in-right'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <NodeIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 data-testid="workflow-label" className="font-semibold text-foreground">{nodeMeta.label}</h3>
            {nodeMeta.statusTransition && (
              <span className="text-xs text-primary font-medium">
                {nodeMeta.statusTransition}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={closeNodeDetailPanel}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6 overflow-y-auto h-[calc(100%-140px)]">
        {/* Description */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            What This Does
          </h4>
          <p className="text-sm text-foreground leading-relaxed">
            {nodeMeta.description}
          </p>
        </div>

        {/* Execution Time */}
        {nodeMeta.executionTime && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>Estimated: {nodeMeta.executionTime}</span>
          </div>
        )}

        {/* Requirements */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Requirements
          </h4>
          <div className="space-y-2">
            <RequirementItem
              label="PRD Status"
              value={nodeMeta.requiredStatus.join(' / ')}
              isMet={workflowAvailable}
            />
            {selectedPRD && (
              <div data-testid="prd-status">
                <RequirementItem
                  label="Current Status"
                  value={selectedPRD.status.replace('_', ' ')}
                  isMet={workflowAvailable}
                />
              </div>
            )}
          </div>
        </div>

        {/* No PRD selected warning */}
        {!selectedPRD && (
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-400">
              Select a PRD from the sidebar to execute this workflow.
            </p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-card/95 backdrop-blur-md space-y-2">
        {/* Execute Button */}
        <button
          onClick={handleExecute}
          disabled={!workflowAvailable || isExecuting || !selectedPRD}
          className={cn(
            'w-full py-3 rounded-lg font-semibold text-center transition-all flex items-center justify-center gap-2',
            workflowAvailable && selectedPRD
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {isExecuting ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Starting...
            </>
          ) : workflowAvailable && selectedPRD ? (
            <>
              <Play className="w-4 h-4" />
              Execute {nodeMeta.label}
            </>
          ) : (
            'Prerequisites Not Met'
          )}
        </button>

        {/* Quizmaster Option for Planning Nodes */}
        {isPlanningNode && workflowAvailable && selectedPRD && (
          <button
            onClick={handleLaunchQuizmaster}
            className="w-full py-2.5 rounded-lg font-medium text-center transition-colors flex items-center justify-center gap-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20"
          >
            <MessageCircleQuestion className="w-4 h-4" />
            Start with Quizmaster
          </button>
        )}
      </div>

      {/* Error Modal */}
      <WorkflowErrorModal
        open={errorModalOpen}
        onOpenChange={setErrorModalOpen}
        error={workflowError}
        onRetry={handleExecute}
      />
    </div>
  );
}
