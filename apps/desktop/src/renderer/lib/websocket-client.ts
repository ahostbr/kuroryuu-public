/**
 * WebSocket Client for Kuroryuu Gateway
 * 
 * Provides real-time updates for:
 * - Agent status changes (registered, heartbeat, deregistered)
 * - Orchestration task updates
 * - Statistics
 * 
 * Usage:
 *   import { gatewayWebSocket } from './websocket-client';
 *   
 *   // Subscribe to events
 *   gatewayWebSocket.on('agent_status_change', (data) => { ... });
 *   gatewayWebSocket.on('stats_update', (data) => { ... });
 *   
 *   // Connect
 *   gatewayWebSocket.connect();
 */

export type WebSocketEventType =
  | 'connected'
  | 'disconnected'
  | 'agent_registered'
  | 'agent_heartbeat'
  | 'agent_status_change'
  | 'agent_deregistered'
  | 'stats_update'
  | 'task_created'
  | 'task_breakdown'
  | 'subtask_claimed'
  | 'subtask_started'
  | 'subtask_completed'
  | 'subtask_status_change'  // Phase 2: DAG updates
  | 'task_completed'
  | 'leader_message'  // Phase 1: Leader-worker push
  | 'ping'  // Keep-alive ping
  | 'pong'  // Keep-alive pong response
  // Security events
  | 'security_alert'         // External connection detected
  | 'threat_intel_update'    // Intel gathered for an IP
  | 'defense_mode_changed'   // Lockdown enabled/disabled
  | 'ip_blocked'             // IP added to blocklist
  | 'server_shutting_down'   // Emergency shutdown initiated
  | 'error';

export interface WebSocketMessage {
  type: WebSocketEventType;
  timestamp: string;
  [key: string]: unknown;
}

type EventCallback = (data: WebSocketMessage) => void;

class GatewayWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  
  constructor(url = 'ws://127.0.0.1:8200/ws/agents') {
    this.url = url;
  }
  
  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      console.log('[WS] Already connected or connecting');
      return;
    }
    
    this.connectionState = 'connecting';
    console.log(`[WS] Connecting to ${this.url}...`);
    
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.startPingInterval();
        this.emit('connected', { 
          type: 'connected', 
          timestamp: new Date().toISOString(),
          message: 'WebSocket connected'
        });
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          // Debug: Log all non-ping messages
          if (data.type !== 'ping' && data.type !== 'pong') {
            console.log(`[WS] Received: ${data.type}`, data);
          }
          this.handleMessage(data);
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };
      
      this.ws.onclose = (event) => {
        console.log(`[WS] Disconnected (code: ${event.code})`);
        this.connectionState = 'disconnected';
        this.stopPingInterval();
        this.emit('disconnected', {
          type: 'disconnected',
          timestamp: new Date().toISOString(),
          code: event.code,
          reason: event.reason
        });
        this.attemptReconnect();
      };
      
      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        this.emit('error', {
          type: 'error',
          timestamp: new Date().toISOString(),
          error: 'WebSocket error'
        });
      };
    } catch (err) {
      console.error('[WS] Connection failed:', err);
      this.connectionState = 'disconnected';
      this.attemptReconnect();
    }
  }
  
  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.stopPingInterval();
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connectionState = 'disconnected';
  }
  
  /**
   * Subscribe to specific event types
   */
  on(eventType: WebSocketEventType | 'all', callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }
  
  /**
   * Send a message to the server
   */
  send(message: Record<string, unknown>): boolean {
    if (this.ws && this.connectionState === 'connected') {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }
  
  /**
   * Subscribe to specific topics (sent to server)
   */
  subscribe(topics: string[]): void {
    this.send({ type: 'subscribe', topics });
  }
  
  /**
   * Get current connection state
   */
  getState(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionState;
  }
  
  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /**
   * Emit a simulated event (for testing purposes)
   */
  emit(eventType: WebSocketEventType, data: Record<string, unknown>): void {
    const message: WebSocketMessage = {
      type: eventType,
      timestamp: new Date().toISOString(),
      ...data,
    };
    this.handleMessage(message);
  }

  private handleMessage(data: WebSocketMessage): void {
    // Handle ping/pong internally
    if (data.type === 'ping') {
      this.send({ type: 'pong' });
      return;
    }
    
    // Emit to specific type listeners
    this.notifyListeners(data.type, data);

    // Also emit to 'all' listeners
    const allListeners = this.listeners.get('all');
    if (allListeners) {
      allListeners.forEach(callback => callback(data));
    }
  }

  private notifyListeners(eventType: string, data: WebSocketMessage): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }
  
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WS] Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.connectionState === 'disconnected') {
        this.connect();
      }
    }, delay);
  }
  
  private startPingInterval(): void {
    this.stopPingInterval();
    // Send ping every 25 seconds (server expects within 30s)
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 25000);
  }
  
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

// Export singleton instance
export const gatewayWebSocket = new GatewayWebSocketClient();

// Export class for custom instances
export { GatewayWebSocketClient };
