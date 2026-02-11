import { useEffect, useState } from 'react';
import { useMarketingStore } from '../../stores/marketing-store';
import { Terminal } from '../Terminal';
import { Loader2 } from 'lucide-react';

export function MarketingTerminal() {
  const terminalPtyId = useMarketingStore((s) => s.terminalPtyId);
  const setTerminalPtyId = useMarketingStore((s) => s.setTerminalPtyId);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (terminalPtyId) return;

    const createPty = async () => {
      setCreating(true);
      try {
        // Get project root
        const projectRoot = await window.electronAPI.app.getProjectRoot();

        // Create PTY with marketing agent config
        const pty = await window.electronAPI.pty.create({
          cols: 120,
          rows: 30,
          cwd: projectRoot,
          cmd: 'claude',
          args: ['@ai/skills/marketing/MARKETING_BOOTSTRAP.md'],
          env: {
            KURORYUU_AGENT_ID: 'marketing-specialist',
            KURORYUU_AGENT_NAME: 'Marketing Specialist',
            KURORYUU_AGENT_ROLE: 'specialist',
          },
        });

        setTerminalPtyId(pty.id);
      } catch (err) {
        console.error('[Marketing] Failed to create PTY:', err);
      } finally {
        setCreating(false);
      }
    };

    createPty();
  }, [terminalPtyId, setTerminalPtyId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (terminalPtyId) {
        window.electronAPI.pty.kill(terminalPtyId).catch(() => {
          // Ignore errors on cleanup
        });
      }
    };
  }, [terminalPtyId]);

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
      }}
    />
  );
}
