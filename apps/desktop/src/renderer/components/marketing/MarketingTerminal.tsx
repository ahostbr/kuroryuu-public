import { useEffect, useRef, useState } from 'react';
import { useMarketingStore } from '../../stores/marketing-store';
import { useSpawnTerminalAgent } from '../../hooks/useSpawnTerminalAgent';
import { Terminal } from '../Terminal';

/**
 * MarketingTerminal — Spawns a Marketing Specialist agent via unified hook.
 *
 * Uses useSpawnTerminalAgent to create the PTY and register the agent in
 * agent-config-store (visible in TerminalGrid + Gateway heartbeat).
 *
 * - First mount: spawns agent, stores ptyId
 * - Subsequent mounts: reconnects Terminal to existing ptyId
 */
export function MarketingTerminal() {
  const terminalPtyId = useMarketingStore((s) => s.terminalPtyId);
  const setTerminalPtyId = useMarketingStore((s) => s.setTerminalPtyId);
  const { spawn } = useSpawnTerminalAgent();
  const spawnedRef = useRef(false);

  // Spawn agent on first mount (only if no existing ptyId)
  useEffect(() => {
    if (terminalPtyId || spawnedRef.current) return;
    spawnedRef.current = true;

    spawn({
      name: 'Marketing Specialist',
      role: 'specialist',
      capabilities: ['marketing'],
      promptPath: 'ai/skills/marketing/MARKETING_BOOTSTRAP.md',
      onReady: (ptyId) => {
        console.log('[Marketing] Agent spawned:', ptyId);
        setTerminalPtyId(ptyId);
      },
    }).catch((err) => {
      console.error('[Marketing] Failed to spawn agent:', err);
      spawnedRef.current = false;
    });
  }, [terminalPtyId, spawn, setTerminalPtyId]);

  if (!terminalPtyId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Spawning Marketing Specialist...
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
