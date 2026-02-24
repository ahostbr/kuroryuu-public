import { getSettings } from './settings';
import { speakText } from './tts/tts-manager';
import { getMCPInstance } from './mcp-integration';
import { setTTSPlaying } from './speech-recognition';
import { getDomainConfigReader, type DomainConfig } from './domain-config-reader';
import { app, BrowserWindow } from 'electron';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

// Context tracking types
interface ContextInfo {
  usedTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelMaxTokens?: number;
  maxTokens: number;
  percentage: number;
}

interface LMStudioResponse {
  success: boolean;
  response?: string;
  error?: string;
}

interface LMStudioMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCallNative[];
  tool_call_id?: string;
}

interface ToolCallNative {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface LLMResponse {
  content: string;
  tool_calls?: ToolCallNative[];
}

// Gateway URL for chat proxy
const GATEWAY_URL = 'http://127.0.0.1:8200';
const MCP_URL = 'http://127.0.0.1:8100';
// CLIProxyAPI - fallback when LM Studio unavailable
const CLIPROXYAPI_URL = 'http://127.0.0.1:8317';
// CLIProxyAPI auth token (local development key)
const CLIPROXYAPI_AUTH = 'Bearer kuroryuu-local-key';

// Available tools for LM Studio (OpenAI format - LM Studio converts to [AVAILABLE_TOOLS])
// NOTE: Using routed tool pattern with action parameter (2026-01-09)
const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'k_rag',
      description: 'Search codebase for keywords, find TODOs, explore code. Use action=query to search.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['query', 'status', 'index'], description: 'Action: query=search, status=check index, index=rebuild' },
          query: { type: 'string', description: 'Search query (for query action)' },
          top_k: { type: 'number', description: 'Max results (default 8)' },
          exts: { type: 'array', items: { type: 'string' }, description: 'File extensions to filter, e.g. [".py", ".md"]' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'k_files',
      description: 'File operations: read, write, list. Use action parameter to specify operation.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write', 'list'], description: 'Action to perform' },
          path: { type: 'string', description: 'File or directory path' },
          content: { type: 'string', description: 'Content to write (for write action)' }
        },
        required: ['action', 'path']
      }
    }
  }
];

// System prompt for Tray Companion
const LMSTUDIO_SYSTEM_PROMPT = `You are a helpful AI assistant in the Kuroryuu system.

Keep responses brief and conversational - they may be spoken aloud via TTS.

You have access to these tools - USE THEM when relevant:
- k_rag: Search the codebase (action="query", query="search term")
- k_files: Read/write/list files (action="read|write|list", path="...")

When user asks to find something, scan for TODOs, or search code - call k_rag first.
After getting tool results, summarize them conversationally.`;

function sanitizeModelIdForPromptFilename(modelId: string): string {
  // Prompts are stored as <sanitizedModelId>.md
  // Example: "mistralai/devstral-small-2-2512" -> "mistralaidevstral-small-2-2512.md"
  return modelId.replace(/[^a-zA-Z0-9._-]+/g, '');
}

export function resolvePromptsDir(): string | null {
  const candidates: string[] = [];

  // Prefer stable per-user locations (works for installed app + autostart)
  try {
    candidates.push(
      path.join(app.getPath('appData'), 'Kuroryuu', 'tray_companion', 'Prompts')
    );
    candidates.push(path.join(app.getPath('userData'), 'Prompts'));
  } catch {
    // app.getPath may throw early in startup; fall back to other candidates
  }

  // Dev / portable fallbacks
  candidates.push(path.join(app.getAppPath(), 'Prompts'));
  candidates.push(path.join(process.cwd(), 'Prompts'));
  candidates.push(path.join(process.cwd(), 'apps', 'tray_companion', 'Prompts'));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

// NOTE: Legacy text-based tool parsing removed - using native OpenAI tool_calls format only
// Native tool calls come as response.tool_calls array from LM Studio

export class LMStudioIntegration {
  private lmStudioUrl: string = 'http://127.0.0.1:1234';
  private cliproxyApiUrl: string = CLIPROXYAPI_URL;
  private cliproxyApiModel: string = 'claude-sonnet-4-20250514';
  private gatewayUrl: string = GATEWAY_URL;
  private mcpUrl: string = MCP_URL;
  private conversationHistory: LMStudioMessage[] = [];
  private systemPrompt: string = LMSTUDIO_SYSTEM_PROMPT;
  private systemPromptLoaded: boolean = false;
  private systemPromptLoadPromise: Promise<void> | null = null;
  private isProcessing: boolean = false;
  private useGateway: boolean = true; // Route through Gateway for tool support
  private useFallback: boolean = false; // Use CLIProxyAPI when LM Studio unavailable
  private maxToolIterations: number = 3; // Prevent infinite loops
  private selectedModel: string = ''; // Empty = use first available
  private announceBackendSwitch: boolean = true; // Voice announce backend switches
  private lastActiveBackend: 'lmstudio' | 'cliproxyapi' | null = null;

  // Context tracking
  private usedTokens: number = 0;
  private completionTokens: number = 0;
  private totalTokens: number = 0;
  private modelMaxContextTokens: number | null = null;
  private maxContextTokens: number = 8192; // Default, updated from model info
  private mainWindow: BrowserWindow | null = null;
  private autoResetThreshold: number = 0.80; // Auto-clear at 80%

  // Domain config source tracking
  private usingDomainConfig: boolean = false;
  private domainConfigProvider: 'lmstudio' | 'claude' | 'cliproxyapi' | 'gateway-auto' = 'gateway-auto';
  private domainConfigTemperature: number = 0.7;
  private domainConfigMaxTokens: number = 4096;

  constructor() {
    const settings = getSettings();
    if (settings.localLlmUrl) {
      this.lmStudioUrl = settings.localLlmUrl;
    }
    if (settings.voiceModel) {
      this.selectedModel = settings.voiceModel;
    }
    // CLIProxyAPI settings
    if (settings.cliproxyApiUrl) {
      this.cliproxyApiUrl = settings.cliproxyApiUrl;
    }
    if (settings.cliproxyApiModel) {
      this.cliproxyApiModel = settings.cliproxyApiModel;
    }
    if (typeof settings.announceBackendSwitch === 'boolean') {
      this.announceBackendSwitch = settings.announceBackendSwitch;
    }

    // Best-effort load of a model-specific prompt (non-blocking)
    void this.reloadSystemPrompt();

    // Best-effort load of model context window from LM Studio (non-blocking)
    void this.refreshModelContextWindow();

    // Initialize domain config integration (non-blocking)
    this.initDomainConfig();
  }

  /**
   * Initialize domain config integration
   * Loads shared config from Desktop app and watches for changes
   */
  private initDomainConfig(): void {
    try {
      const domainReader = getDomainConfigReader();
      domainReader.load();
      domainReader.watch();

      // Apply voice domain config if available
      const voiceConfig = domainReader.getVoiceConfig();
      if (voiceConfig) {
        this.applyDomainConfig(voiceConfig);
      }

      // Listen for config changes
      domainReader.on('change', (fullConfig) => {
        const voiceConfig = fullConfig.configs['voice'];
        if (voiceConfig) {
          console.log('[LMStudioIntegration] Domain config changed, applying...');
          this.applyDomainConfig(voiceConfig);

          // Notify UI about config change
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('domain-config:updated', voiceConfig);
          }
        }
      });
    } catch (error) {
      console.warn('[LMStudioIntegration] Failed to init domain config:', error);
    }
  }

  /**
   * Apply domain config to this instance
   * Follows Insights.tsx pattern: pass provider directly to gateway
   */
  private applyDomainConfig(config: DomainConfig): void {
    console.log('[LMStudioIntegration] Applying domain config:', config.provider, config.modelId);
    this.usingDomainConfig = true;
    this.domainConfigProvider = config.provider;
    this.domainConfigTemperature = config.temperature ?? 0.7;
    this.domainConfigMaxTokens = config.maxTokens ?? 4096;

    // Set model based on provider
    switch (config.provider) {
      case 'lmstudio':
        this.useFallback = false;
        if (config.modelId) {
          this.selectedModel = config.modelId;
        }
        break;
      case 'cliproxyapi':
      case 'claude':
        // Both route to CLIProxyAPI endpoint
        this.useFallback = true;
        if (config.modelId) {
          this.cliproxyApiModel = config.modelId;
        }
        break;
      case 'gateway-auto':
        // Use gateway routing with fallback chain (default behavior)
        this.useFallback = false;
        break;
    }
  }

  /**
   * Get whether domain config is being used
   */
  public isUsingDomainConfig(): boolean {
    return this.usingDomainConfig;
  }

  /**
   * Get current voice domain config
   */
  public getVoiceDomainConfig(): DomainConfig | null {
    return getDomainConfigReader().getVoiceConfig();
  }

  // Announce backend switch via TTS
  private async announceBackendChange(from: string | null, to: string): Promise<void> {
    if (!this.announceBackendSwitch || from === to) return;

    const backendNames: Record<string, string> = {
      lmstudio: 'LM Studio',
      cliproxyapi: 'Claude CLI proxy'
    };

    const toName = backendNames[to] || to;

    if (from === null) {
      // Initial connection
      await speakText(`Connected to ${toName}`).catch(() => {});
    } else {
      // Backend switch
      const fromName = backendNames[from] || from;
      await speakText(`Switching from ${fromName} to ${toName}`).catch(() => {});
    }
  }

  private async refreshModelContextWindow(): Promise<void> {
    // LM Studio exposes context window info on non-OpenAI endpoints.
    // - /api/v0/models: includes max_context_length and loaded_context_length (if loaded)
    // - /api/v1/models: includes max_context_length (and loaded_instances)
    //
    // We prefer loaded_context_length when present because it represents the actual context window
    // configured/loaded for the running model instance.
    try {
      const url = `${this.lmStudioUrl}/api/v0/models`;
      const response = await fetch(url);
      if (!response.ok) return;

      const data = await response.json();
      const models: any[] = Array.isArray(data?.data) ? data.data : [];
      const modelInfo = models.find((m) => m?.id === this.selectedModel);
      if (!modelInfo) return;

      const modelMax = Number(modelInfo.max_context_length);
      const loaded = Number(modelInfo.loaded_context_length);

      if (Number.isFinite(modelMax) && modelMax > 0) {
        this.modelMaxContextTokens = modelMax;
      }

      const effective =
        Number.isFinite(loaded) && loaded > 0
          ? loaded
          : Number.isFinite(modelMax) && modelMax > 0
            ? modelMax
            : null;

      if (effective && effective !== this.maxContextTokens) {
        this.maxContextTokens = effective;
        console.log(`[LMStudio] Context window set from /api/v0/models: ${effective} (model max: ${this.modelMaxContextTokens ?? 'unknown'})`);
        this.emitContextUpdate();
      }
    } catch {
      // Non-fatal: keep existing maxContextTokens
    }
  }

  private async ensureSystemPromptLoaded(): Promise<void> {
    if (this.systemPromptLoaded) return;
    await this.reloadSystemPrompt();
  }

  private resolveSystemPromptPath(): string | null {
    const settings = getSettings();

    const explicit = settings.voicePromptPath?.trim();
    if (explicit) {
      if (path.isAbsolute(explicit)) return explicit;
      const promptsDir = resolvePromptsDir();
      return promptsDir ? path.join(promptsDir, explicit) : path.resolve(explicit);
    }

    const promptsDir = resolvePromptsDir();
    if (!promptsDir) return null;

    const filenameBase = sanitizeModelIdForPromptFilename(this.selectedModel || '');
    if (!filenameBase) return null;

    return path.join(promptsDir, `${filenameBase}.md`);
  }

  async reloadSystemPrompt(): Promise<void> {
    if (this.systemPromptLoadPromise) {
      return await this.systemPromptLoadPromise;
    }

    const load = (async () => {
      const settings = getSettings();
      const inlinePrompt = settings.voiceSystemPrompt?.trim();
      if (inlinePrompt) {
        this.systemPrompt = inlinePrompt;
        this.systemPromptLoaded = true;
        console.log('[LMStudio] System prompt loaded from settings override');
        return;
      }

      const promptPath = this.resolveSystemPromptPath();

      if (promptPath && existsSync(promptPath)) {
        try {
          const prompt = await fs.readFile(promptPath, 'utf8');
          this.systemPrompt = prompt;
          this.systemPromptLoaded = true;
          console.log('[LMStudio] System prompt loaded from:', promptPath);
          return;
        } catch (error) {
          console.warn('[LMStudio] Failed reading system prompt file, falling back:', error);
        }
      } else if (promptPath) {
        console.warn('[LMStudio] System prompt file not found, falling back:', promptPath);
      }

      this.systemPrompt = LMSTUDIO_SYSTEM_PROMPT;
      this.systemPromptLoaded = true;
    })();

    this.systemPromptLoadPromise = load.finally(() => {
      if (this.systemPromptLoadPromise === load) {
        this.systemPromptLoadPromise = null;
      }
    });

    return await this.systemPromptLoadPromise;
  }

  // Execute a tool call via MCP server (JSON-RPC 2.0)
  private async executeTool(toolCall: { name: string; arguments: Record<string, unknown> }): Promise<string> {
    console.log(`[LMStudio] Executing tool: ${toolCall.name}`, toolCall.arguments);
    
    try {
      // MCP uses JSON-RPC 2.0 format
      const response = await fetch(`${this.mcpUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolCall.name,
            arguments: toolCall.arguments
          }
        })
      });
      
      if (!response.ok) {
        return `Error: Tool ${toolCall.name} failed with status ${response.status}`;
      }
      
      const result = await response.json();
      console.log(`[LMStudio] Tool result:`, result);
      
      // Handle JSON-RPC response
      if (result.error) {
        return `Error: ${result.error.message || 'Unknown error'}`;
      }
      
      // Extract content from MCP response
      if (result.result?.content && Array.isArray(result.result.content)) {
        return result.result.content.map((c: { text?: string }) => c.text || '').join('\n');
      }
      if (result.result?.text) {
        return result.result.text;
      }
      return JSON.stringify(result.result || result);
    } catch (error) {
      console.error(`[LMStudio] Tool execution error:`, error);
      return `Error executing ${toolCall.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  // Get LLM response with native tool support
  private async getLLMResponse(messages: LMStudioMessage[], includeTools: boolean = true): Promise<LLMResponse> {
    if (this.useGateway) {
      // Gateway route - pass provider directly (Insights.tsx pattern)
      // backend: provider !== 'gateway-auto' ? provider : undefined
      const gatewayBackend = this.domainConfigProvider !== 'gateway-auto' ? this.domainConfigProvider : undefined;
      const modelToUse = this.useFallback ? this.cliproxyApiModel : (this.selectedModel || undefined);

      console.log('[LMStudioIntegration] Gateway request:', {
        provider: this.domainConfigProvider,
        backend: gatewayBackend,
        model: modelToUse,
      });

      const body: Record<string, unknown> = {
        messages,
        agent_id: 'tray-companion',
        model: modelToUse,
        stream: false,
        temperature: this.domainConfigTemperature,
        max_tokens: this.domainConfigMaxTokens,
        backend: gatewayBackend,
        inject_bootstrap: false
      };
      
      if (includeTools) {
        body.tools = TOOLS;  // LM Studio converts to [AVAILABLE_TOOLS]
      }
      
      const response = await fetch(`${this.gatewayUrl}/v1/chat/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        throw new Error(`Gateway HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Track token usage from gateway response (LM Studio usage fields)
      if (data.usage) {
        this.updateTokenUsage(data.usage);
      }
      
      return {
        content: data.content || '',
        tool_calls: data.tool_calls
      };
    } else {
      // Direct LM Studio route with native tools (or CLIProxyAPI fallback)
      const baseUrl = this.useFallback ? this.cliproxyApiUrl : this.lmStudioUrl;
      const body: Record<string, unknown> = {
        model: this.useFallback ? this.cliproxyApiModel : (this.selectedModel || undefined),
        messages,
        temperature: this.domainConfigTemperature,
        max_tokens: this.domainConfigMaxTokens,
        stream: false
      };

      if (includeTools) {
        body.tools = TOOLS;
      }

      let response: Response;
      try {
        // Add auth header for CLIProxyAPI requests
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.useFallback) {
          headers['Authorization'] = CLIPROXYAPI_AUTH;
        }
        response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });
      } catch (primaryError) {
        // Primary failed, try fallback
        if (!this.useFallback) {
          console.log('[LMStudio] Primary failed, trying CLIProxyAPI fallback...');
          const fallbackBody = { ...body, model: this.cliproxyApiModel };
          response = await fetch(`${this.cliproxyApiUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': CLIPROXYAPI_AUTH
            },
            body: JSON.stringify(fallbackBody)
          });
          this.useFallback = true; // Remember for next request
        } else {
          throw primaryError;
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from LLM');
      }

      // Track token usage from response
      if (data.usage) {
        this.updateTokenUsage(data.usage);
      }

      const message = data.choices[0].message;
      return {
        content: message.content || '',
        tool_calls: message.tool_calls
      };
    }
  }

  // Context tracking methods
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private updateTokenUsage(usage: any): void {
    // LM Studio returns OpenAI-style usage for chat/completions: prompt_tokens, completion_tokens, total_tokens
    // Responses API uses: input_tokens, output_tokens, total_tokens
    const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? usage?.total_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? (promptTokens + completionTokens);

    // "Context Usage" should reflect prompt/input tokens (the actual context window consumption).
    this.usedTokens = promptTokens;
    this.completionTokens = completionTokens;
    this.totalTokens = totalTokens;

    const percentage = this.usedTokens / this.maxContextTokens;

    console.log(
      `[LMStudio] Context (prompt): ${this.usedTokens}/${this.maxContextTokens} (${(percentage * 100).toFixed(1)}%)` +
        ` completion=${this.completionTokens} total=${this.totalTokens}`
    );
    
    // Emit context update to renderer
    this.emitContextUpdate();
    
    // Auto-clear at threshold
    if (percentage >= this.autoResetThreshold) {
      console.log(`[LMStudio] Context at ${(percentage * 100).toFixed(0)}% - auto-clearing history`);
      this.clearHistory();
      
      // Notify user via TTS
      speakText('Context limit reached. Chat history cleared.').catch(() => {});
    }
  }

  private emitContextUpdate(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('context-update', this.getContextInfo());
      } catch (e) {
        // Window destroyed during send
      }
    }
  }

  getContextInfo(): ContextInfo {
    return {
      usedTokens: this.usedTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
      modelMaxTokens: this.modelMaxContextTokens ?? undefined,
      maxTokens: this.maxContextTokens,
      percentage: this.usedTokens / this.maxContextTokens
    };
  }

  setMaxContextTokens(maxTokens: number): void {
    this.maxContextTokens = maxTokens;
    console.log(`[LMStudio] Max context set to ${maxTokens} tokens`);
    this.emitContextUpdate();
  }

  async sendMessage(message: string, autoSpeak: boolean = true): Promise<LMStudioResponse> {
    console.log('[LMStudio] sendMessage() called');
    console.log('[LMStudio] Message:', message.substring(0, 50) + '...');
    console.log('[LMStudio] autoSpeak:', autoSpeak);
    
    if (this.isProcessing) {
      console.log('[LMStudio] Already processing - rejecting');
      return { success: false, error: 'Already processing a message' };
    }

    try {
      this.isProcessing = true;
      await this.ensureSystemPromptLoaded();

      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: message
      });

      // Build messages array with system prompt first
      let messagesWithSystem: LMStudioMessage[] = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory
      ];

      let assistantMessage: string = '';
      let iterations = 0;
      
      // Tool execution loop
      while (iterations < this.maxToolIterations) {
        iterations++;
        console.log(`[LMStudio] Iteration ${iterations}/${this.maxToolIterations}`);
        
        // Get LLM response
        const llmResponse = await this.getLLMResponse(messagesWithSystem);
        console.log('[LMStudio] Response content:', llmResponse.content?.substring(0, 200) || '(empty)');
        console.log('[LMStudio] Tool calls:', llmResponse.tool_calls?.length || 0);
        
        // Check for native tool_calls in response (OpenAI-compatible format)
        if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
          console.log('[LMStudio] Native tool calls detected, executing...');

          // Execute each tool and collect results
          const toolResults: { id: string; result: string }[] = [];
          for (const tc of llmResponse.tool_calls) {
            try {
              const args = typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments;
              const result = await this.executeTool({ name: tc.function.name, arguments: args });
              toolResults.push({ id: tc.id, result });
              console.log(`[LMStudio] Tool ${tc.function.name} result:`, result.substring(0, 100));
            } catch (e) {
              console.error(`[LMStudio] Tool ${tc.function.name} failed:`, e);
              toolResults.push({ id: tc.id, result: `Error: ${e}` });
            }
          }

          // Add assistant's tool call message to history
          messagesWithSystem.push({
            role: 'assistant',
            content: llmResponse.content || '',
            tool_calls: llmResponse.tool_calls
          });

          // Add tool results as tool messages (OpenAI format)
          for (const tr of toolResults) {
            messagesWithSystem.push({
              role: 'tool',
              content: tr.result,
              tool_call_id: tr.id
            });
          }

          console.log('[LMStudio] Tool results injected, continuing loop...');
        } else {
          // No tool calls - this is the final response
          assistantMessage = llmResponse.content;
          break;
        }
      }
      
      if (!assistantMessage) {
        assistantMessage = 'I encountered an issue processing the tools. Please try again.';
      }
      
      // Add final assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      });

      // Auto-speak if enabled (fire-and-forget, don't block)
      if (autoSpeak) {
        console.log('[LMStudio] ========== TTS TRIGGER ==========');
        console.log('[LMStudio] Auto-speak enabled, triggering TTS...');
        console.log('[LMStudio] Response text length:', assistantMessage.length);
        console.log('[LMStudio] Response preview:', assistantMessage.substring(0, 100));
        
        // Clean up response for TTS (native tool calls don't appear in content)
        const ttsText = assistantMessage.trim();
        
        // Pause speech recognition while TTS is playing
        setTTSPlaying(true);
        
        speakText(ttsText)
          .then((result) => {
            console.log('[LMStudio] TTS completed with result:', result);
            setTTSPlaying(false);  // Resume speech recognition
          })
          .catch((err) => {
            console.error('[LMStudio] TTS error (non-blocking):', err.message);
            setTTSPlaying(false);  // Resume even on error
          });
        console.log('[LMStudio] TTS call initiated (fire-and-forget)');
        console.log('[LMStudio] ========== END TTS TRIGGER ==========');
      } else {
        console.log('[LMStudio] Auto-speak DISABLED, skipping TTS');
      }

      // Log to MCP if connected
      const mcp = getMCPInstance();
      if (mcp.isConnectedToMCP()) {
        await mcp.sendInboxMessage('lmstudio-log', `User: ${message}\nLMStudio: ${assistantMessage}`, 'low');
      }

      console.log('[LMStudio] Response received:', assistantMessage.substring(0, 100) + '...');
      
      this.isProcessing = false;
      return { success: true, response: assistantMessage };
    } catch (error) {
      this.isProcessing = false;
      const errorMessage = error instanceof Error ? error.message : 'LM Studio request failed';
      console.error('LMStudio error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async testConnection(): Promise<LMStudioResponse> {
    try {
      // Test Gateway health first (for tool support + fallback chain)
      const gatewayResponse = await fetch(`${this.gatewayUrl}/v1/health`);
      const gatewayOk = gatewayResponse.ok;

      // Test LM Studio directly
      let lmOk = false;
      try {
        const lmResponse = await fetch(`${this.lmStudioUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
        lmOk = lmResponse.ok;
      } catch {
        lmOk = false;
      }

      // Test CLIProxyAPI as fallback
      let cliproxyOk = false;
      try {
        const cliproxyResponse = await fetch(`${this.cliproxyApiUrl}/v1/models`, {
          signal: AbortSignal.timeout(3000),
          headers: { 'Authorization': CLIPROXYAPI_AUTH }
        });
        cliproxyOk = cliproxyResponse.ok;
      } catch {
        cliproxyOk = false;
      }

      let newBackend: 'lmstudio' | 'cliproxyapi' | null = null;

      // If using domain config, respect the configured provider (Insights.tsx pattern)
      if (this.usingDomainConfig) {
        // Map provider to actual backend check
        const isClipproxyBacked = this.domainConfigProvider === 'cliproxyapi' || this.domainConfigProvider === 'claude';
        const configuredBackend = isClipproxyBacked ? 'cliproxyapi' : 'lmstudio';
        const configuredBackendOk = isClipproxyBacked ? cliproxyOk : lmOk;
        const displayName = this.domainConfigProvider; // Show actual configured provider

        if (gatewayOk && configuredBackendOk) {
          console.log(`Gateway + ${displayName} connected (domain config provider: ${this.domainConfigProvider})`);
          this.useGateway = true;
          newBackend = configuredBackend;
          if (!isClipproxyBacked) {
            await this.refreshModelContextWindow();
          }
          if (this.lastActiveBackend !== newBackend) {
            await this.announceBackendChange(this.lastActiveBackend, newBackend);
            this.lastActiveBackend = newBackend;
          }
          return { success: true, response: `Gateway + ${displayName} connected (domain config)` };
        } else if (configuredBackendOk) {
          console.log(`${displayName} connected directly (domain config, Gateway down)`);
          this.useGateway = false;
          newBackend = configuredBackend;
          if (!isClipproxyBacked) {
            await this.refreshModelContextWindow();
          }
          if (this.lastActiveBackend !== newBackend) {
            await this.announceBackendChange(this.lastActiveBackend, newBackend);
            this.lastActiveBackend = newBackend;
          }
          return { success: true, response: `${displayName} connected (domain config, no tools)` };
        }
        // Domain config backend is down - return error, don't fall back silently
        console.error(`Domain config provider ${this.domainConfigProvider} unavailable!`);
        this.lastActiveBackend = null;
        return { success: false, error: `${displayName} is not available. Start CLIProxyAPI at port 8317 or change provider in Desktop Domain Configuration.` };
      }

      // Auto-detection mode (no domain config or configured backend down)
      if (gatewayOk && lmOk) {
        console.log('Gateway + LM Studio connected - tool support enabled');
        this.useGateway = true;
        this.useFallback = false;
        newBackend = 'lmstudio';
        await this.refreshModelContextWindow();
        if (this.lastActiveBackend !== newBackend) {
          await this.announceBackendChange(this.lastActiveBackend, newBackend);
          this.lastActiveBackend = newBackend;
        }
        return { success: true, response: 'Gateway + LM Studio connected (tools enabled)' };
      } else if (gatewayOk && cliproxyOk) {
        console.log('Gateway + CLIProxyAPI connected - using Claude CLI fallback');
        this.useGateway = true;
        this.useFallback = true;
        newBackend = 'cliproxyapi';
        if (this.lastActiveBackend !== newBackend) {
          await this.announceBackendChange(this.lastActiveBackend, newBackend);
          this.lastActiveBackend = newBackend;
        }
        return { success: true, response: 'Gateway + CLIProxyAPI connected (Claude CLI fallback)' };
      } else if (lmOk) {
        console.log('LM Studio connected, Gateway down - direct mode (no tools)');
        this.useGateway = false;
        this.useFallback = false;
        newBackend = 'lmstudio';
        await this.refreshModelContextWindow();
        if (this.lastActiveBackend !== newBackend) {
          await this.announceBackendChange(this.lastActiveBackend, newBackend);
          this.lastActiveBackend = newBackend;
        }
        return { success: true, response: 'LM Studio connected (no tools - Gateway down)' };
      } else if (cliproxyOk) {
        console.log('CLIProxyAPI connected, LM Studio + Gateway down - direct fallback mode');
        this.useGateway = false;
        this.useFallback = true;
        newBackend = 'cliproxyapi';
        if (this.lastActiveBackend !== newBackend) {
          await this.announceBackendChange(this.lastActiveBackend, newBackend);
          this.lastActiveBackend = newBackend;
        }
        return { success: true, response: 'CLIProxyAPI connected (direct fallback, no tools)' };
      } else {
        this.lastActiveBackend = null;
        throw new Error('No LLM backends available (LM Studio + CLIProxyAPI both down)');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
      console.error('LMStudio connection test failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
    this.usedTokens = 0;
    this.completionTokens = 0;
    this.totalTokens = 0;
    console.log('LMStudio conversation history cleared, context reset to 0');
    this.emitContextUpdate();
  }

  getHistory(): LMStudioMessage[] {
    return [...this.conversationHistory];
  }

  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  updateBaseUrl(url: string): void {
    this.lmStudioUrl = url;
    console.log('LMStudio URL updated:', url);
    void this.refreshModelContextWindow();
  }

  setUseGateway(useGateway: boolean): void {
    this.useGateway = useGateway;
    console.log('LMStudio useGateway:', useGateway);
  }

  isUsingGateway(): boolean {
    return this.useGateway;
  }

  // CLIProxyAPI configuration
  updateCliproxyApiUrl(url: string): void {
    this.cliproxyApiUrl = url;
    console.log('CLIProxyAPI URL updated:', url);
  }

  updateCliproxyApiModel(model: string): void {
    this.cliproxyApiModel = model;
    console.log('CLIProxyAPI model updated:', model);
  }

  setAnnounceBackendSwitch(announce: boolean): void {
    this.announceBackendSwitch = announce;
    console.log('Announce backend switch:', announce);
  }

  getActiveBackend(): 'lmstudio' | 'cliproxyapi' | null {
    return this.lastActiveBackend;
  }

  isUsingFallback(): boolean {
    return this.useFallback;
  }

  updateSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
    console.log('LMStudio system prompt updated');
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  // Quick conversation starters
  async quickQuery(query: string): Promise<LMStudioResponse> {
    const contextualQuery = `Please provide a brief, concise answer: ${query}`;
    return await this.sendMessage(contextualQuery, true);
  }

  async explainCode(code: string): Promise<LMStudioResponse> {
    const query = `Briefly explain what this code does:\n\n${code}`;
    return await this.sendMessage(query, true);
  }

  async reviewText(text: string): Promise<LMStudioResponse> {
    const query = `Please review and provide brief feedback on this text:\n\n${text}`;
    return await this.sendMessage(query, true);
  }

  // Model selection
  async getModels(): Promise<{
    models: string[];
    selected: string;
    source: 'loaded' | 'all';
  }> {
    // Prefer "loaded" models from LM Studio's native API. /v1/models may include
    // models that aren't currently loaded; selecting them won't actually switch
    // the backend until LM Studio loads them.
    try {
      const loadedRes = await fetch(`${this.lmStudioUrl}/api/v0/models`);
      if (loadedRes.ok) {
        const loadedData = await loadedRes.json();
        const rawModels: any[] = Array.isArray(loadedData?.data) ? loadedData.data : [];
        const loadedModels = rawModels
          .filter((m) => {
            const id = String(m?.id ?? '');
            if (!id) return false;
            if (id.includes('embedding') || id.includes('flux')) return false;
            const loadedContext = Number(m?.loaded_context_length);
            return Number.isFinite(loadedContext) && loadedContext > 0;
          })
          .map((m) => String(m.id));

        if (loadedModels.length > 0) {
          const selected = loadedModels.includes(this.selectedModel) ? this.selectedModel : '';
          return { models: loadedModels, selected, source: 'loaded' };
        }
      }
    } catch {
      // Fall back to /v1/models below
    }

    try {
      const response = await fetch(`${this.lmStudioUrl}/v1/models`);
      if (!response.ok) {
        return { models: [], selected: this.selectedModel, source: 'all' };
      }
      const data = await response.json();
      const models = (data.data || [])
        .map((m: { id: string }) => m.id)
        .filter((id: string) => !id.includes('embedding') && !id.includes('flux')); // Filter out non-chat models
      const selected = models.includes(this.selectedModel) ? this.selectedModel : '';
      return { models, selected, source: 'all' };
    } catch (error) {
      console.error('Error fetching models:', error);
      return { models: [], selected: this.selectedModel, source: 'all' };
    }
  }

  async setModel(model: string): Promise<void> {
    this.selectedModel = model;
    this.systemPromptLoaded = false;
    console.log('LMStudio model set to:', model);
    await this.reloadSystemPrompt();
    await this.refreshModelContextWindow();
  }

  getSelectedModel(): string {
    return this.selectedModel;
  }

  /**
   * Fetch models available through CLIProxyAPI
   * CLIProxyAPI supports: Claude, GPT, Gemini, Qwen, iFlow, etc.
   */
  async fetchCLIProxyModels(): Promise<{ models: Array<{id: string, name: string}>, source: string }> {
    try {
      const response = await fetch(`${this.cliproxyApiUrl}/v1/models`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'Authorization': CLIPROXYAPI_AUTH }
      });
      if (!response.ok) {
        return { models: this.getStaticCLIProxyModels(), source: 'static' };
      }
      const data = await response.json();
      if (data.data && Array.isArray(data.data)) {
        return {
          models: data.data.map((m: { id: string }) => ({
            id: m.id,
            name: this.formatModelName(m.id),
          })),
          source: 'live',
        };
      }
      return { models: this.getStaticCLIProxyModels(), source: 'static' };
    } catch {
      return { models: this.getStaticCLIProxyModels(), source: 'static' };
    }
  }

  /**
   * Static fallback for CLI Proxy models
   * Includes: Antigravity, Claude, OpenAI, GitHub Copilot, Kiro, Gemini
   * Updated to match model-registry.ts (62 models)
   */
  private getStaticCLIProxyModels(): Array<{id: string, name: string}> {
    return [
      // ===== ANTIGRAVITY (10) =====
      { id: 'gemini-claude-sonnet-4-5-thinking', name: 'Claude Sonnet 4.5 (Thinking)' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
      { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image' },
      { id: 'gemini-claude-opus-4-5-thinking', name: 'Claude Opus 4.5 (Thinking)' },
      { id: 'tab_flash_lite_preview', name: 'Tab Flash Lite Preview' },
      { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' },
      { id: 'gemini-claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (High)' },

      // ===== CLAUDE (8) =====
      { id: 'claude-haiku-4-5-20251001', name: 'Claude 4.5 Haiku' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude 4.5 Sonnet' },
      { id: 'claude-opus-4-5-20251101', name: 'Claude 4.5 Opus' },
      { id: 'claude-opus-4-1-20250805', name: 'Claude 4.1 Opus' },
      { id: 'claude-opus-4-20250514', name: 'Claude 4 Opus' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude 4 Sonnet' },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },

      // ===== OPENAI (9) =====
      { id: 'gpt-5', name: 'GPT 5' },
      { id: 'gpt-5-codex', name: 'GPT 5 Codex' },
      { id: 'gpt-5-codex-mini', name: 'GPT 5 Codex Mini' },
      { id: 'gpt-5.1', name: 'GPT 5.1' },
      { id: 'gpt-5.1-codex', name: 'GPT 5.1 Codex' },
      { id: 'gpt-5.1-codex-mini', name: 'GPT 5.1 Codex Mini' },
      { id: 'gpt-5.1-codex-max', name: 'GPT 5.1 Codex Max' },
      { id: 'gpt-5.2', name: 'GPT 5.2' },
      { id: 'gpt-5.2-codex', name: 'GPT 5.2 Codex' },

      // ===== GITHUB-COPILOT (21) =====
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-5', name: 'GPT-5' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
      { id: 'gpt-5-codex', name: 'GPT-5 Codex' },
      { id: 'gpt-5.1', name: 'GPT-5.1' },
      { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex' },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini' },
      { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max' },
      { id: 'gpt-5.2', name: 'GPT-5.2' },
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex' },
      { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5' },
      { id: 'claude-opus-4.1', name: 'Claude Opus 4.1' },
      { id: 'claude-opus-4.5', name: 'Claude Opus 4.5' },
      { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)' },
      { id: 'grok-code-fast-1', name: 'Grok Code Fast 1' },
      { id: 'oswe-vscode-prime', name: 'Raptor mini (Preview)' },

      // ===== KIRO (9) =====
      { id: 'kiro-auto', name: 'Kiro Auto' },
      { id: 'kiro-claude-opus-4-5', name: 'Kiro Claude Opus 4.5' },
      { id: 'kiro-claude-sonnet-4-5', name: 'Kiro Claude Sonnet 4.5' },
      { id: 'kiro-claude-sonnet-4', name: 'Kiro Claude Sonnet 4' },
      { id: 'kiro-claude-haiku-4-5', name: 'Kiro Claude Haiku 4.5' },
      { id: 'kiro-claude-opus-4-5-agentic', name: 'Kiro Claude Opus 4.5 (Agentic)' },
      { id: 'kiro-claude-sonnet-4-5-agentic', name: 'Kiro Claude Sonnet 4.5 (Agentic)' },
      { id: 'kiro-claude-sonnet-4-agentic', name: 'Kiro Claude Sonnet 4 (Agentic)' },
      { id: 'kiro-claude-haiku-4-5-agentic', name: 'Kiro Claude Haiku 4.5 (Agentic)' },

      // ===== GEMINI (5) =====
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
    ];
  }

  /**
   * Format model ID to human-readable name
   * Updated to match model-registry.ts
   */
  private formatModelName(modelId: string): string {
    const knownNames: Record<string, string> = {
      // ===== ANTIGRAVITY =====
      'gemini-claude-sonnet-4-5-thinking': 'Claude Sonnet 4.5 (Thinking)',
      'gemini-claude-opus-4-5-thinking': 'Claude Opus 4.5 (Thinking)',
      'gemini-claude-sonnet-4-5': 'Claude Sonnet 4.5',
      'tab_flash_lite_preview': 'Tab Flash Lite Preview',
      'gpt-oss-120b-medium': 'GPT-OSS 120B (Medium)',
      'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
      'gemini-3-pro-image-preview': 'Gemini 3 Pro Image',

      // ===== CLAUDE =====
      'claude-haiku-4-5-20251001': 'Claude 4.5 Haiku',
      'claude-sonnet-4-5-20250929': 'Claude 4.5 Sonnet',
      'claude-opus-4-5-20251101': 'Claude 4.5 Opus',
      'claude-opus-4-1-20250805': 'Claude 4.1 Opus',
      'claude-opus-4-20250514': 'Claude 4 Opus',
      'claude-sonnet-4-20250514': 'Claude 4 Sonnet',
      'claude-3-7-sonnet-20250219': 'Claude 3.7 Sonnet',
      'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',

      // ===== OPENAI =====
      'gpt-5': 'GPT 5',
      'gpt-5-codex': 'GPT 5 Codex',
      'gpt-5-codex-mini': 'GPT 5 Codex Mini',
      'gpt-5.1': 'GPT 5.1',
      'gpt-5.1-codex': 'GPT 5.1 Codex',
      'gpt-5.1-codex-mini': 'GPT 5.1 Codex Mini',
      'gpt-5.1-codex-max': 'GPT 5.1 Codex Max',
      'gpt-5.2': 'GPT 5.2',
      'gpt-5.2-codex': 'GPT 5.2 Codex',

      // ===== GITHUB-COPILOT =====
      'gpt-4.1': 'GPT-4.1',
      'gpt-4o': 'GPT-4o',
      'gpt-5-mini': 'GPT-5 Mini',
      'claude-haiku-4.5': 'Claude Haiku 4.5',
      'claude-opus-4.1': 'Claude Opus 4.1',
      'claude-opus-4.5': 'Claude Opus 4.5',
      'claude-sonnet-4': 'Claude Sonnet 4',
      'claude-sonnet-4.5': 'Claude Sonnet 4.5',
      'grok-code-fast-1': 'Grok Code Fast 1',
      'oswe-vscode-prime': 'Raptor mini (Preview)',

      // ===== KIRO =====
      'kiro-auto': 'Kiro Auto',
      'kiro-claude-opus-4-5': 'Kiro Claude Opus 4.5',
      'kiro-claude-sonnet-4-5': 'Kiro Claude Sonnet 4.5',
      'kiro-claude-sonnet-4': 'Kiro Claude Sonnet 4',
      'kiro-claude-haiku-4-5': 'Kiro Claude Haiku 4.5',
      'kiro-claude-opus-4-5-agentic': 'Kiro Claude Opus 4.5 (Agentic)',
      'kiro-claude-sonnet-4-5-agentic': 'Kiro Claude Sonnet 4.5 (Agentic)',
      'kiro-claude-sonnet-4-agentic': 'Kiro Claude Sonnet 4 (Agentic)',
      'kiro-claude-haiku-4-5-agentic': 'Kiro Claude Haiku 4.5 (Agentic)',

      // ===== GEMINI =====
      'gemini-2.5-pro': 'Gemini 2.5 Pro',
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'gemini-3-pro-preview': 'Gemini 3 Pro Preview',
      'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
    };

    if (knownNames[modelId]) {
      return knownNames[modelId];
    }

    // Handle HuggingFace-style IDs (org/model-name)
    if (modelId.includes('/')) {
      const parts = modelId.split('/');
      const modelPart = parts[parts.length - 1];
      return this.formatModelName(modelPart);
    }

    // Convert kebab-case to Title Case
    return modelId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .trim();
  }
}

// Global LMStudio instance
let lmstudioInstance: LMStudioIntegration | null = null;

export function getLMStudioInstance(): LMStudioIntegration {
  if (!lmstudioInstance) {
    lmstudioInstance = new LMStudioIntegration();
  }
  return lmstudioInstance;
}

export async function initializeLMStudio(): Promise<LMStudioResponse> {
  const lmstudio = getLMStudioInstance();
  const testResult = await lmstudio.testConnection();
  
  if (testResult.success) {
    console.log('LMStudio integration initialized successfully');
  } else {
    console.warn('LMStudio integration failed to initialize:', testResult.error);
  }
  
  return testResult;
}
