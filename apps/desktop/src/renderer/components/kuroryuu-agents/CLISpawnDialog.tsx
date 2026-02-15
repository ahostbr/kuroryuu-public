/**
 * CLISpawnDialog - Dialog for spawning CLI agents via k_bash
 *
 * Supports presets for Claude, Codex, Kiro, Aider, and custom commands.
 */
import { useState, useEffect } from 'react';
import {
  X,
  Bot,
  TerminalSquare,
  Zap,
  Code,
  Settings2,
  Play,
  FolderOpen,
} from 'lucide-react';

const CLI_PRESETS = [
  { id: 'claude', label: 'Claude Code', cmd: 'claude', icon: Bot },
  { id: 'codex', label: 'Codex CLI', cmd: 'codex', icon: TerminalSquare },
  { id: 'kiro', label: 'Kiro', cmd: 'kiro', icon: Zap },
  { id: 'aider', label: 'Aider', cmd: 'aider', icon: Code },
  { id: 'custom', label: 'Custom Command', cmd: '', icon: Settings2 },
];

interface CLISpawnDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CLISpawnDialog({ isOpen, onClose }: CLISpawnDialogProps) {
  const [selectedPreset, setSelectedPreset] = useState(CLI_PRESETS[0]);
  const [command, setCommand] = useState('claude');
  const [workdir, setWorkdir] = useState('');
  const [pty, setPty] = useState(true);
  const [args, setArgs] = useState('');
  const [isSpawning, setIsSpawning] = useState(false);

  // Load project root on mount
  useEffect(() => {
    if (!isOpen) return;

    const api = (window as unknown as {
      electronAPI: { app: { getProjectRoot: () => Promise<string> } }
    }).electronAPI;

    if (api?.app?.getProjectRoot) {
      api.app.getProjectRoot().then(setWorkdir).catch(() => {});
    }
  }, [isOpen]);

  const handlePresetClick = (preset: typeof CLI_PRESETS[0]) => {
    setSelectedPreset(preset);
    setCommand(preset.cmd);
  };

  const handleSpawn = async () => {
    if (!command.trim()) return;

    setIsSpawning(true);
    try {
      // Build full command with args
      const fullCommand = args.trim() ? `${command} ${args}` : command;

      // Call Gateway MCP k_bash
      const response = await fetch('http://127.0.0.1:8200/v1/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'k_bash',
          arguments: {
            command: fullCommand,
            workdir: workdir || undefined,
            pty,
            background: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gateway error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[CLISpawnDialog] Spawned session:', data);

      // Close dialog on success
      onClose();

      // Reset form
      setSelectedPreset(CLI_PRESETS[0]);
      setCommand('claude');
      setArgs('');
      setPty(true);
    } catch (error) {
      console.error('[CLISpawnDialog] Spawn error:', error);
      alert(`Failed to spawn: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSpawning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            <TerminalSquare className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Spawn CLI Agent</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* CLI Preset Selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-3">
              CLI Preset
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CLI_PRESETS.map((preset) => {
                const Icon = preset.icon;
                const isSelected = selectedPreset.id === preset.id;

                return (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetClick(preset)}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:border-primary/50'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="font-medium text-sm">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Command Input */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Command
            </label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Enter command..."
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 focus:border-primary focus:outline-none font-mono text-sm text-zinc-100"
            />
          </div>

          {/* Args Textarea */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Arguments / Prompt
            </label>
            <textarea
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder="Enter arguments or prompt..."
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 focus:border-primary focus:outline-none resize-none text-sm text-zinc-100"
            />
          </div>

          {/* Working Directory */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              <FolderOpen className="w-4 h-4 inline mr-1" />
              Working Directory
            </label>
            <input
              type="text"
              value={workdir}
              onChange={(e) => setWorkdir(e.target.value)}
              placeholder="Project root (leave empty for default)"
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 focus:border-primary focus:outline-none text-sm text-zinc-100"
            />
          </div>

          {/* PTY Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-zinc-400">
              Allocate PTY (interactive CLI)
            </label>
            <button
              onClick={() => setPty(!pty)}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                pty ? 'bg-primary' : 'bg-zinc-700'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                  pty ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-700 bg-zinc-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
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
  );
}
