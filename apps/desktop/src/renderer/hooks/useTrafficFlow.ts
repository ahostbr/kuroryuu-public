/**
 * useTrafficFlow - WebSocket hook for real-time traffic events
 * Connects to gateway WebSocket endpoint and streams traffic events
 * Uses a singleton connection shared across all components
 */
import { useEffect, useState } from 'react';
import { useTrafficStore } from '../stores/traffic-store';
import type { TrafficWebSocketMessage, TrafficEvent } from '../types/traffic';

const WEBSOCKET_URL = 'ws://127.0.0.1:8200/ws/traffic-flow';
const RECONNECT_INTERVAL = 5000; // 5 seconds
const PING_INTERVAL = 30000; // 30 seconds

// HP-3: Event batching configuration
const EVENT_BATCH_SIZE = 20; // Flush when queue reaches this size
const EVENT_FLUSH_INTERVAL_MS = 100; // Flush every 100ms regardless of queue size

// Module-level singleton - shared across all hook instances
let sharedWs: WebSocket | null = null;
let sharedReconnectTimeout: NodeJS.Timeout | null = null;
let sharedPingInterval: NodeJS.Timeout | null = null;
let connectionVerifyTimeout: NodeJS.Timeout | null = null;
let connectionCount = 0;
let isConnecting = false;

// Connection verification delay - verify WebSocket is actually open after onopen fires
const CONNECTION_VERIFY_DELAY = 1000;

// HP-3: Event batching queue
let eventQueue: TrafficEvent[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

// Callbacks for all subscribers
const subscribers = new Set<{
  onConnect: () => void;
  onDisconnect: () => void;
}>();

function notifyConnect() {
  subscribers.forEach((s) => s.onConnect());
}

function notifyDisconnect() {
  subscribers.forEach((s) => s.onDisconnect());
}

function cleanupShared() {
  if (sharedReconnectTimeout) {
    clearTimeout(sharedReconnectTimeout);
    sharedReconnectTimeout = null;
  }

  if (sharedPingInterval) {
    clearInterval(sharedPingInterval);
    sharedPingInterval = null;
  }

  if (connectionVerifyTimeout) {
    clearTimeout(connectionVerifyTimeout);
    connectionVerifyTimeout = null;
  }

  // HP-3: Clear event batching state
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  eventQueue = [];

  if (sharedWs) {
    sharedWs.close();
    sharedWs = null;
  }

  isConnecting = false;
}

// HP-3: Flush batched events to store
function flushEventQueue(addEvents: (events: TrafficEvent[]) => void) {
  if (eventQueue.length > 0) {
    addEvents([...eventQueue]);
    eventQueue = [];
  }
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
}

function connectShared(
  addEvents: (events: TrafficEvent[]) => void,
  updateStats: (stats: any) => void
) {
  // Already connected or connecting
  if (sharedWs?.readyState === WebSocket.OPEN) {
    notifyConnect();
    return;
  }

  if (isConnecting) {
    return;
  }

  cleanupShared();
  isConnecting = true;

  try {
    console.log('[TrafficFlow] Connecting to WebSocket:', WEBSOCKET_URL);
    const ws = new WebSocket(WEBSOCKET_URL);
    sharedWs = ws;

    ws.onopen = () => {
      console.log('[TrafficFlow] WebSocket connected, verifying...');
      isConnecting = false;

      // Verify connection is still open after a brief delay
      // This catches cases where onopen fires but connection immediately fails
      connectionVerifyTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log('[TrafficFlow] Connection verified as OPEN');
          notifyConnect();
        } else {
          console.warn(
            '[TrafficFlow] Connection verification failed (state:',
            ws.readyState,
            '), retrying...'
          );
          cleanupShared();
          connectShared(addEvents, updateStats);
        }
      }, CONNECTION_VERIFY_DELAY);

      // Start ping interval to keep connection alive
      sharedPingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      try {
        const message: TrafficWebSocketMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'traffic_event':
            if (message.event) {
              // HP-3: Batch events instead of adding one at a time
              eventQueue.push(message.event);

              // Flush immediately if batch size reached
              if (eventQueue.length >= EVENT_BATCH_SIZE) {
                flushEventQueue(addEvents);
              } else if (!flushTimeout) {
                // Schedule flush after interval if not already scheduled
                flushTimeout = setTimeout(() => {
                  flushEventQueue(addEvents);
                }, EVENT_FLUSH_INTERVAL_MS);
              }
            }
            break;

          case 'stats_update':
            if (message.stats) {
              updateStats(message.stats);
            }
            break;

          case 'connected':
          case 'pong':
          case 'ping':
            // Keep-alive messages, no action needed
            break;

          default:
            // Ignore unknown message types silently
            break;
        }
      } catch (err) {
        console.error('[TrafficFlow] Failed to parse message:', err);
      }
    };

    ws.onerror = () => {
      // Only warn once, not spam
      if (isConnecting) {
        console.warn('[TrafficFlow] WebSocket connection failed (will retry)');
      }
    };

    ws.onclose = (event) => {
      console.log('[TrafficFlow] WebSocket closed:', event.code, event.reason || '');
      isConnecting = false;
      notifyDisconnect();

      if (sharedPingInterval) {
        clearInterval(sharedPingInterval);
        sharedPingInterval = null;
      }

      // Only reconnect if there are still subscribers
      if (connectionCount > 0) {
        console.log(`[TrafficFlow] Reconnecting in ${RECONNECT_INTERVAL}ms...`);
        sharedReconnectTimeout = setTimeout(() => {
          connectShared(addEvents, updateStats);
        }, RECONNECT_INTERVAL);
      }
    };
  } catch (err) {
    console.error('[TrafficFlow] Failed to create WebSocket:', err);
    isConnecting = false;
    notifyDisconnect();

    // Retry if still have subscribers
    if (connectionCount > 0) {
      sharedReconnectTimeout = setTimeout(() => {
        connectShared(addEvents, updateStats);
      }, RECONNECT_INTERVAL);
    }
  }
}

export function useTrafficFlow() {
  const [localConnected, setLocalConnected] = useState(false);

  // HP-3: Use addEvents for batch processing instead of addEvent
  const addEvents = useTrafficStore((s) => s.addEvents);
  const updateStats = useTrafficStore((s) => s.updateStats);
  const setConnected = useTrafficStore((s) => s.setConnected);
  const isConnected = useTrafficStore((s) => s.isConnected);

  useEffect(() => {
    // Subscribe this component
    const subscription = {
      onConnect: () => {
        setLocalConnected(true);
        setConnected(true);
      },
      onDisconnect: () => {
        setLocalConnected(false);
        setConnected(false);
      },
    };

    subscribers.add(subscription);
    connectionCount++;

    // Connect if this is the first subscriber
    if (connectionCount === 1) {
      connectShared(addEvents, updateStats);
    } else if (sharedWs?.readyState === WebSocket.OPEN) {
      // Already connected, notify this subscriber
      setLocalConnected(true);
      setConnected(true);
    }

    return () => {
      subscribers.delete(subscription);
      connectionCount--;

      // Clean up if this was the last subscriber
      if (connectionCount === 0) {
        console.log('[TrafficFlow] No more subscribers, closing connection');
        cleanupShared();
        setConnected(false);
      }
    };
  }, [addEvents, updateStats, setConnected]);

  // Periodic state sync - detect stale connection state
  useEffect(() => {
    const syncInterval = setInterval(() => {
      const actuallyConnected = sharedWs?.readyState === WebSocket.OPEN;
      if (localConnected !== actuallyConnected) {
        console.log(
          '[TrafficFlow] State sync: UI shows',
          localConnected ? 'CONNECTED' : 'DISCONNECTED',
          'but WebSocket is',
          actuallyConnected ? 'OPEN' : 'CLOSED/MISSING'
        );
        setLocalConnected(actuallyConnected);
        setConnected(actuallyConnected);
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(syncInterval);
  }, [localConnected, setConnected]);

  const reconnect = () => {
    cleanupShared();
    connectShared(addEvents, updateStats);
  };

  const disconnect = () => {
    cleanupShared();
    setConnected(false);
  };

  return {
    isConnected: localConnected || isConnected,
    reconnect,
    disconnect,
  };
}
