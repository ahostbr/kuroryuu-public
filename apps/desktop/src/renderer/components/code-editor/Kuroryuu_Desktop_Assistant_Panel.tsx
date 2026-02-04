/**
 * Kuroryuu Desktop Assistant Panel - Unified AI Chat Interface
 *
 * Single component serving two modes:
 * - 'panel': Collapsible right-side panel in Code Editor (VSCode-like)
 * - 'fullscreen': Full content area for Insights view
 *
 * Uses Copilot-style dark theme for the AI chat interface.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLMStudioChatStore, type ChatMessage, type ToolCallData } from '../../stores/lmstudio-chat-store';
import type { RichCard } from '../../types/insights';
import { chatLock, type AssistantViewType } from '../../utils/cross-window-lock';
import { useCodeEditorStore } from '../../stores/code-editor-store';
import { useDomainConfigStore } from '../../stores/domain-config-store';
import { PROVIDERS, type LLMProvider } from '../../types/domain-config';
import { modelSupportsTools, inferSourceFromId } from '../../services/model-registry';
import {
  Send,
  Trash2,
  RefreshCw,
  X,
  FileCode,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Mic,
  Square,
  Wrench,
  History,
  PlusCircle,
  Copy,
  Check,
  Volume2,
  VolumeX,
  FolderTree,
  MessageSquare,
  TerminalSquare,
} from 'lucide-react';

// Kuroryuu brand icon - ink-wash dragon
import kuroryuuIcon from '../../../../build/icon.png';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolCallCard } from './ToolCallCard';
import { ConversationList } from './ConversationList';
import { ContextSelector } from './ContextSelector';
import { EmptyState } from './EmptyState';
import { ModelSelector } from './ModelSelector';
import { SlashCommandMenu, SLASH_COMMANDS, type SlashCommand } from './SlashCommandMenu';
import { AtMentionPicker, type MentionItem, type MentionCategoryDef } from './AtMentionPicker';
import { FileExplorerPanel } from '../FileExplorerPanel';
import { InsightsTerminalPanel } from './InsightsTerminalPanel';
import { RichCardRenderer } from '../insights/RichCardRenderer';
import { useSettingsStore } from '../../stores/settings-store';
import { toast } from '../ui/toaster';
import { filterTerminalOutput, hasTerminalArtifacts } from '../../utils/filter-terminal-output';

// Import Copilot theme CSS
import './copilot-theme.css';

// ============================================================================
// TTS Hook - ported from Insights.tsx
// ============================================================================
function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const speak = useCallback(async (text: string, messageId?: string) => {
    setIsSpeaking(true);
    if (messageId) setSpeakingMessageId(messageId);
    try {
      await (window as any).electronAPI?.tts?.speak?.({ text });
    } catch (err) {
      console.error('[TTS] Error speaking:', err);
    } finally {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await (window as any).electronAPI?.tts?.stop?.();
    } catch (err) {
      console.error('[TTS] Error stopping:', err);
    }
    setIsSpeaking(false);
    setSpeakingMessageId(null);
  }, []);

  return { speak, stop, isSpeaking, speakingMessageId };
}

// ============================================================================
// Props Interface
// ============================================================================
export interface AssistantPanelProps {
  /** 'panel' = Code Editor side panel, 'fullscreen' = Insights view */
  mode?: 'panel' | 'fullscreen';
  /** Optional callback when panel requests close (panel mode only) */
  onClose?: () => void;
}

// ============================================================================
// Provider color helper for visual differentiation
// ============================================================================
function getSourceColor(source: string): string {
  const colors: Record<string, string> = {
    claude: '#c99a27',           // Anthropic gold
    gemini: '#4285f4',           // Google blue
    openai: '#10a37f',           // OpenAI green
    'github-copilot': '#6e5494', // GitHub purple
    kiro: '#ff9900',             // AWS orange
    antigravity: '#8b5cf6',      // Purple
    grok: '#1da1f2',             // X/Twitter blue
    local: '#6b7280',            // Gray for local models
  };
  return colors[source] || '#6b7280'; // Default gray
}

// ============================================================================
// Individual message component - Copilot style
// ============================================================================
function MessageBubble({
  message,
  onApplyCode,
  onSpeak,
  onStopSpeaking,
  isSpeaking,
  showRichCards,
}: {
  message: ChatMessage;
  onApplyCode?: (code: string, language: string) => void;
  onSpeak?: (text: string, messageId: string) => void;
  onStopSpeaking?: () => void;
  isSpeaking?: boolean;
  showRichCards?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isError = message.role === 'assistant' && message.content.startsWith('Error:');
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const hasRichCards = showRichCards && message.richCards && message.richCards.length > 0;

  // Derive display name and source label from message metadata
  const { displayName, sourceLabel, sourceColor } = useMemo(() => {
    if (isUser) return { displayName: 'You', sourceLabel: null, sourceColor: null };

    // Use model metadata if available
    const modelName = message.modelName || message.model || 'Kuroryuu';
    const source = message.source || (message.model ? inferSourceFromId(message.model) : null);

    // Format source for display (capitalize first letter, handle hyphens)
    const sourceLabel = source
      ? source.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : null;
    const sourceColor = source ? getSourceColor(source) : null;

    return { displayName: modelName, sourceLabel, sourceColor };
  }, [isUser, message.model, message.modelName, message.source]);

  // Filter terminal artifacts from PTY backend output (assistant messages only)
  const filteredContent = useMemo(() => {
    if (isUser || !message.content) return message.content;
    // Only apply filtering if content likely has terminal artifacts
    if (hasTerminalArtifacts(message.content)) {
      return filterTerminalOutput(message.content);
    }
    return message.content;
  }, [isUser, message.content]);

  const handleCopy = async () => {
    // Copy filtered content (cleaned of terminal artifacts)
    await navigator.clipboard.writeText(filteredContent || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTTS = () => {
    if (isSpeaking) {
      onStopSpeaking?.();
    } else {
      // Speak filtered content (cleaned of terminal artifacts)
      onSpeak?.(filteredContent || '', message.id);
    }
  };

  // Tool message - special styling (tool calls without response text yet)
  if (hasToolCalls && !message.content) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 py-2"
      >
        <div className="space-y-2">
          {message.toolCalls!.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} compact={true} />
          ))}
          {/* Rich cards when tools complete but no text yet */}
          {hasRichCards && message.richCards!.map(card => (
            <RichCardRenderer key={card.id} card={card} />
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group px-4 py-3 ${isUser ? 'cp-msg-user' : ''}`}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-3">
          {/* Avatar */}
          <div className={`cp-avatar ${isUser ? 'cp-avatar-user' : 'cp-avatar-ai'}`}>
            {isUser ? (
              <span className="text-[10px] font-semibold">Y</span>
            ) : (
              <img src={kuroryuuIcon} alt="" className="w-5 h-5 object-cover cp-dragon-glow" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 cp-msg-content">
            {/* Header */}
            <div className="cp-msg-header">
              <span className="cp-msg-name">{displayName}</span>
              {sourceLabel && (
                <span className="text-xs opacity-70" style={{ color: sourceColor || undefined }}>
                  ({sourceLabel})
                </span>
              )}
              <span className="cp-msg-time">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {message.contextIncluded && (
                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--cp-accent-blue)' }}>
                  <FileCode className="w-3 h-3" /> +context
                </span>
              )}
            </div>

            {/* Tool calls FIRST - chronological order (tools called before response) */}
            {hasToolCalls && (
              <div className="space-y-2 mb-3">
                {message.toolCalls!.map((tc) => (
                  <ToolCallCard key={tc.id} toolCall={tc} compact={true} />
                ))}
              </div>
            )}

            {/* Rich visualization cards SECOND - appear when tools complete */}
            {hasRichCards && !isUser && (
              <div className="space-y-2 mb-3">
                {message.richCards!.map(card => (
                  <RichCardRenderer key={card.id} card={card} />
                ))}
              </div>
            )}

            {/* Message Body LAST - the actual response text */}
            <div className={`cp-prose ${isError ? 'text-red-400' : ''}`}>
              {filteredContent && (
                <MarkdownRenderer
                  content={filteredContent}
                  onApplyCode={!isUser ? onApplyCode : undefined}
                />
              )}
            </div>

            {/* Action buttons (hover reveal) */}
            {!isUser && filteredContent && (
              <div className="mt-2 flex items-center gap-2">
                {/* Copy button */}
                <button
                  onClick={handleCopy}
                  className={`cp-copy-btn ${copied ? 'cp-copy-btn-success' : ''}`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                {/* TTS button */}
                <button
                  onClick={handleTTS}
                  className={`cp-copy-btn ${isSpeaking ? 'cp-copy-btn-active' : ''}`}
                  title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
                >
                  {isSpeaking ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5" />
                      <span>Stop</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Speak</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Token usage bar
// ============================================================================
function TokenUsageBar() {
  const { contextInfo } = useLMStudioChatStore();

  if (contextInfo.usedTokens === 0) return null;

  const percentage = Math.min(contextInfo.percentage * 100, 100);
  const colorClass =
    percentage >= 80 ? 'bg-red-500' : percentage >= 60 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="px-3 py-1.5 border-t border-border">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
        <span>Context</span>
        <span>
          {contextInfo.usedTokens.toLocaleString()} / {contextInfo.maxTokens.toLocaleString()}
        </span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Streaming message bubble - Copilot style with purple dots + progressive tool calls
// ============================================================================
function StreamingMessageBubble({
  content,
  toolCalls,
  richCards,
  showRichCards,
}: {
  content: string;
  toolCalls?: ToolCallData[];
  richCards?: RichCard[];
  showRichCards?: boolean;
}) {
  // Get current model info from domain config for streaming display
  const domainConfig = useDomainConfigStore((state) => state.getConfigForDomain('code-editor'));
  const modelId = domainConfig.modelId || '';
  const modelName = domainConfig.modelName || modelId || 'Kuroryuu';
  const source = modelId ? inferSourceFromId(modelId) : null;
  const sourceLabel = source
    ? source.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : null;

  // Filter terminal artifacts from PTY backend streaming output
  const filteredContent = useMemo(() => {
    if (!content) return '';
    if (hasTerminalArtifacts(content)) {
      return filterTerminalOutput(content);
    }
    return content;
  }, [content]);

  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const hasRichCards = showRichCards && richCards && richCards.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-4 py-3"
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-3">
          {/* Avatar - Kuroryuu dragon */}
          <div className="cp-avatar cp-avatar-ai">
            <img src={kuroryuuIcon} alt="" className="w-5 h-5 object-cover cp-dragon-glow" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="cp-msg-header">
              <span className="cp-msg-name">{modelName}</span>
              {sourceLabel && (
                <span className="text-xs opacity-70" style={{ color: getSourceColor(source || '') }}>
                  ({sourceLabel})
                </span>
              )}
            </div>

            {/* Progressive Tool Calls - Show immediately as they stream in */}
            {hasToolCalls && (
              <div className="space-y-2 mb-3">
                {toolCalls!.map((tc) => (
                  <ToolCallCard key={tc.id} toolCall={tc} compact={true} />
                ))}
              </div>
            )}

            {/* Progressive Rich Cards - Show as soon as tool completes */}
            {hasRichCards && (
              <div className="space-y-2 mb-3">
                {richCards!.map(card => (
                  <RichCardRenderer key={card.id} card={card} />
                ))}
              </div>
            )}

            {/* Message Body */}
            <div className="cp-prose">
              {filteredContent ? (
                <>
                  <MarkdownRenderer content={filteredContent} />
                  {/* Typing cursor - gold */}
                  <span className="cp-typing-cursor" />
                </>
              ) : (
                <div className="cp-streaming-dots">
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="cp-streaming-dot"
                  />
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
                    className="cp-streaming-dot"
                  />
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                    className="cp-streaming-dot"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Resize handle component (panel mode only)
// ============================================================================
function ResizeHandle({
  onResize,
  isResizing,
  setIsResizing,
}: {
  onResize: (deltaX: number) => void;
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
}) {
  const startXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      setIsResizing(true);
    },
    [setIsResizing]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Negative because dragging left should increase width (panel is on right side)
      const deltaX = startXRef.current - e.clientX;
      startXRef.current = e.clientX;
      onResize(deltaX);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onResize, setIsResizing]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 transition-colors group ${
        isResizing ? 'bg-primary' : 'bg-transparent hover:bg-primary/50'
      }`}
      title="Drag to resize"
    >
      {/* Visual indicator line */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-0.5 transition-opacity ${
          isResizing ? 'opacity-100 bg-primary' : 'opacity-0 group-hover:opacity-100 bg-primary/50'
        }`}
      />
    </div>
  );
}

// ============================================================================
// Main panel component
// ============================================================================
export function KuroryuuDesktopAssistantPanel({ mode = 'panel', onClose }: AssistantPanelProps) {
  const {
    isPanelOpen,
    panelWidth,
    showConversationList,
    isConnected,
    connectionStatus,
    availableModels,
    selectedModel,
    messages,
    isSending,
    isStreaming,
    streamingContent,
    includeContext,
    availableTools,
    toolsLoading,
    testConnection,
    loadModels,
    loadTools,
    setModel,
    sendMessage,
    cancelStreaming,
    clearHistory,
    togglePanel,
    setPanelWidth,
    setIncludeContext,
    toggleConversationList,
    createNewConversation,
  } = useLMStudioChatStore();

  // TTS hook
  const { speak, stop, isSpeaking, speakingMessageId } = useTTS();

  // Rich tool visualizations setting
  const enableRichToolVisualizations = useSettingsStore(
    state => state.appSettings?.enableRichToolVisualizations ?? false
  );

  // Domain config for provider/model selection
  const {
    getConfigForDomain,
    updateDomainConfig,
    availableModels: domainModels,
    providerHealth,
    fetchAvailableModels,
    checkProviderHealth,
  } = useDomainConfigStore();
  const domainConfig = getConfigForDomain('code-editor');

  // Code editor store for applying code suggestions (panel mode)
  const { openFiles, activeFileIndex, updateFileContent } = useCodeEditorStore();
  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  const [input, setInput] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Voice input state (using Python voice_input.py via IPC - same as tray_companion)
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Mode-specific settings
  const isFullscreen = mode === 'fullscreen';
  const [showSidebar, setShowSidebar] = useState(isFullscreen); // Expanded by default in fullscreen
  const [sidebarView, setSidebarView] = useState<'conversations' | 'files' | 'terminal'>('conversations');

  // PTY session state for Terminal tab (Claude CLI PTY integration)
  const [ptySessionId, setPtySessionId] = useState<string | null>(() => {
    // Restore from localStorage if available
    if (typeof window !== 'undefined') {
      return localStorage.getItem('insights-pty-session');
    }
    return null;
  });

  // Persist PTY session ID to localStorage when it changes
  useEffect(() => {
    if (ptySessionId) {
      localStorage.setItem('insights-pty-session', ptySessionId);
    }
  }, [ptySessionId]);

  // Handler for when terminal panel creates/connects to a PTY
  const handlePtyReady = useCallback((ptyId: string, sessionId?: string) => {
    console.log('[AssistantPanel] PTY ready:', { ptyId, sessionId });
    setPtySessionId(ptyId);
    // Also sync to the chat store for message sending
    useLMStudioChatStore.getState().setPtySessionId(ptyId);
  }, []);

  // Slash command menu state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0);

  // @ mention picker state
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [atFilter, setAtFilter] = useState('');
  const [atHighlightIndex, setAtHighlightIndex] = useState(0);

  // Mutual exclusion state
  const [isBlocked, setIsBlocked] = useState(false);
  const viewType: AssistantViewType = isFullscreen ? 'insights' : 'code-editor';

  // Acquire/release view lock for mutual exclusion (cross-window via BroadcastChannel)
  useEffect(() => {
    let isMounted = true;

    // Check current lock state and update blocked status
    const syncLockState = () => {
      if (!isMounted) return;

      const current = chatLock.getActiveView();

      if (current === viewType) {
        // We have the lock
        setIsBlocked(false);
      } else if (current && current !== viewType) {
        // Another view has the lock
        setIsBlocked(true);
      } else {
        // Lock is free, try to acquire
        const success = chatLock.acquire(viewType);
        setIsBlocked(!success);
      }
    };

    // Initial sync
    syncLockState();

    // Subscribe to lock changes from other windows
    const unsubscribe = chatLock.subscribe(() => {
      // Always re-sync from localStorage on any change
      // Use requestAnimationFrame to batch multiple rapid changes
      requestAnimationFrame(syncLockState);
    });

    return () => {
      isMounted = false;
      unsubscribe();
      chatLock.release(viewType);
    };
  }, [viewType]);

  // Handle resize (panel mode only)
  const handleResize = useCallback(
    (deltaX: number) => {
      setPanelWidth(panelWidth + deltaX);
    },
    [panelWidth, setPanelWidth]
  );

  // Handle applying code from AI suggestions to editor
  const handleApplyCode = useCallback(
    (code: string, language: string) => {
      if (activeFileIndex >= 0) {
        // Replace entire file content with the suggested code
        updateFileContent(activeFileIndex, code);
        toast.success('Code applied to editor');
      } else {
        toast.error('No file open to apply code');
      }
    },
    [activeFileIndex, updateFileContent]
  );

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Test connection and load models/tools on mount
  useEffect(() => {
    // For fullscreen mode, always init. For panel mode, only when open.
    if (isFullscreen || isPanelOpen) {
      handleConnect();
      // Load available models for all providers and MCP tools
      setIsLoadingModels(true);
      Promise.all([fetchAvailableModels(), checkProviderHealth(), loadTools()])
        .finally(() => setIsLoadingModels(false));
    }
  }, [isFullscreen, isPanelOpen]);

  // Focus input when panel opens or on fullscreen mount
  useEffect(() => {
    if (isFullscreen || isPanelOpen) {
      inputRef.current?.focus();
    }
  }, [isFullscreen, isPanelOpen]);

  const handleConnect = async () => {
    setIsConnecting(true);
    await testConnection();
    await checkProviderHealth();
    setIsConnecting(false);
  };

  // Handle provider change - fetch fresh models for new provider
  const handleProviderChange = async (provider: LLMProvider) => {
    updateDomainConfig('code-editor', { provider });

    // Fetch models for the new provider (ensures we have fresh data)
    const fetchModels = useDomainConfigStore.getState().fetchModelsForProvider;
    const freshModels = await fetchModels(provider);

    // Reset model to first available for this provider
    if (freshModels.length > 0) {
      updateDomainConfig('code-editor', { modelId: freshModels[0].id, modelName: freshModels[0].name });
      setModel(freshModels[0].id);
    } else {
      // Fallback to cached models if fetch returns empty
      const cachedModels = domainModels.filter(m => m.provider === provider);
      if (cachedModels.length > 0) {
        updateDomainConfig('code-editor', { modelId: cachedModels[0].id, modelName: cachedModels[0].name });
        setModel(cachedModels[0].id);
      }
    }
  };

  // Handle model change - now receives provider directly from selector
  const handleModelChange = (modelId: string, provider: string) => {
    const model = domainModels.find(m => m.id === modelId && m.provider === provider);
    if (model) {
      updateDomainConfig('code-editor', {
        provider: model.provider as LLMProvider,
        modelId: model.id,
        modelName: model.name,
      });
      setModel(model.id);
    }
  };

  // Get models for current provider
  const modelsForCurrentProvider = domainModels.filter(m => m.provider === domainConfig.provider);

  // Filter to tool-capable models only when tools are loaded
  const toolCapableModels = useMemo(() => {
    if (!availableTools.length) return modelsForCurrentProvider; // No filtering if no tools
    return modelsForCurrentProvider.filter(m => modelSupportsTools(m.id));
  }, [modelsForCurrentProvider, availableTools]);

  // Check if current model supports tools
  const currentModelSupportsTools = useMemo(() => {
    const modelId = domainConfig.modelId || selectedModel;
    return modelId ? modelSupportsTools(modelId) : true;
  }, [domainConfig.modelId, selectedModel]);

  // Get provider info
  const currentProviderInfo = PROVIDERS.find(p => p.id === domainConfig.provider);
  const isProviderHealthy = providerHealth[domainConfig.provider] ?? false;

  // Get PTY-related state from store
  const { sendMessageViaPty, setPtySessionId: storePtySessionId } = useLMStudioChatStore();

  // Check if current provider is PTY-based
  const isPtyProvider = domainConfig.provider === 'claude-cli-pty';

  const handleSend = () => {
    if (!input.trim() || isSending) return;

    // Use PTY method if provider is claude-cli-pty and we have a session
    if (isPtyProvider && ptySessionId) {
      sendMessageViaPty(input.trim());
    } else {
      sendMessage(input.trim());
    }

    setInput('');
    setShowSlashMenu(false);
  };

  // Handle input change - detect slash commands and @ mentions
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Detect slash command trigger (only at start of input)
    if (value.startsWith('/')) {
      setShowSlashMenu(true);
      setSlashFilter(value.slice(1));
      setShowAtMenu(false);
      setAtFilter('');
    }
    // Detect @ mention trigger
    else if (value.includes('@')) {
      const atIndex = value.lastIndexOf('@');
      const afterAt = value.slice(atIndex + 1);
      // Only show menu if @ is at start or after whitespace
      const charBefore = atIndex > 0 ? value[atIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        setShowAtMenu(true);
        setAtFilter(afterAt);
        setShowSlashMenu(false);
        setSlashFilter('');
      } else {
        setShowAtMenu(false);
        setAtFilter('');
      }
    }
    else {
      setShowSlashMenu(false);
      setSlashFilter('');
      setShowAtMenu(false);
      setAtFilter('');
    }
  };

  // Handle slash command selection
  const handleSlashCommandSelect = (cmd: SlashCommand) => {
    setShowSlashMenu(false);
    setSlashFilter('');

    switch (cmd.name) {
      // Core
      case '/clear':
        clearHistory();
        setInput('');
        toast.success('Conversation cleared');
        break;

      case '/help':
        toast.info('Commands: /help /clear /context /compact /history /model /provider /config /doctor /status /hooks /memory');
        setInput('');
        break;

      // Context Management
      case '/context': {
        const tokenCount = messages.reduce((acc, m) => acc + (m.content?.length || 0) / 4, 0);
        const maxTokens = 128000;
        const percent = Math.round((tokenCount / maxTokens) * 100);
        toast.info(`Context: ~${Math.round(tokenCount)} / ${maxTokens} tokens (${percent}%)`);
        setInput('');
        break;
      }

      case '/compact':
        if (messages.length < 5) {
          toast.info('History too short to compact');
        } else {
          toast.info('Compacting not yet implemented');
        }
        setInput('');
        break;

      case '/history':
        setShowSidebar(true);
        setInput('');
        break;

      // Configuration
      case '/model':
        toast.info('Use model selector in bottom bar');
        setInput('');
        break;

      case '/provider':
        toast.info('Use provider selector in bottom bar');
        setInput('');
        break;

      case '/config':
        toast.info(`Provider: ${domainConfig.provider} | Model: ${selectedModel} | Tools: ${availableTools.length}`);
        setInput('');
        break;

      // System
      case '/doctor': {
        const checks = [
          isConnected ? '✓ Connected' : '✗ Disconnected',
          isProviderHealthy ? '✓ Provider' : '✗ Provider',
        ];
        toast.info(checks.join(' | '));
        setInput('');
        break;
      }

      case '/status': {
        const statusText = isConnected ? 'Connected' : 'Disconnected';
        const providerText = isProviderHealthy ? 'Provider OK' : 'Provider Error';
        toast.info(`${statusText} | ${providerText}`);
        setInput('');
        break;
      }

      case '/hooks':
        toast.info('Hook configuration coming soon');
        setInput('');
        break;

      case '/memory':
        toast.info('Memory files coming soon');
        setInput('');
        break;

      // Default: insert command text
      default:
        setInput(cmd.name + ' ');
        inputRef.current?.focus();
        break;
    }
  };

  // Handle @ mention selection
  const handleAtMentionSelect = (item: MentionItem | MentionCategoryDef) => {
    // If it's a category with no items (like expanding), let picker handle internally
    if ('label' in item) {
      // Category selected - update filter to show items
      setAtFilter(`${item.id}:`);
      setShowAtMenu(true);
      return;
    }

    // Item selected - insert into input
    setShowAtMenu(false);
    setAtFilter('');

    const mention = item as MentionItem;
    const currentInput = input;
    const atIndex = currentInput.lastIndexOf('@');

    // Replace @... with the selected file/directory reference
    const beforeAt = currentInput.slice(0, atIndex);
    const displayPath = mention.path || mention.name;
    const newInput = `${beforeAt}@${displayPath} `;

    setInput(newInput);
    inputRef.current?.focus();
  };

  // ============================================================================
  // @ Mention - Folder Navigation with IPC
  // ============================================================================

  // Get project root via IPC (async) with sensible fallback
  const [projectRoot, setProjectRoot] = useState<string>('.');
  const [atCurrentFolder, setAtCurrentFolder] = useState<string>('.');
  const [atFolderContents, setAtFolderContents] = useState<MentionItem[]>([]);
  const [atFilesLoading, setAtFilesLoading] = useState(false);

  // Fetch project root once on mount
  useEffect(() => {
    window.electronAPI?.app?.getProjectRoot?.()
      .then((root: string) => {
        console.log('[AtMention] Got project root:', root);
        setProjectRoot(root);
        setAtCurrentFolder(root);
      })
      .catch((err: Error) => {
        console.warn('[AtMention] Failed to get project root, using fallback:', err);
      });
  }, []);

  // Fetch folder contents via IPC when @ menu opens or folder changes
  useEffect(() => {
    if (!showAtMenu) return;

    const fetchFolderContents = async () => {
      setAtFilesLoading(true);
      try {
        // Use electronAPI to read directory tree (depth 1 = immediate children)
        const nodes = await (window as any).electronAPI?.fs?.readTree?.(atCurrentFolder, 1);

        if (nodes && Array.isArray(nodes)) {
          const items: MentionItem[] = nodes.map((node: any) => ({
            id: node.path,
            type: node.type === 'directory' ? 'directories' : 'files',
            name: node.name,
            path: node.path,
            isFolder: node.type === 'directory',
            isNavigable: node.type === 'directory',
            meta: node.type === 'directory' && node.children
              ? `(${node.children.length} items)`
              : undefined,
          }));

          // Sort: folders first, then files, alphabetically
          items.sort((a, b) => {
            if (a.isFolder && !b.isFolder) return -1;
            if (!a.isFolder && b.isFolder) return 1;
            return a.name.localeCompare(b.name);
          });

          setAtFolderContents(items);
        } else {
          // Fallback to empty if IPC not available
          setAtFolderContents([]);
        }
      } catch (err) {
        console.error('[AtMention] Error fetching folder contents:', err);
        setAtFolderContents([]);
      } finally {
        setAtFilesLoading(false);
      }
    };

    fetchFolderContents();
  }, [showAtMenu, atCurrentFolder]);

  // Handle folder navigation from AtMentionPicker
  const handleAtFolderNavigate = useCallback((path: string) => {
    setAtCurrentFolder(path);
    setAtFilter('');
    setAtHighlightIndex(0);
  }, []);

  // Reset folder when @ menu closes
  useEffect(() => {
    if (!showAtMenu && projectRoot) {
      setAtCurrentFolder(projectRoot);
    }
  }, [showAtMenu, projectRoot]);

  // Split folder contents into files and directories for category view
  const atFiles: MentionItem[] = useMemo(() => {
    return atFolderContents.filter(item => !item.isFolder);
  }, [atFolderContents]);

  const atDirectories: MentionItem[] = useMemo(() => {
    return atFolderContents.filter(item => item.isFolder);
  }, [atFolderContents]);

  // Get filtered @ mention items for keyboard nav
  const filteredAtItems = useMemo(() => {
    if (!atFilter || atFilter.endsWith(':')) return atFolderContents.slice(0, 20);
    const term = atFilter.replace(/^\w+:/, '').toLowerCase();
    return atFolderContents.filter(item =>
      item.name.toLowerCase().includes(term) ||
      item.path?.toLowerCase().includes(term)
    ).slice(0, 20);
  }, [atFilter, atFolderContents]);

  // Get filtered commands for keyboard nav
  const filteredSlashCommands = useMemo(() => {
    if (!slashFilter) return SLASH_COMMANDS;
    const searchTerm = slashFilter.toLowerCase();
    return SLASH_COMMANDS.filter(
      cmd =>
        cmd.name.toLowerCase().includes(searchTerm) ||
        cmd.description.toLowerCase().includes(searchTerm)
    );
  }, [slashFilter]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash menu navigation
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashHighlightIndex(prev =>
          prev < filteredSlashCommands.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashHighlightIndex(prev =>
          prev > 0 ? prev - 1 : filteredSlashCommands.length - 1
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredSlashCommands[slashHighlightIndex]) {
          handleSlashCommandSelect(filteredSlashCommands[slashHighlightIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }

    // @ mention menu navigation
    if (showAtMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAtHighlightIndex(prev =>
          prev < filteredAtItems.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAtHighlightIndex(prev =>
          prev > 0 ? prev - 1 : filteredAtItems.length - 1
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredAtItems[atHighlightIndex]) {
          handleAtMentionSelect(filteredAtItems[atHighlightIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAtMenu(false);
        return;
      }
    }

    // Ctrl+Enter - Send message
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
      return;
    }

    // Escape - Cancel streaming or clear input
    if (e.key === 'Escape') {
      if (isStreaming) {
        cancelStreaming();
      } else {
        setInput('');
      }
      return;
    }

    // Ctrl+L - Clear chat history
    if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      clearHistory();
      return;
    }

    // Ctrl+/ - Toggle context inclusion
    if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setIncludeContext(!includeContext);
      return;
    }

    // Up Arrow in empty input - Recall last user message
    if (e.key === 'ArrowUp' && !input.trim()) {
      e.preventDefault();
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMessage) {
        setInput(lastUserMessage.content);
      }
      return;
    }
  };

  // ============================================================================
  // Voice Input - Uses Python voice_input.py via IPC (same system as tray_companion)
  // This replaces the broken Web MediaRecorder + Whisper approach
  // ============================================================================

  // Handle microphone button click - uses Python speech recognition
  const handleMicClick = useCallback(async () => {
    if (isRecording) {
      // Stop listening
      try {
        await (window as any).electronAPI?.speech?.stop?.();
        setIsRecording(false);
      } catch (err) {
        console.error('[VoiceInput] Error stopping:', err);
        setIsRecording(false);
      }
    } else {
      // Start listening
      setVoiceError(null);
      try {
        const result = await (window as any).electronAPI?.speech?.start?.();
        if (result?.success) {
          setIsRecording(true);
        } else {
          setVoiceError(result?.error || 'Failed to start voice input');
        }
      } catch (err) {
        console.error('[VoiceInput] Error starting:', err);
        setVoiceError(err instanceof Error ? err.message : 'Failed to start');
      }
    }
  }, [isRecording]);

  // Set up speech event listeners - put transcript in input field (don't auto-send)
  useEffect(() => {
    const api = (window as any).electronAPI?.speech;
    if (!api) return;

    // Handle transcript - put in input field, user can review before sending
    const unsubTranscript = api.onTranscript?.((text: string) => {
      console.log('[VoiceInput] Received transcript:', text);
      if (text && text.trim()) {
        setInput(prev => prev ? `${prev} ${text.trim()}` : text.trim());
      }
      // Stop Python speech process after receiving transcript (single-phrase mode)
      api.stop?.();
      setIsRecording(false);
      setIsTranscribing(false);
    });

    // Handle status changes
    const unsubStatus = api.onStatus?.((status: string) => {
      console.log('[VoiceInput] Status:', status);
      if (status === 'started') {
        setIsRecording(true);
        setVoiceError(null);
      } else if (status.startsWith('error')) {
        setVoiceError(status);
        setIsRecording(false);
      }
    });

    // Handle errors
    const unsubError = api.onError?.((err: string) => {
      console.error('[VoiceInput] Error:', err);
      setVoiceError(err);
      setIsRecording(false);
    });

    return () => {
      // Cleanup listeners
      unsubTranscript?.();
      unsubStatus?.();
      unsubError?.();
      // Stop speech if active
      api.stop?.();
      // Stop TTS if playing
      stop();
    };
  }, [stop]); // setInput is stable from useState

  // Panel mode: respect isPanelOpen state
  if (!isFullscreen && !isPanelOpen) return null;

  // Mutual exclusion: show blocked message if another view has the chat open
  if (isBlocked) {
    const otherView = isFullscreen ? 'Code Editor' : 'Insights';

    // Force bring the chat to this view
    const handleBringToFront = () => {
      chatLock.forceClear();
      const success = chatLock.acquire(viewType);
      if (success) {
        setIsBlocked(false);
      }
    };

    return (
      <div className="flex items-center justify-center h-full bg-card/50 text-muted-foreground p-8">
        <div className="text-center space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-yellow-500" />
          <p className="text-sm">
            Chat is currently open in <span className="font-medium text-foreground">{otherView}</span>.
          </p>
          <button
            onClick={handleBringToFront}
            className="px-4 py-2 text-xs font-medium bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-md transition-colors"
          >
            Bring to Front
          </button>
          <p className="text-xs text-muted-foreground/70">
            This will close the chat in {otherView}
          </p>
        </div>
      </div>
    );
  }

  // Calculate width based on mode
  const totalWidth = isFullscreen
    ? '100%'
    : showConversationList
      ? panelWidth + 192
      : panelWidth;

  // Container classes based on mode
  const containerClasses = isFullscreen
    ? 'flex h-full w-full bg-card/50 overflow-hidden'
    : `relative flex h-full border-l border-border bg-card/50 overflow-hidden ${isResizing ? 'select-none' : ''}`;

  return (
    <div
      className={containerClasses}
      style={isFullscreen ? undefined : { width: totalWidth, maxWidth: '50vw' }}
    >
      {/* Sidebar - Conversations or File Explorer (fullscreen only) */}
      {(showSidebar || showConversationList) && (
        <div className="flex flex-col h-full border-r" style={{ width: '192px', borderColor: 'var(--cp-border-default)', backgroundColor: 'var(--cp-bg-secondary)' }}>
          {/* Sidebar view toggle - only in fullscreen mode */}
          {isFullscreen && (
            <div className="sidebar-view-toggle">
              <button
                onClick={() => setSidebarView('conversations')}
                className={sidebarView === 'conversations' ? 'active' : ''}
                title="Conversations"
              >
                <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />
                Chats
              </button>
              <button
                onClick={() => setSidebarView('files')}
                className={sidebarView === 'files' ? 'active' : ''}
                title="File Explorer"
              >
                <FolderTree className="w-3.5 h-3.5 inline mr-1.5" />
                Files
              </button>
{/* NOTE: Terminal tab hidden for public release - PTY integration not fully functional */}
              {/* <button
                onClick={() => setSidebarView('terminal')}
                className={sidebarView === 'terminal' ? 'active' : ''}
                title="Terminal - Raw PTY Output"
              >
                <TerminalSquare className="w-3.5 h-3.5 inline mr-1.5" />
                Terminal
              </button> */}
            </div>
          )}

          {/* Sidebar content */}
          {sidebarView === 'conversations' || !isFullscreen ? (
            <ConversationList />
          ) : sidebarView === 'files' ? (
            <FileExplorerPanel
              projectRoot={projectRoot}
              onFileSelect={(filePath) => {
                // Insert @filepath into the input
                const newInput = input.trim() ? `${input} @${filePath} ` : `@${filePath} `;
                setInput(newInput);
                inputRef.current?.focus();
              }}
            />
          ) : null}
          {/* NOTE: Terminal panel hidden for public release - PTY integration not fully functional
          ) : sidebarView === 'terminal' ? (
            <InsightsTerminalPanel
              ptySessionId={ptySessionId}
              onPtyReady={handlePtyReady}
              cwd={projectRoot}
            />
          ) : null}
          */}
        </div>
      )}

      {/* Main chat panel - Copilot themed */}
      <div className="copilot-panel flex-1 flex flex-col overflow-hidden relative">
        {/* Resize handle on left edge (panel mode only) */}
        {!isFullscreen && (
          <ResizeHandle onResize={handleResize} isResizing={isResizing} setIsResizing={setIsResizing} />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--cp-border-default)', backgroundColor: 'var(--cp-bg-secondary)' }}>
          <div className="flex items-center gap-2">
            <img src={kuroryuuIcon} alt="" className="w-5 h-5 rounded-full object-cover cp-dragon-glow" />
            <span className="text-sm font-medium" style={{ color: 'var(--cp-text-bright)' }}>
              {isFullscreen ? 'Kuroryuu' : 'Kuroryuu'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Conversation history toggle */}
            <button
              onClick={() => isFullscreen ? setShowSidebar(!showSidebar) : toggleConversationList()}
              className={`p-1.5 rounded-md transition-colors ${
                (isFullscreen ? showSidebar : showConversationList)
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title="Chat history"
            >
              <History className="w-3.5 h-3.5" />
            </button>
            {/* Tools indicator */}
            {availableTools.length > 0 && (
              <button
                className="p-1.5 rounded-md transition-colors hover:bg-muted"
                title={`${availableTools.length} MCP tools available`}
              >
                <Wrench className="w-3.5 h-3.5 text-green-500" />
              </button>
            )}
            {toolsLoading && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            )}
            {/* New chat button */}
            <button
              onClick={() => createNewConversation()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="New chat"
            >
              <PlusCircle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              title="Reconnect"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={clearHistory}
              disabled={messages.length === 0}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              title="Clear history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {/* Close button (panel mode) or hide (fullscreen can use sidebar toggle) */}
            {!isFullscreen && (
              <button
                onClick={onClose || togglePanel}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Close panel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Token usage - moved up, no provider bar */}
        <TokenUsageBar />

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--cp-bg-primary)' }}>
          {messages.length === 0 ? (
            <EmptyState
              onSuggestionClick={(suggestion) => {
                setInput(suggestion);
                inputRef.current?.focus();
              }}
            />
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--cp-border-default)' }}>
              {messages
                .filter(msg => !msg.isStreaming) // Skip streaming message - handled below
                .map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onApplyCode={activeFile ? handleApplyCode : undefined}
                  onSpeak={speak}
                  onStopSpeaking={stop}
                  isSpeaking={speakingMessageId === msg.id}
                  showRichCards={enableRichToolVisualizations}
                />
              ))}

              {/* Show streaming message with progressive tool calls & rich cards */}
              {isStreaming && (() => {
                const streamingMsg = messages.find(m => m.isStreaming);
                return (
                  <StreamingMessageBubble
                    content={streamingContent}
                    toolCalls={streamingMsg?.toolCalls}
                    richCards={streamingMsg?.richCards}
                    showRichCards={enableRichToolVisualizations}
                  />
                );
              })()}
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Context display (panel mode) */}
        {!isFullscreen && <ContextSelector />}

        {/* Input area - Copilot styled */}
        <div className="p-4" style={{ borderTop: '1px solid var(--cp-border-default)', backgroundColor: 'var(--cp-bg-secondary)' }}>
          <div className="cp-input-container">
            {/* Recording Banner / Error Display */}
            <AnimatePresence>
              {isRecording && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="cp-recording-banner"
                >
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="cp-recording-dot"
                  />
                  <span className="cp-recording-text">Listening... Speak now</span>
                </motion.div>
              )}
              {voiceError && !isRecording && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-3 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20"
                >
                  Voice error: {voiceError}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main Input Area */}
            <div className="flex items-end gap-2 p-3">
              {/* Textarea with slash command menu */}
              <div className="flex-1 relative">
                {/* Slash Command Menu */}
                <SlashCommandMenu
                  isOpen={showSlashMenu}
                  filter={slashFilter}
                  onSelect={handleSlashCommandSelect}
                  onClose={() => setShowSlashMenu(false)}
                  highlightedIndex={slashHighlightIndex}
                  setHighlightedIndex={setSlashHighlightIndex}
                />
                <AtMentionPicker
                  isOpen={showAtMenu}
                  filter={atFilter}
                  onSelect={handleAtMentionSelect}
                  onClose={() => setShowAtMenu(false)}
                  onFilterChange={setAtFilter}
                  highlightedIndex={atHighlightIndex}
                  setHighlightedIndex={setAtHighlightIndex}
                  files={atFiles}
                  directories={atDirectories}
                  currentFolder={atCurrentFolder}
                  onFolderNavigate={handleAtFolderNavigate}
                  folderContents={atFolderContents}
                />
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isTranscribing
                      ? 'Transcribing & sending...'
                      : isRecording
                        ? 'Listening... (auto-sends when you stop speaking)'
                        : isConnected
                          ? 'Ask Kuroryuu anything...'
                          : 'Connecting...'
                  }
                  disabled={!isConnected || isSending || isTranscribing}
                  rows={1}
                  className="cp-input-textarea w-full"
                  style={{ maxHeight: '200px' }}
                />
              </div>

              {/* Right Controls */}
              <div className="flex items-center gap-1">
                {/* Microphone */}
                <motion.button
                  onClick={handleMicClick}
                  disabled={!isConnected || isSending || isTranscribing}
                  whileTap={{ scale: 0.95 }}
                  className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isRecording
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : ''
                  }`}
                  style={!isRecording ? { color: 'var(--cp-text-muted)' } : undefined}
                  title={isRecording ? 'Stop recording' : 'Voice input'}
                >
                  {isTranscribing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </motion.button>

                {/* Send/Stop Button */}
                {isStreaming ? (
                  <motion.button
                    onClick={cancelStreaming}
                    whileTap={{ scale: 0.95 }}
                    className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    title="Stop generating"
                  >
                    <Square className="w-5 h-5 fill-current" />
                  </motion.button>
                ) : (
                  <motion.button
                    onClick={handleSend}
                    disabled={!isConnected || isSending || !input.trim() || isRecording}
                    whileTap={{ scale: 0.95 }}
                    className={`p-2 rounded-lg transition-colors ${
                      input.trim() && !isSending && isConnected && !isRecording
                        ? 'cp-btn-primary'
                        : 'cursor-not-allowed'
                    }`}
                    style={!(input.trim() && !isSending && isConnected && !isRecording) ? { color: 'var(--cp-text-muted)' } : undefined}
                    title="Send message"
                  >
                    {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </motion.button>
                )}
              </div>
            </div>

            {/* Bottom bar - Provider/Model left, Mic/Send right (Copilot style) */}
            <div className="px-3 pb-2 flex items-center justify-between">
              {/* Left: Provider + Model selector */}
              <div className="flex items-center gap-1">
                {/* Provider dropdown */}
                <div className="relative group">
                  <button
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-muted/50 transition-colors"
                    style={{ color: currentProviderInfo?.color || 'var(--cp-text-muted)' }}
                    title="Provider"
                  >
                    {isConnecting || isLoadingModels ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isProviderHealthy ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-red-500" />
                    )}
                    <span className="font-medium">{currentProviderInfo?.name || 'Provider'}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                {/* Model selector */}
                <ModelSelector
                  models={modelsForCurrentProvider}
                  selectedModelId={domainConfig.modelId || selectedModel}
                  selectedProvider={domainConfig.provider}
                  onModelSelect={handleModelChange}
                  disabled={isLoadingModels}
                  showToolsOnly={availableTools.length > 0}
                />

                {/* Tools indicator */}
                {availableTools.length > 0 && (
                  <button
                    className="p-1 rounded text-green-500 hover:bg-muted/50 transition-colors"
                    title={`${availableTools.length} MCP tools available${!currentModelSupportsTools ? ' (model may not support tools)' : ''}`}
                  >
                    <Wrench className={`w-3.5 h-3.5 ${!currentModelSupportsTools ? 'opacity-50' : ''}`} />
                  </button>
                )}
              </div>

              {/* Right: Kuroryuu branding */}
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--cp-text-muted)' }}>
                <span className="hidden sm:inline">
                  <span className="cp-kbd">Ctrl+Enter</span>
                </span>
                <img src={kuroryuuIcon} alt="" className="w-4 h-4 rounded-sm object-cover" style={{ filter: 'drop-shadow(0 0 4px rgba(201, 162, 39, 0.4))' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default KuroryuuDesktopAssistantPanel;
