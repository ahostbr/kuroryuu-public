import { useEffect, useRef, useState } from 'react';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
}

interface UseWebSocketOptions {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function useWebSocket({
  url,
  reconnectInterval = 3000,
  maxReconnectAttempts = 5,
  onMessage,
  onConnect,
  onDisconnect,
  onError
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);

  const connect = () => {
    if (!mountedRef.current) return;
    
    try {
      setConnectionStatus('connecting');
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        if (!mountedRef.current) return;
        
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        onConnect?.();
        console.log(`[WebSocket] Connected to ${url}`);
      };
      
      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          onMessage?.(message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };
      
      ws.onclose = () => {
        if (!mountedRef.current) return;
        
        setIsConnected(false);
        setConnectionStatus('disconnected');
        onDisconnect?.();
        console.log(`[WebSocket] Disconnected from ${url}`);
        
        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`[WebSocket] Reconnecting... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, reconnectInterval);
        } else {
          console.log('[WebSocket] Max reconnection attempts reached');
          setConnectionStatus('error');
        }
      };
      
      ws.onerror = (error) => {
        if (!mountedRef.current) return;
        
        // Only log error if we were previously connected (avoid noise on initial connection failures)
        if (connectionStatus === 'connected') {
          console.error('[WebSocket] Error:', error);
        } else {
          console.log('[WebSocket] Connection error, will retry...');
        }
        setConnectionStatus('error');
        onError?.(error);
      };
      
      wsRef.current = ws;
      
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      setConnectionStatus('error');
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
  };

  const sendMessage = (message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  };

  useEffect(() => {
    mountedRef.current = true;
    
    // Small delay to let the page fully render before connecting
    const initTimeout = setTimeout(() => {
      if (mountedRef.current) {
        connect();
      }
    }, 100);
    
    return () => {
      mountedRef.current = false;
      clearTimeout(initTimeout);
      disconnect();
    };
  }, [url]);

  return {
    isConnected,
    connectionStatus,
    lastMessage,
    sendMessage,
    reconnect: connect,
    disconnect
  };
}

// Real-time agent status hook
export function useAgentStatusUpdates() {
  const [agentStatuses, setAgentStatuses] = useState<Record<string, any>>({});
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  const { isConnected, connectionStatus, sendMessage } = useWebSocket({
    url: 'ws://127.0.0.1:8200/ws/agents',
    onMessage: (message) => {
      if (message.type === 'agent_status_update') {
        setAgentStatuses(prev => ({
          ...prev,
          [message.data.agent_id]: {
            ...prev[message.data.agent_id],
            ...message.data,
            last_seen: Date.now()
          }
        }));
        setLastUpdate(Date.now());
      } else if (message.type === 'agent_heartbeat') {
        setAgentStatuses(prev => ({
          ...prev,
          [message.data.agent_id]: {
            ...prev[message.data.agent_id],
            status: 'alive',
            last_heartbeat: message.data.timestamp,
            last_seen: Date.now()
          }
        }));
        setLastUpdate(Date.now());
      }
    },
    onConnect: () => {
      // Request current agent statuses
      sendMessage({ type: 'get_agent_statuses' });
    }
  });

  return {
    agentStatuses,
    lastUpdate,
    isConnected,
    connectionStatus
  };
}

// Real-time task updates hook
export function useTaskUpdates() {
  const [tasks, setTasks] = useState<Record<string, any>>({});
  const [taskQueue, setTaskQueue] = useState<any[]>([]);

  const { isConnected, sendMessage } = useWebSocket({
    url: 'ws://127.0.0.1:8200/ws/tasks',
    onMessage: (message) => {
      if (message.type === 'task_created') {
        setTasks(prev => ({
          ...prev,
          [message.data.task_id]: message.data
        }));
      } else if (message.type === 'task_updated') {
        setTasks(prev => ({
          ...prev,
          [message.data.task_id]: {
            ...prev[message.data.task_id],
            ...message.data
          }
        }));
      } else if (message.type === 'task_queue_update') {
        setTaskQueue(message.data.queue || []);
      }
    },
    onConnect: () => {
      sendMessage({ type: 'get_task_queue' });
    }
  });

  return {
    tasks,
    taskQueue,
    isConnected
  };
}

// System metrics hook
export function useSystemMetrics() {
  const [metrics, setMetrics] = useState({
    cpu_percent: 0,
    memory_percent: 0,
    active_agents: 0,
    pending_tasks: 0,
    completed_tasks: 0,
    avg_response_time: 0
  });

  const { isConnected } = useWebSocket({
    url: 'ws://127.0.0.1:8200/ws/metrics',
    onMessage: (message) => {
      if (message.type === 'system_metrics') {
        setMetrics(message.data);
      }
    }
  });

  return {
    metrics,
    isConnected
  };
}
