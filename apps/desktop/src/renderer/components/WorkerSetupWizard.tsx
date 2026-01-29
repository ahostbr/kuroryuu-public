/**
 * WorkerSetupWizard - Unified progressive disclosure wizard for adding agents
 *
 * Features:
 * - Progressive disclosure: Provider → Role → Subtype → Config
 * - Role selection (Worker | Thinker | Specialist | Workflow) for Claude Code only
 * - Auto-populated @ files based on role/subtype
 * - CLI availability detection with install hints
 * - Manual CLI path fallback
 */
import { useState, useEffect, useMemo } from 'react';
import {
  User,
  Cpu,
  Sparkles,
  Terminal as TerminalIcon,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  Plus,
  FileText,
  ExternalLink,
  AlertCircle,
  GitBranch,
  AlertTriangle,
  FolderOpen,
  Brain,
  Workflow,
  Lightbulb,
  Search,
  Wrench,
  GitMerge,
  Flame,
  Atom,
  Target,
  Shield,
  Heart,
  Network,
  ShieldAlert,
  Gauge,
  TestTube,
  FilePlus,
  BookOpen,
  PlayCircle,
  CheckCircle,
  ShieldCheck,
  Code,
  Settings,
  Trophy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAgentConfigStore, type AgentConfig } from '../stores/agent-config-store';
import { useWorktreesStore } from '../stores/worktrees-store';
import type { Worktree } from '../types/worktree';

type CliProvider = 'claude' | 'kuroryuu' | 'shell';
type AgentRole = 'worker' | 'thinker' | 'specialist' | 'workflow';

interface CliDetectionResult {
  available: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
  installCmd: string | null;
  installUrl: string | null;
}

interface ProviderTemplate {
  id: CliProvider;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  supportsSystemPrompt: boolean;
  supportsAtFiles: boolean;
  installCmd: string | null;
  installUrl: string | null;
}

interface RoleOption {
  id: AgentRole;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  hasSubtypes: boolean;
}

interface SubtypeOption {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  category?: string;
  style?: string;
  toolProfile?: string;
}

const CLI_PROVIDERS: ProviderTemplate[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'Anthropic Claude CLI. Supports system prompts and @ file references.',
    icon: <Sparkles className="w-5 h-5" />,
    color: 'from-orange-500 to-amber-600',
    supportsSystemPrompt: true,
    supportsAtFiles: true,
    installCmd: 'npm install -g @anthropic-ai/claude-code',
    installUrl: 'https://claude.ai/claude-code',
  },
  {
    id: 'kuroryuu',
    name: 'Kuroryuu CLI',
    description: 'Local Kuroryuu CLI. Connects to LM Studio backend.',
    icon: <Cpu className="w-5 h-5" />,
    color: 'from-green-500 to-emerald-600',
    supportsSystemPrompt: false,
    supportsAtFiles: false,
    installCmd: 'pip install kuroryuu-cli',
    installUrl: null,
  },
  {
    id: 'shell',
    name: 'Plain Shell',
    description: 'Raw terminal shell. No AI agent, just a command line.',
    icon: <TerminalIcon className="w-5 h-5" />,
    color: 'from-muted-foreground to-muted',
    supportsSystemPrompt: false,
    supportsAtFiles: false,
    installCmd: null,
    installUrl: null,
  },
];

const AGENT_ROLES: RoleOption[] = [
  {
    id: 'worker',
    name: 'Worker',
    description: 'General-purpose agent for code execution',
    icon: User,
    color: '#3B82F6',
    hasSubtypes: false,
  },
  {
    id: 'thinker',
    name: 'Thinker',
    description: 'Debate & reasoning specialist',
    icon: Brain,
    color: '#FFD700',
    hasSubtypes: true,
  },
  {
    id: 'specialist',
    name: 'Specialist',
    description: 'Task-focused expert agent',
    icon: Sparkles,
    color: '#10B981',
    hasSubtypes: true,
  },
  {
    id: 'workflow',
    name: 'Workflow',
    description: 'PRD execution specialist',
    icon: Workflow,
    color: '#8B5CF6',
    hasSubtypes: true,
  },
];

const THINKER_PERSONAS: SubtypeOption[] = [
  { id: 'visionary', name: 'Visionary', description: 'Creative exploration', icon: Lightbulb, color: '#FFD700', category: 'exploration' },
  { id: 'skeptic', name: 'Skeptic', description: 'Rigorous evaluation', icon: Search, color: '#4A90D9', category: 'evaluation' },
  { id: 'pragmatist', name: 'Pragmatist', description: 'Practical grounding', icon: Wrench, color: '#28A745', category: 'execution' },
  { id: 'synthesizer', name: 'Synthesizer', description: 'Integration focus', icon: GitMerge, color: '#9B59B6', category: 'integration' },
  { id: 'devils_advocate', name: "Devil's Advocate", description: 'Contrarian challenge', icon: Flame, color: '#E74C3C', category: 'stress-testing' },
  { id: 'first_principles', name: 'First Principles', description: 'Fundamental reasoning', icon: Atom, color: '#3498DB', category: 'analysis' },
  { id: 'red_team', name: 'Red Team', description: 'Security attacker', icon: Target, color: '#C0392B', category: 'security' },
  { id: 'blue_team', name: 'Blue Team', description: 'Security defender', icon: Shield, color: '#2980B9', category: 'security' },
  { id: 'user_advocate', name: 'User Advocate', description: 'UX perspective', icon: Heart, color: '#E91E63', category: 'experience' },
  { id: 'systems_thinker', name: 'Systems Thinker', description: 'Holistic analysis', icon: Network, color: '#17A2B8', category: 'analysis' },
];

const SPECIALIST_TYPES: SubtypeOption[] = [
  { id: 'security_auditor', name: 'Security Auditor', description: 'Vulnerability analysis', icon: ShieldAlert, color: '#DC2626', toolProfile: 'read_only' },
  { id: 'performance_optimizer', name: 'Performance', description: 'Optimization expert', icon: Gauge, color: '#F59E0B', toolProfile: 'read_only' },
  { id: 'doc_writer', name: 'Doc Writer', description: 'Documentation', icon: FileText, color: '#3B82F6', toolProfile: 'write_docs' },
  { id: 'test_generator', name: 'Test Generator', description: 'Test creation', icon: TestTube, color: '#10B981', toolProfile: 'write_tests' },
];

const WORKFLOW_TYPES: SubtypeOption[] = [
  { id: 'prd_generator', name: 'Generator', description: 'Create PRD documents', icon: FilePlus, color: '#8B5CF6', toolProfile: 'write_reports' },
  { id: 'prd_primer', name: 'Primer', description: 'Load context & prepare', icon: BookOpen, color: '#7C3AED', toolProfile: 'read_analyze' },
  { id: 'prd_executor', name: 'Executor', description: 'Execute plan steps', icon: PlayCircle, color: '#10B981', toolProfile: 'execute_full' },
  { id: 'prd_reviewer', name: 'Reviewer', description: 'Review implementation', icon: CheckCircle, color: '#3B82F6', toolProfile: 'read_analyze' },
  { id: 'prd_validator', name: 'Validator', description: 'Final validation', icon: ShieldCheck, color: '#22C55E', toolProfile: 'execute_full' },
  { id: 'prd_reporter', name: 'Reporter', description: 'Generate reports', icon: FileText, color: '#F59E0B', toolProfile: 'write_reports' },
  { id: 'prd_code_reviewer', name: 'Code Reviewer', description: 'Technical review', icon: Code, color: '#DC2626', toolProfile: 'read_analyze' },
  { id: 'prd_system_reviewer', name: 'System Reviewer', description: 'Process adherence', icon: Settings, color: '#6366F1', toolProfile: 'write_reports' },
  { id: 'prd_hackathon_finalizer', name: 'Hackathon', description: 'Project finalization', icon: Trophy, color: '#EAB308', toolProfile: 'execute_full' },
];

// Get bootstrap @ files based on role and subtype
function getBootstrapFiles(role: AgentRole, subtype: string | null): string[] {
  switch (role) {
    case 'worker':
      return ['KURORYUU_WORKER.md'];
    case 'thinker':
      if (subtype) {
        return [
          `ai/prompt_packs/thinkers/${subtype}.md`,
          'ai/prompt_packs/thinkers/_base_thinker.md',
        ];
      }
      return [];
    case 'specialist':
      if (subtype) {
        return [`ai/prompt_packs/specialists/${subtype}.md`];
      }
      return [];
    case 'workflow':
      if (subtype) {
        return [`ai/prompt_packs/workflow_specialists/${subtype}.md`];
      }
      return [];
    default:
      return [];
  }
}

interface Props {
  open: boolean;
  onComplete: (config: AgentConfig) => void;
  onCancel: () => void;
  workerCount: number;
  projectRoot?: string;
  onLaunchThinker?: (basePath: string, personaPath: string, personaName: string) => void;
  onLaunchWorkflowSpecialist?: (promptPath: string, specialistName: string, profile: string) => void;
}

type WorktreeMode = 'none' | 'shared' | 'per-worker';

export function WorkerSetupWizard({ open, onComplete, onCancel, workerCount, projectRoot = '', onLaunchThinker, onLaunchWorkflowSpecialist }: Props) {
  // Store actions
  const { addWorkerAgent } = useAgentConfigStore();
  const { worktrees, refreshWorktrees, isLoading: isLoadingWorktrees } = useWorktreesStore();

  // CLI detection state
  const [cliStatus, setCliStatus] = useState<Record<CliProvider, CliDetectionResult>>({} as Record<CliProvider, CliDetectionResult>);
  const [isDetecting, setIsDetecting] = useState(false);

  // Selection state - progressive disclosure
  const [selectedProvider, setSelectedProvider] = useState<ProviderTemplate | null>(null);
  const [selectedRole, setSelectedRole] = useState<AgentRole | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);

  // Form state
  const [atFiles, setAtFiles] = useState<string[]>([]);
  const [atFileInput, setAtFileInput] = useState('');
  const [claudeModeEnabled, setClaudeModeEnabled] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Manual CLI path (when auto-detection fails)
  const [manualCliPath, setManualCliPath] = useState('');
  const [showManualPath, setShowManualPath] = useState(false);

  // Worktree mode state
  const [worktreeMode, setWorktreeMode] = useState<WorktreeMode>('none');
  const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(null);
  const [showWorktreeSection, setShowWorktreeSection] = useState(false);
  const [commandPreview, setCommandPreview] = useState('');

  // Launching state for thinkers/specialists
  const [isLaunching, setIsLaunching] = useState(false);

  // Computed bootstrap files
  const bootstrapFiles = useMemo(() => {
    if (!selectedRole) return [];
    return getBootstrapFiles(selectedRole, selectedSubtype);
  }, [selectedRole, selectedSubtype]);

  // Get subtypes for selected role
  const subtypes = useMemo((): SubtypeOption[] => {
    switch (selectedRole) {
      case 'thinker': return THINKER_PERSONAS;
      case 'specialist': return SPECIALIST_TYPES;
      case 'workflow': return WORKFLOW_TYPES;
      default: return [];
    }
  }, [selectedRole]);

  // Detect all CLIs when wizard opens
  useEffect(() => {
    const cli = window.electronAPI?.cli as { detectAllProviders?: () => Promise<unknown> } | undefined;
    if (open && cli?.detectAllProviders) {
      setIsDetecting(true);
      cli.detectAllProviders()
        .then((results: unknown) => {
          setCliStatus(results as typeof cliStatus);
        })
        .catch((err: unknown) => {
          console.error('Failed to detect CLIs:', err);
        })
        .finally(() => {
          setIsDetecting(false);
        });
    }
  }, [open]);

  // Generate command preview
  useEffect(() => {
    if (!selectedProvider) return;
    const cli = window.electronAPI?.cli as { getCommandPreview?: (opts: { cliProvider: string; atFiles?: string[] }) => Promise<string> } | undefined;
    if (cli?.getCommandPreview) {
      const allAtFiles = [...bootstrapFiles, ...atFiles];
      cli.getCommandPreview({
        cliProvider: selectedProvider.id,
        atFiles: allAtFiles.length > 0 ? allAtFiles : undefined,
      }).then(setCommandPreview);
    }
  }, [selectedProvider, atFiles, bootstrapFiles]);

  // Fetch worktrees when section is expanded
  useEffect(() => {
    if (showWorktreeSection && worktrees.length === 0) {
      refreshWorktrees();
    }
  }, [showWorktreeSection, worktrees.length, refreshWorktrees]);

  // Reset form when wizard opens
  useEffect(() => {
    if (open) {
      setSelectedProvider(null);
      setSelectedRole(null);
      setSelectedSubtype(null);
      setAtFiles([]);
      setAtFileInput('');
      setShowAdvanced(false);
      setManualCliPath('');
      setShowManualPath(false);
      setWorktreeMode('none');
      setSelectedWorktree(null);
      setShowWorktreeSection(false);
      setClaudeModeEnabled(true);
    }
  }, [open]);

  // Reset role when provider changes
  useEffect(() => {
    if (selectedProvider?.id !== 'claude') {
      setSelectedRole(null);
      setSelectedSubtype(null);
    }
  }, [selectedProvider]);

  // Reset subtype when role changes
  useEffect(() => {
    setSelectedSubtype(null);
  }, [selectedRole]);

  const handleProviderChange = (provider: ProviderTemplate) => {
    const status = cliStatus[provider.id];
    if (provider.id === 'shell' || status?.available) {
      setSelectedProvider(provider);
      // Auto-select worker role for non-Claude providers
      if (provider.id !== 'claude') {
        setSelectedRole('worker');
      }
    }
  };

  const handleAddAtFile = () => {
    const file = atFileInput.trim();
    if (file && !atFiles.includes(file)) {
      setAtFiles([...atFiles, file]);
      setAtFileInput('');
    }
  };

  const handleRemoveAtFile = (file: string) => {
    setAtFiles(atFiles.filter(f => f !== file));
  };

  const handleCreate = async () => {
    if (!selectedProvider) return;

    // Handle thinker launch via existing API
    if (selectedRole === 'thinker' && selectedSubtype && onLaunchThinker) {
      setIsLaunching(true);
      try {
        const result = await window.electronAPI.thinker.getPromptPaths(selectedSubtype);
        if (result.ok && result.basePath && result.personaPath) {
          const persona = THINKER_PERSONAS.find(p => p.id === selectedSubtype);
          onLaunchThinker(result.basePath, result.personaPath, persona?.name || selectedSubtype);
          onCancel();
        }
      } catch (err) {
        console.error('Failed to launch thinker:', err);
      } finally {
        setIsLaunching(false);
      }
      return;
    }

    // Handle workflow specialist launch via existing API
    if (selectedRole === 'workflow' && selectedSubtype && onLaunchWorkflowSpecialist) {
      setIsLaunching(true);
      try {
        const result = await window.electronAPI.workflowSpecialist.getPromptPath(selectedSubtype);
        if (result.ok && result.promptPath) {
          const specialist = WORKFLOW_TYPES.find(s => s.id === selectedSubtype);
          onLaunchWorkflowSpecialist(result.promptPath, specialist?.name || selectedSubtype, specialist?.toolProfile || 'read_analyze');
          onCancel();
        }
      } catch (err) {
        console.error('Failed to launch workflow specialist:', err);
      } finally {
        setIsLaunching(false);
      }
      return;
    }

    // Handle worker/specialist - create agent config
    const cliPath = manualCliPath.trim() || cliStatus[selectedProvider.id]?.path || undefined;
    const allAtFiles = [...bootstrapFiles, ...atFiles];

    const workerConfig: AgentConfig = {
      id: `${selectedRole || 'worker'}_${selectedProvider.id}_${Date.now()}`,
      name: selectedRole === 'specialist' && selectedSubtype
        ? SPECIALIST_TYPES.find(s => s.id === selectedSubtype)?.name || `Worker ${workerCount + 1}`
        : `Worker ${workerCount + 1}`,
      role: selectedRole || 'worker',
      modelName: selectedProvider.id === 'claude' ? 'claude-code' : selectedProvider.id,
      backend: 'terminal',
      capabilities: ['chat', 'code', 'terminal'],
      enabled: true,
      cliProvider: selectedProvider.id,
      cliPath,
      atFiles: selectedProvider.supportsAtFiles && allAtFiles.length > 0 ? allAtFiles : undefined,
      claudeModeEnabled: selectedProvider.id === 'claude' ? claudeModeEnabled : undefined,
      worktreeMode: worktreeMode !== 'none' ? worktreeMode : undefined,
      worktreePath: worktreeMode === 'shared' && selectedWorktree ? selectedWorktree.path : undefined,
    };

    addWorkerAgent(workerConfig);
    onComplete(workerConfig);
  };

  const status = selectedProvider ? cliStatus[selectedProvider.id] : null;
  const isAvailable = !selectedProvider || selectedProvider.id === 'shell' || status?.available || manualCliPath.trim().length > 0;
  const worktreeValid = worktreeMode !== 'shared' || selectedWorktree !== null;

  // Validation: need provider, role (for Claude), and subtype (if role has subtypes)
  const roleNeedsSubtype = selectedRole && AGENT_ROLES.find(r => r.id === selectedRole)?.hasSubtypes;
  const isValid = selectedProvider &&
    isAvailable &&
    worktreeValid &&
    (selectedProvider.id !== 'claude' || selectedRole) &&
    (!roleNeedsSubtype || selectedSubtype);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Add Agent</h2>
              <p className="text-xs text-muted-foreground">Configure a new agent</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-muted-foreground hover:text-white hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Progressive Disclosure */}
        <div className="p-6 space-y-6">
          {/* Section 1: CLI Provider Selection (Always visible) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              CLI Provider
              {isDetecting && <Loader2 className="inline w-3 h-3 ml-2 animate-spin" />}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {CLI_PROVIDERS.map((provider) => {
                const providerStatus = cliStatus[provider.id];
                const available = provider.id === 'shell' || providerStatus?.available;

                return (
                  <button
                    key={provider.id}
                    onClick={() => handleProviderChange(provider)}
                    disabled={!available && provider.id !== 'shell'}
                    className={`p-4 rounded-lg border-2 text-center transition-all relative ${
                      selectedProvider?.id === provider.id
                        ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                        : available
                        ? 'border-border bg-card hover:border-muted-foreground'
                        : 'border-border bg-card/50 opacity-50'
                    }`}
                    title={available ? provider.description : `${provider.name} not installed`}
                  >
                    <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br ${provider.color} mb-2`}>
                      {provider.icon}
                    </div>
                    <div className="text-sm font-medium text-foreground">{provider.name}</div>
                    {providerStatus?.version && (
                      <div className="text-xs text-muted-foreground">v{providerStatus.version}</div>
                    )}
                    {!available && provider.id !== 'shell' && (
                      <div className="absolute -top-1 -right-1">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Install instructions for unavailable providers */}
            {selectedProvider && !status?.available && selectedProvider.id !== 'shell' && (
              <div className="mt-3 p-3 bg-amber-900/20 border border-amber-800/50 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs flex-1">
                    <p className="text-amber-300 font-medium">Not auto-detected</p>
                    {selectedProvider.installCmd && (
                      <code className="block mt-1 text-muted-foreground bg-card px-2 py-1 rounded">
                        {selectedProvider.installCmd}
                      </code>
                    )}
                    {selectedProvider.installUrl && (
                      <a
                        href={selectedProvider.installUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-blue-400 hover:text-blue-300"
                      >
                        Install Guide <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      onClick={() => setShowManualPath(!showManualPath)}
                      className="flex items-center gap-1 mt-2 text-blue-400 hover:text-blue-300"
                    >
                      <FolderOpen className="w-3 h-3" />
                      {showManualPath ? 'Hide manual path' : 'Or enter path manually'}
                    </button>
                    {showManualPath && (
                      <div className="mt-2">
                        <input
                          type="text"
                          value={manualCliPath}
                          onChange={(e) => setManualCliPath(e.target.value)}
                          placeholder="C:\path\to\claude.exe"
                          className="w-full px-2 py-1.5 bg-card border border-border rounded text-sm text-foreground focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Role Selection (Claude Code only) */}
          {selectedProvider?.id === 'claude' && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="h-px bg-border mb-6" />
              <label className="block text-sm font-medium text-foreground mb-3">
                Agent Role
              </label>
              <div className="grid grid-cols-4 gap-2">
                {AGENT_ROLES.map((role) => {
                  const Icon = role.icon;
                  const isSelected = selectedRole === role.id;

                  return (
                    <button
                      key={role.id}
                      onClick={() => setSelectedRole(role.id)}
                      className={`p-3 rounded-lg border-2 text-center transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                          : 'border-border bg-card hover:border-muted-foreground'
                      }`}
                    >
                      <div
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg mb-1"
                        style={{ backgroundColor: `${role.color}20` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: role.color }} />
                      </div>
                      <div className="text-xs font-medium text-foreground">{role.name}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {selectedRole
                  ? AGENT_ROLES.find(r => r.id === selectedRole)?.description
                  : 'Select a role for this agent'}
              </p>
            </div>
          )}

          {/* Section 3: Subtype Selection (for roles with subtypes) */}
          {selectedRole && subtypes.length > 0 && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="h-px bg-border mb-6" />
              <label className="block text-sm font-medium text-foreground mb-3">
                {selectedRole === 'thinker' ? 'Thinker Persona' :
                 selectedRole === 'specialist' ? 'Specialist Type' :
                 'Workflow Stage'}
              </label>
              <div className={`grid gap-2 ${subtypes.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {subtypes.map((subtype) => {
                  const Icon = subtype.icon;
                  const isSelected = selectedSubtype === subtype.id;

                  return (
                    <button
                      key={subtype.id}
                      onClick={() => setSelectedSubtype(subtype.id)}
                      className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                          : 'border-border bg-card hover:border-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="p-1.5 rounded"
                          style={{ backgroundColor: `${subtype.color}20` }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color: subtype.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-foreground truncate">{subtype.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{subtype.description}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 4: Configuration (when role is fully selected) */}
          {selectedProvider && ((selectedProvider.id !== 'claude') || (selectedRole && (!roleNeedsSubtype || selectedSubtype))) && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="h-px bg-border mb-6" />

              {/* Bootstrap Info */}
              {bootstrapFiles.length > 0 && selectedProvider.supportsAtFiles && (
                <div className="p-3 bg-card/50 border border-border rounded-lg mb-4">
                  <p className="text-sm text-foreground mb-1">Bootstrap files:</p>
                  <div className="flex flex-wrap gap-1">
                    {bootstrapFiles.map((file) => (
                      <code key={file} className="text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                        @{file}
                      </code>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Loaded automatically via @ file reference
                  </p>
                </div>
              )}

              {/* @ File References (Claude only) */}
              {selectedProvider.supportsAtFiles && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Additional @ Files <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={atFileInput}
                      onChange={(e) => setAtFileInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddAtFile()}
                      className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="src/main.py"
                    />
                    <button
                      onClick={handleAddAtFile}
                      disabled={!atFileInput.trim()}
                      className="px-3 py-2 bg-secondary border border-border rounded-lg text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {atFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {atFiles.map((file) => (
                        <div
                          key={file}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-secondary border border-border rounded text-xs text-foreground"
                        >
                          <FileText className="w-3 h-3" />
                          @{file}
                          <button
                            onClick={() => handleRemoveAtFile(file)}
                            className="ml-1 text-muted-foreground hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Claude Mode Toggle (Claude workers only) */}
              {selectedProvider.id === 'claude' && selectedRole === 'worker' && (
                <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg mb-4">
                  <input
                    type="checkbox"
                    id="claude-mode"
                    checked={claudeModeEnabled}
                    onChange={(e) => setClaudeModeEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-card text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                  />
                  <label htmlFor="claude-mode" className="flex-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-medium text-foreground">Claude Mode</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Receive Kuroryuu inbox messages and task assignments
                    </p>
                  </label>
                </div>
              )}

              {/* Worktree Mode (workers only) */}
              {selectedRole === 'worker' && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowWorktreeSection(!showWorktreeSection)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium text-foreground">Worktree Mode</span>
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded">
                        Experimental
                      </span>
                    </div>
                    {showWorktreeSection ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>

                  {showWorktreeSection && (
                    <div className="px-4 py-3 border-t border-border space-y-3">
                      <div className="flex items-start gap-2 p-2 bg-amber-900/20 border border-amber-800/30 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-300">
                          Worktree mode is experimental. Workers may have merge conflicts.
                        </p>
                      </div>

                      <label className="flex items-start gap-3 p-2 rounded-lg hover:bg-secondary/30 cursor-pointer">
                        <input
                          type="radio"
                          name="worktree-mode"
                          checked={worktreeMode === 'none'}
                          onChange={() => {
                            setWorktreeMode('none');
                            setSelectedWorktree(null);
                          }}
                          className="mt-1 w-4 h-4 text-green-500 border-gray-600 bg-card focus:ring-green-500 focus:ring-offset-0"
                        />
                        <div>
                          <div className="text-sm font-medium text-foreground">Main Branch (default)</div>
                          <p className="text-xs text-muted-foreground">Worker runs in main project directory</p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-2 rounded-lg hover:bg-secondary/30 cursor-pointer">
                        <input
                          type="radio"
                          name="worktree-mode"
                          checked={worktreeMode === 'shared'}
                          onChange={() => setWorktreeMode('shared')}
                          className="mt-1 w-4 h-4 text-green-500 border-gray-600 bg-card focus:ring-green-500 focus:ring-offset-0"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">Shared Worktree</div>
                          <p className="text-xs text-muted-foreground">All workers share one worktree</p>

                          {worktreeMode === 'shared' && (
                            <div className="mt-2">
                              {isLoadingWorktrees ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Loading worktrees...
                                </div>
                              ) : worktrees.length === 0 ? (
                                <p className="text-xs text-amber-400">No worktrees available.</p>
                              ) : (
                                <select
                                  value={selectedWorktree?.id || ''}
                                  onChange={(e) => {
                                    const wt = worktrees.find(w => w.id === e.target.value);
                                    setSelectedWorktree(wt || null);
                                  }}
                                  className="w-full px-2 py-1.5 bg-card border border-border rounded text-sm text-foreground focus:outline-none focus:border-green-500"
                                >
                                  <option value="">Select a worktree...</option>
                                  {worktrees.map((wt) => (
                                    <option key={wt.id} value={wt.id}>
                                      {wt.branchName} ({wt.path.split(/[/\\]/).pop()})
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-2 rounded-lg hover:bg-secondary/30 cursor-pointer">
                        <input
                          type="radio"
                          name="worktree-mode"
                          checked={worktreeMode === 'per-worker'}
                          onChange={() => {
                            setWorktreeMode('per-worker');
                            setSelectedWorktree(null);
                          }}
                          className="mt-1 w-4 h-4 text-green-500 border-gray-600 bg-card focus:ring-green-500 focus:ring-offset-0"
                        />
                        <div>
                          <div className="text-sm font-medium text-foreground">Per-Worker Worktree</div>
                          <p className="text-xs text-muted-foreground">Each worker gets its own worktree</p>
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Command Preview */}
              {commandPreview && selectedProvider.id !== 'shell' && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <TerminalIcon className="w-4 h-4" />
                    Command Preview
                    {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showAdvanced && (
                    <div className="mt-2 p-3 bg-card border border-border rounded-lg">
                      <code className="text-xs text-muted-foreground break-all">{commandPreview}</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border sticky bottom-0 bg-background">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!isValid || isDetecting || isLaunching}
            className="px-5 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium rounded-lg hover:from-blue-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {isLaunching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Launching...
              </>
            ) : (
              <>
                {selectedRole === 'thinker' ? <Brain className="w-4 h-4" /> :
                 selectedRole === 'workflow' ? <Workflow className="w-4 h-4" /> :
                 selectedRole === 'specialist' ? <Sparkles className="w-4 h-4" /> :
                 <User className="w-4 h-4" />}
                {selectedRole === 'thinker' ? 'Launch Thinker' :
                 selectedRole === 'workflow' ? 'Launch Specialist' :
                 selectedRole === 'specialist' ? 'Add Specialist' :
                 'Add Worker'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
