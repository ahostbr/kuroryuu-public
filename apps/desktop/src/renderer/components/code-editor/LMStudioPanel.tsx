/**
 * @deprecated Use Kuroryuu_Desktop_Assistant_Panel.tsx instead.
 * This file is kept for backwards compatibility but will be removed.
 *
 * LMStudioPanel - AI Chat Panel for Code Editor (DEPRECATED)
 *
 * Collapsible right-side panel that connects to LM Studio
 * via Gateway for AI-assisted coding conversations.
 *
 * Uses Copilot-style dark theme for the AI chat interface.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLMStudioChatStore, type ChatMessage, type ToolCallData } from '../../stores/lmstudio-chat-store';
import { useCodeEditorStore } from '../../stores/code-editor-store';
import { useDomainConfigStore } from '../../stores/domain-config-store';
import { PROVIDERS, type LLMProvider } from '../../types/domain-config';
import { modelSupportsTools } from '../../services/model-registry';
import {
  Send,
  Trash2,
  RefreshCw,
  X,
  FileCode,
  ChevronDown,
  ChevronRight,
  User,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Mic,
  Square,
  Wrench,
  History,
  PlusCircle,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolCallCard } from './ToolCallCard';
import { ConversationList } from './ConversationList';
import { ContextSelector } from './ContextSelector';
import { EmptyState } from './EmptyState';
import { ModelSelector } from './ModelSelector';
import { toast } from '../ui/toaster';

// Import Copilot theme CSS
import './copilot-theme.css';

// Individual message component - Copilot style
function MessageBubble({
  message,
  onApplyCode,
}: {
  message: ChatMessage;
  onApplyCode?: (code: string, language: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isError = message.role === 'assistant' && message.content.startsWith('Error:');
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Tool message - special styling
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
              <User className="w-4 h-4" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 cp-msg-content">
            {/* Header */}
            <div className="cp-msg-header">
              <span className="cp-msg-name">{isUser ? 'You' : 'Kuroryuu'}</span>
              <span className="cp-msg-time">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {message.contextIncluded && (
                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--cp-accent-blue)' }}>
                  <FileCode className="w-3 h-3" /> +context
                </span>
              )}
            </div>

            {/* Message Body */}
            <div className={`cp-prose ${isError ? 'text-red-400' : ''}`}>
              {message.content && (
                <MarkdownRenderer
                  content={message.content}
                  onApplyCode={!isUser ? onApplyCode : undefined}
                />
              )}
            </div>

            {/* Tool calls if present with content */}
            {hasToolCalls && message.content && (
              <div className="space-y-2 mt-3">
                {message.toolCalls!.map((tc) => (
                  <ToolCallCard key={tc.id} toolCall={tc} compact={true} />
                ))}
              </div>
            )}

            {/* Copy button (hover reveal) */}
            {!isUser && message.content && (
              <div className="mt-2">
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
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Token usage bar
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

// Streaming message bubble - Copilot style with purple dots
function StreamingMessageBubble({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-4 py-3"
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-3">
          {/* Avatar - purple for AI */}
          <div className="cp-avatar cp-avatar-ai">
            <Sparkles className="w-4 h-4" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="cp-msg-header">
              <span className="cp-msg-name">Kuroryuu</span>
            </div>

            {/* Message Body */}
            <div className="cp-prose">
              {content ? (
                <>
                  <MarkdownRenderer content={content} />
                  {/* Typing cursor - purple */}
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

// Resize handle component
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

// Main panel component
export function LMStudioPanel() {
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

  // Code editor store for applying code suggestions
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

  // Voice recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Audio monitoring refs for silence detection
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const maxRecordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Silence detection constants
  const SILENCE_THRESHOLD = 5;      // Audio level below this = silence
  const SILENCE_TIMEOUT_MS = 400;   // 400ms of silence triggers stop
  const MAX_RECORDING_MS = 8000;    // 8 second max recording

  // Handle resize
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
    if (isPanelOpen) {
      handleConnect();
      // Load available models for all providers and MCP tools
      setIsLoadingModels(true);
      Promise.all([fetchAvailableModels(), checkProviderHealth(), loadTools()])
        .finally(() => setIsLoadingModels(false));
    }
  }, [isPanelOpen]);

  // Focus input when panel opens
  useEffect(() => {
    if (isPanelOpen) {
      inputRef.current?.focus();
    }
  }, [isPanelOpen]);

  const handleConnect = async () => {
    setIsConnecting(true);
    await testConnection();
    await checkProviderHealth();
    setIsConnecting(false);
  };

  // Handle provider change
  const handleProviderChange = (provider: LLMProvider) => {
    updateDomainConfig('code-editor', { provider });
    // Reset model when provider changes
    const modelsForProvider = domainModels.filter(m => m.provider === provider);
    if (modelsForProvider.length > 0) {
      updateDomainConfig('code-editor', { modelId: modelsForProvider[0].id, modelName: modelsForProvider[0].name });
      setModel(modelsForProvider[0].id);
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

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  // Stop recording and process audio
  const stopRecording = useCallback(async () => {
    // Clean up audio monitoring
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (maxRecordingTimeoutRef.current) {
      clearTimeout(maxRecordingTimeoutRef.current);
      maxRecordingTimeoutRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.addEventListener(
        'stop',
        async () => {
          try {
            setIsTranscribing(true);

            // Create audio blob
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

            // Skip if no audio data
            if (audioBlob.size < 1000) {
              audioChunksRef.current = [];
              mediaRecorderRef.current = null;
              setIsRecording(false);
              setIsTranscribing(false);
              return;
            }

            // Convert blob to ArrayBuffer for IPC transfer
            const arrayBuffer = await audioBlob.arrayBuffer();

            // Call Whisper transcription via IPC
            const result = await (window as any).electronAPI?.audio?.transcribe(
              Array.from(new Uint8Array(arrayBuffer)),
              'audio/webm',
              'whisper'
            );

            if (result?.success && result.transcription) {
              const text = result.transcription.trim();
              if (text) {
                // Auto-send directly to AI instead of putting in input box
                sendMessage(text);
              }
            }

            // Reset recording state
            audioChunksRef.current = [];
            mediaRecorderRef.current = null;
          } catch (error) {
            console.error('[VoiceInput] Error processing audio:', error);
          } finally {
            setIsRecording(false);
            setIsTranscribing(false);
          }
        },
        { once: true }
      );
    } else {
      setIsRecording(false);
    }
  }, [sendMessage]);

  // Monitor audio levels for silence detection
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average level (0-100)
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const level = Math.min(100, (avg / 255) * 100);
    setAudioLevel(level);

    // Silence detection
    if (level < SILENCE_THRESHOLD) {
      // Start silence timeout if not already running
      if (!silenceTimeoutRef.current) {
        silenceTimeoutRef.current = setTimeout(() => {
          stopRecording(); // Auto-stop when silence detected
        }, SILENCE_TIMEOUT_MS);
      }
    } else {
      // Voice detected - clear silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
    }

    // Continue monitoring
    animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
  }, [stopRecording, SILENCE_THRESHOLD, SILENCE_TIMEOUT_MS]);

  // Handle microphone button click
  const handleMicClick = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      await stopRecording();
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        streamRef.current = stream;
        audioChunksRef.current = [];

        // Set up audio analysis for silence detection
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100); // Collect data every 100ms
        setIsRecording(true);

        // Start monitoring audio levels for silence detection
        monitorAudioLevel();

        // Set max recording timeout (8 seconds)
        maxRecordingTimeoutRef.current = setTimeout(() => {
          stopRecording();
        }, MAX_RECORDING_MS);
      } catch (error) {
        console.error('[VoiceInput] Error starting recording:', error);
        // Handle permission denied or no mic available
        if (error instanceof DOMException) {
          if (error.name === 'NotAllowedError') {
            alert('Microphone permission denied. Please allow microphone access.');
          } else if (error.name === 'NotFoundError') {
            alert('No microphone found. Please connect a microphone.');
          }
        }
      }
    }
  }, [isRecording, stopRecording, monitorAudioLevel, MAX_RECORDING_MS]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up audio monitoring
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (maxRecordingTimeoutRef.current) {
        clearTimeout(maxRecordingTimeoutRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      // Clean up media streams
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore errors during cleanup
        }
      }
    };
  }, []);

  if (!isPanelOpen) return null;

  // Calculate total width including conversation list
  const totalWidth = showConversationList ? panelWidth + 192 : panelWidth;

  return (
    <div
      className={`relative flex h-full border-l border-border bg-card/50 overflow-hidden ${
        isResizing ? 'select-none' : ''
      }`}
      style={{ width: totalWidth, maxWidth: '50vw' }}
    >
      {/* Conversation list sidebar */}
      <ConversationList />

      {/* Main chat panel - Copilot themed */}
      <div className="copilot-panel flex-1 flex flex-col overflow-hidden relative">
        {/* Resize handle on left edge */}
        <ResizeHandle onResize={handleResize} isResizing={isResizing} setIsResizing={setIsResizing} />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--cp-border-default)', backgroundColor: 'var(--cp-bg-secondary)' }}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: 'var(--cp-accent-purple)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--cp-text-bright)' }}>AI Chat</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Conversation history toggle */}
          <button
            onClick={toggleConversationList}
            className={`p-1.5 rounded-md transition-colors ${
              showConversationList
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
          <button
            onClick={togglePanel}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Provider and model selection */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs">
        {/* Provider indicator */}
        <div className="flex items-center gap-1.5">
          {isConnecting || isLoadingModels ? (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          ) : isProviderHealthy ? (
            <CheckCircle2 className="w-3 h-3" style={{ color: currentProviderInfo?.color || 'green' }} />
          ) : (
            <AlertCircle className="w-3 h-3 text-red-500" />
          )}
          <span className="text-xs font-medium" style={{ color: currentProviderInfo?.color }}>
            {currentProviderInfo?.name || 'Provider'}
          </span>
        </div>

        {/* Model selector - new grouped dropdown */}
        <ModelSelector
          models={domainModels}
          selectedModelId={domainConfig.modelId || selectedModel}
          selectedProvider={domainConfig.provider}
          onModelSelect={handleModelChange}
          disabled={isLoadingModels}
          showToolsOnly={availableTools.length > 0}
        />

        {/* Warning for non-tool model */}
        {availableTools.length > 0 && !currentModelSupportsTools && (
          <span className="text-xs text-yellow-500 flex items-center gap-0.5" title="This model doesn't support tools">
            <AlertCircle className="w-3 h-3" />
          </span>
        )}
      </div>

      {/* Token usage */}
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
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onApplyCode={activeFile ? handleApplyCode : undefined}
              />
            ))}

            {/* Show streaming message while receiving */}
            {isStreaming && <StreamingMessageBubble content={streamingContent} />}
          </div>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Context display */}
      <ContextSelector />

      {/* Input area - Copilot styled */}
      <div className="p-4" style={{ borderTop: '1px solid var(--cp-border-default)', backgroundColor: 'var(--cp-bg-secondary)' }}>
        <div className="cp-input-container">
          {/* Recording Banner */}
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
          </AnimatePresence>

          {/* Main Input Area */}
          <div className="flex items-end gap-2 p-3">
            {/* Textarea */}
            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isTranscribing
                    ? 'Transcribing & sending...'
                    : isRecording
                      ? 'Listening... (auto-sends when you stop speaking)'
                      : isConnected
                        ? 'Ask Kuroryuu anything...'
                        : 'Connect to LM Studio first...'
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

          {/* Keyboard hints footer */}
          <div className="px-4 pb-2 flex items-center justify-between text-xs" style={{ color: 'var(--cp-text-muted)' }}>
            <div className="flex items-center gap-4">
              <span>
                <span className="cp-kbd">Ctrl+Enter</span> send
              </span>
              <span>
                <span className="cp-kbd">Esc</span> stop
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-3 h-3" style={{ color: 'var(--cp-accent-yellow)' }} />
              <span>Kuroryuu</span>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

export default LMStudioPanel;
