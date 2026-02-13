/**
 * SessionTerminal - xterm.js terminal view for a PTY-mode agent session.
 * Reconnects to existing PTY via ptyId stored on the session.
 * Follows the MarketingTerminal reconnection pattern.
 */
import { useEffect, useState } from 'react';
import { Terminal } from '../Terminal';
import { TerminalSquare } from 'lucide-react';

interface SessionTerminalProps {
  sessionId: string;
  ptyId: string;
  cwd: string;
  status: string;
}

export function SessionTerminal({ sessionId, ptyId, cwd, status }: SessionTerminalProps) {
  const [projectRoot, setProjectRoot] = useState<string>(cwd);

  useEffect(() => {
    if (!cwd) {
      window.electronAPI?.app?.getProjectRoot?.()
        .then((root: string) => setProjectRoot(root))
        .catch(() => {});
    }
  }, [cwd]);

  const handleReady = (termId: string) => {
    console.log(`[SessionTerminal] Terminal ready for session ${sessionId}:`, termId);
  };

  const isDone = status !== 'running' && status !== 'starting';

  return (
    <div className="w-full h-full flex flex-col">
      {/* Status bar when process has ended */}
      {isDone && (
        <div className={`px-3 py-1.5 text-xs text-center border-b border-border ${
          status === 'completed'
            ? 'bg-green-500/10 text-green-400'
            : status === 'error'
              ? 'bg-red-500/10 text-red-400'
              : 'bg-yellow-500/10 text-yellow-400'
        }`}>
          Process {status}
        </div>
      )}
      {/* Terminal — render directly, no extra overflow wrapper (matches MarketingTerminal pattern) */}
      <Terminal
        id={ptyId}
        terminalId={`agent-session-${sessionId}`}
        onReady={handleReady}
        cwd={projectRoot}
      />
    </div>
  );
}

/** Placeholder when no PTY is available for this session */
export function SessionTerminalPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <TerminalSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No terminal available</p>
        <p className="text-xs mt-1 opacity-60">This session was run in structured mode</p>
      </div>
    </div>
  );
}
