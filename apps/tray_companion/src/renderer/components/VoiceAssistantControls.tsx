import { useState, useEffect, useRef } from 'react';
import { Send, Trash2, TestTube, Loader2, Mic, MicOff, MessageSquare, Volume2, Activity, Settings, Link, Pin } from 'lucide-react';

// Provider definitions (matching Desktop domain-config types)
// CLIProxyAPI supports: Claude, GPT, Gemini, Qwen, iFlow, etc.
const PROVIDERS = [
  { id: 'lmstudio', name: 'LMStudio', color: 'green' },
  { id: 'cliproxyapi', name: 'CLI Proxy', color: 'blue' },
  { id: 'gateway-auto', name: 'Gateway (Auto)', color: 'purple' },
  { id: 'claude', name: 'Claude API', color: 'orange' },
] as const;

type LLMProvider = typeof PROVIDERS[number]['id'];

interface DomainConfig {
  provider: LLMProvider;
  modelId: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
}

interface VoiceAssistantControlsProps {
  settings: {
    voiceEnabled: boolean;
    localLlmUrl: string;
    voiceModel?: string;
    voicePromptPath?: string;
    voiceSystemPrompt?: string;
    voiceAlwaysListen?: boolean;
    voiceAutoSpeak?: boolean;
    voiceWakeWord?: string;
  };
  onUpdateSettings: (settings: any) => void;
}

interface VoiceMessage {
  role: 'user' | 'assistant';
  content: string;
}

type SpeechState = 'idle' | 'listening' | 'hearing' | 'processing' | 'sending' | 'responding';

// State display info
const STATE_INFO: Record<SpeechState, { label: string; color: string; bgColor: string }> = {
  idle: { label: 'Idle', color: 'text-zinc-500', bgColor: 'bg-zinc-600' },
  listening: { label: 'Waiting for speech...', color: 'text-blue-400', bgColor: 'bg-blue-500' },
  hearing: { label: 'Hearing voice...', color: 'text-green-400', bgColor: 'bg-green-500' },
  processing: { label: 'Processing speech...', color: 'text-cyan-400', bgColor: 'bg-cyan-500' },
  sending: { label: 'Sending to AI...', color: 'text-yellow-400', bgColor: 'bg-yellow-500' },
  responding: { label: 'AI responding...', color: 'text-purple-400', bgColor: 'bg-purple-500' },
};

// ============================================================================
// Model Family Detection (matching Desktop domain-config)
// ============================================================================

type ModelFamily = 'claude' | 'openai' | 'gemini' | 'qwen' | 'deepseek' | 'local' | 'other';

const MODEL_FAMILY_LABELS: Record<ModelFamily, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)',
  qwen: 'Qwen (Alibaba)',
  deepseek: 'DeepSeek',
  local: 'Local Models',
  other: 'Other',
};

const FAMILY_SORT_ORDER: ModelFamily[] = [
  'claude', 'openai', 'gemini', 'qwen', 'deepseek', 'local', 'other',
];

function getModelFamily(modelId: string): ModelFamily {
  const id = modelId.toLowerCase();
  if (id.includes('claude')) return 'claude';
  if (id.includes('gpt') || id.startsWith('o1-') || id === 'o1') return 'openai';
  if (id.includes('gemini')) return 'gemini';
  if (id.includes('qwen')) return 'qwen';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('devstral') || id.includes('mistral') || id.includes('llama')) return 'local';
  return 'other';
}

function groupModelsByFamily(models: string[]): Map<ModelFamily, string[]> {
  const grouped = new Map<ModelFamily, string[]>();

  // Initialize in sort order
  for (const family of FAMILY_SORT_ORDER) {
    grouped.set(family, []);
  }

  // Group models
  for (const model of models) {
    const family = getModelFamily(model);
    const familyModels = grouped.get(family) || [];
    familyModels.push(model);
    grouped.set(family, familyModels);
  }

  // Remove empty groups
  for (const [family, familyModels] of grouped) {
    if (familyModels.length === 0) {
      grouped.delete(family);
    }
  }

  return grouped;
}

function VoiceAssistantControls({ settings, onUpdateSettings }: VoiceAssistantControlsProps): React.JSX.Element {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<VoiceMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Unknown');
  const [isListening, setIsListening] = useState(false);

  // Model selection
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(settings.voiceModel || '');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsSource, setModelsSource] = useState<'loaded' | 'all'>('all');

  // System prompt path (optional override)
  const [promptPath, setPromptPath] = useState(settings.voicePromptPath || '');
  const autoPromptFilename = selectedModel
    ? `${selectedModel.replace(/[^a-zA-Z0-9._-]+/g, '')}.md`
    : '';

  // System prompt text (optional override)
  const [systemPromptText, setSystemPromptText] = useState(settings.voiceSystemPrompt || '');

  // Real activity state
  const [speechState, setSpeechState] = useState<SpeechState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [autoSentMessage, setAutoSentMessage] = useState('');

  // Context tracking
  const [contextInfo, setContextInfo] = useState<{ usedTokens: number; completionTokens: number; totalTokens: number; modelMaxTokens?: number; maxTokens: number; percentage: number }>({
    usedTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    maxTokens: 8192,
    percentage: 0
  });

  // Audio level history for waveform
  const [audioLevelHistory, setAudioLevelHistory] = useState<number[]>(new Array(30).fill(0));
  const audioLevelRef = useRef<number[]>(new Array(30).fill(0));

  // Domain config state (sync with Desktop app)
  const [domainConfigSource, setDomainConfigSource] = useState<'local' | 'shared'>('local');
  const [currentProvider, setCurrentProvider] = useState<LLMProvider>('lmstudio');
  const [providerHealth, setProviderHealth] = useState<Record<string, boolean>>({
    lmstudio: false,
    cliproxyapi: false,
    'gateway-auto': false,
    claude: true, // Claude is assumed healthy
  });

  useEffect(() => {
    if (settings.voiceEnabled) {
      testConnection();
      checkAllProviderHealth();
      loadHistory();
      checkListeningStatus();
      loadContextInfo();
      loadModels();
      loadDomainConfig();
    }

    const api = (window as any).api;

    // Domain config updates from Desktop app
    if (api.domainConfig?.onUpdate) {
      api.domainConfig.onUpdate((config: DomainConfig) => {
        console.log('[UI] Domain config updated:', config);
        setDomainConfigSource('shared');
        setCurrentProvider(config.provider);
        setSelectedModel(config.modelId);
      });
    }

    // Speech transcript (final)
    if (api.onSpeechTranscript) {
      api.onSpeechTranscript((transcript: string) => {
        console.log('[UI] Transcript:', transcript);
        setMessage(transcript);
        setInterimTranscript('');
      });
    }

    // Speech interim (in progress)
    if (api.onSpeechInterim) {
      api.onSpeechInterim((interim: string) => {
        console.log('[UI] Interim:', interim);
        setInterimTranscript(interim);
      });
    }

    // Audio level (real-time)
    if (api.onAudioLevel) {
      api.onAudioLevel((level: number) => {
        setAudioLevel(level);
        // Update history for waveform
        audioLevelRef.current = [...audioLevelRef.current.slice(1), level];
        setAudioLevelHistory([...audioLevelRef.current]);
      });
    }

    // Speech state changes
    if (api.onSpeechState) {
      api.onSpeechState((state: string) => {
        console.log('[UI] Speech state:', state);
        setSpeechState(state as SpeechState);

        if (state === 'listening') {
          setIsListening(true);
        } else if (state === 'idle') {
          setIsListening(false);
        }
      });
    }

    // Voice detected
    if (api.onVoiceDetected) {
      api.onVoiceDetected(() => {
        console.log('[UI] Voice detected');
      });
    }

    // Message sent event
    if (api.voice?.onMessageSent) {
      api.voice.onMessageSent((event: any) => {
        const { command, success } = event.detail || {};
        if (command) {
          setAutoSentMessage(success ? `Sent: "${command}"` : `Failed: "${command}"`);
          setTimeout(() => setAutoSentMessage(''), 5000);
        }
        // Reload history after message sent
        loadHistory();
        // Reload context info after message
        loadContextInfo();
      });
    }

    // Context update events
    if (api.voice?.onContextUpdate) {
      api.voice.onContextUpdate((info: { usedTokens: number; completionTokens: number; totalTokens: number; modelMaxTokens?: number; maxTokens: number; percentage: number }) => {
        console.log('[UI] Context update:', info);
        setContextInfo(info);
      });
    }
  }, [settings.voiceEnabled]);

  useEffect(() => {
    setPromptPath(settings.voicePromptPath || '');
  }, [settings.voicePromptPath]);

  useEffect(() => {
    setSystemPromptText(settings.voiceSystemPrompt || '');
  }, [settings.voiceSystemPrompt]);

  const testConnection = async () => {
    try {
      const result = await (window as any).api.voice.testConnection();
      setIsConnected(result.success);
      setConnectionStatus(result.success ? 'Connected' : result.error || 'Failed');
      // Update LMStudio provider health based on connection
      setProviderHealth(prev => ({ ...prev, lmstudio: result.success }));
    } catch (error) {
      setIsConnected(false);
      setConnectionStatus('Error');
      setProviderHealth(prev => ({ ...prev, lmstudio: false }));
    }
  };

  const checkAllProviderHealth = async () => {
    // Use IPC to main process (avoids CORS issues)
    try {
      const health = await (window as any).api.voice.checkProviderHealth();
      setProviderHealth(health);
    } catch (error) {
      console.error('Failed to check provider health:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const historyData = await (window as any).api.voice.getHistory();
      setHistory(historyData);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const checkListeningStatus = async () => {
    try {
      const listening = await (window as any).api.speech?.isListening?.();
      setIsListening(listening || false);
      if (listening) {
        setSpeechState('listening');
      }
    } catch (error) {
      console.error('Error checking listening status:', error);
    }
  };

  const loadContextInfo = async () => {
    try {
      const info = await (window as any).api.voice.getContextInfo();
      if (info) {
        setContextInfo(info);
      }
    } catch (error) {
      console.error('Error loading context info:', error);
    }
  };

  const loadModels = async (provider?: LLMProvider) => {
    setIsLoadingModels(true);
    const targetProvider = provider ?? currentProvider;
    try {
      // Load models based on selected provider
      if (targetProvider === 'cliproxyapi') {
        // Fetch CLIProxyAPI models (Claude, GPT, Gemini, etc.)
        const result = await (window as any).api.voice.getCLIProxyModels();
        if (result.models && result.models.length > 0) {
          const modelIds = result.models.map((m: { id: string }) => m.id);
          setAvailableModels(modelIds);
          setModelsSource(result.source === 'live' ? 'loaded' : 'all');
          // Keep current model if valid, else select first
          if (!modelIds.includes(selectedModel) && modelIds.length > 0) {
            await handleModelChange(modelIds[0]);
          }
        } else {
          setAvailableModels([]);
          setModelsSource('all');
        }
      } else {
        // Default: Fetch LMStudio models
        const result = await (window as any).api.voice.getModels();
        if (result.models && result.models.length > 0) {
          setAvailableModels(result.models);
          setModelsSource(result.source === 'loaded' ? 'loaded' : 'all');
          if (result.selected) {
            setSelectedModel(result.selected);
          } else if (result.models.length > 0) {
            // Auto-select first model if none selected/valid
            await handleModelChange(result.models[0]);
          }
        } else {
          setAvailableModels([]);
          setModelsSource(result?.source === 'loaded' ? 'loaded' : 'all');
        }
      }
    } catch (error) {
      console.error('Error loading models:', error);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const loadDomainConfig = async () => {
    try {
      const result = await (window as any).api.domainConfig?.getVoiceConfig();
      if (result?.success && result.config) {
        console.log('[UI] Loaded domain config from Desktop:', result.config);
        setDomainConfigSource('shared');
        const newProvider = result.config.provider;
        setCurrentProvider(newProvider);
        if (result.config.modelId) {
          setSelectedModel(result.config.modelId);
        }
        // Update provider health based on connection
        if (newProvider === 'lmstudio') {
          setProviderHealth(prev => ({ ...prev, lmstudio: true }));
        }
        // Reload models for the configured provider
        loadModels(newProvider);
      } else {
        console.log('[UI] No shared domain config, using local settings');
        setDomainConfigSource('local');
      }
    } catch (error) {
      console.log('[UI] Domain config not available, using local settings');
      setDomainConfigSource('local');
    }
  };

  const handleProviderChange = (provider: LLMProvider) => {
    if (domainConfigSource === 'shared') {
      // Don't allow local changes when synced with Desktop
      return;
    }
    setCurrentProvider(provider);
    // Reload models for the new provider
    loadModels(provider);
  };

  const handleModelChange = async (model: string) => {
    setSelectedModel(model);
    onUpdateSettings({ voiceModel: model });
    try {
      await (window as any).api.voice.setModel(model);
    } catch (error) {
      console.error('Error setting model:', error);
    }
  };

  const browsePromptFile = async () => {
    try {
      const selected = await (window as any).api.voice.selectPromptFile?.();
      if (!selected) return;
      setPromptPath(selected);
      onUpdateSettings({ voicePromptPath: selected });
    } catch (error) {
      console.error('Error selecting prompt file:', error);
    }
  };

  const applyPromptPath = () => {
    onUpdateSettings({ voicePromptPath: promptPath });
  };

  const clearPromptPath = () => {
    setPromptPath('');
    onUpdateSettings({ voicePromptPath: '' });
  };

  const applySystemPromptText = () => {
    onUpdateSettings({ voiceSystemPrompt: systemPromptText });
  };

  const clearSystemPromptText = () => {
    setSystemPromptText('');
    onUpdateSettings({ voiceSystemPrompt: '' });
  };

  const sendMessage = async () => {
    if (!message.trim() || isSending) return;

    setIsSending(true);
    try {
      const result = await (window as any).api.voice.sendMessage(message, settings.voiceAutoSpeak !== false);

      if (result.success) {
        setMessage('');
        await loadHistory();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      alert(`Error sending message: ${error}`);
    } finally {
      setIsSending(false);
    }
  };

  const clearHistory = async () => {
    if (confirm('Clear conversation history?')) {
      try {
        await (window as any).api.voice.clearHistory();
        setHistory([]);
        // Context is reset on clear - reload it
        await loadContextInfo();
      } catch (error) {
        alert(`Error clearing history: ${error}`);
      }
    }
  };

  const toggleAlwaysListen = async () => {
    try {
      if (isListening) {
        console.log('[UI] Stopping always-listen mode...');
        await (window as any).api.speech.stopAlwaysListen();
        setIsListening(false);
        setSpeechState('idle');
        onUpdateSettings({ voiceAlwaysListen: false });
      } else {
        console.log('[UI] Starting always-listen mode...');

        if (!settings.voiceEnabled) {
          alert('Please enable Voice Assistant first');
          return;
        }

        await (window as any).api.settings.update({
          voiceAlwaysListen: true,
          voiceEnabled: true
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        // Pass forceEnable=true to bypass settings check (we just enabled it)
        const result = await (window as any).api.speech.startAlwaysListen(true);

        if (result.success) {
          setIsListening(true);
          setSpeechState('listening');
        } else {
          await (window as any).api.settings.update({ voiceAlwaysListen: false });
          alert(`Failed to start listening: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('[UI] Error toggling listen mode:', error);
      alert(`Error toggling listen mode: ${error}`);
    }
  };

  const stateInfo = STATE_INFO[speechState] || STATE_INFO.idle;

  return (
    <div className="max-w-2xl">
      <h2 className="shrine-header">
        <div className="header-icon-shrine">
          <MessageSquare />
        </div>
        <span className="header-text">Voice Assistant</span>
        {/* Sync status indicator */}
        <span className={`ml-2 text-xs px-2 py-0.5 rounded flex items-center gap-1 ${
          domainConfigSource === 'shared'
            ? 'bg-green-500/20 text-green-400'
            : 'bg-zinc-700 text-zinc-400'
        }`}>
          {domainConfigSource === 'shared' ? (
            <>
              <Link className="w-3 h-3" />
              Synced
            </>
          ) : (
            <>
              <Pin className="w-3 h-3" />
              Local
            </>
          )}
        </span>
      </h2>

      {/* Enable/Disable */}
      <div className="content-card p-5 mb-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.voiceEnabled}
            onChange={(e) => onUpdateSettings({ voiceEnabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className={`shrine-toggle ${settings.voiceEnabled ? 'active' : ''}`} />
          <span style={{ color: 'var(--text-primary)' }}>Enable Voice Assistant</span>
        </label>
      </div>

      {settings.voiceEnabled && (
        <>
          {/* Provider Configuration */}
          <div className="content-card p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Provider Configuration
                </h3>
                {domainConfigSource === 'shared' && (
                  <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded">
                    Synced with Desktop
                  </span>
                )}
              </div>

              {/* Provider Buttons */}
              <div className="mb-4">
                <label className="block text-sm text-zinc-400 mb-2">Provider</label>
                <div className="grid grid-cols-2 gap-2">
                  {PROVIDERS.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => handleProviderChange(provider.id)}
                      disabled={domainConfigSource === 'shared'}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2
                        ${currentProvider === provider.id
                          ? 'bg-yellow-500/20 border-2 border-yellow-500 text-yellow-400'
                          : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700'}
                        ${domainConfigSource === 'shared' ? 'opacity-60 cursor-not-allowed' : ''}
                      `}
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        providerHealth[provider.id] ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      {provider.name}
                    </button>
                  ))}
                </div>
                {domainConfigSource === 'shared' && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Provider is managed by Desktop app. Open Domain Configuration in Desktop to change.
                  </p>
                )}
              </div>

          </div>

          {/* Connection Settings */}
          <div className="content-card p-5 mb-4">
            <div className="mb-4">
              <label className="block text-sm text-zinc-400 mb-2">Local LLM URL</label>
              <input
                type="text"
                value={settings.localLlmUrl}
                onChange={(e) => onUpdateSettings({ localLlmUrl: e.target.value })}
                placeholder="http://127.0.0.1:1234"
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-yellow-500/50"
              />
            </div>

            {/* Model Selection Dropdown - Grouped by Family */}
            {availableModels.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm text-zinc-400 mb-2">Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={isLoadingModels}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-yellow-500/50 disabled:opacity-50"
                >
                  {(() => {
                    const grouped = groupModelsByFamily(availableModels);
                    const families = Array.from(grouped.keys());

                    return families.map(family => {
                      const familyModels = grouped.get(family) || [];
                      const label = `${MODEL_FAMILY_LABELS[family]} (${familyModels.length})`;

                      return (
                        <optgroup key={family} label={label}>
                          {familyModels.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                        </optgroup>
                      );
                    });
                  })()}
                </select>
                <p className="text-xs text-zinc-500 mt-1">
                  {availableModels.length} {modelsSource === 'loaded' ? 'loaded model' : 'model'}
                  {availableModels.length !== 1 ? 's' : ''} {modelsSource === 'loaded' ? 'loaded' : 'available'}
                </p>
                {modelsSource !== 'loaded' && (
                  <p className="text-xs text-zinc-500 mt-1">
                    If a model won't switch, load it in LM Studio first.
                  </p>
                )}
              </div>
            )}

            {/* System Prompt File */}
            <div className="mb-4">
              <label className="block text-sm text-zinc-400 mb-2">System prompt file</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promptPath}
                    onChange={(e) => setPromptPath(e.target.value)}
                    onBlur={applyPromptPath}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyPromptPath();
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    placeholder={autoPromptFilename ? `(auto) Prompts/${autoPromptFilename}` : '(auto) Prompts/<model>.md'}
                    className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-yellow-500/50"
                  />
                  <button
                    onClick={browsePromptFile}
                    className="px-3 py-2.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Browse
                  </button>
                  {promptPath.trim() && (
                    <button
                      onClick={clearPromptPath}
                      className="px-3 py-2.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Leave blank to auto-load {autoPromptFilename ? `Prompts/${autoPromptFilename}` : 'Prompts/<model>.md'}
                </p>
                {systemPromptText.trim() && (
                  <p className="text-xs text-zinc-500 mt-1">
                    System prompt override is set; the prompt file is ignored until you clear it.
                  </p>
                )}
            </div>

            {/* System Prompt Text */}
            <div className="mb-4">
              <label className="block text-sm text-zinc-400 mb-2">System prompt override</label>
                <textarea
                  value={systemPromptText}
                  onChange={(e) => setSystemPromptText(e.target.value)}
                  onBlur={applySystemPromptText}
                  placeholder="Optional: paste a full system prompt here (overrides the prompt file and defaults)."
                  rows={6}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-yellow-500/50 resize-y"
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-zinc-500">
                    If set, this is sent as the first system message on every request.
                  </p>
                  {systemPromptText.trim() && (
                    <button
                      onClick={clearSystemPromptText}
                      className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-zinc-400">{connectionStatus}</span>
              </div>

              <button
                onClick={() => { testConnection(); checkAllProviderHealth(); loadModels(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <TestTube className="w-3 h-3" />
                Test
              </button>
            </div>
          </div>

          {/* Context Usage Bar */}
          <div className="content-card p-5 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">Context Usage (input tokens)</span>
              <span className="text-xs font-mono text-zinc-500">
                {contextInfo.usedTokens.toLocaleString()} / {contextInfo.maxTokens.toLocaleString()} tokens
              </span>
            </div>
            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  contextInfo.percentage >= 0.80
                    ? 'bg-red-500'
                    : contextInfo.percentage >= 0.60
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(contextInfo.percentage * 100, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-zinc-500">
                In: {contextInfo.usedTokens.toLocaleString()} | Out: {contextInfo.completionTokens.toLocaleString()} | Total: {contextInfo.totalTokens.toLocaleString()} | {(contextInfo.percentage * 100).toFixed(0)}% of window
                {typeof contextInfo.modelMaxTokens === 'number' && contextInfo.modelMaxTokens > 0
                  ? ` | Model max: ${contextInfo.modelMaxTokens.toLocaleString()}`
                  : ''}
                {contextInfo.percentage >= 0.80 && ' | Auto-clear at 80%'}
              </span>
              <button
                onClick={clearHistory}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Clear Now
              </button>
            </div>
          </div>

          {/* Voice Control with REAL Activity Indicator */}
          <div className="content-card p-5 mb-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Voice Control
            </h3>

            <div className="space-y-4">
              {/* Toggle switches */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.voiceAlwaysListen || false}
                  onChange={(e) => onUpdateSettings({ voiceAlwaysListen: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-zinc-700 rounded-full peer-checked:bg-yellow-500 relative transition-colors">
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.voiceAlwaysListen ? 'left-5' : 'left-1'}`} />
                </div>
                <span className="text-zinc-200">Always-listen mode</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.voiceAutoSpeak !== false}
                  onChange={(e) => onUpdateSettings({ voiceAutoSpeak: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-zinc-700 rounded-full peer-checked:bg-yellow-500 relative transition-colors">
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.voiceAutoSpeak !== false ? 'left-5' : 'left-1'}`} />
                </div>
                <span className="text-zinc-200">Auto-speak responses</span>
              </label>

              {/* ====== REAL ACTIVITY INDICATOR ====== */}
              <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-4">
                {/* State indicator */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${stateInfo.bgColor} ${speechState !== 'idle' ? 'animate-pulse' : ''}`} />
                    <div>
                      <div className={`text-sm font-medium ${stateInfo.color}`}>
                        {stateInfo.label}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-zinc-600">
                    {speechState}
                  </div>
                </div>

                {/* Audio level waveform */}
                {isListening && (
                  <div className="mb-3">
                    <div className="flex items-end justify-center gap-0.5 h-8 bg-zinc-900 rounded px-2">
                      {audioLevelHistory.map((level, i) => (
                        <div
                          key={i}
                          className="w-1 bg-gradient-to-t from-green-600 to-green-400 rounded-t transition-all duration-75"
                          style={{
                            height: `${Math.max(2, level * 100)}%`,
                            opacity: i / audioLevelHistory.length
                          }}
                        />
                      ))}
                    </div>
                    <div className="text-center text-xs text-zinc-600 mt-1">
                      Audio Level: {Math.round(audioLevel * 100)}%
                    </div>
                  </div>
                )}

                {/* Interim transcript (what's being heard) */}
                {interimTranscript && (
                  <div className="p-3 bg-cyan-900/30 border border-cyan-500/50 rounded-lg mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex gap-0.5">
                        <div className="w-1 h-3 bg-cyan-500 rounded-full animate-pulse" style={{animationDelay: '0ms'}} />
                        <div className="w-1 h-3 bg-cyan-500 rounded-full animate-pulse" style={{animationDelay: '150ms'}} />
                        <div className="w-1 h-3 bg-cyan-500 rounded-full animate-pulse" style={{animationDelay: '300ms'}} />
                      </div>
                      <span className="text-xs text-cyan-400 font-medium">Hearing:</span>
                    </div>
                    <div className="text-sm text-cyan-200 italic">"{interimTranscript}"</div>
                  </div>
                )}

                {/* Last sent message */}
                {autoSentMessage && (
                  <div className={`p-3 rounded-lg ${autoSentMessage.startsWith('Sent') ? 'bg-green-900/30 border border-green-500/50' : 'bg-red-900/30 border border-red-500/50'}`}>
                    <div className="flex items-center gap-2">
                      <Volume2 className={`w-3 h-3 ${autoSentMessage.startsWith('Sent') ? 'text-green-400' : 'text-red-400'}`} />
                      <div className={`text-xs font-medium ${autoSentMessage.startsWith('Sent') ? 'text-green-400' : 'text-red-400'}`}>
                        {autoSentMessage}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Start/Stop button */}
              <button
                onClick={toggleAlwaysListen}
                disabled={!isConnected}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all font-medium ${
                  isListening
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-5 h-5" />
                    Stop Listening
                  </>
                ) : (
                  <>
                    <Mic className="w-5 h-5" />
                    Start Always-Listen
                  </>
                )}
              </button>

              {/* Help text */}
              {isListening && (
                <div className="p-3 bg-zinc-800 rounded-lg text-xs text-zinc-400">
                  <strong>How it works:</strong> Speak naturally. After 0.5s of silence, your speech is sent to the AI.
                  Max recording time is 8 seconds.
                </div>
              )}
            </div>
          </div>

          {/* Message Input */}
          <div className="content-card p-5 mb-4">
            <label className="block text-sm text-zinc-400 mb-2">Send Message</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && isConnected && sendMessage()}
                  placeholder={isConnected ? "Ask anything..." : "Connect to Voice Assistant first..."}
                  disabled={isSending}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-yellow-500/50 disabled:opacity-50"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={isSending || !isConnected || !message.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 disabled:bg-zinc-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Conversation History */}
          <div className="content-card p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-zinc-400">Conversation</label>
              <button
                onClick={clearHistory}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {history.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-4">No conversation yet</p>
              ) : (
                history.map((msg, index) => (
                  <div key={index} className={`p-3 rounded-lg ${msg.role === 'user' ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-zinc-800'}`}>
                    <div className="text-xs text-zinc-500 mb-1">
                      {msg.role === 'user' ? 'You' : 'AI'}
                    </div>
                    <div className="text-sm text-zinc-200">{msg.content}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default VoiceAssistantControls;
