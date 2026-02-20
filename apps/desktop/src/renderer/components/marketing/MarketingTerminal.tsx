import { useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { useMarketingStore } from '../../stores/marketing-store';
import { useSpawnTerminalAgent } from '../../hooks/useSpawnTerminalAgent';
import { Terminal } from '../Terminal';

/**
 * MarketingTerminal — Lazy-starts a Marketing Specialist agent.
 *
 * - Fresh visit (no ptyId): shows "Start Terminal" button
 * - Click button: spawns PTY, shows "Spawning…" while waiting
 * - ptyId arrives: renders Terminal (reconnects on return visits)
 */
export function MarketingTerminal() {
  const terminalPtyId = useMarketingStore((s) => s.terminalPtyId);
  const setTerminalPtyId = useMarketingStore((s) => s.setTerminalPtyId);
  const { spawn } = useSpawnTerminalAgent();
  const spawnedRef = useRef(false);
  const [spawning, setSpawning] = useState(false);

  function handleStart() {
    if (spawnedRef.current) return;
    spawnedRef.current = true;
    setSpawning(true);

    spawn({
      name: 'Marketing Specialist',
      role: 'specialist',
      capabilities: ['marketing'],
      promptPath: 'ai/skills/marketing/MARKETING_BOOTSTRAP.md',
      onReady: (ptyId) => {
        console.log('[Marketing] Agent spawned:', ptyId);
        setTerminalPtyId(ptyId);
        setSpawning(false);
      },
    }).catch((err) => {
      console.error('[Marketing] Failed to spawn agent:', err);
      spawnedRef.current = false;
      setSpawning(false);
    });
  }

  if (!terminalPtyId && !spawning) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-card">
        <button
          onClick={handleStart}
          className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-lg flex items-center gap-2 text-primary-foreground font-medium"
        >
          <Play className="w-5 h-5" />
          Start Terminal
        </button>
      </div>
    );
  }

  if (!terminalPtyId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Spawning Marketing Specialist…
      </div>
    );
  }

  return (
    <Terminal
      id={terminalPtyId}
      terminalId={`marketing-${terminalPtyId}`}
    />
  );
}
