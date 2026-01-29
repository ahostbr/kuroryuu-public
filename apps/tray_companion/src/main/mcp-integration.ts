// MCP Integration for Kuroryuu MCP_CORE connection

interface MCPResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface MCPToolCall {
  tool: string;
  arguments: Record<string, any>;
}

export class MCPIntegration {
  private baseUrl: string = 'http://127.0.0.1:8100';
  private isConnected: boolean = false;
  private sessionId: string = '';

  constructor() {
    this.sessionId = `tray-companion-${Date.now()}`;
  }

  async connect(): Promise<MCPResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error('MCP server returned status:', response.status);
        this.isConnected = false;
        return { success: false, error: `MCP server error: ${response.status}` };
      }
      
      const text = await response.text();
      let data;
      
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('MCP response is not valid JSON:', text.substring(0, 100));
        this.isConnected = false;
        return { success: false, error: 'MCP server returned invalid JSON' };
      }
      
      if (data.ok) {
        this.isConnected = true;
        console.log('MCP connection established:', data);
        return { success: true, data };
      } else {
        this.isConnected = false;
        return { success: false, error: 'MCP server not healthy' };
      }
    } catch (error) {
      this.isConnected = false;
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      console.error('MCP connection failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async callTool(toolCall: MCPToolCall): Promise<MCPResponse> {
    if (!this.isConnected) {
      const connectResult = await this.connect();
      if (!connectResult.success) {
        return connectResult;
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolCall.tool,
            arguments: toolCall.arguments
          }
        })
      });

      const data = await response.json();
      
      if (data.error) {
        return { success: false, error: data.error.message || 'Tool call failed' };
      }

      return { success: true, data: data.result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Tool call failed';
      console.error('MCP tool call failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // Kuroryuu-specific tool calls (using routed tool pattern with action parameter)
  async startSession(): Promise<MCPResponse> {
    return await this.callTool({
      tool: 'k_session',
      arguments: {
        action: 'start',
        process_id: this.sessionId,
        cli_type: 'tray-companion',
        agent_id: 'kuroryuu-tts-companion'
      }
    });
  }

  async sendInboxMessage(recipient: string, message: string, priority: 'low' | 'normal' | 'high' = 'normal'): Promise<MCPResponse> {
    return await this.callTool({
      tool: 'k_inbox',
      arguments: {
        action: 'send',
        payload: { recipient, message, priority, sender: 'tts-companion' }
      }
    });
  }

  async ragQuery(query: string): Promise<MCPResponse> {
    return await this.callTool({
      tool: 'k_rag',
      arguments: {
        action: 'query',
        query,
        top_k: 5
      }
    });
  }

  async saveCheckpoint(name: string, data: any): Promise<MCPResponse> {
    return await this.callTool({
      tool: 'k_checkpoint',
      arguments: {
        action: 'save',
        name: `tts-companion-${name}`,
        data: data
      }
    });
  }

  async loadCheckpoint(name: string): Promise<MCPResponse> {
    return await this.callTool({
      tool: 'k_checkpoint',
      arguments: {
        action: 'load',
        name: `tts-companion-${name}`
      }
    });
  }

  isConnectedToMCP(): boolean {
    return this.isConnected;
  }

  getSessionId(): string {
    return this.sessionId;
  }
}

// Global MCP instance
let mcpInstance: MCPIntegration | null = null;

export function getMCPInstance(): MCPIntegration {
  if (!mcpInstance) {
    mcpInstance = new MCPIntegration();
  }
  return mcpInstance;
}

export async function initializeMCP(): Promise<MCPResponse> {
  const mcp = getMCPInstance();
  const connectResult = await mcp.connect();
  
  if (connectResult.success) {
    // Start session with Kuroryuu
    await mcp.startSession();
    console.log('MCP integration initialized successfully');
  }
  
  return connectResult;
}
