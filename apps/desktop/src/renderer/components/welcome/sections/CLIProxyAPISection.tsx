/**
 * CLIProxyAPI Section for Welcome Hub
 * Embeds the existing CLIProxySection and CLIProxyWizard from settings
 */

import React, { useState } from 'react';
import {
  ChevronDown,
  Cpu,
  Server,
  Zap,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { CLIProxySection } from '../../settings/CLIProxySection';
import { CLIProxyWizard } from '../../settings/CLIProxyWizard';
import { LMStudioSection } from './LMStudioSection';

interface CLIProxyAPISectionProps {
  className?: string;
}

export function CLIProxyAPISection({ className }: CLIProxyAPISectionProps) {
  const [cliproxyExpanded, setCliproxyExpanded] = useState(true); // Default open since it's the primary
  const [lmstudioExpanded, setLmstudioExpanded] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  return (
    <div className={cn('w-full space-y-4', className)}>
      {/* CLIProxyAPI - Collapsible (default open) */}
      <div className="rounded-xl border border-primary/30 overflow-hidden">
        <button
          onClick={() => setCliproxyExpanded(!cliproxyExpanded)}
          className="w-full flex items-center justify-between p-4 bg-primary/10 hover:bg-primary/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-primary" />
            <div className="text-left">
              <div className="font-medium text-foreground">CLIProxyAPI - Your Default Provider</div>
              <p className="text-sm text-muted-foreground">
                Route AI requests through your existing CLI authentications
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn(
              'w-5 h-5 text-primary transition-transform',
              cliproxyExpanded && 'rotate-180'
            )}
          />
        </button>

        {cliproxyExpanded && (
          <div className="p-4 border-t border-primary/30 bg-card/50 space-y-4">
            {/* What is CLIProxyAPI */}
            <div className="p-4 rounded-lg bg-secondary/30 border border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Server className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">What is CLIProxyAPI?</h3>
                  <p className="text-xs text-muted-foreground">OpenAI-compatible proxy on port 8317</p>
                </div>
              </div>

              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span><strong>No API keys needed</strong> - uses your existing CLI authentications</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Supports: Claude, Gemini, OpenAI, GitHub Copilot, Kiro, Antigravity</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>One-time OAuth login per provider → tokens stored locally</span>
                </li>
              </ul>
            </div>

            {/* Status & Setup */}
            <div className="p-4 rounded-lg bg-secondary/30 border border-border">
              <h3 className="font-semibold text-foreground mb-3">Status & Setup</h3>
              <CLIProxySection />

              <div className="mt-4 pt-3 border-t border-border text-center">
                <button
                  onClick={() => setShowWizard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm"
                >
                  <Server className="w-4 h-4" />
                  Open Full Setup Wizard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* LMStudio - Collapsible (default closed) */}
      <div className="rounded-xl border border-purple-500/30 overflow-hidden">
        <button
          onClick={() => setLmstudioExpanded(!lmstudioExpanded)}
          className="w-full flex items-center justify-between p-4 bg-purple-500/10 hover:bg-purple-500/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-purple-500" />
            <div className="text-left">
              <div className="font-medium text-foreground">Offline Alternative: LMStudio</div>
              <p className="text-sm text-muted-foreground">
                Run models locally for offline access and complete privacy
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn(
              'w-5 h-5 text-purple-500 transition-transform',
              lmstudioExpanded && 'rotate-180'
            )}
          />
        </button>

        {lmstudioExpanded && (
          <div className="p-4 border-t border-purple-500/30 bg-purple-500/5">
            <LMStudioSection />
          </div>
        )}
      </div>

      {/* CLIProxy Wizard Modal */}
      {showWizard && <CLIProxyWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}
