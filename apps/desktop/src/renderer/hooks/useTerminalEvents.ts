import { useEffect, useRef } from 'react';
import { fileLogger } from '../utils/file-logger';

interface UseTerminalEventsOptions {
  terminalId: string | null;  // null = not ready yet
  onOutput?: (data: string) => void;
  onExit?: (exitCode: number) => void;
}

/**
 * useTerminalEvents - Manages PTY data listeners independently from PTY creation
 *
 * Key Design:
 * - Listeners depend ONLY on terminalId (stable component ID)
 * - Uses ref callbacks to avoid stale closures
 * - Attaches listeners BEFORE PTY creation (preventing race condition)
 * - Independent lifecycle from usePtyProcess
 */
export function useTerminalEvents({
  terminalId,
  onOutput,
  onExit,
}: UseTerminalEventsOptions) {
  // Ref callbacks to avoid stale closures
  // These capture the latest callback functions without re-registering listeners
  const onOutputRef = useRef(onOutput);
  const onExitRef = useRef(onExit);

  // Update refs on every render (captures latest callbacks)
  // This effect runs BEFORE the listener effects below
  useEffect(() => {
    onOutputRef.current = onOutput;
    onExitRef.current = onExit;
  });

  // Attach data listener (depends only on terminalId)
  useEffect(() => {
    if (!terminalId) return;  // Wait for terminal ID

    fileLogger.log('useTerminalEvents', 'Attaching data listener', { terminalId });

    const cleanup = window.electronAPI.pty.onData((id, data) => {
      if (id === terminalId) {
        fileLogger.log('useTerminalEvents', 'Received data', { terminalId, dataLength: data.length });
        // Use ref to call latest callback (avoids stale closure)
        onOutputRef.current?.(data);
      }
    });

    return () => {
      fileLogger.log('useTerminalEvents', 'Cleaning up data listener', { terminalId });
      cleanup();
    };
  }, [terminalId]);

  // Attach exit listener
  useEffect(() => {
    if (!terminalId) return;

    fileLogger.log('useTerminalEvents', 'Attaching exit listener', { terminalId });

    const cleanup = window.electronAPI.pty.onExit((id, exitCode) => {
      if (id === terminalId) {
        fileLogger.log('useTerminalEvents', 'Received exit event', { terminalId, exitCode });
        // Use ref to call latest callback
        onExitRef.current?.(exitCode);
      }
    });

    return () => {
      fileLogger.log('useTerminalEvents', 'Cleaning up exit listener', { terminalId });
      cleanup();
    };
  }, [terminalId]);
}
