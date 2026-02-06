/**
 * SpawnAgentDialog - Quick presets dialog for spawning background coding agents
 * Uses k_bash with background=true to spawn autonomous agents
 */
import { useState } from 'react';
import {
  X,
  Terminal,
  Play,
  FolderOpen,
  ChevronDown,
  Settings2,
} from 'lucide-react';

// Agent presets with default commands
const AGENT_PRESETS = [
  {
    id: 'claude',
    name: 'Claude CLI',
    icon: '🤖',
    command: 'claude -p "{prompt}"',
    description: 'Anthropic Claude Code CLI',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    icon: '🧠',
    command: 'codex "{prompt}"',
    description: 'OpenAI Codex CLI',
  },
  {
    id: 'kiro',
    name: 'Kiro CLI',
    icon: '⚡',
    command: 'kiro -p "{prompt}"',
    description: 'Kiro coding assistant',
  },
  {
    id: 'aider',
    name: 'Aider',
    icon: '🔧',
    command: 'aider --message "{prompt}"',
    description: 'AI pair programming',
  },
  {
    id: 'custom',
    name: 'Custom Command',
    icon: '⌨️',
    command: '',
    description: 'Enter any shell command',
  },
];

interface SpawnAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSpawn: (command: string, workdir: string, pty: boolean) => Promise<void>;
  onOpenWizard?: () => void;
  defaultWorkdir?: string;
}

export function SpawnAgentDialog({
  isOpen,
  onClose,
  onSpawn,
  onOpenWizard,
  defaultWorkdir = '',
}: SpawnAgentDialogProps) {
  const [selectedPreset, setSelectedPreset] = useState(AGENT_PRESETS[0]);
  const [command, setCommand] = useState(AGENT_PRESETS[0].command);
  const [prompt, setPrompt] = useState('');
  const [workdir, setWorkdir] = useState(defaultWorkdir);
  const [usePty, setUsePty] = useState(true);
  const [isSpawning, setIsSpawning] = useState(false);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);

  if (!isOpen) return null;

  const handlePresetChange = (preset: typeof AGENT_PRESETS[0]) => {
    setSelectedPreset(preset);
    setCommand(preset.command);
    setShowPresetDropdown(false);
  };

  const handleSpawn = async () => {
    if (!command.trim()) return;

    setIsSpawning(true);
    try {
      // Replace {prompt} placeholder with actual prompt
      const finalCommand = command.replace('{prompt}', prompt);
      await onSpawn(finalCommand, workdir, usePty);
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
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Spawn Agent</h2>
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
          {/* Preset Selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Agent Type
            </label>
            <div className="relative">
              <button
                onClick={() => setShowPresetDropdown(!showPresetDropdown)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-secondary border border-border hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{selectedPreset.icon}</span>
                  <div className="text-left">
                    <div className="font-medium">{selectedPreset.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedPreset.description}
                    </div>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${showPresetDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown */}
              {showPresetDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-10 overflow-hidden">
                  {AGENT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetChange(preset)}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left ${
                        selectedPreset.id === preset.id ? 'bg-primary/10' : ''
                      }`}
                    >
                      <span className="text-xl">{preset.icon}</span>
                      <div>
                        <div className="font-medium">{preset.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {preset.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Prompt Input (if command has {prompt} placeholder) */}
          {command.includes('{prompt}') && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Prompt / Task
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What should the agent do?"
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none resize-none text-sm"
              />
            </div>
          )}

          {/* Command Input */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Command
            </label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Enter command..."
              className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none font-mono text-sm"
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
              placeholder="Leave empty for current directory"
              className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none text-sm"
            />
          </div>

          {/* PTY Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-muted-foreground">
              Allocate PTY (for interactive CLIs)
            </label>
            <button
              onClick={() => setUsePty(!usePty)}
              className={`w-12 h-6 rounded-full transition-colors ${
                usePty ? 'bg-primary' : 'bg-secondary'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                  usePty ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/30">
          {onOpenWizard && (
            <button
              onClick={onOpenWizard}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              Advanced...
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSpawn}
              disabled={!command.trim() || isSpawning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              {isSpawning ? 'Spawning...' : 'Spawn'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpawnAgentDialog;
