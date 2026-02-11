import { useEffect, useState, useRef } from 'react';
import { useMarketingStore } from '../../stores/marketing-store';
import { Terminal } from '../Terminal';
import { Loader2 } from 'lucide-react';

const MARKETING_CMD = 'claude @ai/skills/marketing/MARKETING_BOOTSTRAP.md';

export function MarketingTerminal() {
  const terminalPtyId = useMarketingStore((s) => s.terminalPtyId);
  const setTerminalPtyId = useMarketingStore((s) => s.setTerminalPtyId);
  const [creating, setCreating] = useState(false);
  const isCreatingRef = useRef(false);
  const cmdWrittenRef = useRef(false);

  // Create PTY only when none exists
  useEffect(() => {
    // Already have a PTY — Terminal component handles reconnection internally
    if (terminalPtyId) return;

    // Prevent duplicate creation
    if (isCreatingRef.current) return;

    const createPty = async () => {
      isCreatingRef.current = true;
      setCreating(true);
      try {
        const projectRoot = await window.electronAPI.app.getProjectRoot();

        // Spawn a plain PowerShell shell (no cmd = defaults to powershell.exe)
        const pty = await window.electronAPI.pty.create({
          cols: 120,
          rows: 30,
          cwd: projectRoot,
          env: {
            KURORYUU_AGENT_ID: 'marketing-specialist',
            KURORYUU_AGENT_NAME: 'Marketing Specialist',
            KURORYUU_AGENT_ROLE: 'specialist',
          },
        });

        setTerminalPtyId(pty.id);
        cmdWrittenRef.current = false;
      } catch (err) {
        console.error('[Marketing] Failed to create PTY:', err);
      } finally {
        setCreating(false);
        isCreatingRef.current = false;
      }
    };

    createPty();
  }, [terminalPtyId, setTerminalPtyId]);

  // No cleanup — PTY persists across view switches.

  if (creating || !terminalPtyId) {
    return (
      <div className="w-full h-full bg-zinc-900 rounded-lg border border-zinc-700 flex items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Starting marketing terminal...</span>
        </div>
      </div>
    );
  }

  return (
    <Terminal
      id={terminalPtyId}
      terminalId={`marketing-${terminalPtyId}`}
      onReady={(id) => {
        console.log('[Marketing] Terminal ready:', id);
        // Pre-type the claude command (no Enter — user decides when to launch)
        if (!cmdWrittenRef.current) {
          cmdWrittenRef.current = true;
          // Small delay to let the shell prompt render first
          setTimeout(() => {
            window.electronAPI.pty.write(id, MARKETING_CMD);
          }, 800);
        }
      }}
    />
  );
}
