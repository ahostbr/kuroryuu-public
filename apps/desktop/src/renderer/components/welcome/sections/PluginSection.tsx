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
  Sparkles,
  Volume2,
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
              <div className="text-2xl font-bold text-primary">18</div>
              <div className="text-xs text-muted-foreground">MCP Tools</div>
            </div>
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <div className="text-2xl font-bold text-purple-500">130+</div>
              <div className="text-xs text-muted-foreground">Total Actions</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Located at: <code className="bg-secondary px-1 rounded">~/.claude/plugins/kuro</code>
          </p>
        </div>
      </CollapsibleSection>

      {/* Features */}
      <CollapsibleSection title="Features" icon={Sparkles}>
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Voice & TTS</div>
            <div className="grid gap-2">
              <div className="p-2 rounded bg-purple-500/10 border border-purple-500/30">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3 h-3 text-purple-500" />
                  <span className="font-medium text-foreground text-xs">Voice Library</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  47 English Edge TTS voices with preview and selection
                </p>
              </div>
              <div className="p-2 rounded bg-secondary/50">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-foreground">TTS Configuration</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Provider selection, custom messages, voice testing
                </p>
              </div>
              <div className="p-2 rounded bg-secondary/50">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-foreground">Dynamic Voice Loading</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Fetches voices directly from edge-tts for always up-to-date options
                </p>
              </div>
              <div className="p-2 rounded bg-secondary/50">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-foreground">Voice Preview</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Test any voice before selecting with instant audio playback
                </p>
              </div>
              <div className="p-2 rounded bg-purple-500/10 border border-purple-500/30">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3 h-3 text-purple-500" />
                  <span className="font-medium text-foreground text-xs">ElevenLabs Integration</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Premium voices with stability/similarity controls, Turbo v2.5 and Multilingual v2 models
                </p>
              </div>
              <div className="p-2 rounded bg-secondary/50">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-foreground">Smart TTS Announcements</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Task extraction from transcripts with contextual completion messages
                </p>
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Configuration</div>
            <div className="p-2 rounded bg-primary/10 border border-primary/30">
              <span className="font-medium text-foreground text-xs">Plugin Config Tab</span>
              <p className="text-xs text-muted-foreground mt-1">
                Dedicated configuration UI in Claude Plugin page for TTS settings, voice selection, and provider management
              </p>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Backup & Config</div>
            <div className="grid gap-2">
              <div className="p-2 rounded bg-secondary/50">
                <span className="text-xs font-medium text-foreground">Config Backup/Restore</span>
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-backup settings with 20 versions, one-click restore via Plugin Config
                </p>
              </div>
              <div className="p-2 rounded bg-secondary/50">
                <span className="text-xs font-medium text-foreground">Restic Integration</span>
                <p className="text-xs text-muted-foreground mt-1">
                  Encrypted backup repos with real-time progress via k_backup
                </p>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Slash Commands */}
      <CollapsibleSection title="Slash Commands (24)" icon={Terminal}>
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Session Management</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-start [role]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-status</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/question_toggle [t/f]</code>
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
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-repo-intel [action]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-mcptoolsearch [query]</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Parallelism</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/max-subagents-parallel</code>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Activates wave-based parallel task decomposition and agent spawning.
            </p>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Team Orchestration</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-spawnteam [template]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-ralph [task]</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Planning</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-plan [desc]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/k-plan-w-quizmaster</code>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Multi-Agent</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/max-swarm [task]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/find-skill-sh [query]</code>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Spawn coding agent swarms and search skills.sh library.
            </p>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Ralph Signals</div>
            <div className="flex flex-wrap gap-1">
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/ralph_done</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/ralph_progress [n]</code>
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/ralph_stuck [reason]</code>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Signal task status to Ralph orchestrator.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Hooks */}
      <CollapsibleSection title="Hooks (9 Events)" icon={Zap}>
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
                <code className="font-mono text-xs text-primary">SessionEnd</code>
                <span className="text-xs text-muted-foreground">Cleanup, final checkpoint</span>
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
            <div className="p-2 rounded bg-secondary/50">
              <div className="flex justify-between items-center">
                <code className="font-mono text-xs text-primary">SubagentStop</code>
                <span className="text-xs text-muted-foreground">Handle subagent completion</span>
              </div>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <div className="flex justify-between items-center">
                <code className="font-mono text-xs text-primary">Notification</code>
                <span className="text-xs text-muted-foreground">Process system notifications</span>
              </div>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <div className="flex justify-between items-center">
                <code className="font-mono text-xs text-primary">PreCompact</code>
                <span className="text-xs text-muted-foreground">Pre-compaction processing</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            PostToolUse hook syncs TaskCreate/TaskUpdate to ai/todo.md with T### format.
          </p>
        </div>
      </CollapsibleSection>

      {/* Skills */}
      <CollapsibleSection title="Skills (7)" icon={MessageSquare}>
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
              <span className="font-medium text-foreground">max-subagents-parallel</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum parallelism patterns for task decomposition.
              Triggers on "do this in parallel", "spawn multiple agents", "parallelize this".
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-foreground">find-skill-sh</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Search skills.sh for technology-specific procedural knowledge. Triggers on "find skill for X", "how do I do X".
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-foreground">vercel-react-best-practices</span>
            </div>
            <p className="text-xs text-muted-foreground">
              42 optimization rules with agent guidance for React apps.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-foreground">vite</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Build configuration reference (INDEX.md + 19 references).
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-foreground">vitest</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Testing framework reference (INDEX.md + 18 references).
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-foreground">web-design-guidelines</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Design documentation and patterns for web interfaces.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Agents */}
      <CollapsibleSection title="Agents (14)" icon={Bot}>
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
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Utility</div>
            <div className="flex flex-wrap gap-1">
              <span className="bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded text-xs">meta-agent</span>
              <span className="text-[10px] text-muted-foreground ml-1">Meta-analysis and agent configuration generation</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded text-xs">mp-builder</span>
              <span className="text-[10px] text-muted-foreground ml-1">Max-Parallel builder for focused implementation</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded text-xs">mp-validator</span>
              <span className="text-[10px] text-muted-foreground ml-1">Max-Parallel read-only validator for task verification</span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* MCP Tools */}
      <CollapsibleSection title="MCP Tools (18)" icon={Wrench}>
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
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_bash</code>
              <span className="text-muted-foreground ml-1">Background process management</span>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_process</code>
              <span className="text-muted-foreground ml-1">Process monitoring and control</span>
            </div>
            <div className="p-2 rounded bg-secondary/50">
              <code className="text-primary">k_backup</code>
              <span className="text-muted-foreground ml-1">(11 actions)</span>
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
