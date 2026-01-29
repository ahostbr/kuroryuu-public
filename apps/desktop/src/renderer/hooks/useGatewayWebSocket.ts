/**
 * React Hook for Gateway WebSocket
 * 
 * Provides reactive state and event handling for real-time Gateway updates.
 * 
 * Usage:
 *   const { isConnected, lastEvent, subscribe, connect } = useGatewayWebSocket();
 *   
 *   useEffect(() => {
 *     return subscribe('agent_status_change', (data) => {
 *       console.log('Agent status changed:', data);
 *     });
 *   }, [subscribe]);
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { 
  gatewayWebSocket, 
  type WebSocketEventType, 
  type WebSocketMessage 
} from '../lib/websocket-client';

export interface UseGatewayWebSocketReturn {
  /** Current connection state */
  connectionState: 'disconnected' | 'connecting' | 'connected';
  /** Whether currently connected */
  isConnected: boolean;
  /** Last received event */
  lastEvent: WebSocketMessage | null;
  /** Agent statistics (auto-updated) */
  stats: AgentStats | null;
  /** List of active agents (auto-updated) */
  agents: AgentInfo[];
  /** Subscribe to specific event type */
  subscribe: (eventType: WebSocketEventType | 'all', callback: (data: WebSocketMessage) => void) => () => void;
  /** Connect to WebSocket */
  connect: () => void;
  /** Disconnect from WebSocket */
  disconnect: () => void;
  /** Send a message */
  send: (message: Record<string, unknown>) => boolean;
}

export interface AgentStats {
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  busyAgents: number;
}

export interface AgentInfo {
  id: string;
  role: string;
  status: 'idle' | 'busy' | 'dead';
  lastHeartbeat: string;
}

/**
 * Hook for consuming Gateway WebSocket events
 * 
 * @param autoConnect - Whether to automatically connect on mount (default: true)
 */
export function useGatewayWebSocket(autoConnect = true): UseGatewayWebSocketReturn {
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>(
    gatewayWebSocket.getState()
  );
  const [lastEvent, setLastEvent] = useState<WebSocketMessage | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  
  // Track subscriptions for cleanup
  const subscriptionsRef = useRef<Set<() => void>>(new Set());
  
  // Subscribe helper that tracks for cleanup
  const subscribe = useCallback((
    eventType: WebSocketEventType | 'all',
    callback: (data: WebSocketMessage) => void
  ) => {
    const unsubscribe = gatewayWebSocket.on(eventType, callback);
    subscriptionsRef.current.add(unsubscribe);
    return () => {
      unsubscribe();
      subscriptionsRef.current.delete(unsubscribe);
    };
  }, []);
  
  // Set up core event handlers
  useEffect(() => {
    // Connection state tracking
    const unsubConnected = gatewayWebSocket.on('connected', () => {
      setConnectionState('connected');
    });
    
    const unsubDisconnected = gatewayWebSocket.on('disconnected', () => {
      setConnectionState('disconnected');
    });
    
    // Track last event
    const unsubAll = gatewayWebSocket.on('all', (data) => {
      setLastEvent(data);
    });
    
    // Stats updates
    const unsubStats = gatewayWebSocket.on('stats_update', (data) => {
      if (data.stats) {
        setStats(data.stats as AgentStats);
      }
    });
    
    // Agent tracking
    const unsubRegistered = gatewayWebSocket.on('agent_registered', (data) => {
      if (data.agent) {
        setAgents(prev => [...prev, data.agent as AgentInfo]);
      }
    });
    
    const unsubDeregistered = gatewayWebSocket.on('agent_deregistered', (data) => {
      if (data.agent_id) {
        setAgents(prev => prev.filter(a => a.id !== data.agent_id));
      }
    });
    
    const unsubStatusChange = gatewayWebSocket.on('agent_status_change', (data) => {
      if (data.agent_id && data.new_status) {
        setAgents(prev => prev.map(a => 
          a.id === data.agent_id 
            ? { ...a, status: data.new_status as AgentInfo['status'] }
            : a
        ));
      }
    });
    
    // Auto-connect if enabled
    if (autoConnect && gatewayWebSocket.getState() === 'disconnected') {
      setConnectionState('connecting');
      gatewayWebSocket.connect();
    }
    
    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubAll();
      unsubStats();
      unsubRegistered();
      unsubDeregistered();
      unsubStatusChange();
      
      // Clean up any additional subscriptions
      subscriptionsRef.current.forEach(unsub => unsub());
      subscriptionsRef.current.clear();
    };
  }, [autoConnect]);
  
  const connect = useCallback(() => {
    setConnectionState('connecting');
    gatewayWebSocket.connect();
  }, []);
  
  const disconnect = useCallback(() => {
    gatewayWebSocket.disconnect();
    setConnectionState('disconnected');
  }, []);
  
  const send = useCallback((message: Record<string, unknown>) => {
    return gatewayWebSocket.send(message);
  }, []);
  
  return {
    connectionState,
    isConnected: connectionState === 'connected',
    lastEvent,
    stats,
    agents,
    subscribe,
    connect,
    disconnect,
    send,
  };
}

/**
 * Hook for subscribing to specific orchestration events
 */
export function useOrchestrationEvents(options?: {
  onTaskCreated?: (data: WebSocketMessage) => void;
  onTaskBreakdown?: (data: WebSocketMessage) => void;
  onSubtaskClaimed?: (data: WebSocketMessage) => void;
  onSubtaskStarted?: (data: WebSocketMessage) => void;
  onSubtaskCompleted?: (data: WebSocketMessage) => void;
  onTaskCompleted?: (data: WebSocketMessage) => void;
}) {
  const { subscribe, isConnected } = useGatewayWebSocket();
  
  useEffect(() => {
    const unsubscribes: (() => void)[] = [];
    
    if (options?.onTaskCreated) {
      unsubscribes.push(subscribe('task_created', options.onTaskCreated));
    }
    if (options?.onTaskBreakdown) {
      unsubscribes.push(subscribe('task_breakdown', options.onTaskBreakdown));
    }
    if (options?.onSubtaskClaimed) {
      unsubscribes.push(subscribe('subtask_claimed', options.onSubtaskClaimed));
    }
    if (options?.onSubtaskStarted) {
      unsubscribes.push(subscribe('subtask_started', options.onSubtaskStarted));
    }
    if (options?.onSubtaskCompleted) {
      unsubscribes.push(subscribe('subtask_completed', options.onSubtaskCompleted));
    }
    if (options?.onTaskCompleted) {
      unsubscribes.push(subscribe('task_completed', options.onTaskCompleted));
    }
    
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [subscribe, options]);
  
  return { isConnected };
}
