import { useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { useLiteNotionStore } from '../../stores/litenotion-store';
import { Terminal } from '../Terminal';

/**
 * LiteNotionTerminal — Lazy-starts a PowerShell terminal for LiteNotion work.
 */
export function LiteNotionTerminal() {
  const terminalPtyId = useLiteNotionStore((s) => s.terminalPtyId);
  const setTerminalPtyId = useLiteNotionStore((s) => s.setTerminalPtyId);
  const spawnedRef = useRef(false);
  const [spawning, setSpawning] = useState(false);

  async function handleStart() {
    if (spawnedRef.current) return;
    spawnedRef.current = true;
    setSpawning(true);

    try {
      let cwd: string | undefined;
      try {
        cwd = await window.electronAPI?.app?.getProjectRoot?.();
      } catch { /* fallback below */ }
      if (!cwd) {
        cwd = process.env.KURORYUU_ROOT || process.env.KURORYUU_PROJECT_ROOT || undefined;
      }

      const pty = await window.electronAPI.pty.create({
        cmd: 'powershell.exe',
        args: ['-NoLogo'],
        cwd,
        cols: 120,
        rows: 30,
        label: 'LiteNotion Shell',
        cliType: 'shell',
      });

      console.log('[LiteNotion] Shell spawned:', pty.id);
      setTerminalPtyId(pty.id);
      setSpawning(false);
    } catch (err) {
      console.error('[LiteNotion] Failed to spawn shell:', err);
      spawnedRef.current = false;
      setSpawning(false);
    }
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
        Spawning LiteNotion Shell...
      </div>
    );
  }

  return (
    <Terminal
      id={terminalPtyId}
      terminalId={`litenotion-${terminalPtyId}`}
    />
  );
}
