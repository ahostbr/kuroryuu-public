/**
 * SpawnAgentDialog - SDK-native spawn dialog for Claude Agent sessions
 * Uses Claude Agent SDK via IPC to spawn agents with role, model, and tools selection
 */
import { useState, useEffect } from 'react';
import {
  X,
  Bot,
  Play,
  FolderOpen,
  ChevronDown,
  Settings2,
  Shield,
  Zap,
} from 'lucide-react';
import type { SDKAgentConfig } from '../../types/sdk-agent';

const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Most capable' },
  { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', description: 'Fast + smart' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: 'Fastest' },
];

const PERMISSION_MODES = [
  { id: 'bypassPermissions', label: 'Bypass', description: 'No permission prompts (autonomous)' },
  { id: 'acceptEdits', label: 'Accept Edits', description: 'Auto-accept file edits' },
  { id: 'default', label: 'Default', description: 'Ask for each action' },
  { id: 'plan', label: 'Plan Only', description: 'Plan mode — no execution' },
];

interface SpawnAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSpawn: (config: SDKAgentConfig) => Promise<void>;
  defaultWorkdir?: string;
}

export function SpawnAgentDialog({
  isOpen,
  onClose,
  onSpawn,
  defaultWorkdir = '',
}: SpawnAgentDialogProps) {
  const [roles, setRoles] = useState<Record<string, { name: string; description: string; model: string; systemPrompt: string }>>({});
  const [selectedRole, setSelectedRole] = useState('coder');
  const [model, setModel] = useState(MODELS[1].id); // Default to Sonnet
  const [prompt, setPrompt] = useState('');
  const [workdir, setWorkdir] = useState(defaultWorkdir);
  const [permissionMode, setPermissionMode] = useState('bypassPermissions');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxTurns, setMaxTurns] = useState(0);
  const [maxBudgetUsd, setMaxBudgetUsd] = useState(0);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isSpawning, setIsSpawning] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  // Load roles from orchestrator
  useEffect(() => {
    if (!isOpen) return;
    const api = (window as unknown as { electronAPI: { sdkAgent: {
      getRoles: () => Promise<Record<string, unknown>>;
    }}}).electronAPI?.sdkAgent;
    if (api) {
      api.getRoles().then((r) => {
        setRoles(r as Record<string, { name: string; description: string; model: string; systemPrompt: string }>);
      }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const roleEntries = Object.entries(roles);
  const currentRole = roles[selectedRole];

  const handleSpawn = async () => {
    if (!prompt.trim()) return;

    setIsSpawning(true);
    try {
      const config: SDKAgentConfig = {
        prompt: prompt.trim(),
        role: selectedRole,
        model,
        cwd: workdir || undefined,
        permissionMode: permissionMode as SDKAgentConfig['permissionMode'],
        useClaudeCodePreset: true,
      };

      if (maxTurns > 0) config.maxTurns = maxTurns;
      if (maxBudgetUsd > 0) config.maxBudgetUsd = maxBudgetUsd;
      if (systemPrompt.trim()) config.appendSystemPrompt = systemPrompt.trim();

      await onSpawn(config);
      onClose();
    } catch (error) {
      console.error('Failed to spawn agent:', error);
    } finally {
      setIsSpawning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Spawn SDK Agent</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Role Selector */}
          {roleEntries.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Role
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-secondary border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="text-left">
                    <div className="font-medium">{currentRole?.name || selectedRole}</div>
                    <div className="text-xs text-muted-foreground">
                      {currentRole?.description || ''}
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${showRoleDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showRoleDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-10 overflow-hidden max-h-60 overflow-y-auto">
                    {roleEntries.map(([key, role]) => (
                      <button
                        key={key}
                        onClick={() => {
                          setSelectedRole(key);
                          setShowRoleDropdown(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left ${
                          selectedRole === key ? 'bg-primary/10' : ''
                        }`}
                      >
                        <div>
                          <div className="font-medium">{role.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {role.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Model Selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              <Zap className="w-4 h-4 inline mr-1" />
              Model
            </label>
            <div className="grid grid-cols-3 gap-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                    model === m.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Task / Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the agent do?"
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none resize-none text-sm"
              autoFocus
            />
          </div>

          {/* Working Directory */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              <FolderOpen className="w-4 h-4 inline mr-1" />
              Working Directory
            </label>
            <input
              type="text"
              value={workdir}
              onChange={(e) => setWorkdir(e.target.value)}
              placeholder="Leave empty for project root"
              className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none text-sm"
            />
          </div>

          {/* Permission Mode */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              <Shield className="w-4 h-4 inline mr-1" />
              Permission Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PERMISSION_MODES.map((pm) => (
                <button
                  key={pm.id}
                  onClick={() => setPermissionMode(pm.id)}
                  className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                    permissionMode === pm.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium">{pm.label}</div>
                  <div className="text-xs text-muted-foreground">{pm.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Options */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            Advanced Options
            <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          {showAdvanced && (
            <div className="space-y-3 pl-2 border-l-2 border-border">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Max Turns</label>
                  <input
                    type="number"
                    min={0}
                    value={maxTurns}
                    onChange={(e) => setMaxTurns(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="0 = unlimited"
                  />
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">0 = unlimited</p>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Max Budget ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={maxBudgetUsd}
                    onChange={(e) => setMaxBudgetUsd(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="0 = unlimited"
                  />
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">0 = unlimited</p>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Extra System Prompt</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Appended to default system prompt..."
                  rows={2}
                  className="w-full px-3 py-1.5 rounded-md border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-secondary/30 sticky bottom-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSpawn}
            disabled={!prompt.trim() || isSpawning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            {isSpawning ? 'Starting...' : 'Start Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SpawnAgentDialog;
