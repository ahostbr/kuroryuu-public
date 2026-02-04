/**
 * useBashOutputStream - WebSocket hook for real-time k_bash output streaming
 *
 * Subscribes to bash_output events from the PTY WebSocket for a specific session_id.
 * Used by SessionLogViewer to display real-time output from background agents.
 */
import { useEffect, useState, useRef, useCallback } from 'react';

const WS_URL = 'ws://127.0.0.1:8200/ws/pty-traffic';

interface BashOutputEvent {
  action: string;
  session_id: string;
  response: string;
  response_size: number;
  is_final?: boolean;
  exit_code?: number;
  command_preview?: string;
  cli_type?: string;
}

interface WebSocketMessage {
  type: string;
  event?: BashOutputEvent;
  ping_interval?: number;
}

export function useBashOutputStream(sessionId: string | null) {
  const [output, setOutput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!sessionId) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Subscribe to bash_output events for this session only
      ws.send(JSON.stringify({
        type: 'subscribe',
        filters: {
          session_ids: [sessionId],
          actions: ['bash_output'],
        },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        // Handle ping - respond with pong
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        // Handle PTY event
        if (message.type === 'pty_event' && message.event) {
          const evt = message.event;

          // Only process events for our session
          if (evt.session_id === sessionId && evt.action === 'bash_output') {
            // Append output chunk
            if (evt.response) {
              setOutput((prev) => prev + evt.response);
            }

            // Check if this is the final event
            if (evt.is_final) {
              setIsComplete(true);
            }
          }
        }
      } catch (err) {
        console.warn('[useBashOutputStream] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Don't reconnect if complete
      if (!isComplete && sessionId) {
        // Reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 2000);
      }
    };

    ws.onerror = (err) => {
      console.warn('[useBashOutputStream] WebSocket error:', err);
      setIsConnected(false);
    };
  }, [sessionId, isComplete]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const clearOutput = useCallback(() => {
    setOutput('');
    setIsComplete(false);
  }, []);

  // Connect when sessionId changes, disconnect on unmount
  useEffect(() => {
    if (sessionId) {
      setOutput('');
      setIsComplete(false);
      connect();
    }

    return () => {
      disconnect();
    };
  }, [sessionId, connect, disconnect]);

  return {
    output,
    isConnected,
    isComplete,
    clearOutput,
  };
}

export default useBashOutputStream;
