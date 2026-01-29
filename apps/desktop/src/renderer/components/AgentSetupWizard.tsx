/**
 * LeaderSetupWizard - Single-step leader agent configuration
 *
 * Configures the leader agent with:
 * - LLM backend selection (LM Studio, Claude API, Claude Code CLI, OpenAI, Custom)
 * - Agent name
 * - Endpoint URL
 * - Model name
 * - Bootstrap file path
 * - Advanced settings (temperature, max tokens) - LM Studio only
 * - CLI system prompt (Claude Code CLI only) - auto-loads KURORYUU_LEADER.md
 *
 * Workers are added via the Worker Wizard when clicking + to add terminals.
 */
import { useState, useEffect } from 'react';
import {
  Crown,
  Cpu,
  Sparkles,
  Zap,
  ChevronDown,
  ChevronUp,
  Settings,
  Globe,
  TerminalSquare,
  Terminal,
  Loader2,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { useAgentConfigStore, type AgentConfig } from '../stores/agent-config-store';

interface BackendTemplate {
  id: string;
  name: string;
  backend: 'lmstudio' | 'claude' | 'claude-cli' | 'openai' | 'custom' | 'terminal';
  defaultEndpoint: string;
  defaultModel: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  requiresApiKey: boolean;
  isTerminalOnly?: boolean;
  isCliMode?: boolean;  // True for Claude Code CLI - spawns CLI with system prompt
}

const BACKEND_TEMPLATES: BackendTemplate[] = [
  {
    id: 'lmstudio',
    name: 'LM Studio',
    backend: 'lmstudio',
    defaultEndpoint: 'http://169.254.83.107:1234',
    defaultModel: 'devstral-small',
    description: 'Local models via LM Studio. Uses kuroryuu-cli.',
    icon: <Cpu className="w-5 h-5" />,
    color: 'from-green-500 to-emerald-600',
    requiresApiKey: false,
  },
  {
    id: 'claude',
    name: 'Claude API',
    backend: 'claude',
    defaultEndpoint: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    description: 'Anthropic Claude. Powerful reasoning and orchestration.',
    icon: <Sparkles className="w-5 h-5" />,
    color: 'from-orange-500 to-amber-600',
    requiresApiKey: true,
  },
  {
    id: 'claude-cli',
    name: 'Claude Code',
    backend: 'claude-cli',
    defaultEndpoint: '',
    defaultModel: 'claude-code',
    description: 'Claude Code CLI. Auto-injects KURORYUU_LEADER.md bootstrap.',
    icon: <Terminal className="w-5 h-5" />,
    color: 'from-orange-400 to-yellow-500',
    requiresApiKey: false,
    isCliMode: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    backend: 'openai',
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4-turbo',
    description: 'OpenAI GPT-4. Versatile and widely supported.',
    icon: <Zap className="w-5 h-5" />,
    color: 'from-blue-500 to-cyan-600',
    requiresApiKey: true,
  },
  {
    id: 'custom',
    name: 'Custom',
    backend: 'custom',
    defaultEndpoint: 'http://localhost:8080',
    defaultModel: 'custom-model',
    description: 'Custom OpenAI-compatible endpoint.',
    icon: <Globe className="w-5 h-5" />,
    color: 'from-muted-foreground to-muted',
    requiresApiKey: false,
  },
  {
    id: 'terminal',
    name: 'Terminal Only',
    backend: 'terminal',
    defaultEndpoint: '',
    defaultModel: '',
    description: 'Plain terminal without AI agent. Good for manual work.',
    icon: <TerminalSquare className="w-5 h-5" />,
    color: 'from-muted to-muted',
    requiresApiKey: false,
    isTerminalOnly: true,
  },
];

interface Props {
  onComplete: () => void;
  projectRoot?: string;
  /** Callback to create leader terminal directly (Quizmaster pattern for Ralph mode) */
  onCreateLeaderTerminal?: (config: AgentConfig) => void;
}

export function AgentSetupWizard({ onComplete, projectRoot = '', onCreateLeaderTerminal }: Props) {
  // Default bootstrap path based on project root
  const defaultBootstrapPath = projectRoot
    ? `${projectRoot.replace(/\//g, '\\\\')}\\KURORYUU_LEADER.md`
    : 'KURORYUU_LEADER.md';

  // Store actions only - no reading stale state for defaults
  const { setLeaderAgent, completeSetup } = useAgentConfigStore();

  // Form state - always start fresh with LM Studio defaults
  // The key prop on this component forces remount on reset, so useState always gets fresh values
  const [selectedBackend, setSelectedBackend] = useState<BackendTemplate>(BACKEND_TEMPLATES[0]);
  const [agentName, setAgentName] = useState('Leader');
  const [endpoint, setEndpoint] = useState(BACKEND_TEMPLATES[0].defaultEndpoint);
  const [modelName, setModelName] = useState(BACKEND_TEMPLATES[0].defaultModel);
  const [apiKey, setApiKey] = useState('');
  const [bootstrapPath, setBootstrapPath] = useState(defaultBootstrapPath);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);

  // CLI mode state (for Claude Code CLI)
  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null);
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [cliVersion, setCliVersion] = useState<string | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);
  // Ralph mode - autonomous task orchestration personality
  const [ralphMode, setRalphMode] = useState(false);

  const isTerminalOnly = selectedBackend.id === 'terminal';
  const isCliMode = selectedBackend.isCliMode === true;

  const handleBackendChange = (template: BackendTemplate) => {
    setSelectedBackend(template);
    setEndpoint(template.defaultEndpoint);
    setModelName(template.defaultModel);
    // Clear API key when switching to non-API backend
    if (!template.requiresApiKey) {
      setApiKey('');
    }
  };

  // Detect Claude CLI availability on mount
  useEffect(() => {
    if (window.electronAPI?.cli?.detect) {
      window.electronAPI.cli.detect('claude')
        .then((result) => {
          setCliAvailable(result.found);
          setCliPath(result.path || null);
          setCliVersion(result.version || null);
          setCliError(result.found ? null : result.message);
        })
        .catch((err) => {
          console.error('[AgentSetupWizard] CLI detection failed:', err);
          setCliAvailable(false);
          setCliError('Detection failed');
        });
    }
  }, []);

  const handleStart = () => {
    // Build config based on mode
    const leaderConfig: AgentConfig = {
      id: `leader_${selectedBackend.id}_${Date.now()}`,
      name: agentName.trim() || (isTerminalOnly ? 'Terminal' : isCliMode ? 'Leader (Claude Code)' : `${selectedBackend.name} Leader`),
      role: 'leader',
      modelName: isTerminalOnly ? '' : modelName,
      backend: selectedBackend.backend,
      capabilities: isTerminalOnly ? ['terminal'] : ['orchestration', 'chat', 'code', 'terminal'],
      enabled: true,
      endpoint: isTerminalOnly || isCliMode ? '' : endpoint,
      apiKey: apiKey || undefined,
      bootstrapPath: isTerminalOnly ? '' : bootstrapPath,
      temperature: selectedBackend.id === 'lmstudio' ? temperature : undefined,
      maxTokens: selectedBackend.id === 'lmstudio' ? maxTokens : undefined,
      isTerminalOnly: isTerminalOnly,
      // CLI mode fields - @KURORYUU_LEADER.md will be added in buildCliConfig
      cliProvider: isCliMode ? 'claude' : undefined,
      cliPath: isCliMode ? (cliPath || undefined) : undefined,
      // Ralph mode - autonomous orchestration personality
      ralphMode: isCliMode ? ralphMode : undefined,
      // Claude mode flag for terminal
      claudeModeEnabled: isCliMode ? true : undefined,
    };

    // Ralph mode: Use Quizmaster pattern (direct terminal creation for instant spawn)
    if (ralphMode && onCreateLeaderTerminal) {
      console.log('[AgentSetupWizard] Ralph mode - using direct terminal creation (Quizmaster pattern)');
      setLeaderAgent(leaderConfig);
      completeSetup();
      onCreateLeaderTerminal(leaderConfig);
      onComplete();
      return;
    }

    // Normal flow: set config and let TerminalGrid useEffect create terminal
    setLeaderAgent(leaderConfig);
    completeSetup();
    onComplete();
  };

  const isLmStudio = selectedBackend.id === 'lmstudio';

  // Validation: All modes require agent name
  // Terminal Only just needs name
  // CLI mode needs CLI available and name
  // API backends need name/endpoint/model
  const isValid = isTerminalOnly
    ? agentName.trim()
    : isCliMode
    ? (cliAvailable === true && agentName.trim())
    : (endpoint.trim() && modelName.trim() && agentName.trim());

  return (
    <div className="w-full h-full flex items-center justify-center bg-background p-8">
      <div className="max-w-xl w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-yellow-500 to-amber-600 mb-3">
            <Crown className="w-7 h-7 text-black" />
          </div>
          <h1 className="text-xl font-bold text-white mb-1">Leader Setup</h1>
          <p className="text-sm text-muted-foreground">Configure the leader agent for your session</p>
        </div>

        <div className="space-y-4">
          {/* Agent Name - shown for all backends including Terminal */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Agent Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-white text-sm focus:outline-none focus:border-primary transition-colors"
              placeholder="Leader"
            />
          </div>

          {/* Backend Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              LLM Backend
            </label>
            <div className="grid grid-cols-6 gap-2">
              {BACKEND_TEMPLATES.map((template) => {
                const isClaudeCliTemplate = template.id === 'claude-cli';
                const cliDisabled = isClaudeCliTemplate && cliAvailable === false;

                return (
                  <button
                    key={template.id}
                    onClick={() => handleBackendChange(template)}
                    disabled={cliDisabled}
                    className={`p-3 rounded-lg border-2 text-center transition-all relative ${
                      selectedBackend.id === template.id
                        ? 'border-primary bg-primary/10'
                        : cliDisabled
                        ? 'border-border bg-card/50 opacity-50 cursor-not-allowed'
                        : 'border-border bg-card hover:border-muted-foreground'
                    }`}
                    title={cliDisabled ? 'Claude Code CLI not installed' : template.description}
                  >
                    <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br ${template.color} mb-1`}>
                      {template.icon}
                    </div>
                    <div className="text-xs font-medium text-foreground truncate">{template.name}</div>
                    {isClaudeCliTemplate && cliVersion && (
                      <div className="text-[10px] text-muted-foreground truncate">v{cliVersion}</div>
                    )}
                    {isClaudeCliTemplate && cliAvailable === false && (
                      <div className="absolute -top-1 -right-1">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{selectedBackend.description}</p>

            {/* CLI not installed warning */}
            {isCliMode && cliAvailable === false && cliError && (
              <div className="mt-2 p-3 bg-amber-900/20 border border-amber-800/50 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="text-amber-300 font-medium">Claude Code CLI not installed</p>
                    <code className="block mt-1 text-muted-foreground bg-card px-2 py-1 rounded">
                      npm install -g @anthropic-ai/claude-code
                    </code>
                    <a
                      href="https://claude.ai/claude-code"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-blue-400 hover:text-blue-300"
                    >
                      Install Guide <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Configuration fields - hidden for Terminal Only */}
          {!isTerminalOnly && !isCliMode && (
            <>
              {/* Endpoint URL */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Endpoint URL
                </label>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-white text-sm focus:outline-none focus:border-primary transition-colors"
                  placeholder="http://localhost:1234"
                />
              </div>

              {/* Model Name */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-white text-sm focus:outline-none focus:border-primary transition-colors"
                  placeholder="devstral-small"
                />
              </div>

              {/* API Key (conditional) */}
              {selectedBackend.requiresApiKey && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    API Key <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-white text-sm focus:outline-none focus:border-primary transition-colors"
                    placeholder="sk-..."
                  />
                </div>
              )}

              {/* Bootstrap Path */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Bootstrap File
                </label>
                <input
                  type="text"
                  value={bootstrapPath}
                  onChange={(e) => setBootstrapPath(e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-white text-sm focus:outline-none focus:border-primary transition-colors"
                  placeholder={defaultBootstrapPath}
                />
              </div>

              {/* Advanced Settings Toggle - LM Studio only */}
              {isLmStudio && (
                <>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Advanced Settings
                    {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {/* Advanced Settings Panel */}
                  {showAdvanced && (
                    <div className="bg-card/50 border border-border rounded-lg p-4 space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <label className="text-sm font-medium text-foreground">Temperature</label>
                          <span className="text-sm text-muted-foreground">{temperature.toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={temperature}
                          onChange={(e) => setTemperature(parseFloat(e.target.value))}
                          className="w-full accent-yellow-500"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Precise</span>
                          <span>Creative</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Max Tokens
                        </label>
                        <input
                          type="number"
                          value={maxTokens}
                          onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                          min={256}
                          max={32768}
                          className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-white text-sm focus:outline-none focus:border-primary transition-colors"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* CLI Mode: Bootstrap Info */}
          {isCliMode && cliAvailable && (
            <div className="p-3 bg-card/50 border border-border rounded-lg">
              <p className="text-sm text-foreground">
                Will launch with <code className="text-primary">@KURORYUU_LEADER.md</code>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Leader bootstrap loaded automatically via @ file reference
              </p>
            </div>
          )}

          {/* Ralph Mode Toggle (CLI only) */}
          {isCliMode && cliAvailable && (
            <div className="p-3 bg-card/50 border border-border rounded-lg">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ralphMode}
                  onChange={(e) => setRalphMode(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-0"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Ralph Mode</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Autonomous task orchestration via k_pty. Monitors worker terminal for promise signals.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Start Button */}
          <div className="flex justify-end pt-4">
            <button
              onClick={handleStart}
              disabled={!isValid}
              className="px-6 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-medium rounded-lg hover:from-yellow-400 hover:to-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              {isTerminalOnly ? 'Open Terminal' : isCliMode ? 'Start Claude Code' : 'Start Leader'}
            </button>
          </div>
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Click + to add worker terminals after setup
        </p>
      </div>
    </div>
  );
}

