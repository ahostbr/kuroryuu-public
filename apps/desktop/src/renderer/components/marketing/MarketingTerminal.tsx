import { useEffect, useRef, useState } from 'react';
import { useMarketingStore } from '../../stores/marketing-store';
import { Terminal } from '../Terminal';

const MARKETING_CMD = 'claude @ai/skills/marketing/MARKETING_BOOTSTRAP.md';

/**
 * MarketingTerminal — Matches TerminalGrid's PTY creation pattern:
 *
 * - First mount (no ptyId): Terminal component creates PTY via usePtyProcess
 *   AFTER fitAddon.fit() measures the container. This ensures the PTY starts
 *   at the correct cols/rows for the actual container size.
 *
 * - Subsequent mounts (ptyId stored): Terminal reconnects to existing PTY
 *   via pty.subscribe() and syncs dimensions with pty.resize().
 *
 * Previous approach created PTY upfront with hardcoded cols:120, rows:30
 * which caused dimension mismatch when the container was a different size.
 */
export function MarketingTerminal() {
  const terminalPtyId = useMarketingStore((s) => s.terminalPtyId);
  const setTerminalPtyId = useMarketingStore((s) => s.setTerminalPtyId);
  const [projectRoot, setProjectRoot] = useState<string | undefined>(undefined);
  const cmdWrittenRef = useRef(false);

  // Resolve project root so PTY starts in the correct directory
  useEffect(() => {
    window.electronAPI?.app?.getProjectRoot?.()
      .then((root: string) => setProjectRoot(root))
      .catch(() => {/* fallback: undefined lets PTY use its default */});
  }, []);

  const handleReady = (ptyId: string) => {
    console.log('[Marketing] Terminal ready:', ptyId);

    // Store ptyId for reconnection on re-mount
    if (!terminalPtyId) {
      setTerminalPtyId(ptyId);
    }

    // Pre-type the claude command (no Enter — user decides when to launch)
    if (!cmdWrittenRef.current) {
      cmdWrittenRef.current = true;
      setTimeout(() => {
        window.electronAPI.pty.write(ptyId, MARKETING_CMD);
      }, 800);
    }
  };

  return (
    <Terminal
      id={terminalPtyId || undefined}
      terminalId={`marketing-${terminalPtyId || 'pending'}`}
      onReady={handleReady}
      cwd={projectRoot}
      cliConfig={{
        env: {
          KURORYUU_AGENT_ID: 'marketing-specialist',
          KURORYUU_AGENT_NAME: 'Marketing Specialist',
          KURORYUU_AGENT_ROLE: 'specialist',
        },
      }}
    />
  );
}
