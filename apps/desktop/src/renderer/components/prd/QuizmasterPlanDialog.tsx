/**
 * Quizmaster Plan Dialog
 *
 * Modal that appears when user clicks a planning workflow node
 * Offers choice: Start planning session with Quizmaster or proceed directly
 */
import { MessageCircleQuestion, ChevronRight, X } from 'lucide-react';
import type { WorkflowType } from '../../types/prd';

interface QuizmasterPlanDialogProps {
  isOpen: boolean;
  workflow: WorkflowType;
  onClose: () => void;
  onProceedDirect: () => void;
  onLaunchQuizmaster: (variant?: string) => void;
}

// Workflow labels for display
const WORKFLOW_LABELS: Record<WorkflowType, string> = {
  'generate-prd': 'Generate PRD',
  'plan-feature': 'Create Plan',
  'prime': 'Load Context',
  'plan': 'Break Down Tasks',
  'execute': 'Execute Step',
  'execute-formula': 'Execute with Formula',
  'review': 'Review Work',
  'validate': 'Validate & Complete',
  'execution-report': 'Generate Report',
  'code-review': 'Code Review',
  'system-review': 'System Review',
  'hackathon-complete': 'Hackathon Complete',
};

export function QuizmasterPlanDialog({
  isOpen,
  workflow,
  onClose,
  onProceedDirect,
  onLaunchQuizmaster,
}: QuizmasterPlanDialogProps) {
  if (!isOpen) return null;

  const workflowLabel = WORKFLOW_LABELS[workflow] || workflow;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl w-[600px] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <MessageCircleQuestion className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-foreground">Planning Options</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            You're about to start: <span className="text-primary font-medium">{workflowLabel}</span>
          </p>

          <p className="text-sm text-foreground">
            Would you like to use the <span className="text-orange-400 font-medium">Quizmaster</span> to clarify requirements first?
          </p>

          {/* Option 1: Use Quizmaster */}
          <button
            onClick={() => onLaunchQuizmaster()}
            className="w-full flex items-center gap-4 p-4 rounded-lg border-2 border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 hover:border-orange-500/50 transition-all duration-200 text-left group"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/30 transition-colors">
              <MessageCircleQuestion className="w-6 h-6 text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground mb-1">
                Start Planning Session (Recommended)
              </h3>
              <p className="text-xs text-muted-foreground">
                Quizmaster will ask 6-12 questions to extract complete requirements before planning
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-orange-400 flex-shrink-0" />
          </button>

          {/* Option 2: Proceed Directly */}
          <button
            onClick={onProceedDirect}
            className="w-full flex items-center gap-4 p-4 rounded-lg border-2 border-border bg-secondary/50 hover:bg-secondary hover:border-muted-foreground transition-all duration-200 text-left group"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <ChevronRight className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground mb-1">
                Proceed Directly
              </h3>
              <p className="text-xs text-muted-foreground">
                Skip planning session and execute {workflowLabel.toLowerCase()} immediately
              </p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-card/50 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Tip: Quizmaster uses Claude Opus 4 for deep requirements extraction
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
