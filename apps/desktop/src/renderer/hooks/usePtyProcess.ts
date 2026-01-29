import { useEffect, useRef, useState, useCallback } from 'react';
import { fileLogger } from '../utils/file-logger';

interface UsePtyProcessOptions {
  terminalId: string;
  cwd?: string;
  cols: number;
  rows: number;
  cliConfig?: {
    cmd?: string;
    args?: string[];
    env?: Record<string, string>;
  };
  skipCreation?: boolean;  // Wait for dimensions
  initialPtyId?: string;  // For reconnection to alive PTY
  onCreated?: (ptyId: string, sessionId?: string) => void;
  onError?: (error: string) => void;
}

/**
 * usePtyProcess - Manages PTY lifecycle with dimension safety and reconnection
 *
 * Key Design:
 * - skipCreation gates PTY creation until dimensions are validated
 * - Double-checked locking prevents duplicate creation
 * - Supports reconnection to existing PTY processes
 * - Recreation controls for terminal restart
 */
export function usePtyProcess({
  terminalId,
  cwd,
  cols,
  rows,
  cliConfig,
  skipCreation = false,
  initialPtyId,
  onCreated,
  onError,
}: UsePtyProcessOptions) {
  // Ref-based state to prevent duplicate creation
  const isCreatingRef = useRef(false);
  const isCreatedRef = useRef(false);

  // State trigger for forced recreation (refs don't trigger renders)
  const [recreationTrigger, setRecreationTrigger] = useState(0);

  // PTY creation effect
  useEffect(() => {
    // Skip if not ready
    if (skipCreation) {
      fileLogger.log('usePtyProcess', 'Skipping creation (waiting for dimensions)', { terminalId });
      return;
    }

    // Prevent duplicate creation (double-checked locking)
    if (isCreatingRef.current || isCreatedRef.current) {
      fileLogger.log('usePtyProcess', 'Skipping creation (already creating/created)', { terminalId, isCreating: isCreatingRef.current, isCreated: isCreatedRef.current });
      return;
    }

    fileLogger.log('usePtyProcess', 'Starting PTY creation', { terminalId });
    isCreatingRef.current = true;  // Lock BEFORE async call

    // If reconnecting to existing PTY
    if (initialPtyId) {
      fileLogger.log('usePtyProcess', 'Attempting reconnection to existing PTY', { terminalId, initialPtyId });

      window.electronAPI.pty.subscribe(initialPtyId)
        .then(() => {
          fileLogger.log('usePtyProcess', 'Successfully subscribed to PTY', { terminalId, ptyId: initialPtyId });
          isCreatedRef.current = true;
          onCreated?.(initialPtyId, initialPtyId);
        })
        .catch((err) => {
          fileLogger.error('usePtyProcess', 'Subscribe failed, falling back to create new PTY', { terminalId, initialPtyId, error: err instanceof Error ? err.message : String(err) });

          // Fallback: Create new PTY if subscribe fails (PTY is dead)
          window.electronAPI.pty.create({
            cols,
            rows,
            cwd,
            cmd: cliConfig?.cmd,
            args: cliConfig?.args,
            env: cliConfig?.env,
          })
            .then((pty) => {
              fileLogger.log('usePtyProcess', 'Fallback PTY created successfully', { terminalId, newPtyId: pty.id, sessionId: pty.sessionId });
              isCreatedRef.current = true;
              onCreated?.(pty.id, pty.sessionId);
            })
            .catch((createErr) => {
              fileLogger.error('usePtyProcess', 'Fallback create also failed', { terminalId, error: createErr instanceof Error ? createErr.message : String(createErr) });
              const errorMsg = createErr instanceof Error ? createErr.message : String(createErr);
              onError?.(errorMsg);
            })
            .finally(() => {
              isCreatingRef.current = false;
            });
        })
        .finally(() => {
          isCreatingRef.current = false;  // Unlock after completion
        });
      return;
    }

    // Create new PTY
    fileLogger.log('usePtyProcess', 'Creating new PTY', {
      terminalId,
      cols,
      rows,
      cwd,
      cmd: cliConfig?.cmd,
      hasArgs: !!cliConfig?.args,
      hasEnv: !!cliConfig?.env
    });

    window.electronAPI.pty.create({
      cols,
      rows,
      cwd,
      cmd: cliConfig?.cmd,
      args: cliConfig?.args,
      env: cliConfig?.env,
    })
      .then((pty) => {
        fileLogger.log('usePtyProcess', 'PTY created successfully', { terminalId, ptyId: pty.id, sessionId: pty.sessionId });
        isCreatedRef.current = true;
        onCreated?.(pty.id, pty.sessionId);
      })
      .catch((err) => {
        fileLogger.error('usePtyProcess', 'PTY creation failed', { terminalId, error: err instanceof Error ? err.message : String(err) });
        const errorMsg = err instanceof Error ? err.message : String(err);
        onError?.(errorMsg);
      })
      .finally(() => {
        isCreatingRef.current = false;  // Unlock after completion
      });
  }, [terminalId, cwd, cols, rows, skipCreation, recreationTrigger, initialPtyId]);

  // Recreation controls
  const prepareForRecreate = useCallback(() => {
    fileLogger.log('usePtyProcess', 'Preparing for recreation', { terminalId });
    isCreatingRef.current = true;  // Lock BEFORE destroying old PTY
  }, [terminalId]);

  const resetForRecreate = useCallback(() => {
    fileLogger.log('usePtyProcess', 'Resetting for recreation', { terminalId });
    isCreatedRef.current = false;
    isCreatingRef.current = false;
    setRecreationTrigger(prev => prev + 1);  // Force effect re-run
  }, [terminalId]);

  return {
    prepareForRecreate,
    resetForRecreate,
  };
}
