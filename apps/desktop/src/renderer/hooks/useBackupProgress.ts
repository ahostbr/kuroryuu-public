/**
 * useBackupProgress Hook
 *
 * Connects to the PTY traffic WebSocket and filters for backup-related events.
 * Updates the backup store with progress, summary, and error events.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useBackupStore } from '../stores/backup-store';
import type { BackupProgress, BackupSummary, BackupError } from '../types/backup';

const GATEWAY_WS_URL = 'ws://127.0.0.1:8200/ws/pty-traffic';

interface BackupProgressOptions {
  /** Session ID to filter for (only receive events for this session) */
  sessionId?: string | null;
  /** Whether to automatically connect */
  autoConnect?: boolean;
}

interface UseBackupProgressReturn {
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Current backup progress */
  progress: BackupProgress | null;
  /** Backup completion summary */
  summary: BackupSummary | null;
  /** Backup error if any */
  error: BackupError | null;
  /** Manually connect to WebSocket */
  connect: () => void;
  /** Disconnect from WebSocket */
  disconnect: () => void;
}

export function useBackupProgress(options: BackupProgressOptions = {}): UseBackupProgressReturn {
  const { sessionId = null, autoConnect = true } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const isConnectedRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Get store actions
  const {
    currentSessionId,
    backupProgress,
    backupSummary,
    backupError,
    setBackupProgress,
    setBackupSummary,
    setBackupError,
  } = useBackupStore();

  // Use provided sessionId or fall back to store's currentSessionId
  const activeSessionId = sessionId ?? currentSessionId;

  const connect = useCallback(() => {
    if (!mountedRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(GATEWAY_WS_URL);

      ws.onopen = () => {
        if (!mountedRef.current) return;

        isConnectedRef.current = true;
        console.log('[BackupProgress] WebSocket connected');

        // Subscribe to backup events
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            filters: {
              actions: ['backup_progress', 'backup_heartbeat'],
              // Filter by session ID if available
              ...(activeSessionId ? { session_ids: [activeSessionId] } : {}),
            },
          })
        );
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const message = JSON.parse(event.data);

          // Handle ping/pong
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          // Handle PTY events (backup events come through here)
          if (message.type === 'pty_event') {
            const ptyEvent = message.event;

            // Check if this is a backup event
            if (ptyEvent.action !== 'backup_progress' && ptyEvent.cli_type !== 'k_backup') {
              return;
            }

            // Filter by session ID if we have one
            if (activeSessionId && ptyEvent.session_id !== activeSessionId) {
              return;
            }

            const eventType = ptyEvent.event_type;
            const eventData = ptyEvent.data || {};

            switch (eventType) {
              case 'progress':
                setBackupProgress({
                  session_id: ptyEvent.session_id,
                  percent: eventData.percent || 0,
                  files_done: eventData.files_done || 0,
                  bytes_done: eventData.bytes_done || 0,
                  total_files: eventData.total_files || 0,
                  total_bytes: eventData.total_bytes || 0,
                  current_file: eventData.current_file || null,
                  timestamp: ptyEvent.timestamp,
                });
                break;

              case 'summary':
                setBackupSummary({
                  session_id: String(ptyEvent.session_id || ''),
                  snapshot_id: String(eventData.snapshot_id ?? ''),
                  files_new: Number(eventData.files_new) || 0,
                  files_changed: Number(eventData.files_changed) || 0,
                  files_unmodified: Number(eventData.files_unmodified) || 0,
                  dirs_new: Number(eventData.dirs_new) || 0,
                  dirs_changed: Number(eventData.dirs_changed) || 0,
                  dirs_unmodified: Number(eventData.dirs_unmodified) || 0,
                  data_added: Number(eventData.data_added) || 0,
                  total_files_processed: Number(eventData.total_files_processed) || 0,
                  total_bytes_processed: Number(eventData.total_bytes_processed) || 0,
                  duration_seconds: Number(eventData.duration_seconds) || 0,
                });
                break;

              case 'error':
                setBackupError({
                  session_id: ptyEvent.session_id,
                  message: typeof eventData.message === 'string' ? eventData.message : (eventData.message ? JSON.stringify(eventData.message) : 'Unknown error'),
                  code: String(eventData.code || 'UNKNOWN_ERROR'),
                });
                break;

              default:
                // Log other event types for debugging
                console.log('[BackupProgress] Unknown event type:', eventType, eventData);
            }
          }
        } catch (err) {
          console.error('[BackupProgress] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        isConnectedRef.current = false;

        // Suppress logging during React Strict Mode teardown
        if (!mountedRef.current) return;

        console.log('[BackupProgress] WebSocket disconnected');

        // Attempt reconnect after delay if still mounted
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, 3000);
      };

      ws.onerror = (error) => {
        // Suppress error logging during React Strict Mode teardown
        if (!mountedRef.current) return;
        console.error('[BackupProgress] WebSocket error:', error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[BackupProgress] Failed to connect:', error);
    }
  }, [activeSessionId, setBackupProgress, setBackupSummary, setBackupError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      // Remove event handlers to prevent "closed before established" errors
      // during React Strict Mode teardown
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    isConnectedRef.current = false;
  }, []);

  // Effect for connection lifecycle
  useEffect(() => {
    mountedRef.current = true;

    if (autoConnect) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Effect to update subscription when session ID changes
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && activeSessionId) {
      wsRef.current.send(
        JSON.stringify({
          type: 'subscribe',
          filters: {
            actions: ['backup_progress', 'backup_heartbeat'],
            session_ids: [activeSessionId],
          },
        })
      );
    }
  }, [activeSessionId]);

  return {
    isConnected: isConnectedRef.current,
    progress: backupProgress,
    summary: backupSummary,
    error: backupError,
    connect,
    disconnect,
  };
}

/**
 * Simple hook to check if a backup is currently running
 */
export function useIsBackupRunning(): boolean {
  return useBackupStore((state) => state.isBackupRunning);
}

/**
 * Hook to get the current backup progress percentage
 */
export function useBackupPercent(): number {
  return useBackupStore((state) => state.backupProgress?.percent ?? 0);
}
