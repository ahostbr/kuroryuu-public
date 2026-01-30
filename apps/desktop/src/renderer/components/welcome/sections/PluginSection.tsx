import React, { useState } from 'react';
import {
  Puzzle,
  ChevronDown,
  Terminal,
  Zap,
  MessageSquare,
  Users,
  Wrench,
  Network,
  Bot,
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

interface PluginSectionProps {
  className?: string;
}

export function PluginSection({ className }: PluginSectionProps) {
  return (
    <div className={cn('w-full space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Puzzle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Kuro Plugin</h2>
          <p className="text-sm text-muted-foreground">
            Claude Code CLI plugin for Kuroryuu integration
          </p>
        </div>
      </div>

      {/* Overview - Default Open */}
      <CollapsibleSection title="Overview" icon={Puzzle} defaultOpen={true}>
        <div className="space-y-3">
          <p className="text-muted-foreground">
            The Kuro plugin enables Claude Code CLI to integrate with the Kuroryuu multi-agent orchestration system.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="text-2xl font-bold text-primary">16</div>
              <div className="text-xs text-muted-foreground">MCP Tools</div>
            </div>
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <div className="text-2xl font-bold text-purple-500">118</div>
              <div className="text-xs text-muted-foreground">Total Actions</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Located at: <code className="bg-secondary px-1 rounded">~/.claude/plugins/kuro</code>
          </p>
        </div>
      </CollapsibleSection>

      {/* Slash Commands */}
      <CollapsibleSection title="Slash Commands (12)" icon={Terminal}>
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Session Management</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-start [role]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-status</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Checkpoints</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-save [desc]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-load [id]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/savenow</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/loadnow</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Role Configuration</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-leader</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-worker</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-thinker</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Search & Messaging</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-rag [query]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-inbox [action]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-memory [key]</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Parallelism</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/max-parallel</code>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Activates wave-based parallel task decomposition and agent spawning.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Hooks */}
      <CollapsibleSection title="Hooks (5 Events)" icon={Zap}>
        <div className="space-y-3">
          <div className="grid gap-2">
            <div className="p-2 rounded bg-secondary/50">
              <div className="flex justify-between items-center">
                <code className="font-mono text-xs text-primary">SessionStart</code>
                <span className="text-xs text-muted-foreground">Bootstrap session</span>
              </div>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <div className="flex justify-between items-center">
                <code className="font-mono text-xs text-primary">PreToolUse</code>
                <span className="text-xs text-muted-foreground">RAG gate, edit confirm</span>
              </div>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <div className="flex justify-between items-center">
                <code className="font-mono text-xs text-primary">PostToolUse</code>
                <span className="text-xs text-muted-foreground">Sync tasks to ai/todo.md</span>
              </div>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <div className="flex justify-between items-center">
                <code className="font-mono text-xs text-primary">UserPromptSubmit</code>
                <span className="text-xs text-muted-foreground">Check inbox, export</span>
              </div>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <div className="flex justify-between items-center">
                <code className="font-mono text-xs text-primary">Stop</code>
                <span className="text-xs text-muted-foreground">Checkpoint before exit</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            PostToolUse hook syncs TaskCreate/TaskUpdate to ai/todo.md with T### format.
          </p>
        </div>
      </CollapsibleSection>

      {/* Skills */}
      <CollapsibleSection title="Skills (2)" icon={MessageSquare}>
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-foreground">kuroryuu-patterns</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Comprehensive guide to Kuroryuu patterns, MCP tools, and multi-agent coordination.
              Triggers on "how does Kuroryuu work", "k_ tools", "promise protocol".
            </p>
          </div>
          <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-foreground">max-parallel</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum parallelism patterns for task decomposition.
              Triggers on "do this in parallel", "spawn multiple agents", "parallelize this".
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Agents */}
      <CollapsibleSection title="Agents (11)" icon={Bot}>
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Explorers</div>
            <div className="grid gap-2">
              <div className="p-2 rounded bg-green-500/10 border border-green-500/30">
                <div className="flex justify-between items-center">
                  <code className="font-mono text-xs text-green-500">kuroryuu-explorer</code>
                  <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">haiku</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Fast read-only codebase exploration</p>
              </div>
              <div className="p-2 rounded bg-orange-500/10 border border-orange-500/30">
                <div className="flex justify-between items-center">
                  <code className="font-mono text-xs text-orange-500">kuroryuu-explorer-opus</code>
                  <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">opus</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Deep research with advanced reasoning</p>
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">PRD Workflow</div>
            <div className="flex flex-wrap gap-1">
              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-xs">prd-generator</span>
              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-xs">prd-primer</span>
              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-xs">prd-executor</span>
              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-xs">prd-reviewer</span>
              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-xs">prd-code-reviewer</span>
              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-xs">prd-validator</span>
              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-xs">prd-reporter</span>
              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-xs">prd-system-reviewer</span>
              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-xs">prd-hackathon-finalizer</span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* MCP Tools */}
      <CollapsibleSection title="MCP Tools (16)" icon={Wrench}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_rag</code>
              <span className="text-muted-foreground ml-1">(12 actions)</span>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_pty</code>
              <span className="text-muted-foreground ml-1">(11 actions)</span>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_inbox</code>
              <span className="text-muted-foreground ml-1">(8 actions)</span>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_capture</code>
              <span className="text-muted-foreground ml-1">(8 actions)</span>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_session</code>
              <span className="text-muted-foreground ml-1">(7 actions)</span>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_memory</code>
              <span className="text-muted-foreground ml-1">(7 actions)</span>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_checkpoint</code>
              <span className="text-muted-foreground ml-1">(4 actions)</span>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_files</code>
              <span className="text-muted-foreground ml-1">(5 actions)</span>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_repo_intel</code>
              <span className="text-muted-foreground ml-1">(5 actions)</span>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_collective</code>
              <span className="text-muted-foreground ml-1">(6 actions)</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Also: k_graphiti_migrate, k_pccontrol (opt-in), k_thinker_channel, k_MCPTOOLSEARCH, k_help
          </p>
        </div>
      </CollapsibleSection>

      {/* Multi-Agent Coordination */}
      <CollapsibleSection title="Multi-Agent Coordination" icon={Network}>
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Promise Protocol</div>
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2 text-xs">
                <code className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">DONE</code>
                <span className="text-muted-foreground">Task complete, leader verifies</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <code className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">PROGRESS:N%</code>
                <span className="text-muted-foreground">Partial progress reported</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <code className="bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">BLOCKED</code>
                <span className="text-muted-foreground">External blocker, leader investigates</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <code className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">STUCK</code>
                <span className="text-muted-foreground">Can't proceed, leader sends hint</span>
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Delegation Pattern</div>
            <div className="p-2 rounded bg-secondary/50 font-mono text-xs text-muted-foreground">
              Leader → k_inbox(send, task) → Worker<br/>
              Worker → &lt;promise&gt;PROGRESS:50%&lt;/promise&gt; → Leader<br/>
              Worker → &lt;promise&gt;DONE&lt;/promise&gt; → Leader<br/>
              Leader → Verify completion
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Thinker Debates</div>
            <div className="flex flex-wrap gap-1">
              <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-xs">visionary</span>
              <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-xs">skeptic</span>
              <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-xs">pragmatist</span>
              <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-xs">red_team</span>
              <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-xs">blue_team</span>
              <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-xs">first_principles</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Spawn multiple thinkers for multi-perspective analysis via k_thinker_channel.
            </p>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
