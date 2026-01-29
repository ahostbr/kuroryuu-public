/**
 * AgentTerminalCog - Per-agent settings panel
 * 
 * Opens from COG icon in terminal header.
 * Configures Claude Code sub-agent export settings.
 */
import { useState, useEffect } from 'react';
import {
  Settings,
  X,
  Download,
  Check,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Info,
} from 'lucide-react';
import {
  useSubAgentConfigStore,
  AVAILABLE_TOOLS,
  type AvailableTool,
  type SubAgentModel,
  type PermissionMode,
} from '../stores/subagent-config-store';
import { useKuroryuuDialog } from '../hooks/useKuroryuuDialog';
import { useRef } from 'react';

interface AgentTerminalCogProps {
  agentId: string;
  agentName: string;
  agentRole: 'leader' | 'worker';
  roleOverride?: 'leader' | 'worker'; // Manual role override
  isOpen: boolean;
  onClose: () => void;
  // Terminal management
  terminalId?: string;
  terminalTitle?: string;
  onTitleChange?: (newTitle: string) => void;
  onKillAgent?: () => void;
}

// Tool descriptions for tooltips
const TOOL_DESCRIPTIONS: Record<AvailableTool, string> = {
  k_session: 'Session/hook lifecycle (start, end, pre_tool, post_tool, log)',
  k_files: 'File operations (read, write, list)',
  k_memory: 'Working memory (get, set_goal, add_blocker, set_steps)',
  k_inbox: 'Message queue (send, list, read, claim, complete)',
  k_checkpoint: 'Persistence (save, list, load)',
  k_rag: 'Search (query, status, index)',
  k_interact: 'Human-in-the-loop - LEADER ONLY (ask, approve, plan)',
  k_capture: 'Visual capture (start, stop, screenshot)',
};

export function AgentTerminalCog({
  agentId,
  agentName,
  agentRole,
  roleOverride,
  isOpen,
  onClose,
  terminalId,
  terminalTitle,
  onTitleChange,
  onKillAgent,
}: AgentTerminalCogProps) {
  const {
    getConfig,
    setConfig,
    initializeConfig,
    enableTool,
    disableTool,
    exportConfig,
    previewConfig,
    setSyncOnSave,
  } = useSubAgentConfigStore();

  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
  const [exportMessage, setExportMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState<'terminal' | 'subagent'>('terminal');
  const [editingTitle, setEditingTitle] = useState(terminalTitle || '');
  const { confirmDestructive } = useKuroryuuDialog();

  // LMStudio / CLIProxyAPI enhancement state
  const [lmstudioUrl, setLmstudioUrl] = useState('http://169.254.83.107:1234');
  const [cliproxyUrl, setCliproxyUrl] = useState('http://127.0.0.1:8317');
  const [backendPreference, setBackendPreference] = useState<'lmstudio' | 'cliproxyapi'>('lmstudio');
  const [enhanceEnabled, setEnhanceEnabled] = useState(true);
  const [previewContent, setPreviewContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Derive effective role: roleOverride takes precedence, then agent ID pattern
  const idBasedRole: 'leader' | 'worker' = agentId.startsWith('leader_') ? 'leader' : 'worker';
  const effectiveRole: 'leader' | 'worker' = roleOverride || idBasedRole;

  // Initialize config if not exists
  useEffect(() => {
    if (isOpen && !getConfig(agentId)) {
      initializeConfig(agentId, effectiveRole, agentName);
    }
  }, [isOpen, agentId, effectiveRole, agentName, getConfig, initializeConfig]);

  const config = getConfig(agentId);

  if (!isOpen || !config) return null;

  const handleToolToggle = (tool: AvailableTool) => {
    // Prevent workers from enabling k_interact
    if (tool === 'k_interact' && effectiveRole === 'worker') {
      return;
    }

    if (config.tools.includes(tool)) {
      disableTool(agentId, tool);
    } else {
      enableTool(agentId, tool);
    }
  };

  const handleExport = async () => {
    setExportStatus('exporting');
    setExportMessage('');

    const result = await exportConfig(agentId, {
      lmstudioUrl: enhanceEnabled ? lmstudioUrl : undefined,
      enhance: enhanceEnabled,
    });

    if (result.success) {
      setExportStatus('success');
      setExportMessage(`Exported to ${result.path}${result.enhanced ? ' (AI enhanced)' : ''}`);
      // Show toast reminder
      setTimeout(() => {
        setExportStatus('idle');
        setExportMessage('Restart Claude Code to pick up changes');
      }, 2000);
    } else {
      setExportStatus('error');
      setExportMessage(result.error || 'Export failed');
    }
  };

  const handlePreview = async () => {
    setIsGenerating(true);
    setExportMessage('');
    try {
      const result = await previewConfig(agentId, {
        lmstudioUrl: enhanceEnabled ? lmstudioUrl : undefined,
        enhance: enhanceEnabled,
      });
      if (result.success) {
        setPreviewContent(result.markdown);
        setShowPreview(true);
      } else {
        setExportStatus('error');
        setExportMessage(result.error || 'Preview generation failed');
      }
    } catch (e) {
      setExportStatus('error');
      setExportMessage(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleModelChange = (model: SubAgentModel) => {
    setConfig(agentId, { model });
  };

  const handlePermissionChange = (permissionMode: PermissionMode) => {
    setConfig(agentId, { permissionMode });
  };

  const handleNameChange = (name: string) => {
    setConfig(agentId, { name });
  };

  const handleDescriptionChange = (description: string) => {
    setConfig(agentId, { description });
  };

  const handlePromptChange = (systemPrompt: string) => {
    setConfig(agentId, { systemPrompt });
  };

  return (
    <div className="absolute right-0 top-8 w-80 bg-card border border-border rounded-lg shadow-2xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/50 border-b border-border">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Agent Settings</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('terminal')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'terminal'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Terminal
        </button>
        <button
          onClick={() => setActiveTab('subagent')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'subagent'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Sub-agent Export
        </button>
      </div>

      <div className="p-3 space-y-4 max-h-[60vh] overflow-y-auto">
        {/* Terminal Settings Tab */}
        {activeTab === 'terminal' && (
          <>
            {/* Terminal Title */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted-foreground uppercase">Display Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => onTitleChange?.(editingTitle)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onTitleChange?.(editingTitle);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="flex-1 px-2 py-1.5 text-sm bg-secondary border border-border rounded
                             text-foreground focus:border-primary focus:outline-none"
                  placeholder="Terminal display name"
                />
              </div>
            </div>

            {/* Role Display & Change */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted-foreground uppercase">Role</label>
              <div className="flex gap-2">
                <div className={`flex-1 px-3 py-2 text-sm rounded border ${
                  effectiveRole === 'leader'
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}>
                  {effectiveRole === 'leader' ? '👑 Leader' : '🔧 Worker'}
                  {roleOverride && (
                    <span className="ml-1 text-xs opacity-60">(override)</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {effectiveRole === 'leader'
                  ? 'Leader coordinates workers and handles human interaction'
                  : 'Worker executes tasks assigned by leader'}
              </p>
            </div>

            {/* Agent Info */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted-foreground uppercase">Agent ID</label>
              <code className="block px-2 py-1.5 text-xs bg-secondary/50 border border-border rounded text-muted-foreground font-mono truncate">
                {agentId}
              </code>
            </div>

            {/* Kill Agent Button - NEVER show for leader (fail-closed security) */}
            {onKillAgent && effectiveRole !== 'leader' && (
              <div className="pt-2 border-t border-border">
                <button
                  onClick={async () => {
                    const yes = await confirmDestructive({
                      title: 'Kill Agent',
                      message: `Kill this ${effectiveRole} and close terminal? This cannot be undone.`,
                      confirmLabel: 'Kill Agent',
                      cancelLabel: 'Cancel',
                    });
                    if (yes) {
                      onKillAgent();
                      onClose();
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20
                             border border-red-500/30 rounded transition-colors"
                >
                  Kill Agent & Close Terminal
                </button>
                <p className="text-xs text-muted-foreground mt-1">
                  This will stop the agent, kill the PTY, and remove this terminal
                </p>
              </div>
            )}
            {/* Leader protection notice */}
            {effectiveRole === 'leader' && (
              <div className="pt-2 border-t border-border">
                <div className="px-3 py-2 text-sm bg-primary/10 text-primary border border-primary/30 rounded">
                  👑 Leader Terminal Protected
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Leader terminals cannot be closed. Restart the app to reset.
                </p>
              </div>
            )}
          </>
        )}

        {/* Sub-agent Export Tab */}
        {activeTab === 'subagent' && (
          <>
            {/* Name & Description */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted-foreground uppercase">Export Name</label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm bg-secondary border border-border rounded
                           text-foreground focus:border-primary focus:outline-none"
                placeholder="Agent name for Claude Code"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted-foreground uppercase">Description</label>
              <input
                type="text"
                value={config.description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm bg-secondary border border-border rounded
                           text-foreground focus:border-primary focus:outline-none"
                placeholder="When to invoke this sub-agent"
              />
            </div>

        {/* Tools Section */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground uppercase">Enabled Tools</label>
          <div className="grid grid-cols-2 gap-1.5">
            {AVAILABLE_TOOLS.map((tool) => {
              const isLeaderOnly = tool === 'k_interact';
              const isDisabled = isLeaderOnly && effectiveRole === 'worker';
              const isEnabled = config.tools.includes(tool);

              return (
                <button
                  key={tool}
                  onClick={() => handleToolToggle(tool)}
                  disabled={isDisabled}
                  className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded transition-colors ${
                    isEnabled
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : isDisabled
                      ? 'bg-secondary/50 text-muted-foreground cursor-not-allowed border border-border'
                      : 'bg-secondary text-muted-foreground hover:bg-muted border border-border'
                  }`}
                  title={TOOL_DESCRIPTIONS[tool]}
                >
                  {isEnabled && <Check className="w-3 h-3" />}
                  <span className="truncate">{tool}</span>
                  {isLeaderOnly && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">
                      L
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            <Info className="w-3 h-3 inline mr-1" />
            k_interact is leader-only. Workers cannot enable it.
          </p>
        </div>

        {/* Model Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground uppercase">Model</label>
          <div className="grid grid-cols-4 gap-1">
            {(['inherit', 'sonnet', 'opus', 'haiku'] as SubAgentModel[]).map((model) => (
              <button
                key={model}
                onClick={() => handleModelChange(model)}
                className={`px-2 py-1.5 text-xs rounded transition-colors ${
                  config.model === model
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-secondary text-muted-foreground hover:bg-muted border border-border'
                }`}
              >
                {model}
              </button>
            ))}
          </div>
        </div>

        {/* Permission Mode */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground uppercase">Permission Mode</label>
          <div className="grid grid-cols-2 gap-1">
            {(['default', 'strict'] as PermissionMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handlePermissionChange(mode)}
                className={`px-2 py-1.5 text-xs rounded transition-colors ${
                  config.permissionMode === mode
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-secondary text-muted-foreground hover:bg-muted border border-border'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced: System Prompt */}
        <div className="space-y-2">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase hover:text-foreground"
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            />
            System Prompt
          </button>
          {showAdvanced && (
            <textarea
              value={config.systemPrompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              rows={8}
              className="w-full px-2 py-1.5 text-xs font-mono bg-secondary border border-border 
                         rounded text-foreground focus:border-primary focus:outline-none resize-none"
              placeholder="Custom system prompt..."
            />
          )}
        </div>

        {/* Sync on Save Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-foreground">Sync on Save</span>
            <p className="text-[10px] text-muted-foreground">Auto-export to .claude/agents/ on changes</p>
          </div>
          <button
            onClick={() => setSyncOnSave(agentId, !config.syncOnSave)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              config.syncOnSave ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                config.syncOnSave ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* LLM Backend Configuration */}
        <div className="space-y-3 pt-3 border-t border-border">
          <label className="block text-xs font-medium text-muted-foreground uppercase">
            LLM Backend
          </label>

          {/* Backend Preference Toggle */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setBackendPreference('lmstudio')}
              className={`flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded transition-colors ${
                backendPreference === 'lmstudio'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-secondary text-muted-foreground hover:bg-muted border border-border'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
              LMStudio
            </button>
            <button
              onClick={() => setBackendPreference('cliproxyapi')}
              className={`flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded transition-colors ${
                backendPreference === 'cliproxyapi'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-secondary text-muted-foreground hover:bg-muted border border-border'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              CLIProxy
            </button>
          </div>

          {/* LMStudio URL */}
          <div className="space-y-1">
            <label className="block text-[10px] font-medium text-muted-foreground uppercase">
              LMStudio URL
            </label>
            <input
              type="text"
              value={lmstudioUrl}
              onChange={(e) => setLmstudioUrl(e.target.value)}
              className={`w-full px-2 py-1.5 text-xs font-mono bg-secondary border rounded
                         text-foreground focus:outline-none transition-colors ${
                           backendPreference === 'lmstudio'
                             ? 'border-green-500/30 focus:border-green-500'
                             : 'border-border focus:border-primary'
                         }`}
              placeholder="http://127.0.0.1:1234"
            />
          </div>

          {/* CLIProxyAPI URL */}
          <div className="space-y-1">
            <label className="block text-[10px] font-medium text-muted-foreground uppercase">
              CLIProxyAPI URL
            </label>
            <input
              type="text"
              value={cliproxyUrl}
              onChange={(e) => setCliproxyUrl(e.target.value)}
              className={`w-full px-2 py-1.5 text-xs font-mono bg-secondary border rounded
                         text-foreground focus:outline-none transition-colors ${
                           backendPreference === 'cliproxyapi'
                             ? 'border-blue-500/30 focus:border-blue-500'
                             : 'border-border focus:border-primary'
                         }`}
              placeholder="http://127.0.0.1:8317"
            />
            <p className="text-[9px] text-muted-foreground">
              Claude via CLI proxy (fallback when LMStudio unavailable)
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-foreground">AI Enhancement</span>
              <p className="text-[10px] text-muted-foreground">
                Use {backendPreference === 'lmstudio' ? 'Devstral' : 'Claude'} for rich prompts
              </p>
            </div>
            <button
              onClick={() => setEnhanceEnabled(!enhanceEnabled)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                enhanceEnabled ? 'bg-purple-500' : 'bg-muted'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  enhanceEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Preview + Export */}
        <div className="pt-2 border-t border-border">
          <div className="flex gap-2 mb-2">
            <button
              onClick={handlePreview}
              disabled={isGenerating}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm bg-secondary hover:bg-muted rounded transition-colors text-foreground"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                'Preview'
              )}
            </button>
            <button
              onClick={handleExport}
              disabled={exportStatus === 'exporting' || isGenerating}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded transition-colors ${
                exportStatus === 'success'
                  ? 'bg-green-500/20 text-green-400'
                  : exportStatus === 'error'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-primary/20 text-primary hover:bg-primary/30'
              }`}
            >
              {exportStatus === 'exporting' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Exporting...
                </>
              ) : exportStatus === 'success' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Exported!
                </>
              ) : exportStatus === 'error' ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  Failed
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Export
                </>
              )}
            </button>
          </div>
          {exportMessage && (
            <p
              className={`mt-1.5 text-[10px] text-center ${
                exportStatus === 'error' ? 'text-red-400' : 'text-muted-foreground'
              }`}
            >
              {exportMessage}
            </p>
          )}
          {config.lastExported && (
            <p className="mt-1 text-[10px] text-muted-foreground text-center">
              Last exported: {new Date(config.lastExported).toLocaleString()}
            </p>
          )}
        </div>

        {/* Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
            <div
              ref={previewRef}
              className="w-[90vw] max-w-3xl max-h-[80vh] bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-2 bg-secondary/50 border-b border-border">
                <span className="text-sm font-medium text-foreground">
                  Preview: {config.name}
                  {enhanceEnabled && <span className="ml-2 text-purple-400 text-xs">(AI Enhanced)</span>}
                </span>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words">
                  {previewContent}
                </pre>
              </div>
              <div className="flex gap-2 p-3 border-t border-border bg-secondary/30">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(previewContent);
                  }}
                  className="flex-1 py-2 text-sm bg-secondary hover:bg-muted rounded transition-colors text-foreground"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => {
                    setShowPreview(false);
                    handleExport();
                  }}
                  className="flex-1 py-2 text-sm bg-primary/20 text-primary hover:bg-primary/30 rounded transition-colors"
                >
                  Export to .claude/agents/
                </button>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

// Hook button component for terminal header
interface CogButtonProps {
  onClick: () => void;
  isActive: boolean;
}

export function AgentCogButton({ onClick, isActive }: CogButtonProps) {
  return (
    <button
      tabIndex={-1}
      onClick={onClick}
      className={`p-1 rounded transition-colors ${
        isActive
          ? 'text-primary bg-primary/20'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
      title="Sub-agent Settings"
    >
      <Settings className="w-3 h-3" />
    </button>
  );
}
