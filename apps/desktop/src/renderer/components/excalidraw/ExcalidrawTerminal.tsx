import { useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { useExcalidrawStore } from '../../stores/excalidraw-store';
import { useSpawnTerminalAgent } from '../../hooks/useSpawnTerminalAgent';
import { Terminal } from '../Terminal';

/**
 * ExcalidrawTerminal — Lazy-starts an Excalidraw Specialist agent.
 *
 * - Fresh visit (no ptyId): shows "Start Terminal" button
 * - Click button: spawns PTY, shows "Spawning..." while waiting
 * - ptyId arrives: renders Terminal (reconnects on return visits)
 */
export function ExcalidrawTerminal() {
  const terminalPtyId = useExcalidrawStore((s) => s.terminalPtyId);
  const setTerminalPtyId = useExcalidrawStore((s) => s.setTerminalPtyId);
  const { spawn } = useSpawnTerminalAgent();
  const spawnedRef = useRef(false);
  const [spawning, setSpawning] = useState(false);

  function handleStart() {
    if (spawnedRef.current) return;
    spawnedRef.current = true;
    setSpawning(true);

    spawn({
      name: 'Excalidraw Agent',
      role: 'specialist',
      capabilities: ['excalidraw'],
      noBootstrap: true,
      onReady: (ptyId) => {
        console.log('[Excalidraw] Agent spawned:', ptyId);
        setTerminalPtyId(ptyId);
        setSpawning(false);
      },
    }).catch((err) => {
      console.error('[Excalidraw] Failed to spawn agent:', err);
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
        Spawning Excalidraw Agent...
      </div>
    );
  }

  return (
    <Terminal
      id={terminalPtyId}
      terminalId={`excalidraw-${terminalPtyId}`}
    />
  );
}
