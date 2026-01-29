/**
 * usePTYTrafficFlow - WebSocket hook for real-time PTY traffic events
 * Connects to gateway WebSocket endpoint and streams PTY events
 * Uses a singleton connection shared across all components
 */
import { useEffect, useState } from 'react';
import { usePTYTrafficStore } from '../stores/pty-traffic-store';
import type { PTYWebSocketMessage, PTYFilterState } from '../types/pty-traffic';

const WEBSOCKET_URL = 'ws://127.0.0.1:8200/ws/pty-traffic';
const GATEWAY_API_URL = 'http://127.0.0.1:8200';
const RECONNECT_INTERVAL = 5000; // 5 seconds
const PING_INTERVAL = 30000; // 30 seconds
const INITIAL_EVENTS_LIMIT = 100; // Fetch last 100 events on connect

// Module-level singleton - shared across all hook instances
let sharedWs: WebSocket | null = null;
let sharedReconnectTimeout: NodeJS.Timeout | null = null;
let sharedPingInterval: NodeJS.Timeout | null = null;
let connectionCount = 0;
let isConnecting = false;

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

/**
 * Fetch historical events from Gateway REST API
 * Called when WebSocket connects to populate initial data
 */
async function fetchHistoricalEvents(
  addEvent: (event: any) => void,
  updateStats: (stats: any) => void
) {
  try {
    // Fetch recent events
    const eventsRes = await fetch(
      `${GATEWAY_API_URL}/v1/pty-traffic/events?limit=${INITIAL_EVENTS_LIMIT}`
    );
    if (eventsRes.ok) {
      const data = await eventsRes.json();
      // Add events in chronological order (oldest first)
      const events = data.events || [];
      events.reverse().forEach((event: any) => addEvent(event));
      console.log(`[PTYTrafficFlow] Loaded ${events.length} historical events`);
    }

    // Fetch current stats
    const statsRes = await fetch(`${GATEWAY_API_URL}/v1/pty-traffic/stats`);
    if (statsRes.ok) {
      const stats = await statsRes.json();
      updateStats(stats);
    }
  } catch (err) {
    console.warn('[PTYTrafficFlow] Failed to fetch historical events:', err);
  }
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

  if (sharedWs) {
    sharedWs.close();
    sharedWs = null;
  }

  isConnecting = false;
}

function connectShared(
  addEvent: (event: any) => void,
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
    console.log('[PTYTrafficFlow] Connecting to WebSocket:', WEBSOCKET_URL);
    const ws = new WebSocket(WEBSOCKET_URL);
    sharedWs = ws;

    ws.onopen = () => {
      console.log('[PTYTrafficFlow] WebSocket connected');
      isConnecting = false;
      notifyConnect();

      // Fetch historical events on initial connection
      fetchHistoricalEvents(addEvent, updateStats);

      // Start ping interval to keep connection alive
      sharedPingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      try {
        const message: PTYWebSocketMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'pty_event':
            if (message.event) {
              addEvent(message.event);
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
          case 'subscribed':
          case 'unsubscribed':
          case 'paused':
          case 'resumed':
            // Acknowledgment messages, no action needed
            break;

          case 'error':
            console.warn('[PTYTrafficFlow] Server error:', message.message);
            break;

          default:
            // Ignore unknown message types silently
            break;
        }
      } catch (err) {
        console.error('[PTYTrafficFlow] Failed to parse message:', err);
      }
    };

    ws.onerror = () => {
      // Only warn once, not spam
      if (isConnecting) {
        console.warn('[PTYTrafficFlow] WebSocket connection failed (will retry)');
      }
    };

    ws.onclose = (event) => {
      console.log('[PTYTrafficFlow] WebSocket closed:', event.code, event.reason || '');
      isConnecting = false;
      notifyDisconnect();

      if (sharedPingInterval) {
        clearInterval(sharedPingInterval);
        sharedPingInterval = null;
      }

      // Only reconnect if there are still subscribers
      if (connectionCount > 0) {
        console.log(`[PTYTrafficFlow] Reconnecting in ${RECONNECT_INTERVAL}ms...`);
        sharedReconnectTimeout = setTimeout(() => {
          connectShared(addEvent, updateStats);
        }, RECONNECT_INTERVAL);
      }
    };
  } catch (err) {
    console.error('[PTYTrafficFlow] Failed to create WebSocket:', err);
    isConnecting = false;
    notifyDisconnect();

    // Retry if still have subscribers
    if (connectionCount > 0) {
      sharedReconnectTimeout = setTimeout(() => {
        connectShared(addEvent, updateStats);
      }, RECONNECT_INTERVAL);
    }
  }
}

/**
 * Send subscription filters to the server
 */
function sendSubscription(filters: Partial<PTYFilterState>) {
  if (sharedWs?.readyState === WebSocket.OPEN) {
    sharedWs.send(
      JSON.stringify({
        type: 'subscribe',
        filters: {
          actions: filters.actions,
          agent_ids: filters.agentIds,
          session_ids: filters.sessionIds,
          errors_only: filters.errorsOnly,
          blocked_only: filters.blockedOnly,
        },
      })
    );
  }
}

/**
 * Pause event streaming
 */
function sendPause() {
  if (sharedWs?.readyState === WebSocket.OPEN) {
    sharedWs.send(JSON.stringify({ type: 'pause' }));
  }
}

/**
 * Resume event streaming
 */
function sendResume() {
  if (sharedWs?.readyState === WebSocket.OPEN) {
    sharedWs.send(JSON.stringify({ type: 'resume' }));
  }
}

export function usePTYTrafficFlow() {
  const [localConnected, setLocalConnected] = useState(false);

  const addEvent = usePTYTrafficStore((s) => s.addEvent);
  const updateStats = usePTYTrafficStore((s) => s.updateStats);
  const setConnected = usePTYTrafficStore((s) => s.setConnected);
  const isConnected = usePTYTrafficStore((s) => s.isConnected);
  const filters = usePTYTrafficStore((s) => s.filters);
  const isPaused = usePTYTrafficStore((s) => s.isPaused);

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
      connectShared(addEvent, updateStats);
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
        console.log('[PTYTrafficFlow] No more subscribers, closing connection');
        cleanupShared();
        setConnected(false);
      }
    };
  }, [addEvent, updateStats, setConnected]);

  // Send filter updates when filters change
  useEffect(() => {
    if (localConnected) {
      sendSubscription(filters);
    }
  }, [localConnected, filters]);

  // Send pause/resume when paused state changes
  useEffect(() => {
    if (localConnected) {
      if (isPaused) {
        sendPause();
      } else {
        sendResume();
      }
    }
  }, [localConnected, isPaused]);

  const reconnect = () => {
    cleanupShared();
    connectShared(addEvent, updateStats);
  };

  const disconnect = () => {
    cleanupShared();
    setConnected(false);
  };

  return {
    isConnected: localConnected || isConnected,
    reconnect,
    disconnect,
    subscribe: sendSubscription,
    pause: sendPause,
    resume: sendResume,
  };
}
