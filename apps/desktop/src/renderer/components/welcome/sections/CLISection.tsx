import React, { useState } from 'react';
import {
  Terminal,
  ChevronDown,
  Zap,
  Cpu,
  Cloud,
  Key,
  Settings,
  Command,
  Activity,
  Layers,
} from 'lucide-react';
import { cn } from '../../../lib/utils';

interface CollapsibleSectionProps {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  accentColor?: string;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  accentColor = 'primary',
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn('rounded-xl border overflow-hidden', `border-${accentColor}/30`)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between p-3 transition-colors',
          `bg-${accentColor}/10 hover:bg-${accentColor}/15`
        )}
      >
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', `text-${accentColor}`)} />
          <span className="font-medium text-foreground text-sm">{title}</span>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 transition-transform',
            `text-${accentColor}`,
            isOpen && 'rotate-180'
          )}
        />
      </button>
      {isOpen && (
        <div className="p-4 border-t border-border bg-card/50 text-sm">
          {children}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <code className="block p-2 rounded bg-secondary/70 font-mono text-xs text-foreground overflow-x-auto">
      {children}
    </code>
  );
}

interface CLISectionProps {
  className?: string;
}

export function CLISection({ className }: CLISectionProps) {
  return (
    <div className={cn('w-full space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Terminal className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Kuroryuu CLI</h2>
          <p className="text-sm text-muted-foreground">
            Interactive AI agent with 61+ models
          </p>
        </div>
      </div>

      {/* Getting Started - Default Open */}
      <CollapsibleSection title="Getting Started" icon={Terminal} defaultOpen={true}>
        <div className="space-y-3">
          <p className="text-muted-foreground">
            The CLI is bundled with Kuroryuu Desktop. Add to PATH for terminal access.
          </p>
          <div className="space-y-2">
            <div className="flex justify-between items-center p-2 rounded bg-secondary/50">
              <code className="font-mono text-xs text-primary">kuroryuu-cli</code>
              <span className="text-xs text-muted-foreground">Start interactive REPL</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-secondary/50">
              <code className="font-mono text-xs text-primary">kuroryuu-cli --prompt "..."</code>
              <span className="text-xs text-muted-foreground">Run with initial prompt</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-secondary/50">
              <code className="font-mono text-xs text-primary">kuroryuu-cli -p --prompt "..."</code>
              <span className="text-xs text-muted-foreground">Print and exit</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-secondary/50">
              <code className="font-mono text-xs text-primary">kuroryuu-cli --help</code>
              <span className="text-xs text-muted-foreground">Show all options</span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Providers */}
      <CollapsibleSection title="Providers (3 Available)" icon={Layers}>
        <div className="space-y-3">
          {/* CLIProxyAPI - Default */}
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-primary" />
              <span className="font-medium text-foreground">CLIProxyAPI</span>
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">DEFAULT</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              61 models across 6 providers: Claude, OpenAI, Gemini, Copilot, Kiro, Antigravity
            </p>
            <CodeBlock>kuroryuu-cli --llm-provider cliproxyapi</CodeBlock>
          </div>

          {/* LMStudio */}
          <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-4 h-4 text-purple-500" />
              <span className="font-medium text-foreground">LMStudio</span>
              <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">OFFLINE</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Local models on your GPU. Auto-fallback to CLIProxy if unavailable.
            </p>
            <CodeBlock>kuroryuu-cli --llm-provider lmstudio</CodeBlock>
          </div>

          {/* Claude API */}
          <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
            <div className="flex items-center gap-2 mb-1">
              <Cloud className="w-4 h-4 text-orange-500" />
              <span className="font-medium text-foreground">Claude API</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Direct Anthropic API. Requires API key or OAuth (Pro/Max).
            </p>
            <CodeBlock>kuroryuu-cli --llm-provider claude</CodeBlock>
          </div>

          <p className="text-xs text-muted-foreground">
            Switch at runtime: <code className="bg-secondary px-1 rounded">/provider cliproxyapi</code>
          </p>
        </div>
      </CollapsibleSection>

      {/* Slash Commands */}
      <CollapsibleSection title="Slash Commands (Interactive)" icon={Command}>
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Health & Status</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/status</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/doctor</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Provider & Model</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/provider [name]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/model [name]</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Operation Modes</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/mode normal</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/mode plan</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/mode read</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Context & History</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/context</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/compact</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/history</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/clear</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Tools & Permissions</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/tools</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/permissions</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Workflow</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/memory</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/plan</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/execute</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/review</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Exit</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/quit</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/exit</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/help</code>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Authentication */}
      <CollapsibleSection title="Authentication" icon={Key}>
        <div className="space-y-3">
          <p className="text-muted-foreground">
            OAuth for Claude Pro/Max subscriptions:
          </p>
          <div className="space-y-2">
            <div className="flex justify-between items-center p-2 rounded bg-secondary/50">
              <code className="font-mono text-xs text-primary">kuroryuu-cli login</code>
              <span className="text-xs text-muted-foreground">Start OAuth flow</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-secondary/50">
              <code className="font-mono text-xs text-primary">kuroryuu-cli logout</code>
              <span className="text-xs text-muted-foreground">Clear tokens</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-secondary/50">
              <code className="font-mono text-xs text-primary">kuroryuu-cli auth-status</code>
              <span className="text-xs text-muted-foreground">Check auth</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            API key mode: Set <code className="bg-secondary px-1 rounded">ANTHROPIC_API_KEY</code> env var
          </p>
        </div>
      </CollapsibleSection>

      {/* Configuration */}
      <CollapsibleSection title="Configuration" icon={Settings}>
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Key Flags</div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <code className="bg-secondary px-1 rounded">--role leader|worker|auto</code>
                <span className="text-muted-foreground">Agent role</span>
              </div>
              <div className="flex justify-between text-xs">
                <code className="bg-secondary px-1 rounded">--model opus|sonnet|gpt5</code>
                <span className="text-muted-foreground">Model shorthand</span>
              </div>
              <div className="flex justify-between text-xs">
                <code className="bg-secondary px-1 rounded">--stateless (default)</code>
                <span className="text-muted-foreground">Fresh context each turn</span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Environment Variables</div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <code className="bg-secondary px-1 rounded">KURORYUU_LLM_PROVIDER</code>
                <span className="text-muted-foreground">Default provider</span>
              </div>
              <div className="flex justify-between text-xs">
                <code className="bg-secondary px-1 rounded">KURORYUU_CLIPROXYAPI_URL</code>
                <span className="text-muted-foreground">CLIProxy URL (:8317)</span>
              </div>
              <div className="flex justify-between text-xs">
                <code className="bg-secondary px-1 rounded">ANTHROPIC_API_KEY</code>
                <span className="text-muted-foreground">Claude API key</span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Model Shorthands</div>
            <div className="flex flex-wrap gap-1 text-xs">
              <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">opus</span>
              <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">sonnet</span>
              <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">haiku</span>
              <span className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">gpt5</span>
              <span className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">codex</span>
              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">gemini</span>
              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">flash</span>
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
