/**
 * WorkflowErrorModal - Error display for PTY creation failures
 *
 * Shows detailed error information with troubleshooting tips
 */

import { AlertTriangle, RefreshCw, Terminal, Copy, ExternalLink } from 'lucide-react';
import { KuroryuuDialog } from '../../ui/dialog/KuroryuuDialog';
import { toast } from '../../ui/toast';

export interface WorkflowError {
  workflow: string;
  message: string;
  details?: string;
  timestamp: string;
}

interface WorkflowErrorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  error: WorkflowError | null;
  onRetry?: () => void;
}

const TROUBLESHOOTING_TIPS = [
  'Ensure Claude CLI is installed and accessible in PATH',
  'Check that the prompt file exists at the specified path',
  'Verify the desktop app has terminal permissions',
  'Try restarting the desktop application',
  'Check the developer console for additional details',
];

export function WorkflowErrorModal({
  open,
  onOpenChange,
  error,
  onRetry,
}: WorkflowErrorModalProps) {
  if (!error) return null;

  const handleCopyError = () => {
    const errorText = `
Workflow Error Report
=====================
Workflow: ${error.workflow}
Time: ${error.timestamp}
Message: ${error.message}
${error.details ? `\nDetails:\n${error.details}` : ''}
    `.trim();

    navigator.clipboard.writeText(errorText);
    toast.success('Error details copied to clipboard');
  };

  return (
    <KuroryuuDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Workflow Execution Failed"
      variant="destructive"
      size="lg"
      data-testid="workflow-error-modal"
      footer={
        <div className="flex items-center justify-between">
          <button
            onClick={handleCopyError}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="w-4 h-4" />
            Copy Details
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
            >
              Close
            </button>
            {onRetry && (
              <button
                data-testid="retry-button"
                onClick={() => {
                  onOpenChange(false);
                  onRetry();
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Error Summary */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-red-400">{error.workflow} failed</div>
            <div data-testid="error-message" className="text-sm text-red-300/80 mt-1">{error.message}</div>
          </div>
        </div>

        {/* Error Details */}
        {error.details && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Error Details
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 border border-border font-mono text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
              {error.details}
            </div>
          </div>
        )}

        {/* Troubleshooting Tips */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Troubleshooting
          </div>
          <ul className="space-y-1.5">
            {TROUBLESHOOTING_TIPS.map((tip, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="text-primary mt-1">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={() => {
              // Open DevTools via IPC if available
              if (typeof window !== 'undefined' && (window as any).electronAPI?.debug?.openDevTools) {
                (window as any).electronAPI.debug.openDevTools();
              }
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
            Open DevTools
          </button>
          <button
            onClick={() => window.open('https://docs.anthropic.com/claude-code', '_blank')}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Claude CLI Docs
          </button>
        </div>
      </div>
    </KuroryuuDialog>
  );
}

export default WorkflowErrorModal;
