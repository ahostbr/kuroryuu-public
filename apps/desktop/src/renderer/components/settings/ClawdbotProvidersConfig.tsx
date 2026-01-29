/**
 * Clawdbot Provider Configuration
 * Accordion-based UI for configuring LM Studio, Ollama, Anthropic, OpenAI providers
 */

import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  Server,
  Cpu,
  BookOpen,
} from 'lucide-react';
import { toast } from '../ui/toast';
import type {
  ClawdbotProviderConfig,
  ClawdbotModelConfig,
  ProviderType,
} from '../../types/clawdbot';

interface ProviderSectionProps {
  title: string;
  icon: React.ReactNode;
  provider: ProviderType;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  enabled: boolean;
  status: 'idle' | 'testing' | 'success' | 'error';
}

function ProviderSection({
  title,
  icon,
  provider,
  isExpanded,
  onToggle,
  children,
  enabled,
  status,
}: ProviderSectionProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-secondary/50 hover:bg-secondary transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-secondary rounded">{icon}</div>
          <span className="font-medium text-sm text-foreground">{title}</span>
          {enabled && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Check className="w-3 h-3" /> Enabled
            </span>
          )}
          {status === 'testing' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Testing...
            </span>
          )}
          {status === 'success' && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Check className="w-3 h-3" /> Connected
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="w-3 h-3" /> Error
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {isExpanded && (
        <div className="p-4 space-y-4 border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}

interface ModelListProps {
  models: ClawdbotModelConfig[];
  primaryModel?: string;
  onModelsChange: (models: ClawdbotModelConfig[]) => void;
  onPrimaryChange: (modelId: string) => void;
}

function ModelList({ models, primaryModel, onModelsChange, onPrimaryChange }: ModelListProps) {
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');

  const handleAddModel = () => {
    if (!newModelId.trim()) return;
    const newModel: ClawdbotModelConfig = {
      id: newModelId.trim(),
      name: newModelName.trim() || newModelId.trim(),
      contextWindow: 32768,
      maxTokens: 4096,
    };
    onModelsChange([...models, newModel]);
    setNewModelId('');
    setNewModelName('');
  };

  const handleRemoveModel = (id: string) => {
    onModelsChange(models.filter(m => m.id !== id));
    if (primaryModel === id) {
      onPrimaryChange('');
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-xs text-muted-foreground">Models</label>

      {/* Model list */}
      <div className="space-y-2">
        {models.map((model) => (
          <div
            key={model.id}
            className="flex items-center gap-2 p-2 bg-secondary rounded-lg"
          >
            <input
              type="radio"
              name="primaryModel"
              checked={primaryModel === model.id}
              onChange={() => onPrimaryChange(model.id)}
              className="w-4 h-4 text-primary accent-primary"
              title="Set as primary model"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">{model.name}</div>
              <div className="text-xs text-muted-foreground">{model.id}</div>
            </div>
            <button
              onClick={() => handleRemoveModel(model.id)}
              className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
              title="Remove model"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Add model form */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newModelId}
          onChange={(e) => setNewModelId(e.target.value)}
          placeholder="Model ID (e.g., mistral-small)"
          className="flex-1 px-3 py-1.5 bg-secondary border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
        />
        <input
          type="text"
          value={newModelName}
          onChange={(e) => setNewModelName(e.target.value)}
          placeholder="Display name"
          className="flex-1 px-3 py-1.5 bg-secondary border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
        />
        <button
          onClick={handleAddModel}
          disabled={!newModelId.trim()}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary/20 text-primary rounded hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {primaryModel && (
        <p className="text-xs text-muted-foreground">
          Primary: <span className="text-primary">{primaryModel}</span>
        </p>
      )}
    </div>
  );
}

export function ClawdbotProvidersConfig() {
  const [config, setConfig] = useState<ClawdbotProviderConfig>({
    lmstudio: { enabled: false, baseUrl: 'http://host.docker.internal:1234/v1', models: [] },
    ollama: { enabled: false, baseUrl: 'http://host.docker.internal:11434', models: [] },
    anthropic: { enabled: false, apiKey: '' },
    openai: { enabled: false, apiKey: '' },
  });

  const [expandedProvider, setExpandedProvider] = useState<ProviderType | null>(null);
  const [projectRoot, setProjectRoot] = useState<string>('');
  const [providerStatus, setProviderStatus] = useState<Record<ProviderType, 'idle' | 'testing' | 'success' | 'error'>>({
    lmstudio: 'idle',
    ollama: 'idle',
    anthropic: 'idle',
    openai: 'idle',
  });
  const [testError, setTestError] = useState<Record<ProviderType, string | null>>({
    lmstudio: null,
    ollama: null,
    anthropic: null,
    openai: null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Track if API keys are configured in main Integrations
  const [mainIntegrationStatus, setMainIntegrationStatus] = useState<{
    anthropic: boolean;
    openai: boolean;
  }>({ anthropic: false, openai: false });

  // Load config and project root on mount
  useEffect(() => {
    loadConfig();
    loadProjectRoot();
    loadMainIntegrationStatus();
  }, []);

  const loadProjectRoot = async () => {
    try {
      const root = await window.electronAPI.app.getProjectRoot();
      setProjectRoot(root);
    } catch (err) {
      console.error('Failed to get project root:', err);
    }
  };

  const loadMainIntegrationStatus = async () => {
    try {
      const [anthropicConnected, openaiConnected] = await Promise.all([
        window.electronAPI.auth.anthropic.isConnected(),
        window.electronAPI.auth.openai.isConnected(),
      ]);
      setMainIntegrationStatus({
        anthropic: anthropicConnected,
        openai: openaiConnected,
      });
    } catch (err) {
      console.error('Failed to load main integration status:', err);
    }
  };

  const openSetupGuide = async () => {
    if (!projectRoot) return;
    const guidePath = `${projectRoot}/Docs/Guides/ClawdbotSetup.md`;
    try {
      await window.electronAPI.shell.openPath(guidePath);
    } catch (err) {
      toast.error('Failed to open setup guide');
    }
  };

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.clawdbot.getProviderConfig();
      if (result.ok && result.config) {
        setConfig(result.config);
      }
    } catch (err) {
      console.error('Failed to load provider config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestProvider = async (provider: ProviderType) => {
    setProviderStatus(prev => ({ ...prev, [provider]: 'testing' }));
    setTestError(prev => ({ ...prev, [provider]: null }));

    try {
      const providerConfig = config[provider];
      if (!providerConfig) return;

      let testConfig: { baseUrl?: string; apiKey?: string } = {};

      if (provider === 'lmstudio' || provider === 'ollama') {
        testConfig.baseUrl = (providerConfig as any).baseUrl;
      } else {
        testConfig.apiKey = (providerConfig as any).apiKey;
      }

      const result = await window.electronAPI.clawdbot.testProvider(provider, testConfig);

      if (result.ok) {
        setProviderStatus(prev => ({ ...prev, [provider]: 'success' }));

        // Auto-populate models for LM Studio and Ollama
        if ((provider === 'lmstudio' || provider === 'ollama') && result.models?.length) {
          setConfig(prev => ({
            ...prev,
            [provider]: {
              ...(prev[provider] as any),
              models: result.models,
            },
          }));
          toast.success(`Found ${result.models.length} models from ${provider}`);
        } else {
          toast.success(`${provider} connection successful`);
        }
      } else {
        setProviderStatus(prev => ({ ...prev, [provider]: 'error' }));
        setTestError(prev => ({ ...prev, [provider]: result.error || 'Connection failed' }));
        toast.error(result.error || `${provider} connection failed`);
      }
    } catch (err) {
      setProviderStatus(prev => ({ ...prev, [provider]: 'error' }));
      setTestError(prev => ({ ...prev, [provider]: String(err) }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await window.electronAPI.clawdbot.setProviderConfig(config);
      if (result.ok) {
        toast.success('Provider configuration saved');
      } else {
        toast.error(result.error || 'Failed to save configuration');
      }
    } catch (err) {
      toast.error('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const updateLmStudio = (updates: Partial<NonNullable<ClawdbotProviderConfig['lmstudio']>>) => {
    setConfig(prev => ({
      ...prev,
      lmstudio: { ...prev.lmstudio!, ...updates },
    }));
  };

  const updateOllama = (updates: Partial<NonNullable<ClawdbotProviderConfig['ollama']>>) => {
    setConfig(prev => ({
      ...prev,
      ollama: { ...prev.ollama!, ...updates },
    }));
  };

  const updateAnthropic = (updates: Partial<NonNullable<ClawdbotProviderConfig['anthropic']>>) => {
    setConfig(prev => ({
      ...prev,
      anthropic: { ...prev.anthropic!, ...updates },
    }));
  };

  const updateOpenAI = (updates: Partial<NonNullable<ClawdbotProviderConfig['openai']>>) => {
    setConfig(prev => ({
      ...prev,
      openai: { ...prev.openai!, ...updates },
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Provider Configuration</h4>
        <div className="flex items-center gap-3">
          <button
            onClick={openSetupGuide}
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
            title="Open Setup Guide"
          >
            <BookOpen className="w-3 h-3" /> Setup Guide
          </button>
          <button
            onClick={loadConfig}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-3 h-3" /> Reload
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Configure AI providers for Clawdbot. Use <code className="bg-secondary px-1 rounded">host.docker.internal</code> to access localhost from within Docker.
      </p>

      {/* LM Studio */}
      <ProviderSection
        title="LM Studio"
        icon={<Server className="w-4 h-4 text-blue-400" />}
        provider="lmstudio"
        isExpanded={expandedProvider === 'lmstudio'}
        onToggle={() => setExpandedProvider(expandedProvider === 'lmstudio' ? null : 'lmstudio')}
        enabled={config.lmstudio?.enabled ?? false}
        status={providerStatus.lmstudio}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="lmstudio-enabled"
              checked={config.lmstudio?.enabled ?? false}
              onChange={(e) => updateLmStudio({ enabled: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="lmstudio-enabled" className="text-sm text-foreground">
              Enable LM Studio
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Base URL</label>
            <input
              type="text"
              value={config.lmstudio?.baseUrl ?? ''}
              onChange={(e) => updateLmStudio({ baseUrl: e.target.value })}
              placeholder="http://host.docker.internal:1234/v1"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <ModelList
            models={config.lmstudio?.models ?? []}
            primaryModel={config.lmstudio?.primaryModel}
            onModelsChange={(models) => updateLmStudio({ models })}
            onPrimaryChange={(id) => updateLmStudio({ primaryModel: id })}
          />

          <div className="flex gap-2">
            <button
              onClick={() => handleTestProvider('lmstudio')}
              disabled={providerStatus.lmstudio === 'testing'}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm disabled:opacity-50"
            >
              {providerStatus.lmstudio === 'testing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Test Connection
            </button>
          </div>

          {testError.lmstudio && (
            <p className="text-xs text-red-400">{testError.lmstudio}</p>
          )}
        </div>
      </ProviderSection>

      {/* Ollama */}
      <ProviderSection
        title="Ollama"
        icon={<Cpu className="w-4 h-4 text-green-400" />}
        provider="ollama"
        isExpanded={expandedProvider === 'ollama'}
        onToggle={() => setExpandedProvider(expandedProvider === 'ollama' ? null : 'ollama')}
        enabled={config.ollama?.enabled ?? false}
        status={providerStatus.ollama}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ollama-enabled"
              checked={config.ollama?.enabled ?? false}
              onChange={(e) => updateOllama({ enabled: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="ollama-enabled" className="text-sm text-foreground">
              Enable Ollama
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Base URL</label>
            <input
              type="text"
              value={config.ollama?.baseUrl ?? ''}
              onChange={(e) => updateOllama({ baseUrl: e.target.value })}
              placeholder="http://host.docker.internal:11434"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <ModelList
            models={config.ollama?.models ?? []}
            primaryModel={config.ollama?.primaryModel}
            onModelsChange={(models) => updateOllama({ models })}
            onPrimaryChange={(id) => updateOllama({ primaryModel: id })}
          />

          <div className="flex gap-2">
            <button
              onClick={() => handleTestProvider('ollama')}
              disabled={providerStatus.ollama === 'testing'}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm disabled:opacity-50"
            >
              {providerStatus.ollama === 'testing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Test Connection
            </button>
          </div>

          {testError.ollama && (
            <p className="text-xs text-red-400">{testError.ollama}</p>
          )}
        </div>
      </ProviderSection>

      {/* Anthropic - uses API key from main Integrations */}
      <ProviderSection
        title="Anthropic (Claude)"
        icon={<span className="text-orange-400 font-bold text-xs">A</span>}
        provider="anthropic"
        isExpanded={expandedProvider === 'anthropic'}
        onToggle={() => setExpandedProvider(expandedProvider === 'anthropic' ? null : 'anthropic')}
        enabled={config.anthropic?.enabled ?? false}
        status={mainIntegrationStatus.anthropic ? providerStatus.anthropic : 'idle'}
      >
        <div className="space-y-4">
          {mainIntegrationStatus.anthropic ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="anthropic-enabled"
                  checked={config.anthropic?.enabled ?? false}
                  onChange={(e) => updateAnthropic({ enabled: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                <label htmlFor="anthropic-enabled" className="text-sm text-foreground">
                  Enable Anthropic for Clawdbot
                </label>
              </div>

              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">Using API key from main Integrations</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleTestProvider('anthropic')}
                  disabled={providerStatus.anthropic === 'testing'}
                  className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 transition-colors text-sm disabled:opacity-50"
                >
                  {providerStatus.anthropic === 'testing' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Test Connection
                </button>
              </div>
            </>
          ) : (
            <div className="p-3 bg-secondary/50 border border-border rounded-lg">
              <p className="text-sm text-muted-foreground">
                Configure Anthropic API key in the main <span className="text-primary">Integrations</span> section first.
              </p>
            </div>
          )}

          {testError.anthropic && (
            <p className="text-xs text-red-400">{testError.anthropic}</p>
          )}
        </div>
      </ProviderSection>

      {/* OpenAI - uses API key from main Integrations */}
      <ProviderSection
        title="OpenAI (GPT)"
        icon={<span className="text-emerald-400 font-bold text-xs">O</span>}
        provider="openai"
        isExpanded={expandedProvider === 'openai'}
        onToggle={() => setExpandedProvider(expandedProvider === 'openai' ? null : 'openai')}
        enabled={config.openai?.enabled ?? false}
        status={mainIntegrationStatus.openai ? providerStatus.openai : 'idle'}
      >
        <div className="space-y-4">
          {mainIntegrationStatus.openai ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="openai-enabled"
                  checked={config.openai?.enabled ?? false}
                  onChange={(e) => updateOpenAI({ enabled: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                <label htmlFor="openai-enabled" className="text-sm text-foreground">
                  Enable OpenAI for Clawdbot
                </label>
              </div>

              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">Using API key from main Integrations</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleTestProvider('openai')}
                  disabled={providerStatus.openai === 'testing'}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm disabled:opacity-50"
                >
                  {providerStatus.openai === 'testing' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Test Connection
                </button>
              </div>
            </>
          ) : (
            <div className="p-3 bg-secondary/50 border border-border rounded-lg">
              <p className="text-sm text-muted-foreground">
                Configure OpenAI API key in the main <span className="text-primary">Integrations</span> section first.
              </p>
            </div>
          )}

          {testError.openai && (
            <p className="text-xs text-red-400">{testError.openai}</p>
          )}
        </div>
      </ProviderSection>

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          Save Configuration
        </button>
      </div>
    </div>
  );
}
