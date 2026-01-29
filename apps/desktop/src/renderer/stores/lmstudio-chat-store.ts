/**
 * @deprecated Planned migration to unified-chat-store.ts with Electron IPC persistence.
 * For now, this store continues to be used by KuroryuuDesktopAssistantPanel.
 *
 * LM Studio Chat Store
 *
 * State management for the AI chat panel in the Code Editor.
 * Connects to any model running in LM Studio via Gateway API.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useDomainConfigStore } from './domain-config-store';
import type { LLMProvider } from '../types/domain-config';
import { inferSourceFromId } from '../services/model-registry';
import { filterTerminalOutput, hasTerminalArtifacts, stripInputEcho } from '../utils/filter-terminal-output';

// Gateway endpoints
const GATEWAY_URL = 'http://127.0.0.1:8200';
const LMSTUDIO_URL = 'http://127.0.0.1:1234';
const CLIPROXYAPI_URL = 'http://127.0.0.1:8317';

// Map provider to backend name for Gateway API
const PROVIDER_TO_BACKEND: Record<LLMProvider, string> = {
  'lmstudio': 'lmstudio',
  'cliproxyapi': 'cliproxyapi',
  'claude': 'claude',
  'claude-cli': 'claude-cli', // Direct via Claude Code CLI - real Opus 4.5
  'claude-cli-pty': 'claude-cli-pty', // Persistent Claude CLI session via PTY
  'gateway-auto': '', // Empty = use fallback chain
};

// Cache for LM Studio availability (avoid spamming connection refused errors)
let _lmStudioAvailableCache: { available: boolean; timestamp: number } | null = null;
const LMSTUDIO_CACHE_TTL = 60000; // 1 minute TTL for unavailable status

// Tool call types
export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
}

// Tool schema from Gateway /v1/tools endpoint
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  contextIncluded?: boolean;
  // Tool call support
  toolCalls?: ToolCallData[];
  toolCallId?: string; // For tool result messages
  // Model/provider metadata (from Gateway response)
  model?: string;       // e.g., "grok-code-fast-1" (from Gateway)
  provider?: string;    // e.g., "cliproxyapi" (Gateway backend name)
  modelName?: string;   // e.g., "Grok Code Fast 1" (display name from registry)
  source?: string;      // e.g., "github-copilot" (actual model source)
}

// Conversation (chat session) type
export interface Conversation {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// Max limits for storage
const MAX_MESSAGES_PER_CONVERSATION = 50;
const MAX_CONVERSATIONS = 20;

export interface EditorContext {
  filePath: string;
  content: string;
  language: string;
  lineCount: number;
}

export interface ContextInfo {
  usedTokens: number;
  completionTokens: number;
  totalTokens: number;
  maxTokens: number;
  percentage: number;
}

/**
 * @deprecated Use AssistantViewType from utils/cross-window-lock.ts instead.
 * This type is kept for backwards compatibility.
 */
export type AssistantViewType = 'insights' | 'code-editor' | null;

interface LMStudioChatState {
  // Panel state
  isPanelOpen: boolean;
  panelWidth: number;
  showConversationList: boolean;

  /**
   * @deprecated Use chatLock.getActiveView() from utils/cross-window-lock.ts instead.
   * This store-based state only works within a single window context.
   */
  activeView: AssistantViewType;

  // Connection state
  isConnected: boolean;
  connectionStatus: string;
  availableModels: string[];
  selectedModel: string;

  // Chat state
  messages: ChatMessage[];
  isSending: boolean;

  // Conversation management
  conversations: Conversation[];
  currentConversationId: string | null;

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;
  abortController: AbortController | null;

  // Context state
  editorContext: EditorContext | null;
  includeContext: boolean;
  contextInfo: ContextInfo;

  // Tool support state
  availableTools: ToolSchema[];
  toolsLoading: boolean;
  toolsError: string | null;

  // PTY session state (for claude-cli-pty backend)
  ptySessionId: string | null;
  ptyPollingActive: boolean;

  // Actions
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  setPanelWidth: (width: number) => void;
  toggleConversationList: () => void;
  testConnection: () => Promise<boolean>;
  loadModels: () => Promise<void>;
  loadTools: () => Promise<void>;
  setModel: (model: string) => void;
  sendMessage: (content: string) => Promise<void>;
  cancelStreaming: () => void;
  clearHistory: () => void;
  setEditorContext: (context: EditorContext | null) => void;
  setIncludeContext: (include: boolean) => void;

  // Conversation actions
  createNewConversation: (name?: string) => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, name: string) => void;
  exportConversationAsMarkdown: (id?: string) => string;

  // Mutual exclusion actions
  setActiveView: (view: AssistantViewType) => boolean;
  releaseActiveView: (view: AssistantViewType) => void;

  // PTY session actions
  setPtySessionId: (id: string | null) => void;
  sendMessageViaPty: (content: string) => Promise<void>;
}

const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateConversationId = () => `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Create a new conversation object
const createConversation = (name?: string): Conversation => ({
  id: generateConversationId(),
  name: name || `Chat ${new Date().toLocaleString()}`,
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const DEFAULT_CONTEXT_INFO: ContextInfo = {
  usedTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  maxTokens: 128000, // Match typical model context window
  percentage: 0,
};

// System prompt for code editor context
const CODE_EDITOR_SYSTEM_PROMPT = `You are a helpful AI coding assistant in the Kuroryuu Code Editor.

When the user shares code context:
- Reference specific line numbers when discussing code
- Suggest minimal, targeted changes
- Explain the reasoning behind suggestions

Keep responses concise and actionable. Use markdown for code blocks.`;

export const useLMStudioChatStore = create<LMStudioChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      isPanelOpen: false,
      panelWidth: 360,
      showConversationList: false,
      activeView: null,
      isConnected: false,
      connectionStatus: 'Not connected',
      availableModels: [],
      selectedModel: '',
      messages: [],
      isSending: false,
      conversations: [],
      currentConversationId: null,
      isStreaming: false,
      streamingContent: '',
      abortController: null,
      editorContext: null,
      includeContext: true,
      contextInfo: DEFAULT_CONTEXT_INFO,

      // Tool support
      availableTools: [],
      toolsLoading: false,
      toolsError: null,

      // PTY session state
      ptySessionId: null,
      ptyPollingActive: false,

      // Panel actions
      togglePanel: () => {
        const state = get();
        if (!state.isPanelOpen) {
          // When opening, sync model from domain config if not already set
          const domainConfig = useDomainConfigStore.getState().getConfigForDomain('code-editor');
          const currentModel = state.selectedModel;
          if (!currentModel && domainConfig.modelId) {
            set({ isPanelOpen: true, selectedModel: domainConfig.modelId });
            return;
          }
        }
        set({ isPanelOpen: !state.isPanelOpen });
      },

      setPanelOpen: (open: boolean) => {
        if (open) {
          // When opening, sync model from domain config if not already set
          const domainConfig = useDomainConfigStore.getState().getConfigForDomain('code-editor');
          const currentModel = get().selectedModel;
          if (!currentModel && domainConfig.modelId) {
            set({ isPanelOpen: true, selectedModel: domainConfig.modelId });
            return;
          }
        }
        set({ isPanelOpen: open });
      },

      setPanelWidth: (width: number) => set({ panelWidth: Math.max(280, Math.min(600, width)) }),

      toggleConversationList: () => set((state) => ({ showConversationList: !state.showConversationList })),

      // Connection actions
      testConnection: async () => {
        try {
          // Test Gateway health first (handles fallback chain)
          const gatewayRes = await fetch(`${GATEWAY_URL}/v1/health`);
          const gatewayOk = gatewayRes.ok;

          // Try to get active backend from Gateway API
          let activeBackendName = '';
          if (gatewayOk) {
            try {
              const backendRes = await fetch(`${GATEWAY_URL}/api/backends/current`, { signal: AbortSignal.timeout(2000) });
              if (backendRes.ok) {
                const data = await backendRes.json();
                if (data.ok && data.backend?.name) {
                  activeBackendName = data.backend.name;
                }
              }
            } catch { /* continue */ }
          }

          // Test LM Studio directly (with caching to avoid connection refused spam)
          let lmOk = false;
          if (_lmStudioAvailableCache && Date.now() - _lmStudioAvailableCache.timestamp < LMSTUDIO_CACHE_TTL) {
            lmOk = _lmStudioAvailableCache.available;
          } else {
            try {
              const lmRes = await fetch(`${LMSTUDIO_URL}/v1/models`, { signal: AbortSignal.timeout(2000) });
              lmOk = lmRes.ok;
              _lmStudioAvailableCache = { available: lmOk, timestamp: Date.now() };
            } catch {
              lmOk = false;
              _lmStudioAvailableCache = { available: false, timestamp: Date.now() };
            }
          }

          // Test CLIProxyAPI as fallback
          let cliproxyOk = false;
          try {
            const cliproxyRes = await fetch(`${CLIPROXYAPI_URL}/v1/models`, {
              headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
              signal: AbortSignal.timeout(2000),
            });
            cliproxyOk = cliproxyRes.ok;
          } catch { cliproxyOk = false; }

          // Determine status message with backend indicator
          if (gatewayOk && lmOk) {
            const status = activeBackendName === 'lmstudio'
              ? '🟢 LMStudio (local)'
              : activeBackendName === 'cliproxyapi'
                ? '🔵 CLIProxy (Claude)'
                : '🟢 LMStudio';
            set({ isConnected: true, connectionStatus: status });
            await get().loadModels();
            return true;
          } else if (gatewayOk && cliproxyOk) {
            set({ isConnected: true, connectionStatus: '🔵 CLIProxy (Claude)' });
            await get().loadModels();
            return true;
          } else if (lmOk) {
            set({ isConnected: true, connectionStatus: '🟡 LMStudio (no Gateway)' });
            await get().loadModels();
            return true;
          } else if (cliproxyOk) {
            set({ isConnected: true, connectionStatus: '🟡 CLIProxy (no Gateway)' });
            return true;
          } else {
            set({ isConnected: false, connectionStatus: '🔴 No LLM backends' });
            return false;
          }
        } catch (error) {
          set({ isConnected: false, connectionStatus: '🔴 Connection failed' });
          return false;
        }
      },

      loadModels: async () => {
        // Check cache - if LM Studio was recently unavailable, don't retry
        if (_lmStudioAvailableCache &&
            !_lmStudioAvailableCache.available &&
            Date.now() - _lmStudioAvailableCache.timestamp < LMSTUDIO_CACHE_TTL) {
          return; // Skip - LM Studio is known to be unavailable
        }

        try {
          // Try to get loaded models first (LM Studio v0 API)
          const loadedRes = await fetch(`${LMSTUDIO_URL}/api/v0/models`, { signal: AbortSignal.timeout(3000) });
          if (loadedRes.ok) {
            _lmStudioAvailableCache = { available: true, timestamp: Date.now() };
            const data = await loadedRes.json();
            const models = (data.data || [])
              .filter((m: any) => {
                const id = String(m?.id ?? '');
                if (!id) return false;
                // Filter out embedding and flux models
                if (id.includes('embedding') || id.includes('flux')) return false;
                // Check if loaded
                const loadedContext = Number(m?.loaded_context_length);
                return Number.isFinite(loadedContext) && loadedContext > 0;
              })
              .map((m: any) => String(m.id));

            if (models.length > 0) {
              const currentModel = get().selectedModel;
              const validModel = models.includes(currentModel) ? currentModel : models[0];
              set({ availableModels: models, selectedModel: validModel });
              return;
            }
          }

          // Fallback to v1 models endpoint
          const res = await fetch(`${LMSTUDIO_URL}/v1/models`, { signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            _lmStudioAvailableCache = { available: true, timestamp: Date.now() };
            const data = await res.json();
            const models = (data.data || [])
              .map((m: { id: string }) => m.id)
              .filter((id: string) => !id.includes('embedding') && !id.includes('flux'));

            const currentModel = get().selectedModel;
            const validModel = models.includes(currentModel) ? currentModel : (models[0] || '');
            set({ availableModels: models, selectedModel: validModel });
          }
        } catch {
          // Cache the failure to avoid repeated connection refused spam
          _lmStudioAvailableCache = { available: false, timestamp: Date.now() };
        }
      },

      loadTools: async () => {
        set({ toolsLoading: true, toolsError: null });
        try {
          const response = await fetch(`${GATEWAY_URL}/v1/tools`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) {
            throw new Error(`Failed to load tools: ${response.status}`);
          }
          const data = await response.json();
          set({
            availableTools: data.tools || [],
            toolsLoading: false,
          });
          console.log(`[LMStudioChat] Loaded ${data.tools?.length || 0} MCP tools`);
        } catch (error) {
          console.error('[LMStudioChat] Failed to load tools:', error);
          set({
            toolsError: error instanceof Error ? error.message : 'Failed to load tools',
            toolsLoading: false,
            availableTools: [], // Clear tools on error
          });
        }
      },

      setModel: (model: string) => set({ selectedModel: model }),

      // Chat actions
      sendMessage: async (content: string) => {
        const state = get();
        if (!content.trim() || state.isSending || state.isStreaming || !state.isConnected) return;

        // Create AbortController for cancellation
        const abortController = new AbortController();
        set({ isSending: true, isStreaming: true, streamingContent: '', abortController });

        // Build user message content with optional context
        let userContent = content;
        if (state.includeContext && state.editorContext) {
          const ctx = state.editorContext;
          userContent = `## Current File Context
- **Path**: ${ctx.filePath}
- **Language**: ${ctx.language}
- **Lines**: ${ctx.lineCount}

\`\`\`${ctx.language}
${ctx.content.length > 15000 ? ctx.content.slice(-15000) + '\n// ... (truncated)' : ctx.content}
\`\`\`

---

${content}`;
        }

        // Add user message to history
        const userMessage: ChatMessage = {
          id: generateId(),
          role: 'user',
          content,
          timestamp: Date.now(),
          contextIncluded: state.includeContext && !!state.editorContext,
        };

        set((s) => ({ messages: [...s.messages, userMessage] }));

        try {
          // Build messages array for API
          const apiMessages = [
            { role: 'system', content: CODE_EDITOR_SYSTEM_PROMPT },
            ...state.messages.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: userContent },
          ];

          // Get domain config for code-editor chat - domainConfig is source of truth
          const domainConfig = useDomainConfigStore.getState().getConfigForDomain('code-editor');
          // Use domainConfig.modelId as source of truth (UI-selected), fall back to state.selectedModel only if empty
          const modelToUse = domainConfig.modelId || state.selectedModel;
          const backend = PROVIDER_TO_BACKEND[domainConfig.provider] || 'lmstudio';

          console.log('[LMStudioChat] Model selection:', {
            'domainConfig.modelId': domainConfig.modelId,
            'state.selectedModel': state.selectedModel,
            'modelToUse': modelToUse,
            'backend': backend,
            'provider': domainConfig.provider,
          });

          // Convert tools to OpenAI format for Gateway
          const toolsPayload = state.availableTools.length > 0
            ? state.availableTools.map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
              }))
            : undefined;

          // Call Gateway v2 chat stream with full tool loop support
          const response = await fetch(`${GATEWAY_URL}/v2/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
            body: JSON.stringify({
              messages: apiMessages,
              model: modelToUse,
              stream: true,
              temperature: domainConfig.temperature,
              max_tokens: domainConfig.maxTokens,
              backend: backend || undefined, // Empty = use fallback chain
              tools: toolsPayload,
              // Pass conversation ID for persistent backends (claude-cli-pty)
              extra: {
                conversation_id: state.currentConversationId,
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`Gateway error: ${response.status}`);
          }

          // Check if we got a streaming response
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
            // SSE streaming response
            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let fullContent = '';
            let buffer = '';
            let toolCalls: ToolCallData[] = [];
            const toolCallsInProgress: Map<string, ToolCallData> = new Map();

            // Stream metadata from Gateway (real backend/model info)
            let streamMetadata: { backend?: string; model?: string } = {};

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              // Process complete SSE events from buffer
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);

                  // Skip [DONE] marker
                  if (data === '[DONE]') continue;

                  try {
                    const parsed = JSON.parse(data);

                    // V2 format: {"type": "metadata", "backend": "...", "model": "..."} for stream info
                    if (parsed.type === 'metadata') {
                      streamMetadata = {
                        backend: parsed.backend,
                        model: parsed.model,
                      };
                      console.log('[LMStudioChat] Stream metadata:', streamMetadata);
                      continue;
                    }

                    // V2 format: {"type": "delta", "text": "..."} for text chunks
                    if (parsed.type === 'delta' && parsed.text) {
                      // Apply filtering to incoming PTY chunks if they contain terminal artifacts
                      let cleanText = parsed.text;
                      if (hasTerminalArtifacts(parsed.text)) {
                        const filtered = filterTerminalOutput(parsed.text);
                        // Only use filtered version if it preserved some content
                        if (filtered && filtered.length > 0) {
                          cleanText = filtered;
                        }
                      }
                      fullContent += cleanText;
                      set({ streamingContent: fullContent });
                      continue;
                    }

                    // V2 format: {"type": "tool_start", "name": "...", "id": "..."} for tool start
                    if (parsed.type === 'tool_start') {
                      const newToolCall: ToolCallData = {
                        id: parsed.id || generateId(),
                        name: parsed.name || '',
                        arguments: parsed.arguments || {},
                        status: 'running',
                        startTime: Date.now(),
                      };
                      toolCallsInProgress.set(newToolCall.id, newToolCall);
                      // Update streaming content to show tool is running
                      set({ streamingContent: fullContent });
                      continue;
                    }

                    // V2 format: {"type": "tool_end", "id": "...", "is_error": bool, "result": ...}
                    if (parsed.type === 'tool_end') {
                      const existing = toolCallsInProgress.get(parsed.id);
                      if (existing) {
                        existing.status = parsed.is_error ? 'error' : 'success';
                        existing.result = parsed.result;
                        existing.error = parsed.is_error ? parsed.error : undefined;
                        existing.endTime = Date.now();
                      }
                      continue;
                    }

                    // V2 format: {"type": "done", ...} for completion
                    if (parsed.type === 'done') {
                      // Extract usage info if available
                      if (parsed.usage) {
                        const usage = parsed.usage;
                        const usedTokens = usage.prompt_tokens || 0;
                        const completionTokens = usage.completion_tokens || 0;
                        const maxTokens = get().contextInfo.maxTokens;
                        set({
                          contextInfo: {
                            usedTokens,
                            completionTokens,
                            totalTokens: usage.total_tokens || usedTokens + completionTokens,
                            maxTokens,
                            percentage: usedTokens / maxTokens,
                          },
                        });
                      }
                      continue;
                    }

                    // V2 format: {"type": "error", "message": "..."}
                    if (parsed.type === 'error') {
                      console.error('[LMStudioChat] Stream error:', parsed.message);
                      continue;
                    }

                    // V2 format: {"type": "info", ...} - informational events
                    if (parsed.type === 'info') {
                      console.log('[LMStudioChat] Info:', parsed.message);
                      continue;
                    }

                    // Fallback: Handle OpenAI format for backwards compatibility
                    const delta = parsed.choices?.[0]?.delta?.content || parsed.content || '';
                    if (delta) {
                      fullContent += delta;
                      set({ streamingContent: fullContent });
                    }

                    // Parse tool calls from OpenAI format (fallback)
                    const deltaToolCalls = parsed.choices?.[0]?.delta?.tool_calls;
                    if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
                      for (const tc of deltaToolCalls) {
                        const tcId = tc.id || tc.index?.toString() || generateId();
                        if (!toolCallsInProgress.has(tcId)) {
                          const newToolCall: ToolCallData = {
                            id: tcId,
                            name: tc.function?.name || '',
                            arguments: {},
                            status: 'running',
                            startTime: Date.now(),
                          };
                          toolCallsInProgress.set(tcId, newToolCall);
                        }
                        const existing = toolCallsInProgress.get(tcId)!;
                        if (tc.function?.name) {
                          existing.name = tc.function.name;
                        }
                        if (tc.function?.arguments) {
                          const argsStr = (existing as any)._argsBuffer || '';
                          (existing as any)._argsBuffer = argsStr + tc.function.arguments;
                          try {
                            existing.arguments = JSON.parse((existing as any)._argsBuffer);
                          } catch {
                            // Not complete JSON yet
                          }
                        }
                      }
                    }

                    // Check for usage info in OpenAI format
                    if (parsed.usage) {
                      const usage = parsed.usage;
                      const usedTokens = usage.prompt_tokens || 0;
                      const completionTokens = usage.completion_tokens || 0;
                      const maxTokens = get().contextInfo.maxTokens;
                      set({
                        contextInfo: {
                          usedTokens,
                          completionTokens,
                          totalTokens: usage.total_tokens || usedTokens + completionTokens,
                          maxTokens,
                          percentage: usedTokens / maxTokens,
                        },
                      });
                    }
                  } catch {
                    // Non-JSON data, might be plain text delta
                    if (data.trim()) {
                      fullContent += data;
                      set({ streamingContent: fullContent });
                    }
                  }
                }
              }
            }

            // Finalize tool calls from in-progress map
            for (const tc of toolCallsInProgress.values()) {
              if (tc.status === 'running') {
                tc.status = 'pending'; // Mark incomplete ones as pending
              }
              delete (tc as any)._argsBuffer;
              toolCalls.push(tc);
            }

            // Stream complete - add assistant message with model/provider metadata
            // Get model display info from registry if available
            const domainModels = useDomainConfigStore.getState().availableModels;
            const modelInfo = streamMetadata.model
              ? domainModels.find(m => m.id === streamMetadata.model)
              : undefined;

            // Strip user input echo if present (PTY backends echo the input back)
            // Safety: only attempt stripping if we have meaningful content
            let finalContent = fullContent;
            if (finalContent && content && finalContent.length > 10) {
              const stripped = stripInputEcho(finalContent, content);
              // Only use stripped version if it has meaningful content
              if (stripped && stripped.length > 0) {
                finalContent = stripped;
              }
            }

            const assistantMessage: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: finalContent || (toolCalls.length > 0 ? '' : 'No response received.'),
              timestamp: Date.now(),
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              // Real model/provider from Gateway response
              model: streamMetadata.model,
              provider: streamMetadata.backend,
              modelName: modelInfo?.name || streamMetadata.model,
              source: modelInfo?.source || (streamMetadata.model ? inferSourceFromId(streamMetadata.model) : undefined),
            };

            // Auto-clear at 80% (but only if we have valid usage data)
            const currentInfo = get().contextInfo;
            const hasValidUsage = currentInfo.usedTokens > 0 && currentInfo.maxTokens > 0;
            if (hasValidUsage && currentInfo.percentage >= 0.8) {
              console.log('[LMStudioChat] Context at 80%, clearing history');
              set({
                messages: [userMessage, assistantMessage], // Keep the conversation pair
                contextInfo: DEFAULT_CONTEXT_INFO,
                isSending: false,
                isStreaming: false,
                streamingContent: '',
                abortController: null,
              });
            } else {
              set((s) => ({
                messages: [...s.messages, assistantMessage],
                isSending: false,
                isStreaming: false,
                streamingContent: '',
                abortController: null,
              }));
            }
          } else {
            // Non-streaming JSON response (fallback)
            const data = await response.json();
            const assistantContent = data.content || 'No response received.';

            // Update token usage if available
            if (data.usage) {
              const usage = data.usage;
              const usedTokens = usage.prompt_tokens || 0;
              const completionTokens = usage.completion_tokens || 0;
              const maxTokens = state.contextInfo.maxTokens;
              set({
                contextInfo: {
                  usedTokens,
                  completionTokens,
                  totalTokens: usage.total_tokens || usedTokens + completionTokens,
                  maxTokens,
                  percentage: usedTokens / maxTokens,
                },
              });

              // Auto-clear at 80%
              if (usedTokens / maxTokens >= 0.8) {
                console.log('[LMStudioChat] Context at 80%, clearing history');
                set({ messages: [], contextInfo: DEFAULT_CONTEXT_INFO });
              }
            }

            // Add assistant message with model/provider metadata
            // Non-streaming fallback uses configured values since no metadata event
            const domainConfig = useDomainConfigStore.getState().getConfigForDomain('code-editor');
            const fallbackModel = domainConfig.modelId || state.selectedModel;

            const assistantMessage: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: assistantContent,
              timestamp: Date.now(),
              // Use configured values for non-streaming fallback
              model: fallbackModel,
              provider: backend,
              modelName: domainConfig.modelName || fallbackModel,
              source: fallbackModel ? inferSourceFromId(fallbackModel) : undefined,
            };

            set((s) => ({
              messages: [...s.messages, assistantMessage],
              isSending: false,
              isStreaming: false,
              streamingContent: '',
              abortController: null,
            }));
          }
        } catch (error) {
          // Handle abort specifically
          if (error instanceof Error && error.name === 'AbortError') {
            console.log('[LMStudioChat] Request cancelled');
            const cancelledContent = get().streamingContent;

            // If we have partial content, save it as a cancelled message
            if (cancelledContent.trim()) {
              const partialMessage: ChatMessage = {
                id: generateId(),
                role: 'assistant',
                content: cancelledContent + '\n\n*(Response cancelled)*',
                timestamp: Date.now(),
              };
              set((s) => ({
                messages: [...s.messages, partialMessage],
                isSending: false,
                isStreaming: false,
                streamingContent: '',
                abortController: null,
              }));
            } else {
              set({
                isSending: false,
                isStreaming: false,
                streamingContent: '',
                abortController: null,
              });
            }
            return;
          }

          console.error('[LMStudioChat] Send error:', error);

          // Add error message
          const errorMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
            timestamp: Date.now(),
          };

          set((s) => ({
            messages: [...s.messages, errorMessage],
            isSending: false,
            isStreaming: false,
            streamingContent: '',
            abortController: null,
          }));
        }
      },

      cancelStreaming: () => {
        const { abortController } = get();
        if (abortController) {
          abortController.abort();
        }
      },

      clearHistory: () => {
        const state = get();
        // Save current conversation before clearing
        if (state.currentConversationId && state.messages.length > 0) {
          const conversations = state.conversations.map((c) =>
            c.id === state.currentConversationId
              ? { ...c, messages: [], updatedAt: Date.now() }
              : c
          );
          set({ messages: [], contextInfo: DEFAULT_CONTEXT_INFO, conversations });
        } else {
          set({ messages: [], contextInfo: DEFAULT_CONTEXT_INFO });
        }
      },

      // Context actions
      setEditorContext: (context: EditorContext | null) => set({ editorContext: context }),

      setIncludeContext: (include: boolean) => set({ includeContext: include }),

      // Conversation management actions
      createNewConversation: (name?: string) => {
        const state = get();

        // Save current conversation first
        let conversations = state.conversations;
        if (state.currentConversationId && state.messages.length > 0) {
          conversations = conversations.map((c) =>
            c.id === state.currentConversationId
              ? {
                  ...c,
                  messages: state.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
                  updatedAt: Date.now(),
                }
              : c
          );
        }

        // Create new conversation
        const newConv = createConversation(name);
        conversations = [newConv, ...conversations].slice(0, MAX_CONVERSATIONS);

        set({
          conversations,
          currentConversationId: newConv.id,
          messages: [],
          contextInfo: DEFAULT_CONTEXT_INFO,
        });
      },

      switchConversation: (id: string) => {
        const state = get();
        const targetConv = state.conversations.find((c) => c.id === id);
        if (!targetConv) return;

        // Save current conversation first
        let conversations = state.conversations;
        if (state.currentConversationId && state.messages.length > 0) {
          conversations = conversations.map((c) =>
            c.id === state.currentConversationId
              ? {
                  ...c,
                  messages: state.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
                  updatedAt: Date.now(),
                }
              : c
          );
        }

        set({
          conversations,
          currentConversationId: id,
          messages: targetConv.messages,
          contextInfo: DEFAULT_CONTEXT_INFO,
        });
      },

      deleteConversation: (id: string) => {
        const state = get();
        const conversations = state.conversations.filter((c) => c.id !== id);

        // If deleting current conversation, switch to another or clear
        if (state.currentConversationId === id) {
          const nextConv = conversations[0];
          set({
            conversations,
            currentConversationId: nextConv?.id || null,
            messages: nextConv?.messages || [],
            contextInfo: DEFAULT_CONTEXT_INFO,
          });
        } else {
          set({ conversations });
        }
      },

      renameConversation: (id: string, name: string) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, name, updatedAt: Date.now() } : c
          ),
        }));
      },

      exportConversationAsMarkdown: (id?: string) => {
        const state = get();
        const targetId = id || state.currentConversationId;

        let messages: ChatMessage[];
        let convName: string;

        if (targetId) {
          const conv = state.conversations.find((c) => c.id === targetId);
          messages = conv?.messages || state.messages;
          convName = conv?.name || 'Chat Export';
        } else {
          messages = state.messages;
          convName = 'Chat Export';
        }

        // Build markdown
        const lines: string[] = [
          `# ${convName}`,
          '',
          `*Exported on ${new Date().toLocaleString()}*`,
          '',
          '---',
          '',
        ];

        for (const msg of messages) {
          const time = new Date(msg.timestamp).toLocaleTimeString();
          const role = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'AI' : msg.role;

          lines.push(`### ${role} (${time})`);
          lines.push('');
          lines.push(msg.content);
          lines.push('');

          // Add tool calls if present
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            lines.push('**Tool Calls:**');
            for (const tc of msg.toolCalls) {
              lines.push(`- \`${tc.name}\`: ${tc.status}`);
            }
            lines.push('');
          }
        }

        return lines.join('\n');
      },

      /**
       * @deprecated Use chatLock from utils/cross-window-lock.ts instead.
       * This store-based lock only works within a single window context.
       * The cross-window lock uses BroadcastChannel + localStorage to work
       * across multiple Electron BrowserWindows.
       */
      setActiveView: (view: AssistantViewType) => {
        const current = get().activeView;
        // If another view already has the lock, deny
        if (current && current !== view) {
          return false;
        }
        set({ activeView: view });
        return true;
      },

      /**
       * @deprecated Use chatLock from utils/cross-window-lock.ts instead.
       * This store-based lock only works within a single window context.
       */
      releaseActiveView: (view: AssistantViewType) => {
        const current = get().activeView;
        // Only release if this view owns the lock
        if (current === view) {
          set({ activeView: null });
        }
      },

      // PTY session actions
      setPtySessionId: (id: string | null) => {
        set({ ptySessionId: id });
        // Persist to localStorage for session recovery
        if (id) {
          localStorage.setItem('insights-pty-session', id);
        } else {
          localStorage.removeItem('insights-pty-session');
        }
      },

      /**
       * Send a message to the Claude CLI via PTY
       * This is used when the selected model is claude-cli-pty
       */
      sendMessageViaPty: async (content: string) => {
        const state = get();
        if (!content.trim() || state.isSending || state.isStreaming) return;
        if (!state.ptySessionId) {
          console.error('[LMStudioChat] No PTY session available');
          return;
        }

        set({ isSending: true, isStreaming: true, streamingContent: '' });

        // Add user message to history
        const userMessage: ChatMessage = {
          id: generateId(),
          role: 'user',
          content,
          timestamp: Date.now(),
        };

        set((s) => ({ messages: [...s.messages, userMessage] }));

        try {
          // Send message to PTY via IPC
          const ptyId = state.ptySessionId;
          await (window as any).electronAPI?.pty?.write(ptyId, content + '\r');

          // Start polling for response
          set({ ptyPollingActive: true });
          let accumulated = '';
          let lastLength = 0;
          let idleCount = 0;
          const maxIdleCount = 30; // 30 * 200ms = 6 seconds of no new output
          const maxWait = 120000; // 2 minute max
          const startTime = Date.now();

          const pollForOutput = async () => {
            if (Date.now() - startTime > maxWait) {
              // Timeout - finalize with what we have
              finalizeMessage(accumulated);
              return;
            }

            try {
              // Read from PTY via k_pty MCP tool through Gateway
              const result = await fetch(`${GATEWAY_URL}/v1/mcp/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tool: 'k_pty',
                  arguments: {
                    action: 'term_read',
                    session_id: ptyId,
                    mode: 'delta',
                    max_chars: 8192,
                  },
                }),
              });

              if (result.ok) {
                const data = await result.json();
                if (data.result?.content) {
                  accumulated += data.result.content;
                  set({ streamingContent: accumulated });
                }
              }

              // Check for idle (no new output)
              if (accumulated.length === lastLength) {
                idleCount++;
              } else {
                idleCount = 0;
                lastLength = accumulated.length;
              }

              // Finalize when idle for a while (response complete)
              if (idleCount >= maxIdleCount && accumulated.length > 0) {
                finalizeMessage(accumulated);
                return;
              }

              // Continue polling
              if (get().ptyPollingActive) {
                setTimeout(pollForOutput, 200);
              }
            } catch (err) {
              console.error('[LMStudioChat] PTY poll error:', err);
              // Continue polling on transient errors
              if (get().ptyPollingActive) {
                setTimeout(pollForOutput, 500);
              }
            }
          };

          const finalizeMessage = (rawContent: string) => {
            set({ ptyPollingActive: false });

            // Import filter function dynamically to avoid circular deps
            const filterTerminalOutput = (text: string) => {
              // Basic ANSI stripping - full filter imported in component
              return text
                .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
                .replace(/\x1b[^[\]].?/g, '')
                .trim();
            };

            const filteredContent = filterTerminalOutput(rawContent);

            const assistantMessage: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: filteredContent || 'No response received.',
              timestamp: Date.now(),
              model: 'claude-cli-pty',
              provider: 'claude-cli-pty',
              modelName: 'Claude (PTY)',
              source: 'claude',
            };

            set((s) => ({
              messages: [...s.messages, assistantMessage],
              isSending: false,
              isStreaming: false,
              streamingContent: '',
            }));
          };

          // Start polling
          pollForOutput();
        } catch (error) {
          console.error('[LMStudioChat] PTY send error:', error);

          const errorMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: `Error: ${error instanceof Error ? error.message : 'PTY communication failed'}`,
            timestamp: Date.now(),
          };

          set((s) => ({
            messages: [...s.messages, errorMessage],
            isSending: false,
            isStreaming: false,
            streamingContent: '',
            ptyPollingActive: false,
          }));
        }
      },
    }),
    {
      name: 'lmstudio-chat-storage',
      partialize: (state) => ({
        isPanelOpen: state.isPanelOpen,
        panelWidth: state.panelWidth,
        selectedModel: state.selectedModel,
        includeContext: state.includeContext,
        showConversationList: state.showConversationList,
        // Persist conversations with limited messages
        conversations: state.conversations.map((c) => ({
          ...c,
          messages: c.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
        })).slice(0, MAX_CONVERSATIONS),
        currentConversationId: state.currentConversationId,
        // Persist PTY session ID for recovery
        ptySessionId: state.ptySessionId,
      }),
    }
  )
);
