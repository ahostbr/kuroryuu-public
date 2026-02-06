/**
 * Kuro Plugin Configuration Panel
 *
 * Configure TTS, validators, hooks, and features for the Kuroryuu plugin.
 * Settings are persisted to .claude/settings.json
 */
import { useEffect, useState } from 'react';
import {
  Volume2,
  Shield,
  Webhook,
  Sparkles,
  Save,
  RotateCcw,
  Play,
  Loader2,
  RefreshCw,
  Library,
  Search,
  Check,
  ChevronDown,
  DatabaseBackup,
  Plus,
  Trash2,
  RotateCw,
  ChevronRight,
  Mic,
  CheckCircle2,
  XCircle,
  Info,
} from 'lucide-react';
import { useClaudeTeamsStore } from '../../stores/claude-teams-store';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================
interface KuroConfig {
  tts: {
    provider: 'edge_tts' | 'pyttsx3' | 'elevenlabs' | 'openai';
    voice: string;
    smartSummaries: boolean;
    summaryProvider: 'gateway-auto' | 'lmstudio' | 'cliproxy' | 'claude';
    summaryModel: string;
    userName: string;
    messages: {
      stop: string;
      subagentStop: string;
      notification: string;
    };
  };
  validators: {
    ruff: boolean;
    ty: boolean;
    timeout: number;
  };
  hooks: {
    ttsOnStop: boolean;
    ttsOnSubagentStop: boolean;
    ttsOnNotification: boolean;
    taskSync: boolean;
    transcriptExport: boolean;
  };
  features: {
    ragInteractive: boolean;
    questionMode: boolean;
  };
}

const DEFAULT_CONFIG: KuroConfig = {
  tts: {
    provider: 'edge_tts',
    voice: 'en-GB-SoniaNeural',
    smartSummaries: false,
    summaryProvider: 'gateway-auto',
    summaryModel: '',
    userName: 'Ryan',
    messages: {
      stop: 'Work complete',
      subagentStop: 'Task finished',
      notification: 'Your attention is needed',
    },
  },
  validators: {
    ruff: true,
    ty: false,
    timeout: 30000,
  },
  hooks: {
    ttsOnStop: true,
    ttsOnSubagentStop: true,
    ttsOnNotification: true,
    taskSync: true,
    transcriptExport: true,
  },
  features: {
    ragInteractive: false,
    questionMode: false,
  },
};

// Voice options per provider (fallback for non-edge providers)
const STATIC_VOICE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  pyttsx3: [
    { value: 'default', label: 'System Default' },
  ],
  elevenlabs: [
    { value: 'rachel', label: 'Rachel' },
    { value: 'bella', label: 'Bella' },
    { value: 'antoni', label: 'Antoni' },
  ],
  openai: [
    { value: 'alloy', label: 'Alloy' },
    { value: 'echo', label: 'Echo' },
    { value: 'fable', label: 'Fable' },
    { value: 'onyx', label: 'Onyx' },
    { value: 'nova', label: 'Nova' },
    { value: 'shimmer', label: 'Shimmer' },
  ],
};

// Voice type for Edge TTS
interface EdgeVoice {
  value: string;
  label: string;
  gender: string;
  locale: string;
}

// LMStudio model type
interface LMStudioModel {
  id: string;
  object: string;
  owned_by?: string;
}

// ============================================================================
// Global TTS Status Panel (shown when Claude Teams are active)
// ============================================================================

interface GlobalHooksValidation {
  valid: boolean;
  uvFound: boolean;
  uvPath: string | null;
  scriptFound: boolean;
  scriptPath: string | null;
  errors: string[];
}

function GlobalTtsStatusPanel() {
  const [validation, setValidation] = useState<GlobalHooksValidation | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const loadValidation = async () => {
    setIsValidating(true);
    setTestResult(null);
    try {
      const result = await (window as unknown as { electronAPI: { globalHooks: { validate: () => Promise<GlobalHooksValidation> } } }).electronAPI?.globalHooks?.validate?.();
      if (result) setValidation(result);
    } catch {
      setValidation({ valid: false, uvFound: false, uvPath: null, scriptFound: false, scriptPath: null, errors: ['Failed to validate'] });
    } finally {
      setIsValidating(false);
    }
  };

  const runTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await (window as unknown as { electronAPI: { globalHooks: { test: () => Promise<{ ok: boolean; error?: string }> } } }).electronAPI?.globalHooks?.test?.();
      if (result) setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: String(err) });
    } finally {
      setIsTesting(false);
    }
  };

  useEffect(() => { loadValidation(); }, []);

  return (
    <div className="flex flex-col gap-2 p-3 mb-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
      <div className="flex items-start gap-2">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-400 leading-relaxed">
          TTS hooks are running globally while Claude Teams are active.
          Local TTS hooks are temporarily disabled to avoid double announcements.
        </p>
      </div>

      {isValidating ? (
        <div className="flex items-center gap-2 text-xs text-blue-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Validating prerequisites...
        </div>
      ) : validation ? (
        <div className="flex flex-col gap-2">
          {/* Status badges */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              {validation.uvFound ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className={validation.uvFound ? 'text-green-400' : 'text-red-400'}>
                UV {validation.uvFound ? 'found' : 'missing'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {validation.scriptFound ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className={validation.scriptFound ? 'text-green-400' : 'text-red-400'}>
                smart_tts.py {validation.scriptFound ? 'found' : 'missing'}
              </span>
            </div>
          </div>

          {/* Errors */}
          {validation.errors.length > 0 && (
            <div className="flex flex-col gap-1 p-2 bg-red-500/10 border border-red-500/20 rounded">
              {validation.errors.map((error, i) => (
                <p key={i} className="text-xs text-red-400 font-mono break-all">{error}</p>
              ))}
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={cn(
              'flex items-center gap-1.5 text-xs p-2 rounded',
              testResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400',
            )}>
              {testResult.ok ? (
                <><CheckCircle2 className="w-3.5 h-3.5" /> Test passed</>
              ) : (
                <><XCircle className="w-3.5 h-3.5" /> {testResult.error || 'Test failed'}</>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={loadValidation}
              disabled={isValidating}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors"
            >
              <RefreshCw className={cn('w-3 h-3', isValidating && 'animate-spin')} />
              Revalidate
            </button>
            {validation.valid && (
              <button
                onClick={runTest}
                disabled={isTesting}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors"
              >
                {isTesting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                Test Global TTS
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Toggle Component
// ============================================================================
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full
        border-2 border-transparent transition-colors duration-200 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
        ${checked ? 'bg-primary' : 'bg-secondary'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg
          ring-0 transition duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  );
}

// ============================================================================
// Collapsible Section Component
// ============================================================================
interface CollapsibleSectionProps {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, icon: Icon, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-secondary/20 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-secondary">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className="p-5 border-t border-border/50 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Field Row Component
// ============================================================================
interface FieldRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function FieldRow({ label, description, children }: FieldRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================
export function KuroPluginConfig() {
  const teamsActive = useClaudeTeamsStore((s) => s.teams.length > 0);
  const [config, setConfig] = useState<KuroConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [edgeVoices, setEdgeVoices] = useState<EdgeVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [voiceFilter, setVoiceFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'Male' | 'Female'>('all');
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [lmstudioModels, setLmstudioModels] = useState<LMStudioModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [lmstudioStatus, setLmstudioStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [backups, setBackups] = useState<Array<{ id: string; timestamp: string; name?: string; size: number; config?: any }>>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [expandedBackup, setExpandedBackup] = useState<string | null>(null);

  // Load config, voices, and backups on mount
  useEffect(() => {
    loadConfig();
    loadEdgeVoices();
    loadBackups();
  }, []);

  // Load LMStudio models when provider is lmstudio
  useEffect(() => {
    if (config.tts.summaryProvider === 'lmstudio' && config.tts.smartSummaries) {
      loadLmstudioModels();
    }
  }, [config.tts.summaryProvider, config.tts.smartSummaries]);

  const loadLmstudioModels = async () => {
    setIsLoadingModels(true);
    setLmstudioStatus('unknown');
    try {
      const response = await fetch('http://127.0.0.1:1234/v1/models', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        const models = (data.data || []).filter((m: LMStudioModel) =>
          // Filter out embedding and image models
          !m.id.includes('embed') && !m.id.includes('flux') && !m.id.includes('nomic')
        );
        setLmstudioModels(models);
        setLmstudioStatus('online');
        // Auto-select first model if none selected
        if (!config.tts.summaryModel && models.length > 0) {
          // Prefer devstral if available
          const devstral = models.find((m: LMStudioModel) => m.id.includes('devstral'));
          updateConfig('tts', { summaryModel: devstral?.id || models[0].id });
        }
      } else {
        setLmstudioStatus('offline');
        setLmstudioModels([]);
      }
    } catch (err) {
      console.error('Failed to fetch LMStudio models:', err);
      setLmstudioStatus('offline');
      setLmstudioModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const loadEdgeVoices = async () => {
    setIsLoadingVoices(true);
    try {
      const result = await window.electronAPI.kuroConfig.getVoices();
      if (result.ok && result.voices) {
        setEdgeVoices(result.voices);
      }
    } catch (err) {
      console.error('Failed to load Edge TTS voices:', err);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  const previewVoice = async (voiceName: string) => {
    if (previewingVoice) return; // Prevent double execution
    setPreviewingVoice(voiceName);
    try {
      await window.electronAPI.kuroConfig.previewVoice(voiceName);
    } catch (err) {
      console.error('Failed to preview voice:', err);
    } finally {
      setPreviewingVoice(null);
    }
  };

  const selectVoice = (voiceName: string) => {
    updateConfig('tts', { voice: voiceName });
  };

  // Sort all voices alphabetically by name
  const sortedEdgeVoices = [...edgeVoices].sort((a, b) => {
    const nameA = a.label.split(' (')[0].toLowerCase();
    const nameB = b.label.split(' (')[0].toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Filter sorted voices based on search and gender
  const filteredVoices = sortedEdgeVoices.filter((v) => {
    const matchesSearch = voiceFilter === '' ||
      v.label.toLowerCase().includes(voiceFilter.toLowerCase()) ||
      v.value.toLowerCase().includes(voiceFilter.toLowerCase());
    const matchesGender = genderFilter === 'all' || v.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.kuroConfig.load();
      if (result.ok && result.config) {
        setConfig(result.config as KuroConfig);
      } else {
        console.error('Failed to load config:', result.error);
        setConfig(DEFAULT_CONFIG);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
      setConfig(DEFAULT_CONFIG);
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      const result = await window.electronAPI.kuroConfig.save(config);
      if (result.ok) {
        setHasChanges(false);
      } else {
        console.error('Failed to save config:', result.error);
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const testTTS = async () => {
    if (isTesting) return; // Prevent double execution
    setIsTesting(true);
    try {
      const result = await window.electronAPI.kuroConfig.testTTS({
        provider: config.tts.provider,
        voice: config.tts.voice,
        messages: { stop: config.tts.messages.stop },
      });
      if (!result.ok) {
        console.error('TTS test failed:', result.error);
      }
    } catch (err) {
      console.error('Failed to test TTS:', err);
    } finally {
      setIsTesting(false);
    }
  };

  const loadBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const result = await window.electronAPI.kuroConfig.listBackups();
      if (result.ok && result.backups) {
        setBackups(result.backups);
      }
    } catch (err) {
      console.error('Failed to load backups:', err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      const name = backupName.trim() || undefined;
      const result = await window.electronAPI.kuroConfig.createBackup(name);
      if (result.ok) {
        setBackupName('');
        setShowBackupDialog(false);
        await loadBackups();
      } else {
        console.error('Failed to create backup:', result.error);
      }
    } catch (err) {
      console.error('Failed to create backup:', err);
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    try {
      const result = await window.electronAPI.kuroConfig.restoreBackup(backupId);
      if (result.ok && result.config) {
        // Merge with defaults to ensure all required fields exist
        const restored = result.config as Partial<KuroConfig>;
        const restoredConfig: KuroConfig = {
          tts: {
            provider: (restored.tts?.provider as KuroConfig['tts']['provider']) || DEFAULT_CONFIG.tts.provider,
            voice: restored.tts?.voice || DEFAULT_CONFIG.tts.voice,
            smartSummaries: restored.tts?.smartSummaries ?? DEFAULT_CONFIG.tts.smartSummaries,
            summaryProvider: (restored.tts?.summaryProvider as KuroConfig['tts']['summaryProvider']) || DEFAULT_CONFIG.tts.summaryProvider,
            summaryModel: restored.tts?.summaryModel || DEFAULT_CONFIG.tts.summaryModel,
            userName: restored.tts?.userName || DEFAULT_CONFIG.tts.userName,
            messages: {
              stop: restored.tts?.messages?.stop || DEFAULT_CONFIG.tts.messages.stop,
              subagentStop: restored.tts?.messages?.subagentStop || DEFAULT_CONFIG.tts.messages.subagentStop,
              notification: restored.tts?.messages?.notification || DEFAULT_CONFIG.tts.messages.notification,
            },
          },
          validators: {
            ruff: restored.validators?.ruff ?? DEFAULT_CONFIG.validators.ruff,
            ty: restored.validators?.ty ?? DEFAULT_CONFIG.validators.ty,
            timeout: restored.validators?.timeout ?? DEFAULT_CONFIG.validators.timeout,
          },
          hooks: {
            ttsOnStop: restored.hooks?.ttsOnStop ?? DEFAULT_CONFIG.hooks.ttsOnStop,
            ttsOnSubagentStop: restored.hooks?.ttsOnSubagentStop ?? DEFAULT_CONFIG.hooks.ttsOnSubagentStop,
            ttsOnNotification: restored.hooks?.ttsOnNotification ?? DEFAULT_CONFIG.hooks.ttsOnNotification,
            taskSync: restored.hooks?.taskSync ?? DEFAULT_CONFIG.hooks.taskSync,
            transcriptExport: restored.hooks?.transcriptExport ?? DEFAULT_CONFIG.hooks.transcriptExport,
          },
          features: {
            ragInteractive: restored.features?.ragInteractive ?? DEFAULT_CONFIG.features.ragInteractive,
            questionMode: restored.features?.questionMode ?? DEFAULT_CONFIG.features.questionMode,
          },
        };
        setConfig(restoredConfig);
        setHasChanges(false);
        await loadBackups();
      } else {
        console.error('Failed to restore backup:', result.error);
      }
    } catch (err) {
      console.error('Failed to restore backup:', err);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    try {
      const result = await window.electronAPI.kuroConfig.deleteBackup(backupId);
      if (result.ok) {
        await loadBackups();
      } else {
        console.error('Failed to delete backup:', result.error);
      }
    } catch (err) {
      console.error('Failed to delete backup:', err);
    }
  };

  const updateConfig = <K extends keyof KuroConfig>(
    section: K,
    updates: Partial<KuroConfig[K]>
  ) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], ...updates },
    }));
    setHasChanges(true);
  };

  const updateTTSMessage = (key: keyof KuroConfig['tts']['messages'], value: string) => {
    setConfig(prev => ({
      ...prev,
      tts: {
        ...prev.tts,
        messages: { ...prev.tts.messages, [key]: value },
      },
    }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* TTS Settings */}
        <CollapsibleSection title="TTS Settings" icon={Volume2} defaultOpen={true}>
          <FieldRow label="Provider" description="Text-to-speech engine">
            <select
              value={config.tts.provider}
              onChange={(e) => updateConfig('tts', { provider: e.target.value as KuroConfig['tts']['provider'] })}
              className="px-3 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="edge_tts">Edge TTS (Free)</option>
              <option value="pyttsx3">pyttsx3 (Offline)</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="openai">OpenAI</option>
            </select>
          </FieldRow>

          <FieldRow label="Voice" description="Voice for speech synthesis">
            <div className="flex items-center gap-2">
              <select
                value={config.tts.voice}
                onChange={(e) => updateConfig('tts', { voice: e.target.value })}
                className="px-3 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary min-w-48"
                disabled={config.tts.provider === 'edge_tts' && isLoadingVoices}
              >
                {config.tts.provider === 'edge_tts' ? (
                  // Dynamic Edge TTS voices (sorted alphabetically)
                  isLoadingVoices ? (
                    <option value="">Loading voices...</option>
                  ) : sortedEdgeVoices.length > 0 ? (
                    sortedEdgeVoices.map((v) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))
                  ) : (
                    <option value="en-GB-SoniaNeural">Sonia (en-GB, Female)</option>
                  )
                ) : (
                  // Static voices for other providers
                  STATIC_VOICE_OPTIONS[config.tts.provider]?.map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))
                )}
              </select>
              {config.tts.provider === 'edge_tts' && (
                <button
                  onClick={loadEdgeVoices}
                  disabled={isLoadingVoices}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
                  title="Refresh voices"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingVoices ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </FieldRow>

          <FieldRow label="Smart Summaries" description="Use AI to generate contextual task announcements">
            <Toggle
              checked={config.tts.smartSummaries}
              onChange={(checked) => updateConfig('tts', { smartSummaries: checked })}
            />
          </FieldRow>

          {config.tts.smartSummaries && (
            <FieldRow label="Summary Provider" description="AI provider for generating summaries">
              <select
                value={config.tts.summaryProvider}
                onChange={(e) => updateConfig('tts', { summaryProvider: e.target.value as KuroConfig['tts']['summaryProvider'] })}
                className="px-3 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="gateway-auto">Gateway (Auto Fallback)</option>
                <option value="lmstudio">LMStudio (Local)</option>
                <option value="cliproxy">CLI Proxy (Claude/GPT/Gemini)</option>
                <option value="claude">Claude API (Direct)</option>
              </select>
            </FieldRow>
          )}

          {config.tts.smartSummaries && config.tts.summaryProvider === 'lmstudio' && (
            <FieldRow
              label="Summary Model"
              description={
                lmstudioStatus === 'offline'
                  ? 'LMStudio not running on port 1234'
                  : lmstudioStatus === 'online'
                  ? `${lmstudioModels.length} models available`
                  : 'Checking LMStudio...'
              }
            >
              <div className="flex items-center gap-2">
                <select
                  value={config.tts.summaryModel}
                  onChange={(e) => updateConfig('tts', { summaryModel: e.target.value })}
                  disabled={isLoadingModels || lmstudioStatus === 'offline'}
                  className={cn(
                    "px-3 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary min-w-64",
                    lmstudioStatus === 'offline' && "opacity-50"
                  )}
                >
                  {isLoadingModels ? (
                    <option value="">Loading models...</option>
                  ) : lmstudioStatus === 'offline' ? (
                    <option value="">LMStudio offline</option>
                  ) : lmstudioModels.length > 0 ? (
                    lmstudioModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))
                  ) : (
                    <option value="">No models loaded</option>
                  )}
                </select>
                <button
                  onClick={loadLmstudioModels}
                  disabled={isLoadingModels}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
                  title="Refresh models"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingModels ? 'animate-spin' : ''}`} />
                </button>
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    lmstudioStatus === 'online' && "bg-green-500",
                    lmstudioStatus === 'offline' && "bg-red-500",
                    lmstudioStatus === 'unknown' && "bg-yellow-500"
                  )}
                  title={lmstudioStatus === 'online' ? 'LMStudio online' : lmstudioStatus === 'offline' ? 'LMStudio offline' : 'Checking...'}
                />
              </div>
            </FieldRow>
          )}

          <FieldRow label="Your Name" description="Name used in announcements">
            <input
              type="text"
              value={config.tts.userName}
              onChange={(e) => updateConfig('tts', { userName: e.target.value })}
              className="w-32 px-3 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Ryan"
            />
          </FieldRow>

          <FieldRow label="Stop Message" description="Fallback when session ends">
            <input
              type="text"
              value={config.tts.messages.stop}
              onChange={(e) => updateTTSMessage('stop', e.target.value)}
              className="w-80 lg:w-96 px-3 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </FieldRow>

          <FieldRow label="Subagent Stop" description="Fallback when agent finishes">
            <input
              type="text"
              value={config.tts.messages.subagentStop}
              onChange={(e) => updateTTSMessage('subagentStop', e.target.value)}
              className="w-80 lg:w-96 px-3 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </FieldRow>

          <FieldRow label="Notification" description="Fallback for notifications">
            <input
              type="text"
              value={config.tts.messages.notification}
              onChange={(e) => updateTTSMessage('notification', e.target.value)}
              className="w-80 lg:w-96 px-3 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </FieldRow>

          <div className="pt-2">
            <button
              onClick={testTTS}
              disabled={isTesting}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Test TTS
            </button>
          </div>
        </CollapsibleSection>

        {/* Validators */}
        <CollapsibleSection title="Validators" icon={Shield} defaultOpen={false}>
          <FieldRow label="Ruff" description="Python linting on file save">
            <Toggle
              checked={config.validators.ruff}
              onChange={(checked) => updateConfig('validators', { ruff: checked })}
            />
          </FieldRow>

          <FieldRow label="Ty" description="Type checking on file save">
            <Toggle
              checked={config.validators.ty}
              onChange={(checked) => updateConfig('validators', { ty: checked })}
            />
          </FieldRow>

          <FieldRow label="Timeout" description="Validator timeout in ms">
            <input
              type="number"
              value={config.validators.timeout}
              onChange={(e) => updateConfig('validators', { timeout: parseInt(e.target.value) || 30000 })}
              className="w-24 px-3 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </FieldRow>
        </CollapsibleSection>

        {/* Hooks */}
        <CollapsibleSection title="Hooks" icon={Webhook} defaultOpen={false}>
          {teamsActive && (
            <GlobalTtsStatusPanel />
          )}
          <FieldRow label="TTS on Stop" description="Speak when session ends">
            <Toggle
              checked={config.hooks.ttsOnStop}
              onChange={(checked) => updateConfig('hooks', { ttsOnStop: checked })}
            />
          </FieldRow>

          <FieldRow label="TTS on Subagent Stop" description="Speak when agent finishes">
            <Toggle
              checked={config.hooks.ttsOnSubagentStop}
              onChange={(checked) => updateConfig('hooks', { ttsOnSubagentStop: checked })}
            />
          </FieldRow>

          <FieldRow label="TTS on Notification" description="Speak for notifications">
            <Toggle
              checked={config.hooks.ttsOnNotification}
              onChange={(checked) => updateConfig('hooks', { ttsOnNotification: checked })}
            />
          </FieldRow>

          <FieldRow label="Task Sync" description="Sync tasks to ai/todo.md">
            <Toggle
              checked={config.hooks.taskSync}
              onChange={(checked) => updateConfig('hooks', { taskSync: checked })}
            />
          </FieldRow>

          <FieldRow label="Transcript Export" description="Export conversation transcripts">
            <Toggle
              checked={config.hooks.transcriptExport}
              onChange={(checked) => updateConfig('hooks', { transcriptExport: checked })}
            />
          </FieldRow>
        </CollapsibleSection>

        {/* Features */}
        <CollapsibleSection title="Features" icon={Sparkles} defaultOpen={false}>
          <FieldRow label="RAG Interactive Mode" description="Select RAG results before use">
            <Toggle
              checked={config.features.ragInteractive}
              onChange={(checked) => updateConfig('features', { ragInteractive: checked })}
            />
          </FieldRow>

          <FieldRow label="Question Mode" description="Claude asks questions before edits">
            <Toggle
              checked={config.features.questionMode}
              onChange={(checked) => updateConfig('features', { questionMode: checked })}
            />
          </FieldRow>
        </CollapsibleSection>

        {/* Config Backups */}
        <CollapsibleSection title="Config Backups" icon={DatabaseBackup} defaultOpen={false}>
          <div className="space-y-4">
            {/* Create Backup Button */}
            <button
              onClick={() => setShowBackupDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Backup
            </button>

            {/* Backup List */}
            {isLoadingBackups ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading backups...
              </div>
            ) : backups.length === 0 ? (
              <div className="text-muted-foreground text-sm py-4">
                No backups found. Create your first backup to save your current config.
              </div>
            ) : (
              <div className="space-y-2">
                {backups.map(backup => {
                  const isExpanded = expandedBackup === backup.id;
                  const config = backup.config;

                  return (
                    <div key={backup.id} className="bg-secondary/50 rounded-lg border border-border/50 overflow-hidden transition-all">
                      {/* Header */}
                      <div className="flex items-center justify-between p-3">
                        <button
                          onClick={() => setExpandedBackup(isExpanded ? null : backup.id)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left group"
                        >
                          <ChevronRight
                            className={cn(
                              "w-4 h-4 text-muted-foreground transition-transform flex-shrink-0",
                              isExpanded && "rotate-90"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate group-hover:text-primary transition-colors">
                              {backup.name || 'Unnamed Backup'}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {new Date(backup.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => handleRestoreBackup(backup.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors"
                            title="Restore this backup"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            Restore
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(backup.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-destructive/10 hover:bg-destructive/20 text-destructive rounded transition-colors"
                            title="Delete this backup"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Preview */}
                      {isExpanded && config && (
                        <div className="border-t border-border/50 bg-background/50 p-4 space-y-3">
                          {/* TTS Settings */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              <Mic className="w-3.5 h-3.5" />
                              TTS Configuration
                            </div>
                            <div className="pl-5 space-y-1 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Provider:</span>
                                <span className="font-mono text-primary">{config.tts?.provider || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Voice:</span>
                                <span className="font-mono text-xs">{config.tts?.voice || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Smart Summaries:</span>
                                {config.tts?.smartSummaries ? (
                                  <span className="flex items-center gap-1 text-green-500">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Enabled
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <XCircle className="w-3.5 h-3.5" />
                                    Disabled
                                  </span>
                                )}
                              </div>
                              {config.tts?.smartSummaries && (
                                <>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Summary Provider:</span>
                                    <span className="font-mono text-xs">{config.tts?.summaryProvider || 'N/A'}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Model:</span>
                                    <span className="font-mono text-xs">{config.tts?.summaryModel || 'N/A'}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Validators */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              <Shield className="w-3.5 h-3.5" />
                              Validators
                            </div>
                            <div className="pl-5 flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1.5">
                                {config.validators?.ruff ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <span className="font-mono text-xs">ruff</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {config.validators?.ty ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <span className="font-mono text-xs">ty</span>
                              </div>
                            </div>
                          </div>

                          {/* Hooks */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              <Webhook className="w-3.5 h-3.5" />
                              Hooks
                            </div>
                            <div className="pl-5 space-y-1 text-sm">
                              <div className="flex items-center gap-1.5">
                                {config.hooks?.ttsOnStop ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <span className="text-xs">TTS on Stop</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {config.hooks?.ttsOnSubagentStop ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <span className="text-xs">TTS on Subagent Stop</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {config.hooks?.ttsOnNotification ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <span className="text-xs">TTS on Notification</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {config.hooks?.taskSync ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <span className="text-xs">Task Sync</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {config.hooks?.transcriptExport ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <span className="text-xs">Transcript Export</span>
                              </div>
                            </div>
                          </div>

                          {/* Features */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              <Sparkles className="w-3.5 h-3.5" />
                              Features
                            </div>
                            <div className="pl-5 space-y-1 text-sm">
                              <div className="flex items-center gap-1.5">
                                {config.features?.ragInteractive ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <span className="text-xs">RAG Interactive Mode</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {config.features?.questionMode ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <span className="text-xs">Question Mode</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Create Backup Dialog */}
          {showBackupDialog && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBackupDialog(false)}>
              <div className="bg-background p-6 rounded-lg max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-semibold mb-4">Create Config Backup</h3>
                <input
                  type="text"
                  value={backupName}
                  onChange={e => setBackupName(e.target.value)}
                  placeholder="Optional backup name (e.g., 'Before TTS changes')"
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setShowBackupDialog(false); setBackupName(''); }}
                    className="px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateBackup}
                    className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors"
                  >
                    Create Backup
                  </button>
                </div>
              </div>
            </div>
          )}
        </CollapsibleSection>

        {/* Voice Library */}
        {config.tts.provider === 'edge_tts' && (
          <CollapsibleSection title="Voice Library" icon={Library} defaultOpen={false}>
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search voices..."
                    value={voiceFilter}
                    onChange={(e) => setVoiceFilter(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <select
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value as 'all' | 'Male' | 'Female')}
                  className="px-3 py-2 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All Genders</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
                <button
                  onClick={loadEdgeVoices}
                  disabled={isLoadingVoices}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                  title="Refresh voice list"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingVoices ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Voice count */}
              <p className="text-xs text-muted-foreground">
                {isLoadingVoices ? 'Loading voices...' : `${filteredVoices.length} voices available`}
              </p>

              {/* Voice grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-2">
                {filteredVoices.map((voice) => (
                  <div
                    key={voice.value}
                    className={`
                      flex items-center justify-between p-3 rounded-lg border transition-colors
                      ${config.tts.voice === voice.value
                        ? 'bg-primary/10 border-primary'
                        : 'bg-secondary/30 border-border hover:bg-secondary/50'
                      }
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {voice.label.split(' (')[0]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {voice.locale} · {voice.gender}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => previewVoice(voice.value)}
                        disabled={previewingVoice !== null}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                        title="Preview voice"
                      >
                        {previewingVoice === voice.value ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => selectVoice(voice.value)}
                        className={`
                          p-1.5 rounded transition-colors
                          ${config.tts.voice === voice.value
                            ? 'text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                          }
                        `}
                        title={config.tts.voice === voice.value ? 'Selected' : 'Select voice'}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* No results message */}
              {!isLoadingVoices && filteredVoices.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No voices match your filters
                </p>
              )}
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-background">
        <div className="text-xs text-muted-foreground">
          {hasChanges ? 'Unsaved changes' : 'All changes saved'}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadConfig}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={saveConfig}
            disabled={isSaving || !hasChanges}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors
              ${hasChanges
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-muted-foreground cursor-not-allowed'
              }
            `}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
