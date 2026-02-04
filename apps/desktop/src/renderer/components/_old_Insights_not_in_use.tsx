/**
 * @deprecated Use KuroryuuDesktopAssistantPanel with mode="fullscreen" instead.
 * This file is kept for backwards compatibility but will be removed.
 *
 * Insights Chat Screen (DEPRECATED)
 *
 * AI chat interface with:
 * - Session history sidebar
 * - Message bubbles with markdown rendering
 * - Tool call badges
 * - Model selector dropdown
 * - Streaming responses
 * - Direct Mode toggle (M1: bypasses harness/inbox)
 * - TTS controls (speak/stop via IPC to main process)
 * - Connection health indicator
 * - Stop generation / Retry support
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  User,
  Bot,
  CheckCircle2,
  AlertCircle,
  Search,
  FileText,
  FolderSearch,
  Plus,
  Trash2,
  ChevronDown,
  ChevronLeft,
  Clock,
  Wrench,
  Zap,
  Volume2,
  VolumeX,
  Copy,
  RotateCcw,
  StopCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  Check,
  Mic,
  MicOff,
  Activity,
  Info,
  AlertTriangle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useInsightsStore } from '../stores/insights-store';
import { useDomainConfigStore } from '../stores/domain-config-store';
import { getModelDisplayName, groupModelsByFamily, MODEL_FAMILY_LABELS, PROVIDERS, type ModelInfo, type LLMProvider } from '../types/domain-config';
import type { InsightsMessage, InsightsModel, ToolCall, InsightsSession, RichCard } from '../types/insights';
import { getInsightsModelName } from '../types/insights';
import { getModelFamily } from '../services/model-registry';
import { useSettingsStore } from '../stores/settings-store';
import { RichCardRenderer } from './insights/RichCardRenderer';
import { parseToolResultToRichCard } from '../utils/rich-card-parsers';

// ============================================================================
// TTS Hook - Uses Desktop main process TTS
// ============================================================================
function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const speak = useCallback(async (text: string) => {
    try {
      setIsSpeaking(true);
      // Use the TTS IPC handlers registered in Desktop main process
      // Note: TTS handlers return { ok: boolean, error?: string } pattern
      const result = await window.electronAPI?.tts?.speak?.({ text });
      if (result && !result.success) {
        console.error('TTS error:', result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('TTS speak failed:', error);
    } finally {
      setIsSpeaking(false);
    }
  }, []);
  
  const stop = useCallback(async () => {
    try {
      await window.electronAPI?.tts?.stop?.();
      setIsSpeaking(false);
    } catch (error) {
      console.error('TTS stop failed:', error);
    }
  }, []);
  
  return { speak, stop, isSpeaking };
}

// ============================================================================
// Voice Input Hook - Uses Python SpeechRecognition via IPC (not Web Speech API)
// ============================================================================
function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
  
  // Set up event listeners on mount
  useEffect(() => {
    // Listen for transcripts from main process
    const unsubTranscript = window.electronAPI?.speech?.onTranscript?.((text: string) => {
      onTranscript(text);
      // Auto-stop after getting a transcript
      setIsListening(false);
    });

    // Listen for status updates
    const unsubStatus = window.electronAPI?.speech?.onStatus?.((status: string) => {
      if (status === 'started') {
        setIsListening(true);
        setError(null);
      } else if (status.startsWith('error')) {
        setError(status);
        setIsListening(false);
      }
    });

    // Listen for errors
    const unsubError = window.electronAPI?.speech?.onError?.((err: string) => {
      setError(err);
      setIsListening(false);
    });

    cleanupRef.current = [unsubTranscript, unsubStatus, unsubError].filter(Boolean) as (() => void)[];

    return () => {
      cleanupRef.current.forEach(unsub => unsub?.());
    };
  }, [onTranscript]);
  
  const startListening = useCallback(async () => {
    setError(null);

    try {
      const result = await window.electronAPI?.speech?.start?.();
      
      if (result?.success) {
        setIsListening(true);
      } else {
        setError(result?.error || 'Failed to start speech recognition');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to start recognition';
      console.error('[VoiceInput] Exception:', errMsg);
      setError(errMsg);
    }
  }, []);
  
  const stopListening = useCallback(async () => {
    try {
      await window.electronAPI?.speech?.stop?.();
    } catch {
      // Ignore stop errors
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);
  
  return { isListening, error, toggleListening, startListening, stopListening };
}

// ============================================================================
// Gateway Health Hook - with latency tracking
// ============================================================================
function useGatewayHealth() {
  const [isOnline, setIsOnline] = useState(true);
  const [lastCheck, setLastCheck] = useState<number>(Date.now());
  const [latency, setLatency] = useState<number | undefined>(undefined);

  const checkHealth = useCallback(async () => {
    const startTime = performance.now();
    try {
      const result = await window.electronAPI?.gateway?.health?.();
      const endTime = performance.now();
      const measuredLatency = Math.round(endTime - startTime);

      setIsOnline(result?.ok ?? false);
      setLatency(result?.ok ? measuredLatency : undefined);
      setLastCheck(Date.now());
      return result?.ok ?? false;
    } catch {
      setIsOnline(false);
      setLatency(undefined);
      setLastCheck(Date.now());
      return false;
    }
  }, []);

  // Check on mount and periodically
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Every 30s
    return () => clearInterval(interval);
  }, [checkHealth]);

  return { isOnline, lastCheck, latency, checkHealth };
}

// ============================================================================
// CLIProxy Authenticated Providers Hook - fetches which provider families have OAuth tokens
// ============================================================================
function useCLIProxyAuthProviders() {
  const [authProviders, setAuthProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAuthProviders = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch available models from CLIProxyAPI to see which providers are authenticated
      const response = await fetch('http://127.0.0.1:8317/v1/models', {
        headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        setAuthProviders([]);
        return;
      }

      const data = await response.json();
      const providers = new Set<string>();

      // Extract provider families from available models
      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((model: { id: string }) => {
          const family = getModelFamily(model.id);
          if (family !== 'other') {
            providers.add(family);
          }
        });
      }

      setAuthProviders(Array.from(providers));
    } catch {
      setAuthProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchAuthProviders();
  }, [fetchAuthProviders]);

  return { authProviders, loading, refresh: fetchAuthProviders };
}

// ============================================================================
// ChatHistorySidebar - Collapsible session list with dates and delete buttons
// ============================================================================
interface ChatHistorySidebarProps {
  sessions: InsightsSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
}

function ChatHistorySidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: ChatHistorySidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Group sessions by date
  const groupedSessions = sessions.reduce((groups, session) => {
    const date = new Date(session.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label: string;
    if (date.toDateString() === today.toDateString()) {
      label = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = 'Yesterday';
    } else if (date > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
      label = 'This Week';
    } else {
      label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(session);
    return groups;
  }, {} as Record<string, InsightsSession[]>);

  return (
    <div className={`${isCollapsed ? 'w-14' : 'w-64'} h-full flex flex-col bg-card/80 backdrop-blur-sm border-r border-border/50 transition-all duration-300 ease-out`}>
      {/* Collapse Toggle + New Chat */}
      <div className="p-2 border-b border-border/50">
        <div className="flex items-center gap-1">
          {/* Collapse toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-zinc-800/50 transition-all"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} />
          </button>

          {/* New Chat Button - full or icon only */}
          {isCollapsed ? (
            <button
              onClick={onNewSession}
              className="p-2 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 hover:from-amber-500/30 hover:to-orange-500/30 transition-all"
              title="New Chat"
            >
              <Plus className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onNewSession}
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-400 hover:from-amber-500/20 hover:to-orange-500/20 border border-amber-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">New Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Session List - Hidden when collapsed, shows count badge instead */}
      {isCollapsed ? (
        <div className="flex-1 flex flex-col items-center py-4 gap-2">
          {/* Session count badge */}
          {sessions.length > 0 && (
            <div
              className="w-8 h-8 rounded-lg bg-zinc-800/50 flex items-center justify-center text-xs text-muted-foreground border border-border/30"
              title={`${sessions.length} conversation${sessions.length !== 1 ? 's' : ''}`}
            >
              {sessions.length}
            </div>
          )}
          {/* Recent session indicators */}
          {sessions.slice(0, 5).map((session, idx) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                session.id === activeSessionId
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-zinc-800/30 text-muted-foreground hover:bg-zinc-800/50 hover:text-foreground border border-transparent'
              }`}
              title={session.title}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {Object.entries(groupedSessions).map(([label, groupSessions]) => (
            <div key={label}>
              <div className="px-2 py-1.5 text-[10px] text-muted-foreground/70 font-semibold uppercase tracking-wider">
                {label}
              </div>
              <div className="space-y-0.5">
                {groupSessions.map(session => (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className={`w-full group flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer ${
                      session.id === activeSessionId
                        ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-foreground border-l-2 border-amber-500'
                        : 'text-muted-foreground hover:bg-zinc-800/50 hover:text-foreground border-l-2 border-transparent'
                    }`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectSession(session.id)}
                  >
                    <MessageSquare className={`w-4 h-4 flex-shrink-0 ${session.id === activeSessionId ? 'text-amber-400' : ''}`} />
                    <span className="flex-1 text-sm truncate">{session.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {sessions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-zinc-800/50 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 opacity-50" />
              </div>
              <p className="text-sm font-medium">No conversations</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Start a new chat above</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// InsightsModelSelector - Model dropdown
// ============================================================================
interface ModelSelectorProps {
  value: InsightsModel;
  onChange: (model: InsightsModel) => void;
  disabled?: boolean;
}

function InsightsModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Get available models from domain config store
  const availableModels = useDomainConfigStore(state => state.availableModels);
  const fetchModels = useDomainConfigStore(state => state.fetchAvailableModels);
  const domainConfig = useDomainConfigStore(state => state.getConfigForDomain('code-editor'));

  // Fetch models on mount if not already loaded
  useEffect(() => {
    if (availableModels.length === 0) {
      fetchModels();
    }
  }, [availableModels.length, fetchModels]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter models for the current provider
  const providerModels = availableModels.filter(m => m.provider === domainConfig.provider);

  // Group models by family for better organization
  const groupedModels = groupModelsByFamily(providerModels);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
          disabled
            ? 'bg-secondary text-muted-foreground cursor-not-allowed'
            : 'bg-secondary text-foreground hover:bg-muted'
        }`}
      >
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="max-w-32 truncate">{getInsightsModelName(value)}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-64 max-h-96 overflow-y-auto bg-secondary border border-border rounded-lg shadow-xl z-50 py-1">
          {providerModels.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Loading models...
            </div>
          ) : (
            Array.from(groupedModels.entries()).map(([family, models]) => (
              <div key={family}>
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50">
                  {MODEL_FAMILY_LABELS[family]}
                </div>
                {models.map(model => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      model.id === value
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DirectModeToggle - M1: Toggle for bypassing harness/inbox
// ============================================================================
interface DirectModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

function DirectModeToggle({ enabled, onChange, disabled }: DirectModeToggleProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      title={enabled ? 'Direct Mode: ON - Bypassing harness/inbox' : 'Direct Mode: OFF - Using full orchestration'}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
        disabled
          ? 'bg-secondary text-muted-foreground cursor-not-allowed'
          : enabled
          ? 'bg-primary/20 text-primary hover:bg-primary/30'
          : 'bg-secondary text-muted-foreground hover:bg-muted'
      }`}
    >
      <Zap className={`w-4 h-4 ${enabled ? 'text-primary' : ''}`} />
      <span>Direct</span>
      <span className={`text-xs px-1.5 py-0.5 rounded ${
        enabled ? 'bg-primary/30 text-yellow-300' : 'bg-muted text-muted-foreground'
      }`}>
        {enabled ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

// ============================================================================
// MetadataToggle - Toggle to show response metadata (model, tokens, latency)
// ============================================================================
interface MetadataToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

function MetadataToggle({ enabled, onChange, disabled }: MetadataToggleProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      title={enabled ? 'Hide response metadata' : 'Show response metadata (model, tokens, latency)'}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
        disabled
          ? 'bg-secondary text-muted-foreground cursor-not-allowed'
          : enabled
          ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
          : 'bg-secondary text-muted-foreground hover:bg-muted'
      }`}
    >
      <Info className={`w-4 h-4 ${enabled ? 'text-cyan-400' : ''}`} />
      <span>Meta</span>
      <span className={`text-xs px-1.5 py-0.5 rounded ${
        enabled ? 'bg-cyan-500/30 text-cyan-300' : 'bg-muted text-muted-foreground'
      }`}>
        {enabled ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

// ============================================================================
// ConnectionIndicator - Enhanced gateway health with model/provider/latency
// ============================================================================
interface ConnectionIndicatorProps {
  isOnline: boolean;
  onRetry: () => void;
  model?: string;
  provider?: string;
  latency?: number;
}

function getShortModelName(model: string): string {
  // Convert long model IDs to readable short names
  if (model.includes('claude-opus')) return 'Opus';
  if (model.includes('claude-sonnet')) return 'Sonnet';
  if (model.includes('claude-haiku')) return 'Haiku';
  if (model.includes('gpt-4o')) return 'GPT-4o';
  if (model.includes('gpt-4')) return 'GPT-4';
  if (model.includes('gpt-3.5')) return 'GPT-3.5';
  if (model.includes('gemini-pro')) return 'Gemini Pro';
  if (model.includes('gemini')) return 'Gemini';
  if (model.includes('mistral')) return 'Mistral';
  if (model.includes('llama')) return 'Llama';
  if (model.includes('qwen')) return 'Qwen';
  // Fallback: take first part before dash or truncate
  const parts = model.split('-');
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

function getProviderLabel(provider: string): string {
  const labels: Record<string, string> = {
    'anthropic': 'Anthropic',
    'openai': 'OpenAI',
    'lmstudio': 'LM Studio',
    'ollama': 'Ollama',
    'openrouter': 'OpenRouter',
    'google': 'Google',
    'gateway-auto': 'Auto',
    'cliproxyapi': 'CLI Proxy',
    'CLIPROXYAPI': 'CLI Proxy',
  };
  return labels[provider] || provider;
}

function ConnectionIndicator({ isOnline, onRetry, model, provider, latency }: ConnectionIndicatorProps) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all cursor-pointer border ${
        isOnline
          ? 'bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-800/70 hover:border-zinc-600/50'
          : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
      }`}
      onClick={onRetry}
      title={isOnline ? 'Click to refresh connection status' : 'Gateway offline. Click to retry.'}
    >
      {isOnline ? (
        <>
          {/* Status indicator dot with pulse */}
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
          </div>

          {/* Provider + Model info */}
          {provider && model && (
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                {getProviderLabel(provider)}
              </span>
              <span className="text-xs text-foreground font-medium">
                {getShortModelName(model)}
              </span>
            </div>
          )}

          {/* Latency badge */}
          {latency !== undefined && latency > 0 && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-700/50 text-[10px] text-muted-foreground">
              <Activity className="w-2.5 h-2.5" />
              {latency}ms
            </div>
          )}

          {/* Refresh icon - subtle */}
          <RefreshCw className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4" />
          <span>Offline</span>
          <RefreshCw className="w-3 h-3 animate-pulse" />
        </>
      )}
    </div>
  );
}

// ============================================================================
// ProviderSelector - Dropdown to switch between providers
// ============================================================================
interface ProviderSelectorProps {
  provider: LLMProvider;
  onProviderChange: (provider: LLMProvider) => void;
  model?: string;
  latency?: number;
  disabled?: boolean;
}

function ProviderSelector({ provider, onProviderChange, model, latency, disabled }: ProviderSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Get provider health from store
  const providerHealth = useDomainConfigStore(state => state.providerHealth);
  const checkSingleProviderHealth = useDomainConfigStore(state => state.checkSingleProviderHealth);

  // Get authenticated providers for CLIProxyAPI
  const { authProviders } = useCLIProxyAuthProviders();

  // Check current provider health on mount
  useEffect(() => {
    checkSingleProviderHealth(provider);
  }, [provider, checkSingleProviderHealth]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentHealth = providerHealth[provider];
  const isHealthy = currentHealth?.healthy ?? false;

  // Check if selected model's family is authenticated (for CLIProxyAPI)
  const modelFamily = model ? getModelFamily(model) : null;
  const isModelAuthWarning = provider === 'cliproxyapi' &&
    modelFamily &&
    modelFamily !== 'other' &&
    authProviders.length > 0 &&
    !authProviders.includes(modelFamily);

  return (
    <div ref={ref} className="relative">
      {/* Trigger button - shows current provider with health + latency */}
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all border ${
          disabled
            ? 'bg-secondary text-muted-foreground cursor-not-allowed border-border'
            : isHealthy
            ? 'bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-800/70 hover:border-zinc-600/50'
            : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
        }`}
        title={
          isHealthy
            ? provider === 'cliproxyapi' && authProviders.length > 0
              ? `${getProviderLabel(provider)} - Authenticated: ${authProviders.join(', ')}`
              : `${getProviderLabel(provider)} - Click to change provider`
            : `${getProviderLabel(provider)} offline`
        }
      >
        {isHealthy ? (
          <>
            {/* Status indicator dot with pulse */}
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
            </div>

            {/* Provider + Model info */}
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                {getProviderLabel(provider)}
              </span>
              {model && (
                <span className="text-xs text-foreground font-medium">
                  {getShortModelName(model)}
                </span>
              )}
            </div>

            {/* Latency badge */}
            {latency !== undefined && latency > 0 && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-700/50 text-[10px] text-muted-foreground">
                <Activity className="w-2.5 h-2.5" />
                {latency}ms
              </div>
            )}

            {/* Auth warning - show if model family not authenticated */}
            {isModelAuthWarning && (
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400"
                title={`${modelFamily} may not be authenticated. Authenticated: ${authProviders.join(', ') || 'none'}`}
              >
                <AlertTriangle className="w-3 h-3" />
              </div>
            )}

            {/* Refresh icon */}
            <RefreshCw className={`w-3 h-3 text-muted-foreground/50 transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4" />
            <span>{getProviderLabel(provider)}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-secondary border border-border rounded-lg shadow-xl z-50 py-1 overflow-hidden">
          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50">
            Select Provider
          </div>
          {PROVIDERS.map(p => {
            const health = providerHealth[p.id];
            const isProviderHealthy = health?.healthy ?? false;
            const isSelected = p.id === provider;

            return (
              <button
                key={p.id}
                onClick={() => {
                  onProviderChange(p.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-3 ${
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                {/* Health indicator */}
                <div className="relative flex-shrink-0">
                  <div className={`w-2 h-2 rounded-full ${isProviderHealthy ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {isProviderHealthy && (
                    <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-50" />
                  )}
                </div>

                {/* Provider info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.description}</div>
                </div>

                {/* Selected check */}
                {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
            );
          })}

          {/* CLIProxyAPI authenticated providers info */}
          {authProviders.length > 0 && (
            <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground">
              <div className="flex items-center gap-1 mb-1">
                <Info className="w-3 h-3" />
                <span className="font-medium">CLI Proxy OAuth:</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {authProviders.map(p => (
                  <span key={p} className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ToolCallBadge - Shows tool usage status
// ============================================================================
interface ToolCallBadgeProps {
  toolCall: ToolCall;
}

function ToolCallBadge({ toolCall }: ToolCallBadgeProps) {
  const statusIcon = {
    running: <Loader2 className="w-3 h-3 animate-spin" />,
    success: <CheckCircle2 className="w-3 h-3 text-green-400" />,
    error: <AlertCircle className="w-3 h-3 text-red-400" />,
  }[toolCall.status];

  const toolIcon = {
    ripgrep: <Search className="w-3 h-3" />,
    read_file: <FileText className="w-3 h-3" />,
    search: <FolderSearch className="w-3 h-3" />,
  }[toolCall.name] || <Wrench className="w-3 h-3" />;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
      toolCall.status === 'running'
        ? 'bg-blue-500/10 text-blue-400'
        : toolCall.status === 'success'
        ? 'bg-green-500/10 text-green-400'
        : 'bg-red-500/10 text-red-400'
    }`}>
      {toolIcon}
      <span>{toolCall.name}</span>
      {statusIcon}
      {toolCall.duration && (
        <span className="text-muted-foreground">{toolCall.duration}ms</span>
      )}
    </div>
  );
}

// ============================================================================
// MessageBubble - User/Assistant message with markdown + actions
// ============================================================================
interface MessageBubbleProps {
  message: InsightsMessage;
  onSpeak?: (text: string) => void;
  onStopSpeaking?: () => void;
  onRetry?: () => void;
  isSpeaking?: boolean;
  canRetry?: boolean;
  showMetadata?: boolean;
  showRichCards?: boolean;
}

function MessageBubble({ message, onSpeak, onStopSpeaking, onRetry, isSpeaking, canRetry, showMetadata, showRichCards }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  const isPending = message.status === 'pending';
  const isError = message.status === 'error';
  const [copied, setCopied] = useState(false);
  const meta = message.metadata;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  // Markdown rendering with react-markdown
  const renderContent = (content: string) => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks with copy button
          pre: ({ children }) => {
            const codeContent = typeof children === 'object' && children !== null && 'props' in children
              ? String((children as React.ReactElement<{ children?: React.ReactNode }>).props?.children || '')
              : '';
            return (
              <pre className="my-2 p-3 bg-background rounded-lg overflow-x-auto relative group">
                {children}
                <button
                  onClick={() => navigator.clipboard.writeText(codeContent)}
                  className="absolute top-2 right-2 p-1.5 rounded bg-secondary text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Copy code"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </pre>
            );
          },
          // Code blocks and inline code
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !className;
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 bg-secondary rounded text-sm font-mono text-yellow-300" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <>
                {match && (
                  <div className="text-xs text-muted-foreground mb-2 font-mono">{match[1]}</div>
                )}
                <code className="text-sm font-mono text-foreground" {...props}>
                  {children}
                </code>
              </>
            );
          },
          // Styled paragraphs
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          // Lists
          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-foreground">{children}</li>,
          // Headings
          h1: ({ children }) => <h1 className="text-xl font-bold mb-2 text-foreground">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-bold mb-2 text-foreground">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-bold mb-2 text-foreground">{children}</h3>,
          // Links
          a: ({ href, children }) => (
            <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          // Tables (GFM)
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border border-border rounded">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-secondary">{children}</thead>,
          th: ({ children }) => <th className="px-3 py-2 text-left text-sm font-medium text-foreground border-b border-border">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-sm text-foreground border-b border-border">{children}</td>,
          // Horizontal rule
          hr: () => <hr className="my-4 border-border" />,
          // Strong and emphasis
          strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isUser ? 'bg-blue-500/20 text-blue-400' : 'bg-primary/20 text-primary'
      }`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Message Content */}
      <div className={`group flex-1 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block text-left px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-blue-500/10 text-foreground'
            : isError
            ? 'bg-red-500/10 text-foreground border border-red-500/20'
            : 'bg-secondary text-foreground'
        }`}>
          {/* Tool calls (for assistant) */}
          {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {message.toolCalls.map(tc => (
                <ToolCallBadge key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Rich visualization cards (when enabled) */}
          {showRichCards && !isUser && message.richCards && message.richCards.length > 0 && (
            <div className="space-y-2 mb-2">
              {message.richCards.map(card => (
                <RichCardRenderer key={card.id} card={card} />
              ))}
            </div>
          )}

          {/* Content */}
          <div className="text-sm whitespace-pre-wrap">
            {isPending ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking...
              </span>
            ) : (
              renderContent(message.content)
            )}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-0.5 bg-primary animate-pulse" />
            )}
          </div>

          {/* Error message */}
          {message.error && (
            <div className="mt-2 flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="w-3 h-3" />
              {message.error}
            </div>
          )}

          {/* Metadata display (when enabled and available) */}
          {showMetadata && !isUser && meta && (
            <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground font-mono space-y-0.5">
              {meta.actualModel && (
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">model:</span>
                  <span className="text-foreground">{meta.actualModel}</span>
                </div>
              )}
              {meta.backend && (
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">backend:</span>
                  <span className="text-foreground">{meta.backend}</span>
                </div>
              )}
              {meta.finishReason && (
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">finish:</span>
                  <span className="text-foreground">{meta.finishReason}</span>
                </div>
              )}
              {meta.usage && (
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">tokens:</span>
                  <span className="text-foreground">
                    {meta.usage.promptTokens || 0} → {meta.usage.completionTokens || 0} = {meta.usage.totalTokens || 0}
                  </span>
                </div>
              )}
              {meta.latencyMs !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">latency:</span>
                  <span className="text-foreground">{meta.latencyMs}ms</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions bar - always visible with timestamp, buttons fade in on hover */}
        <div className={`mt-1.5 flex items-center gap-2 ${isUser ? 'justify-end' : ''}`}>
          {/* Timestamp - always visible */}
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
          
          {/* Action buttons - always visible */}
          {!isPending && !isStreaming && (
            <div className="flex items-center gap-1">
              {/* Copy */}
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title={copied ? 'Copied!' : 'Copy message'}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              
              {/* Speak (assistant only) */}
              {!isUser && onSpeak && onStopSpeaking && (
                <button
                  onClick={() => isSpeaking ? onStopSpeaking() : onSpeak(message.content)}
                  className={`p-1.5 rounded-md transition-colors ${
                    isSpeaking 
                      ? 'text-primary hover:text-yellow-300 bg-primary/20' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                  title={isSpeaking ? 'Stop speaking' : 'Speak message'}
                >
                  {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              )}
              
              {/* Retry (error state or last assistant message) */}
              {isError && canRetry && onRetry && (
                <button
                  onClick={onRetry}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  title="Retry"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ChatInput - Message input with send/stop/mic buttons
// ============================================================================
interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  isOffline?: boolean;
  placeholder?: string;
}

function ChatInput({ 
  onSend, 
  onStop,
  disabled, 
  isStreaming,
  isOffline,
  placeholder = 'Ask anything about your project...' 
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Voice input - auto-sends the transcript
  const handleTranscript = useCallback((text: string) => {
    // Auto-send the voice transcript
    if (text.trim() && !disabled && !isOffline) {
      onSend(text.trim());
    }
  }, [disabled, isOffline, onSend]);
  
  const { isListening, error: voiceError, toggleListening } = useVoiceInput(handleTranscript);

  const handleSubmit = () => {
    if (value.trim() && !disabled && !isOffline) {
      onSend(value.trim());
      setValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  const effectivePlaceholder = isOffline 
    ? 'Gateway offline - reconnect to chat' 
    : voiceError
    ? `Voice error: ${voiceError}`
    : isListening
    ? 'Listening... speak now'
    : placeholder;

  return (
    <div className="flex items-end gap-2 p-4 border-t border-border bg-card/50">
      {/* Mic button */}
      <button
        onClick={toggleListening}
        disabled={disabled || isOffline}
        className={`p-3 rounded-xl transition-colors ${
          isListening
            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse'
            : voiceError
            ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
            : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-muted'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={voiceError ? `Error: ${voiceError}` : isListening ? 'Stop listening' : 'Voice input'}
      >
        {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>
      
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={effectivePlaceholder}
        disabled={disabled || isOffline}
        rows={1}
        className={`flex-1 resize-none bg-secondary border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed ${
          isListening ? 'border-red-500/50' : 'border-border'
        }`}
      />
      {isStreaming && onStop ? (
        <button
          onClick={onStop}
          className="p-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          title="Stop generating (Esc)"
        >
          <StopCircle className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim() || isOffline}
          className="p-3 rounded-xl bg-primary text-background hover:bg-primary disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
        >
          {disabled && !isOffline ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Insights - Main Component
// ============================================================================
export function Insights() {
  const {
    sessions,
    activeSessionId,
    isStreaming,
    createSession,
    deleteSession,
    setActiveSession,
    getActiveSession,
    addMessage,
    updateMessage,
    addToolCall,
    updateToolCall,
    setStreaming,
  } = useInsightsStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get domain config for insights
  const domainConfig = useDomainConfigStore(state => state.getConfigForDomain('code-editor'));
  const updateDomainConfig = useDomainConfigStore(state => state.updateDomainConfig);
  const fetchModelsForProvider = useDomainConfigStore(state => state.fetchModelsForProvider);

  // Initialize model from domain config
  const [selectedModel, setSelectedModel] = useState<InsightsModel>(
    () => (domainConfig.modelId as InsightsModel) || 'claude-sonnet-4-20250514'
  );

  // Sync selectedModel when domain config changes
  useEffect(() => {
    if (domainConfig.modelId && domainConfig.modelId !== selectedModel) {
      setSelectedModel(domainConfig.modelId as InsightsModel);
    }
  }, [domainConfig.modelId]);

  // M1: Direct Mode toggle - bypasses harness/inbox for pure LLM testing
  // NOTE: Direct mode has a bug (_chat_stream_direct NameError), using non-direct for now
  const [directMode, setDirectMode] = useState(false); // Default to non-direct (uses full harness)
  const [showMetadata, setShowMetadata] = useState(false); // Toggle to show response metadata (model, tokens, etc.)
  const [lastUserMessage, setLastUserMessage] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // TTS hook
  const { speak, stop: stopSpeaking, isSpeaking } = useTTS();

  // Rich tool visualizations setting
  const enableRichToolVisualizations = useSettingsStore(
    state => state.appSettings.enableRichToolVisualizations
  );
  
  // Gateway health with latency
  const { isOnline, latency, checkHealth } = useGatewayHealth();

  const activeSession = getActiveSession();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages]);

  const handleNewSession = useCallback(() => {
    createSession(selectedModel);
  }, [createSession, selectedModel]);

  // Provider change handler - updates domain config and fetches new models
  const handleProviderChange = useCallback(async (newProvider: LLMProvider) => {
    // Update domain config
    updateDomainConfig('code-editor', { provider: newProvider });

    // Fetch models for the new provider
    const models = await fetchModelsForProvider(newProvider);

    // If we have models, select the first one
    if (models.length > 0) {
      setSelectedModel(models[0].id);
      updateDomainConfig('code-editor', { modelId: models[0].id, modelName: models[0].name });
    }
  }, [updateDomainConfig, fetchModelsForProvider]);

  // Model change handler - updates state AND persists to domain config
  // Also auto-detects the correct provider based on model family
  const handleModelChange = useCallback((modelId: InsightsModel) => {
    setSelectedModel(modelId);
    // Persist to domain config so it survives session restarts
    const availableModels = useDomainConfigStore.getState().availableModels;
    const modelInfo = availableModels.find(m => m.id === modelId);

    // Auto-detect provider based on model family
    // Claude, OpenAI, Gemini, Copilot, Kiro, etc. all go through CLIProxyAPI
    // Only local models (devstral, mistral, llama) use LMStudio
    const family = getModelFamily(modelId);
    let newProvider: LLMProvider = domainConfig.provider; // Keep current by default

    if (family === 'local') {
      // Local models → LMStudio
      newProvider = 'lmstudio';
    } else if (['claude', 'openai', 'gpt5', 'gemini', 'copilot', 'kiro', 'qwen', 'deepseek'].includes(family)) {
      // Cloud models → CLIProxyAPI
      newProvider = 'cliproxyapi';
    }

    const providerChanged = newProvider !== domainConfig.provider;
    updateDomainConfig('code-editor', {
      modelId,
      modelName: modelInfo?.name || modelId,
      ...(providerChanged ? { provider: newProvider } : {})
    });
    console.log('[Insights] Model changed:', {
      modelId,
      modelName: modelInfo?.name,
      family,
      provider: newProvider,
      providerChanged
    });
  }, [updateDomainConfig, domainConfig.provider]);
  
  // Stop generation handler
  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreaming(false);
  }, [setStreaming]);
  
  // Retry last message
  const handleRetry = useCallback(() => {
    if (lastUserMessage) {
      handleSendMessage(lastUserMessage);
    }
  }, [lastUserMessage]);

  const handleSendMessage = useCallback(async (content: string) => {
    // Check gateway health first
    if (!isOnline) {
      const online = await checkHealth();
      if (!online) {
        // Show error in UI
        let sessionId = activeSessionId;
        if (!sessionId) {
          sessionId = createSession(selectedModel);
        }
        addMessage(sessionId, 'user', content);
        const errMsgId = addMessage(sessionId, 'assistant', '', selectedModel);
        updateMessage(sessionId, errMsgId, { 
          content: 'Gateway is offline. Please start the gateway and try again.', 
          status: 'error' 
        });
        return;
      }
    }
    
    // Save for retry
    setLastUserMessage(content);
    
    // Ensure we have an active session
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = createSession(selectedModel);
    }

    // Add user message
    addMessage(sessionId, 'user', content);

    // Add placeholder assistant message
    const assistantMsgId = addMessage(sessionId, 'assistant', '', selectedModel);

    setStreaming(true);
    updateMessage(sessionId, assistantMsgId, { status: 'streaming' });
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      // Build messages array for gateway
      const session = getActiveSession();
      const chatMessages = session?.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .filter(m => m.content && m.status !== 'error') // Skip error messages
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })) || [];
      
      // Add current message
      chatMessages.push({ role: 'user' as const, content });

      // Call gateway chat endpoint with direct mode option and domain config
      // Safety check: ensure model/provider consistency at request time
      const family = getModelFamily(selectedModel);
      let backendParam: LLMProvider | undefined = domainConfig.provider !== 'gateway-auto' ? domainConfig.provider : undefined;

      // Auto-correct model/provider mismatch (shouldn't happen, but safety check)
      if (family === 'local' && backendParam !== 'lmstudio') {
        console.warn('[Insights] Model/provider mismatch: local model with non-lmstudio provider, auto-correcting');
        backendParam = 'lmstudio';
      } else if (['claude', 'openai', 'gpt5', 'gemini', 'copilot', 'kiro', 'qwen', 'deepseek'].includes(family) && backendParam === 'lmstudio') {
        console.warn('[Insights] Model/provider mismatch: cloud model with lmstudio provider, auto-correcting to cliproxyapi');
        backendParam = 'cliproxyapi';
      }

      console.log('[Insights] Chat request:', {
        model: selectedModel,
        family,
        configProvider: domainConfig.provider,
        backend: backendParam,
        directMode,
      });

      const result = await window.electronAPI.gateway.chat(
        chatMessages,
        selectedModel,
        {
          direct: directMode,  // M1: Pass direct mode flag
          backend: backendParam,
          temperature: domainConfig.temperature,
          max_tokens: domainConfig.maxTokens,
        }
      );

      // Check if aborted
      if (abortControllerRef.current?.signal.aborted) {
        updateMessage(sessionId, assistantMsgId, { 
          content: 'Generation stopped.', 
          status: 'complete' 
        });
        return;
      }

      if (!result.ok || result.error) {
        updateMessage(sessionId, assistantMsgId, { 
          content: result.error || 'Failed to connect to gateway', 
          status: 'error' 
        });
        return;
      }

      // Parse streamed chunks and assemble response
      // Gateway sends: {"type": "delta", "text": "..."} NOT {"type": "content", "content": "..."}
      let fullContent = '';
      const startTime = Date.now();
      let responseMetadata: InsightsMessage['metadata'] = {
        backend: backendParam || 'gateway-auto',
        actualModel: selectedModel, // Start with requested model, update if response includes it
      };

      // Track tool calls and rich cards during streaming
      const toolCallsInProgress = new Map<string, ToolCall>();
      const richCardsCollected: RichCard[] = [];

      for (const chunkStr of result.chunks || []) {
        try {
          const chunk = JSON.parse(chunkStr);

          // Handle different chunk types from gateway
          if (chunk.type === 'delta' && chunk.text) {
            // V2 format: type=delta, text=content
            fullContent += chunk.text;
            updateMessage(sessionId, assistantMsgId, { content: fullContent, status: 'streaming' });
          } else if (chunk.type === 'content' && chunk.content) {
            // Legacy format: type=content, content=text
            fullContent += chunk.content;
            updateMessage(sessionId, assistantMsgId, { content: fullContent, status: 'streaming' });
          } else if (chunk.type === 'tool_start') {
            // Tool call started
            const toolCall: ToolCall = {
              id: chunk.id || `tool-${Date.now()}`,
              name: chunk.name || 'unknown',
              status: 'running',
            };
            toolCallsInProgress.set(toolCall.id, toolCall);
            addToolCall(sessionId, assistantMsgId, toolCall);
          } else if (chunk.type === 'tool_end') {
            // Tool call completed
            const existing = toolCallsInProgress.get(chunk.id);
            if (existing) {
              const duration = chunk.duration_ms || (existing.duration ? existing.duration : undefined);
              updateToolCall(sessionId, assistantMsgId, chunk.id, {
                status: chunk.is_error ? 'error' : 'success',
                result: typeof chunk.result === 'string' ? chunk.result : JSON.stringify(chunk.result),
                duration,
              });

              // Parse rich card if visualizations enabled
              if (enableRichToolVisualizations && !chunk.is_error) {
                const richCard = parseToolResultToRichCard(existing.name, chunk.id, chunk.result);
                if (richCard) {
                  richCardsCollected.push(richCard);
                }
              }
            }
          } else if (chunk.type === 'error') {
            updateMessage(sessionId, assistantMsgId, {
              content: chunk.error || chunk.message || 'Unknown error',
              status: 'error'
            });
            return;
          } else if (chunk.type === 'info') {
            // Info messages (like "Direct Mode: Bypassing harness/inbox") - skip
          } else if (chunk.type === 'done') {
            // Capture metadata from done chunk
            responseMetadata.finishReason = chunk.stop_reason || chunk.finish_reason;
            if (chunk.model) responseMetadata.actualModel = chunk.model;
            if (chunk.usage) {
              responseMetadata.usage = {
                promptTokens: chunk.usage.prompt_tokens || chunk.usage.promptTokens,
                completionTokens: chunk.usage.completion_tokens || chunk.usage.completionTokens,
                totalTokens: chunk.usage.total_tokens || chunk.usage.totalTokens,
              };
            }
          }
        } catch {
          // Skip unparseable chunks
        }
      }

      // Calculate latency
      responseMetadata.latencyMs = Date.now() - startTime;

      // If no content from chunks, use direct response
      if (!fullContent && result.response) {
        fullContent = result.response;
      }

      // Mark complete with metadata and rich cards
      updateMessage(sessionId, assistantMsgId, {
        content: fullContent || 'No response received. Check gateway logs.',
        status: fullContent ? 'complete' : 'error',
        metadata: responseMetadata,
        richCards: richCardsCollected.length > 0 ? richCardsCollected : undefined,
      });
    } catch (error) {
      if (abortControllerRef.current?.signal.aborted) {
        updateMessage(sessionId, assistantMsgId, { 
          content: 'Generation stopped.', 
          status: 'complete' 
        });
      } else {
        updateMessage(sessionId, assistantMsgId, { 
          content: error instanceof Error ? error.message : String(error), 
          status: 'error' 
        });
      }
    } finally {
      setStreaming(false);
      abortControllerRef.current = null;
    }
  }, [activeSessionId, selectedModel, directMode, isOnline, checkHealth, createSession, addMessage, updateMessage, addToolCall, updateToolCall, setStreaming, getActiveSession, enableRichToolVisualizations]);

  // Find last assistant message for retry
  const lastAssistantMsg = activeSession?.messages
    .filter(m => m.role === 'assistant')
    .slice(-1)[0];
  const canRetryLast = lastAssistantMsg?.status === 'error';

  return (
    <div className="h-full flex bg-background">
      {/* Sidebar */}
      <ChatHistorySidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSession}
        onNewSession={handleNewSession}
        onDeleteSession={deleteSession}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full">
        {/* Header - Compact, polished */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/30 backdrop-blur-sm">
          {/* Left: Icon + Title only */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Sparkles className="w-4 h-4 text-black" />
            </div>
            <h1 className="text-base font-semibold text-foreground">Insights</h1>
          </div>

          {/* Right: Provider selector + Model selector */}
          <div className="flex items-center gap-2">
            {/* Provider selector dropdown */}
            <ProviderSelector
              provider={domainConfig.provider}
              onProviderChange={handleProviderChange}
              model={selectedModel}
              latency={latency}
              disabled={isStreaming}
            />

            {/* HIDDEN: Direct Mode toggle - no longer needed, using global settings
            <DirectModeToggle
              enabled={directMode}
              onChange={setDirectMode}
              disabled={isStreaming}
            />
            */}

            {/* Metadata toggle - show model/tokens/latency on responses */}
            <MetadataToggle
              enabled={showMetadata}
              onChange={setShowMetadata}
              disabled={false}
            />

            <InsightsModelSelector
              value={selectedModel}
              onChange={handleModelChange}
              disabled={isStreaming}
            />
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeSession && activeSession.messages.length > 0 ? (
            <>
              {activeSession.messages.map((message, idx) => {
                const isLastAssistant = message.role === 'assistant' && 
                  idx === activeSession.messages.length - 1;
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onSpeak={speak}
                    onStopSpeaking={stopSpeaking}
                    isSpeaking={isSpeaking}
                    onRetry={isLastAssistant && canRetryLast ? handleRetry : undefined}
                    canRetry={isLastAssistant && canRetryLast}
                    showMetadata={showMetadata}
                    showRichCards={enableRichToolVisualizations}
                  />
                );
              })}
              <div ref={messagesEndRef} />
            </>
          ) : (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-yellow-400/20 to-orange-500/20 flex items-center justify-center mb-6">
                <Sparkles className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Start a conversation
              </h2>
              <p className="text-muted-foreground max-w-md mb-8">
                Ask questions about your codebase, get suggestions for improvements,
                or explore your project structure with AI assistance.
              </p>
              {!isOnline && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
                  <WifiOff className="w-4 h-4" />
                  <span>Gateway offline</span>
                  <button 
                    onClick={checkHealth}
                    className="ml-2 px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-xs"
                  >
                    Retry
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 max-w-lg">
                {[
                  { icon: Search, label: 'Search the codebase', prompt: 'Search for...' },
                  { icon: FileText, label: 'Explain a file', prompt: 'Explain what does...' },
                  { icon: FolderSearch, label: 'Find dependencies', prompt: 'What are the dependencies of...' },
                  { icon: Bot, label: 'Suggest improvements', prompt: 'How can I improve...' },
                ].map(({ icon: Icon, label, prompt }) => (
                  <button
                    key={label}
                    onClick={() => handleSendMessage(prompt)}
                    disabled={!isOnline}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-muted-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSendMessage}
          onStop={handleStopGeneration}
          disabled={isStreaming}
          isStreaming={isStreaming}
          isOffline={!isOnline}
        />
      </div>
    </div>
  );
}
