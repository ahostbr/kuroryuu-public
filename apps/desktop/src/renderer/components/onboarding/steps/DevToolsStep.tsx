/**
 * DevToolsStep - Configure preferred IDE and terminal
 */
import React from 'react';
import { Check, Code, Terminal as TerminalIcon } from 'lucide-react';
import { Button } from '../../ui/button';
import { IDE, Terminal, DevToolsConfig } from '../../../types/onboarding';
import { cn } from '../../../lib/utils';

interface DevToolsStepProps {
  config: DevToolsConfig;
  onSetIDE: (ide: IDE) => void;
  onSetTerminal: (terminal: Terminal) => void;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}

const IDE_OPTIONS: { id: IDE; name: string; icon?: string }[] = [
  { id: 'vscode', name: 'VS Code' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'windsurf', name: 'Windsurf' },
  { id: 'zed', name: 'Zed' },
  { id: 'neovim', name: 'Neovim' },
  { id: 'jetbrains', name: 'JetBrains IDE' },
  { id: 'sublime', name: 'Sublime Text' },
  { id: 'other', name: 'Other' },
];

const TERMINAL_OPTIONS: { id: Terminal; name: string; platform?: string }[] = [
  { id: 'default', name: 'System Default' },
  { id: 'iterm', name: 'iTerm2', platform: 'macOS' },
  { id: 'warp', name: 'Warp', platform: 'macOS/Linux' },
  { id: 'alacritty', name: 'Alacritty' },
  { id: 'hyper', name: 'Hyper' },
  { id: 'kitty', name: 'Kitty' },
  { id: 'windows-terminal', name: 'Windows Terminal', platform: 'Windows' },
  { id: 'cmd', name: 'Command Prompt', platform: 'Windows' },
];

export function DevToolsStep({
  config,
  onSetIDE,
  onSetTerminal,
  onContinue,
  onSkip,
  onBack,
}: DevToolsStepProps) {
  return (
    <div className="flex flex-col flex-1 p-8 overflow-hidden">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Development Tools</h2>
        <p className="text-muted-foreground">
          Select your preferred IDE and terminal for the best integration experience
        </p>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* IDE Selection */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Code className="w-5 h-5 text-primary" />
              <h3 className="font-medium text-white">Preferred IDE</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {IDE_OPTIONS.map((ide) => (
                <button
                  key={ide.id}
                  onClick={() => onSetIDE(ide.id)}
                  className={cn(
                    'relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200',
                    config.preferredIDE === ide.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card/50 hover:border-border'
                  )}
                >
                  {config.preferredIDE === ide.id && (
                    <div className="absolute top-2 right-2">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <Code className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <span className="text-sm text-foreground">{ide.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Terminal Selection */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TerminalIcon className="w-5 h-5 text-primary" />
              <h3 className="font-medium text-white">Preferred Terminal</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {TERMINAL_OPTIONS.map((terminal) => (
                <button
                  key={terminal.id}
                  onClick={() => onSetTerminal(terminal.id)}
                  className={cn(
                    'relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200',
                    config.preferredTerminal === terminal.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card/50 hover:border-border'
                  )}
                >
                  {config.preferredTerminal === terminal.id && (
                    <div className="absolute top-2 right-2">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <TerminalIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <span className="text-sm text-foreground">{terminal.name}</span>
                  {terminal.platform && (
                    <span className="text-[10px] text-muted-foreground">{terminal.platform}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-detect hint */}
          <div className="p-4 rounded-lg bg-card/50 border border-border">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground">Tip:</span> Kuroryuu will try to detect your installed tools.
              You can always change these settings later.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground hover:text-white"
        >
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={onSkip}
            className="text-muted-foreground hover:text-white"
          >
            Skip
          </Button>
          <Button
            onClick={onContinue}
            className="bg-primary hover:bg-[#c5c76a] text-background"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
