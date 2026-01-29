/**
 * CLIStep - Claude CLI installation check and instructions
 */
import React, { useEffect, useRef } from 'react';
import { Terminal, CheckCircle2, XCircle, Loader2, Download, Copy, ExternalLink } from 'lucide-react';
import { Button } from '../../ui/button';
import { CLIInstallStatus } from '../../../types/onboarding';
import { cn } from '../../../lib/utils';

interface CLIStepProps {
  cliStatus: CLIInstallStatus;
  onCheckCLI: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function CLIStep({ cliStatus, onCheckCLI, onContinue, onSkip, onBack }: CLIStepProps) {
  // Check CLI on mount (only once)
  const hasChecked = useRef(false);
  useEffect(() => {
    if (!hasChecked.current) {
      hasChecked.current = true;
      onCheckCLI();
    }
  }, []); // Empty deps - run once on mount

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex flex-col flex-1 p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Claude CLI</h2>
        <p className="text-muted-foreground">
          Install the Claude command-line interface for terminal-based AI assistance
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full space-y-6">
        {/* Status card */}
        <div
          className={cn(
            'w-full p-6 rounded-xl border-2 transition-all duration-200',
            cliStatus.checking && 'border-border bg-card/50',
            cliStatus.installed && 'border-green-500/30 bg-green-500/5',
            !cliStatus.checking && !cliStatus.installed && 'border-amber-500/30 bg-amber-500/5'
          )}
        >
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center',
                cliStatus.checking && 'bg-secondary',
                cliStatus.installed && 'bg-green-500/10',
                !cliStatus.checking && !cliStatus.installed && 'bg-amber-500/10'
              )}
            >
              {cliStatus.checking ? (
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              ) : cliStatus.installed ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <XCircle className="w-6 h-6 text-amber-400" />
              )}
            </div>

            <div className="flex-1">
              <p className="font-medium text-white">
                {cliStatus.checking
                  ? 'Checking installation...'
                  : cliStatus.installed
                    ? 'Claude CLI Installed'
                    : 'Claude CLI Not Found'}
              </p>
              {cliStatus.installed && cliStatus.version && (
                <p className="text-sm text-muted-foreground">
                  Version {cliStatus.version}
                  {cliStatus.path && <span className="text-muted-foreground ml-2">• {cliStatus.path}</span>}
                </p>
              )}
              {!cliStatus.checking && !cliStatus.installed && (
                <p className="text-sm text-muted-foreground">Optional but recommended for terminal workflows</p>
              )}
            </div>
          </div>
        </div>

        {/* Installation instructions (if not installed) */}
        {!cliStatus.checking && !cliStatus.installed && (
          <div className="w-full space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Install Claude CLI using one of these methods:
            </p>

            {/* npm install */}
            <div className="p-4 rounded-lg bg-card border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">npm</span>
                <button
                  onClick={() => copyToClipboard('npm install -g @anthropic-ai/claude-cli')}
                  className="text-muted-foreground hover:text-foreground p-1"
                  title="Copy to clipboard"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <code className="text-sm text-primary font-mono">
                npm install -g @anthropic-ai/claude-cli
              </code>
            </div>

            {/* Homebrew install */}
            <div className="p-4 rounded-lg bg-card border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Homebrew (macOS)</span>
                <button
                  onClick={() => copyToClipboard('brew install anthropic/tap/claude')}
                  className="text-muted-foreground hover:text-foreground p-1"
                  title="Copy to clipboard"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <code className="text-sm text-primary font-mono">
                brew install anthropic/tap/claude
              </code>
            </div>

            {/* Refresh button */}
            <div className="flex justify-center">
              <Button
                onClick={onCheckCLI}
                variant="outline"
                size="sm"
                className="border-border"
              >
                <Loader2 className={cn('w-4 h-4 mr-2', cliStatus.checking && 'animate-spin')} />
                Check Again
              </Button>
            </div>
          </div>
        )}

        {/* Installed - show usage hint */}
        {cliStatus.installed && (
          <div className="w-full p-4 rounded-lg bg-card/50 border border-border">
            <div className="flex items-start gap-3">
              <Terminal className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-foreground mb-1">Ready to use in your terminal:</p>
                <code className="text-primary font-mono">claude "your prompt here"</code>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
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
