/**
 * LeaderSetupWizard - Cinematic leader agent configuration
 *
 * A visually striking setup experience with animated backgrounds,
 * glassmorphic cards, and smooth transitions.
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
  AlertCircle,
  ExternalLink,
  Sparkle,
  Info
} from 'lucide-react';
import { useAgentConfigStore, type AgentConfig } from '../stores/agent-config-store';

interface BackendExplanation {
  title: string;
  description: string;
  features: string[];
  useCase: string;
}

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
  isCliMode?: boolean;
  explanation?: BackendExplanation;
}

const BACKEND_TEMPLATES: BackendTemplate[] = [
  {
    id: 'lmstudio',
    name: 'LM Studio',
    backend: 'lmstudio',
    defaultEndpoint: 'http://169.254.83.107:1234',
    defaultModel: 'devstral-small',
    description: 'Local models via LM Studio. Uses kuroryuu-cli.',
    icon: <Cpu className="w-6 h-6" />,
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
    icon: <Sparkles className="w-6 h-6" />,
    color: 'from-orange-500 to-amber-600',
    requiresApiKey: true,
  },
  {
    id: 'claude-cli',
    name: 'Claude Code',
    backend: 'claude-cli',
    defaultEndpoint: '',
    defaultModel: 'claude-code',
    description: 'Launch Claude Code CLI with leader bootstrap',
    icon: <Terminal className="w-6 h-6" />,
    color: 'from-amber-400 to-orange-500',
    requiresApiKey: false,
    isCliMode: true,
    explanation: {
      title: 'Claude Code CLI',
      description: 'Launches the Claude Code CLI with Kuroryuu\'s leader bootstrap automatically loaded. Claude becomes your AI pair programmer with full access to MCP tools.',
      features: [
        'AI-powered code assistance',
        'Auto-loads KURORYUU_LEADER.md',
        'Access to MCP tools (RAG, PTY, files)',
        'Multi-agent orchestration ready'
      ],
      useCase: 'Best for AI-assisted development, task delegation, and orchestration.'
    },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    backend: 'openai',
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4-turbo',
    description: 'OpenAI GPT-4. Versatile and widely supported.',
    icon: <Zap className="w-6 h-6" />,
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
    icon: <Globe className="w-6 h-6" />,
    color: 'from-muted-foreground to-muted',
    requiresApiKey: false,
  },
  {
    id: 'terminal',
    name: 'Terminal',
    backend: 'terminal',
    defaultEndpoint: '',
    defaultModel: '',
    description: 'Plain terminal for manual commands',
    icon: <TerminalSquare className="w-6 h-6" />,
    color: 'from-zinc-500 to-zinc-600',
    requiresApiKey: false,
    isTerminalOnly: true,
    explanation: {
      title: 'Plain Terminal',
      description: 'Opens a standard PowerShell/Bash terminal without any AI agent. You have full manual control over all commands.',
      features: [
        'Direct command execution',
        'No AI overhead or token usage',
        'Full terminal capabilities',
        'Ideal for quick manual tasks'
      ],
      useCase: 'Best for manual work, debugging, or when you want complete control.'
    },
  },
];

const VISIBLE_BACKEND_IDS = ['terminal', 'claude-cli'];
const DEFAULT_BACKEND = BACKEND_TEMPLATES.find(t => t.id === 'terminal')!;

interface Props {
  onComplete: () => void;
  projectRoot?: string;
  onCreateLeaderTerminal?: (config: AgentConfig) => void;
}

export function AgentSetupWizard({ onComplete, projectRoot = '', onCreateLeaderTerminal }: Props) {
  const defaultBootstrapPath = projectRoot
    ? `${projectRoot.replace(/\//g, '\\\\')}\\KURORYUU_LEADER.md`
    : 'KURORYUU_LEADER.md';

  const { setLeaderAgent, completeSetup } = useAgentConfigStore();

  const [selectedBackend, setSelectedBackend] = useState<BackendTemplate>(DEFAULT_BACKEND);
  const [endpoint, setEndpoint] = useState(DEFAULT_BACKEND.defaultEndpoint);
  const [modelName, setModelName] = useState(DEFAULT_BACKEND.defaultModel);
  const [apiKey, setApiKey] = useState('');
  const [bootstrapPath, setBootstrapPath] = useState(defaultBootstrapPath);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null);
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [cliVersion, setCliVersion] = useState<string | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);
  const [ralphMode, setRalphMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showExplanation, setShowExplanation] = useState<string | null>(null);

  const isTerminalOnly = selectedBackend.id === 'terminal';
  const isCliMode = selectedBackend.isCliMode === true;

  // Mount animation
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleBackendChange = (template: BackendTemplate) => {
    setSelectedBackend(template);
    setEndpoint(template.defaultEndpoint);
    setModelName(template.defaultModel);
    if (!template.requiresApiKey) {
      setApiKey('');
    }
  };

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
    const leaderConfig: AgentConfig = {
      id: `leader_${selectedBackend.id}_${Date.now()}`,
      name: isTerminalOnly ? 'Terminal' : isCliMode ? 'Leader (Claude Code)' : `${selectedBackend.name} Leader`,
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
      cliProvider: isCliMode ? 'claude' : undefined,
      cliPath: isCliMode ? (cliPath || undefined) : undefined,
      ralphMode: isCliMode ? ralphMode : undefined,
      claudeModeEnabled: isCliMode ? true : undefined,
    };

    if (ralphMode && onCreateLeaderTerminal) {
      setLeaderAgent(leaderConfig);
      completeSetup();
      onCreateLeaderTerminal(leaderConfig);
      onComplete();
      return;
    }

    setLeaderAgent(leaderConfig);
    completeSetup();
    onComplete();
  };

  const isLmStudio = selectedBackend.id === 'lmstudio';
  const isValid = isTerminalOnly
    ? true
    : isCliMode
    ? (cliAvailable === true)
    : (endpoint.trim() && modelName.trim());

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0a0a0b]">
      {/* Animated background layers */}
      <div className="absolute inset-0">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d0d0f] via-[#0a0a0b] to-[#080808]" />

        {/* Animated mesh gradient orbs */}
        <div
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(251,191,36,0.15) 0%, transparent 70%)',
            animation: 'pulse 8s ease-in-out infinite',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(249,115,22,0.12) 0%, transparent 70%)',
            animation: 'pulse 10s ease-in-out infinite reverse',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-10"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 60%)',
            filter: 'blur(100px)',
          }}
        />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        {/* Noise texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%)',
          }}
        />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-amber-400/30"
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
              animation: `float ${6 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.8}s`,
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 w-full h-full overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-8">
          <div
            className={`w-full max-w-md transition-all duration-700 ease-out ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
          {/* Header */}
          <div className="text-center mb-10">
            {/* Crown icon with glow */}
            <div className="relative inline-flex items-center justify-center mb-6">
              {/* Outer glow rings */}
              <div
                className="absolute w-24 h-24 rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(251,191,36,0.2) 0%, transparent 70%)',
                  animation: 'pulse 3s ease-in-out infinite',
                }}
              />
              <div
                className="absolute w-20 h-20 rounded-full border border-amber-500/20"
                style={{ animation: 'pulse 3s ease-in-out infinite 0.5s' }}
              />

              {/* Main icon container */}
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
                <Crown className="w-8 h-8 text-black" strokeWidth={2.5} />
              </div>
            </div>

            <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">
              Leader Setup
            </h1>
            <p className="text-zinc-500 text-sm">
              Choose how to start your session
            </p>
          </div>

          {/* Selection cards */}
          <div className="space-y-3 mb-8">
            {BACKEND_TEMPLATES.filter(t => VISIBLE_BACKEND_IDS.includes(t.id)).map((template, index) => {
              const isClaudeCliTemplate = template.id === 'claude-cli';
              const cliDisabled = isClaudeCliTemplate && cliAvailable === false;
              const isSelected = selectedBackend.id === template.id;

              return (
                <button
                  key={template.id}
                  onClick={() => handleBackendChange(template)}
                  disabled={cliDisabled}
                  className={`
                    group relative w-full p-4 rounded-2xl text-left transition-all duration-300 ease-out
                    ${isSelected
                      ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/50'
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/10'
                    }
                    border backdrop-blur-sm
                    ${cliDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  style={{
                    transitionDelay: `${index * 50}ms`,
                  }}
                >
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className={`
                      relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300
                      ${isSelected
                        ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-black shadow-lg shadow-amber-500/20'
                        : 'bg-white/5 text-zinc-400 group-hover:bg-white/10 group-hover:text-zinc-300'
                      }
                    `}>
                      {template.icon}
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-[#0a0a0b]" />
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium transition-colors ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                          {template.name}
                        </span>
                        {isClaudeCliTemplate && cliVersion && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            v{cliVersion}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-500 truncate">
                        {template.description}
                      </p>
                    </div>

                    {/* Selection indicator */}
                    <div className={`
                      w-5 h-5 rounded-full border-2 transition-all duration-200 flex items-center justify-center
                      ${isSelected
                        ? 'border-amber-400 bg-amber-400'
                        : 'border-zinc-600 group-hover:border-zinc-500'
                      }
                    `}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    {/* Info dropdown toggle */}
                    {template.explanation && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowExplanation(showExplanation === template.id ? null : template.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            setShowExplanation(showExplanation === template.id ? null : template.id);
                          }
                        }}
                        className="ml-2 p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                        title="Learn more"
                      >
                        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${
                          showExplanation === template.id ? 'rotate-180 text-amber-400' : ''
                        }`} />
                      </div>
                    )}
                  </div>

                  {/* CLI warning */}
                  {isClaudeCliTemplate && cliAvailable === false && (
                    <div className="absolute -top-1 -right-1">
                      <AlertCircle className="w-5 h-5 text-amber-500" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Explanation Panel - appears when dropdown clicked */}
          {showExplanation && (() => {
            const explanation = BACKEND_TEMPLATES.find(t => t.id === showExplanation)?.explanation;
            if (!explanation) return null;
            return (
              <div
                className="mb-6 p-5 rounded-xl bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.08] backdrop-blur-sm"
                style={{ animation: 'fadeIn 0.3s ease-out' }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <Info className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-white mb-2">
                      {explanation.title}
                    </h4>
                    <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
                      {explanation.description}
                    </p>

                    {/* Features list */}
                    <div className="space-y-2 mb-4">
                      {explanation.features.map((feature, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span className="text-zinc-300">{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* Use case */}
                    <div className="pt-3 border-t border-white/[0.06]">
                      <p className="text-xs text-zinc-500">
                        <span className="text-amber-400/80">When to use:</span> {explanation.useCase}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* CLI not installed warning */}
          {isCliMode && cliAvailable === false && cliError && (
            <div
              className="mb-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 backdrop-blur-sm"
              style={{ animation: 'fadeIn 0.3s ease-out' }}
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-amber-300 font-medium text-sm">Claude Code CLI not installed</p>
                  <code className="block mt-2 text-xs text-zinc-400 bg-black/30 px-3 py-2 rounded-lg font-mono">
                    npm install -g @anthropic-ai/claude-code
                  </code>
                  <a
                    href="https://claude.ai/claude-code"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Installation Guide <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* CLI Bootstrap info */}
          {isCliMode && cliAvailable && (
            <div
              className="mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-sm"
              style={{ animation: 'fadeIn 0.3s ease-out' }}
            >
              <div className="flex items-center gap-3">
                <Sparkle className="w-5 h-5 text-amber-400" />
                <div>
                  <p className="text-zinc-300 text-sm">
                    Launches with <code className="text-amber-400 font-mono">@KURORYUU_LEADER.md</code>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Ralph Mode Toggle */}
          {isCliMode && cliAvailable && (
            <div
              className="mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-sm"
              style={{ animation: 'fadeIn 0.3s ease-out 0.1s both' }}
            >
              <label className="flex items-center gap-4 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={ralphMode}
                    onChange={(e) => setRalphMode(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`
                    w-11 h-6 rounded-full transition-colors duration-200
                    ${ralphMode ? 'bg-amber-500' : 'bg-zinc-700'}
                  `}>
                    <div className={`
                      absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200
                      ${ralphMode ? 'translate-x-5' : 'translate-x-0'}
                    `} />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium text-zinc-200">Ralph Mode</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Autonomous orchestration via k_pty
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Configuration fields for non-terminal, non-CLI modes */}
          {!isTerminalOnly && !isCliMode && (
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Endpoint URL</label>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.05] transition-all placeholder-zinc-600"
                  placeholder="http://localhost:1234"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Model</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.05] transition-all placeholder-zinc-600"
                  placeholder="devstral-small"
                />
              </div>
              {selectedBackend.requiresApiKey && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.05] transition-all placeholder-zinc-600"
                    placeholder="sk-..."
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Bootstrap File</label>
                <input
                  type="text"
                  value={bootstrapPath}
                  onChange={(e) => setBootstrapPath(e.target.value)}
                  className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.05] transition-all placeholder-zinc-600"
                  placeholder={defaultBootstrapPath}
                />
              </div>
              {isLmStudio && (
                <>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Advanced Settings
                    {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showAdvanced && (
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                      <div>
                        <div className="flex justify-between mb-2">
                          <label className="text-sm text-zinc-400">Temperature</label>
                          <span className="text-sm text-zinc-500">{temperature.toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={temperature}
                          onChange={(e) => setTemperature(parseFloat(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-zinc-400 mb-2">Max Tokens</label>
                        <input
                          type="number"
                          value={maxTokens}
                          onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                          min={256}
                          max={32768}
                          className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 transition-all"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={handleStart}
            disabled={!isValid}
            className={`
              group relative w-full py-4 rounded-2xl font-semibold text-base transition-all duration-300
              ${isValid
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-black hover:shadow-xl hover:shadow-amber-500/25 hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }
            `}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <Zap className={`w-5 h-5 ${isValid ? 'text-black' : 'text-zinc-500'}`} />
              {isTerminalOnly ? 'Open Terminal' : isCliMode ? 'Start Claude Code' : 'Start Leader'}
            </span>
            {isValid && (
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            )}
          </button>

          {/* Footer */}
          <p className="text-center text-xs text-zinc-600 mt-6">
            Click <span className="text-zinc-500">+</span> to add worker terminals after setup
          </p>
        </div>
        </div>
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.1); opacity: 0.2; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.3; }
          25% { transform: translateY(-20px) translateX(10px); opacity: 0.5; }
          50% { transform: translateY(-10px) translateX(-5px); opacity: 0.4; }
          75% { transform: translateY(-25px) translateX(5px); opacity: 0.3; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
