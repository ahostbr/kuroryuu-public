/**
 * Claude Agent SDK Service
 *
 * Core service wrapping @anthropic-ai/claude-agent-sdk for Kuroryuu Desktop.
 * Manages multiple concurrent agent sessions, streams SDK messages to renderer
 * via BrowserWindow.webContents.send(), and integrates with the Gateway agent registry.
 *
 * Runs in the Electron MAIN PROCESS only (SDK requires Node.js).
 */

import { BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { getApiKey } from '../integrations/token-store';

// SDK types — imported dynamically since it's ESM
import type {
  Query,
  Options as SDKOptions,
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKToolProgressMessage,
  SDKPartialAssistantMessage,
  AgentDefinition,
  PermissionMode,
  McpHttpServerConfig,
} from '@anthropic-ai/claude-agent-sdk';

import type {
  SDKAgentConfig,
  SDKAgentSession,
  SDKAgentSessionSummary,
  SerializedSDKMessage,
  ToolCallRecord,
} from '../../renderer/types/sdk-agent';

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const GATEWAY_MCP_URL = 'http://127.0.0.1:8200/v1/mcp';
const GATEWAY_AGENTS_URL = 'http://127.0.0.1:8200/v1/agents';
const HEARTBEAT_INTERVAL_MS = 10_000;
const MAX_MESSAGES_IN_MEMORY = 5000; // Per session, to prevent memory bloat

// -------------------------------------------------------------------
// Internal session state (not serialized to renderer)
// -------------------------------------------------------------------

interface InternalSession {
  session: SDKAgentSession;
  query: Query | null;
  abortController: AbortController;
  messages: SerializedSDKMessage[];
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  registryAgentId: string | null;
}

// -------------------------------------------------------------------
// Service singleton
// -------------------------------------------------------------------

let instance: ClaudeSDKService | null = null;

export function getClaudeSDKService(): ClaudeSDKService {
  if (!instance) {
    instance = new ClaudeSDKService();
  }
  return instance;
}

export class ClaudeSDKService {
  private sessions = new Map<string, InternalSession>();
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // -----------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------

  async startAgent(config: SDKAgentConfig): Promise<string> {
    const sessionId = randomUUID();

    // Resolve API key
    const apiKey = getApiKey('anthropic') || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('No Anthropic API key configured. Set it in Settings → Integrations → Anthropic.');
    }

    // Build SDK options
    const sdkOptions = this.buildSDKOptions(config, apiKey);
    const abortController = new AbortController();
    sdkOptions.abortController = abortController;

    // Initialize session state
    const session: SDKAgentSession = {
      id: sessionId,
      backend: 'sdk',
      role: config.role,
      status: 'starting',
      prompt: config.prompt,
      model: config.model || 'claude-sonnet-4-5-20250929',
      cwd: config.cwd || process.cwd(),
      startedAt: Date.now(),
      totalCostUsd: 0,
      numTurns: 0,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      toolCalls: [],
      subagentCount: 0,
    };

    const internal: InternalSession = {
      session,
      query: null,
      abortController,
      messages: [],
      heartbeatTimer: null,
      registryAgentId: null,
    };

    this.sessions.set(sessionId, internal);
    this.emit('sdk-agent:status-change', sessionId, 'starting');

    // Start consuming the query in background (don't await)
    this.consumeQuery(sessionId, config.prompt, sdkOptions).catch((err) => {
      console.error(`[ClaudeSDK] Session ${sessionId} fatal error:`, err);
      session.status = 'error';
      session.errors = [String(err)];
      session.completedAt = Date.now();
      this.emit('sdk-agent:status-change', sessionId, 'error');
    });

    return sessionId;
  }

  async stopAgent(sessionId: string): Promise<void> {
    const internal = this.sessions.get(sessionId);
    if (!internal) throw new Error(`Session ${sessionId} not found`);

    // Interrupt then abort
    try {
      if (internal.query) {
        await internal.query.interrupt();
      }
    } catch {
      // Interrupt may fail if already stopped
    }
    internal.abortController.abort();
    internal.session.status = 'cancelled';
    internal.session.completedAt = Date.now();
    this.cleanupSession(sessionId);
    this.emit('sdk-agent:status-change', sessionId, 'cancelled');
  }

  async resumeAgent(sessionId: string, prompt: string): Promise<string> {
    const internal = this.sessions.get(sessionId);
    if (!internal?.session.sdkSessionId) {
      throw new Error(`Session ${sessionId} has no SDK session ID to resume`);
    }

    // Create a new session that resumes the old one
    const config: SDKAgentConfig = {
      prompt,
      model: internal.session.model,
      cwd: internal.session.cwd,
      role: internal.session.role,
      permissionMode: internal.session.permissionMode,
      resumeSessionId: internal.session.sdkSessionId,
    };

    return this.startAgent(config);
  }

  listSessions(): SDKAgentSessionSummary[] {
    const summaries: SDKAgentSessionSummary[] = [];
    for (const internal of Array.from(this.sessions.values())) {
      const s = internal.session;
      const lastMsg = internal.messages.length > 0
        ? internal.messages[internal.messages.length - 1]
        : undefined;

      summaries.push({
        id: s.id,
        sdkSessionId: s.sdkSessionId,
        role: s.role,
        backend: 'sdk',
        status: s.status,
        prompt: s.prompt,
        model: s.model,
        cwd: s.cwd,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        totalCostUsd: s.totalCostUsd,
        numTurns: s.numTurns,
        currentTool: s.currentTool,
        subagentCount: s.subagentCount,
        toolCallCount: s.toolCalls.length,
        lastMessage: lastMsg?.text?.slice(0, 200),
      });
    }
    return summaries;
  }

  getSession(sessionId: string): SDKAgentSession | null {
    return this.sessions.get(sessionId)?.session ?? null;
  }

  getMessages(sessionId: string, offset = 0, limit = 100): SerializedSDKMessage[] {
    const internal = this.sessions.get(sessionId);
    if (!internal) return [];
    return internal.messages.slice(offset, offset + limit);
  }

  getMessageCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.messages.length ?? 0;
  }

  // -----------------------------------------------------------------
  // SDK query consumption (runs in background)
  // -----------------------------------------------------------------

  private async consumeQuery(sessionId: string, prompt: string, options: SDKOptions): Promise<void> {
    const internal = this.sessions.get(sessionId);
    if (!internal) return;

    // Dynamic import since SDK is ESM
    const { query: sdkQuery } = await import('@anthropic-ai/claude-agent-sdk');

    const q = sdkQuery({ prompt, options });
    internal.query = q;
    internal.session.status = 'running';
    this.emit('sdk-agent:status-change', sessionId, 'running');

    // Register with Gateway agent registry (fire-and-forget)
    this.registerWithGateway(sessionId).catch(() => {});

    try {
      for await (const message of q) {
        if (!this.sessions.has(sessionId)) break; // Session was removed

        const serialized = this.serializeMessage(message, sessionId);
        if (!serialized) continue;

        // Store message (with cap)
        if (internal.messages.length < MAX_MESSAGES_IN_MEMORY) {
          internal.messages.push(serialized);
        }

        // Update session state based on message type
        this.processMessage(internal, message, serialized);

        // Forward to renderer
        this.emit('sdk-agent:message', sessionId, serialized);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Normal cancellation
        return;
      }
      console.error(`[ClaudeSDK] Session ${sessionId} stream error:`, err);
      internal.session.status = 'error';
      internal.session.errors = [...(internal.session.errors || []), String(err)];
      internal.session.completedAt = Date.now();
      this.emit('sdk-agent:status-change', sessionId, 'error');
    } finally {
      this.cleanupSession(sessionId);
    }
  }

  // -----------------------------------------------------------------
  // Message processing
  // -----------------------------------------------------------------

  private processMessage(internal: InternalSession, raw: SDKMessage, serialized: SerializedSDKMessage): void {
    const session = internal.session;

    switch (raw.type) {
      case 'system': {
        const sys = raw as SDKSystemMessage;
        if ('subtype' in sys && sys.subtype === 'init') {
          session.sdkSessionId = sys.session_id;
          session.tools = sys.tools;
          session.mcpServers = sys.mcp_servers;
          session.permissionMode = sys.permissionMode;
          session.model = sys.model;
        }
        break;
      }

      case 'assistant': {
        const asst = raw as SDKAssistantMessage;
        // Extract tool calls from content blocks
        if (asst.message?.content) {
          for (const block of asst.message.content) {
            if ('type' in block && block.type === 'tool_use') {
              const toolBlock = block as { type: 'tool_use'; id: string; name: string; input: unknown };
              const record: ToolCallRecord = {
                toolName: toolBlock.name,
                toolUseId: toolBlock.id,
                input: toolBlock.input,
                timestamp: Date.now(),
                parentToolUseId: asst.parent_tool_use_id,
              };
              session.toolCalls.push(record);
              session.currentTool = toolBlock.name;

              // Track subagent spawns
              if (toolBlock.name === 'Task') {
                session.subagentCount++;
              }
            }
          }
        }
        session.numTurns++;
        break;
      }

      case 'tool_progress': {
        const tp = raw as SDKToolProgressMessage;
        session.currentTool = tp.tool_name;
        break;
      }

      case 'result': {
        const result = raw as SDKResultMessage;
        session.completedAt = Date.now();
        session.totalCostUsd = result.total_cost_usd;
        session.numTurns = result.num_turns;
        session.stopReason = result.stop_reason;
        session.usage = {
          inputTokens: result.usage.input_tokens,
          outputTokens: result.usage.output_tokens,
          cacheReadInputTokens: result.usage.cache_read_input_tokens,
          cacheCreationInputTokens: result.usage.cache_creation_input_tokens,
        };
        session.currentTool = undefined;

        if (result.is_error) {
          session.status = 'error';
          session.errors = 'errors' in result ? result.errors : [];
        } else {
          session.status = 'completed';
          session.result = 'result' in result ? result.result : undefined;
        }

        this.emit('sdk-agent:completed', internal.session.id, result.is_error ? 'error' : 'completed');
        break;
      }
    }
  }

  // -----------------------------------------------------------------
  // Message serialization (SDK message → IPC-safe SerializedSDKMessage)
  // -----------------------------------------------------------------

  private serializeMessage(msg: SDKMessage, sessionId: string): SerializedSDKMessage | null {
    const base = {
      uuid: 'uuid' in msg ? String(msg.uuid) : randomUUID(),
      sessionId,
      timestamp: Date.now(),
      parentToolUseId: 'parent_tool_use_id' in msg ? msg.parent_tool_use_id ?? null : null,
    };

    switch (msg.type) {
      case 'system': {
        const sys = msg as SDKSystemMessage & { subtype?: string };
        if (sys.subtype === 'init') {
          return {
            ...base,
            type: 'system',
            subtype: 'init',
            init: {
              tools: sys.tools,
              model: sys.model,
              mcpServers: sys.mcp_servers,
              permissionMode: sys.permissionMode,
              claudeCodeVersion: sys.claude_code_version,
            },
          };
        }
        return {
          ...base,
          type: 'system',
          subtype: sys.subtype,
        };
      }

      case 'assistant': {
        const asst = msg as SDKAssistantMessage;
        // Extract text and tool use from content blocks
        const texts: string[] = [];
        let toolUse: SerializedSDKMessage['toolUse'] = undefined;

        if (asst.message?.content) {
          for (const block of asst.message.content) {
            if ('type' in block) {
              if (block.type === 'text' && 'text' in block) {
                texts.push(block.text as string);
              } else if (block.type === 'tool_use') {
                const tb = block as { type: 'tool_use'; id: string; name: string; input: unknown };
                toolUse = { id: tb.id, name: tb.name, input: tb.input };
              }
            }
          }
        }

        return {
          ...base,
          type: 'assistant',
          text: texts.length > 0 ? texts.join('\n') : undefined,
          toolUse,
        };
      }

      case 'user': {
        // Tool results come as user messages
        const user = msg as { type: 'user'; message: unknown; tool_use_result?: unknown; parent_tool_use_id: string | null; uuid: string; session_id: string };
        return {
          ...base,
          type: 'user' as SerializedSDKMessage['type'],
          toolResult: user.tool_use_result
            ? { toolUseId: '', output: user.tool_use_result }
            : undefined,
        };
      }

      case 'result': {
        const result = msg as SDKResultMessage;
        return {
          ...base,
          type: 'result',
          subtype: result.subtype,
          result: {
            subtype: result.subtype,
            isError: result.is_error,
            result: 'result' in result ? result.result : undefined,
            errors: 'errors' in result ? result.errors : undefined,
            totalCostUsd: result.total_cost_usd,
            numTurns: result.num_turns,
            durationMs: result.duration_ms,
            durationApiMs: result.duration_api_ms,
            stopReason: result.stop_reason,
            usage: {
              inputTokens: result.usage.input_tokens,
              outputTokens: result.usage.output_tokens,
              cacheReadInputTokens: result.usage.cache_read_input_tokens,
              cacheCreationInputTokens: result.usage.cache_creation_input_tokens,
            },
          },
        };
      }

      case 'tool_progress': {
        const tp = msg as SDKToolProgressMessage;
        return {
          ...base,
          type: 'tool_progress',
          toolProgress: {
            toolUseId: tp.tool_use_id,
            toolName: tp.tool_name,
            elapsedSeconds: tp.elapsed_time_seconds,
          },
        };
      }

      case 'stream_event': {
        // Partial streaming messages
        const partial = msg as SDKPartialAssistantMessage;
        let textDelta: string | undefined;

        if (partial.event && 'type' in partial.event) {
          const evt = partial.event as { type: string; delta?: { type?: string; text?: string } };
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            textDelta = evt.delta.text;
          }
        }

        if (!textDelta) return null; // Skip non-text stream events

        return {
          ...base,
          type: 'stream_event',
          textDelta,
        };
      }

      case 'tool_use_summary': {
        return {
          ...base,
          type: 'tool_use_summary',
          text: 'summary' in msg ? (msg as { summary: string }).summary : undefined,
        };
      }

      default:
        // Skip auth_status and other non-essential message types
        return null;
    }
  }

  // -----------------------------------------------------------------
  // SDK options builder
  // -----------------------------------------------------------------

  private buildSDKOptions(config: SDKAgentConfig, apiKey: string): SDKOptions {
    const options: SDKOptions = {
      cwd: config.cwd || process.cwd(),
      model: config.model,
      permissionMode: (config.permissionMode || 'acceptEdits') as PermissionMode,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      maxTurns: config.maxTurns,
      maxBudgetUsd: config.maxBudgetUsd,
      includePartialMessages: config.includePartialMessages ?? false,
      enableFileCheckpointing: config.enableFileCheckpointing ?? false,
      persistSession: config.persistSession ?? true,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: apiKey,
        CLAUDE_AGENT_SDK_CLIENT_APP: 'kuroryuu-desktop/0.2.0',
      },
      // Load project settings so agents see CLAUDE.md and project config
      settingSources: config.settingSources || ['user', 'project'],
    };

    // System prompt
    if (config.useClaudeCodePreset !== false) {
      if (config.appendSystemPrompt) {
        options.systemPrompt = {
          type: 'preset',
          preset: 'claude_code',
          append: config.appendSystemPrompt,
        };
      } else if (config.systemPrompt) {
        options.systemPrompt = config.systemPrompt;
      } else {
        options.systemPrompt = { type: 'preset', preset: 'claude_code' };
      }
    } else if (config.systemPrompt) {
      options.systemPrompt = config.systemPrompt;
    }

    // Resume session
    if (config.resumeSessionId) {
      options.resume = config.resumeSessionId;
    }

    // MCP servers — always include Kuroryuu Gateway
    const mcpServers: Record<string, McpHttpServerConfig> = {
      kuroryuu: { type: 'http', url: GATEWAY_MCP_URL },
    };
    if (config.mcpServers) {
      for (const [name, cfg] of Object.entries(config.mcpServers)) {
        mcpServers[name] = cfg as McpHttpServerConfig;
      }
    }
    options.mcpServers = mcpServers;

    // Subagent definitions
    if (config.agents) {
      const agentDefs: Record<string, AgentDefinition> = {};
      for (const [name, def] of Object.entries(config.agents)) {
        agentDefs[name] = {
          description: def.description,
          tools: def.tools,
          disallowedTools: def.disallowedTools,
          prompt: def.prompt,
          model: def.model === 'inherit' ? undefined : def.model,
          maxTurns: def.maxTurns,
        };
      }
      options.agents = agentDefs;
    }

    // Use named agent
    if (config.agent) {
      options.agent = config.agent;
    }

    return options;
  }

  // -----------------------------------------------------------------
  // Gateway registry integration (fire-and-forget)
  // -----------------------------------------------------------------

  private async registerWithGateway(sessionId: string): Promise<void> {
    const internal = this.sessions.get(sessionId);
    if (!internal) return;

    try {
      const resp = await fetch(`${GATEWAY_AGENTS_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: internal.session.model,
          role: internal.session.role === 'planner' ? 'leader' : 'worker',
          capabilities: internal.session.tools || [],
          agent_id: `sdk_${sessionId.slice(0, 8)}`,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        internal.registryAgentId = data.agent_id || `sdk_${sessionId.slice(0, 8)}`;

        // Start heartbeat
        internal.heartbeatTimer = setInterval(async () => {
          if (internal.session.status === 'running' && internal.registryAgentId) {
            try {
              await fetch(`${GATEWAY_AGENTS_URL}/heartbeat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent_id: internal.registryAgentId }),
              });
            } catch { /* Heartbeat failure is non-critical */ }
          }
        }, HEARTBEAT_INTERVAL_MS);
      }
    } catch {
      // Gateway might not be running — that's fine
    }
  }

  private async deregisterFromGateway(sessionId: string): Promise<void> {
    const internal = this.sessions.get(sessionId);
    if (!internal?.registryAgentId) return;

    try {
      await fetch(`${GATEWAY_AGENTS_URL}/${internal.registryAgentId}`, {
        method: 'DELETE',
      });
    } catch { /* Non-critical */ }
  }

  // -----------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------

  private cleanupSession(sessionId: string): void {
    const internal = this.sessions.get(sessionId);
    if (!internal) return;

    // Stop heartbeat
    if (internal.heartbeatTimer) {
      clearInterval(internal.heartbeatTimer);
      internal.heartbeatTimer = null;
    }

    // Deregister from Gateway
    this.deregisterFromGateway(sessionId).catch(() => {});

    // Close query
    try {
      internal.query?.close();
    } catch { /* Already closed */ }
    internal.query = null;
  }

  /** Remove session entirely (for archival) */
  removeSession(sessionId: string): void {
    this.cleanupSession(sessionId);
    this.sessions.delete(sessionId);
  }

  /** Cleanup all sessions (app shutdown) */
  shutdown(): void {
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.cleanupSession(sessionId);
    }
    this.sessions.clear();
  }

  // -----------------------------------------------------------------
  // IPC emit helper
  // -----------------------------------------------------------------

  private emit(channel: string, ...args: unknown[]): void {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, ...args);
      }
    } catch {
      // Window might be closing
    }
  }
}

// Helper to get session ID from internal ref
function sessionId(internal: InternalSession): string {
  return internal.session.id;
}
