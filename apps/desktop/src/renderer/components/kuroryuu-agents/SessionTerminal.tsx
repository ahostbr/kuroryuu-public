/**
 * SessionTerminal - xterm.js terminal view for a PTY-mode agent session.
 * Thin passthrough to Terminal — matches MarketingTerminal pattern.
 * No wrapper divs; Terminal.tsx already provides w-full h-full containers.
 */
import { useEffect, useState } from 'react';
import { Terminal } from '../Terminal';
import { TerminalSquare } from 'lucide-react';

interface SessionTerminalProps {
  sessionId: string;
  ptyId: string;
  cwd: string;
}

export function SessionTerminal({ sessionId, ptyId, cwd }: SessionTerminalProps) {
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

  return (
    <Terminal
      id={ptyId}
      terminalId={`agent-session-${sessionId}`}
      onReady={handleReady}
      cwd={projectRoot}
    />
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
