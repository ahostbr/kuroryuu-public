/**
 * InsightsTerminalPanel - Raw Terminal View for Claude PTY Sessions
 *
 * Displays the raw terminal output from the PTY session used by the Insights chat.
 * This provides:
 * - Debugging view of unfiltered Claude CLI output (spinners, progress, ANSI)
 * - Ability to see what Claude is doing in real-time
 * - Read-only by default (input goes through chat bar)
 *
 * NOTE: This panel does NOT spawn new PTY sessions. It only connects to
 * existing sessions. PTY sessions are spawned when the user sends their
 * first message using a PTY-based model (claude-cli-pty).
 *
 * The Chat area shows filtered/clean text while this tab shows everything.
 */

import { useState, useRef } from 'react';
import { Terminal } from '../Terminal';
import { Loader2, TerminalSquare, AlertCircle, RefreshCw, MessageSquare } from 'lucide-react';
import type { TerminalRef } from '../Terminal';

interface InsightsTerminalPanelProps {
  /** PTY session ID for the Claude CLI session */
  ptySessionId: string | null;
  /** Called when terminal component gets a valid PTY ID */
  onPtyReady?: (ptyId: string, sessionId?: string) => void;
  /** Current working directory (for display purposes) */
  cwd?: string;
}

export function InsightsTerminalPanel({
  ptySessionId,
  onPtyReady,
  cwd = process.cwd(),
}: InsightsTerminalPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const terminalRef = useRef<TerminalRef | null>(null);

  // Handle terminal ready callback
  const handleTerminalReady = (ptyId: string, sessionId?: string) => {
    console.log('[InsightsTerminalPanel] Terminal ready:', { ptyId, sessionId });
    setError(null);
    onPtyReady?.(ptyId, sessionId);
  };

  // Handle terminal error
  const handleTerminalError = (errorMsg: string) => {
    console.error('[InsightsTerminalPanel] Terminal error:', errorMsg);
    setError(errorMsg);
  };

  // Retry handler
  const handleRetry = () => {
    setIsRetrying(true);
    setError(null);
    // Small delay to allow state to update
    setTimeout(() => {
      setIsRetrying(false);
    }, 100);
  };

  // No PTY session available - show helpful guidance
  if (!ptySessionId) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
          <TerminalSquare className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Raw Output</span>
        </div>

        {/* Empty state with guidance */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-muted-foreground">
          <TerminalSquare className="w-10 h-10 mb-4 opacity-40" />
          <p className="text-sm text-center font-medium text-foreground/80">No PTY Session Active</p>
          <div className="mt-3 text-xs text-center space-y-2 max-w-[180px]">
            <p className="opacity-70">
              To see raw terminal output:
            </p>
            <div className="flex items-center gap-2 justify-center">
              <MessageSquare className="w-3 h-3" />
              <span>Send a message in chat</span>
            </div>
            <p className="opacity-50 text-[10px]">
              The terminal will show Claude CLI output in real-time
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-border bg-muted/20 text-[10px] text-muted-foreground text-center">
          Waiting for PTY session...
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
          <TerminalSquare className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Raw Output</span>
          <span className="text-[10px] text-red-400 ml-auto">Error</span>
        </div>

        {/* Error content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <AlertCircle className="w-8 h-8 mb-3 text-red-500" />
          <p className="text-sm text-center text-foreground">Terminal Error</p>
          <p className="text-xs mt-2 text-center text-muted-foreground max-w-xs">{error}</p>
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-secondary hover:bg-muted text-foreground rounded text-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Render terminal connected to existing PTY session
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <TerminalSquare className="w-3.5 h-3.5 text-green-500" />
        <span className="text-xs font-medium text-foreground">Raw Output</span>
        <span className="text-[10px] text-muted-foreground ml-auto font-mono">
          {ptySessionId.substring(0, 12)}...
        </span>
      </div>

      {/* Terminal content */}
      <div className="flex-1 min-h-0">
        {isRetrying ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Terminal
            id={ptySessionId}
            terminalId={`insights-terminal-${ptySessionId}`}
            onReady={handleTerminalReady}
            onTermRef={(ref) => {
              terminalRef.current = ref;
            }}
            cwd={cwd}
            // No cliConfig - we're connecting to an existing PTY, not creating a new one
          />
        )}
      </div>

      {/* Footer info */}
      <div className="px-3 py-1.5 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
        <span>Shows unfiltered PTY output</span>
        <span className="mx-2">|</span>
        <span>Chat shows filtered text</span>
      </div>
    </div>
  );
}

export default InsightsTerminalPanel;
