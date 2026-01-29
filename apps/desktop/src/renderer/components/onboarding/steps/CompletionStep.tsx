/**
 * CompletionStep - Setup complete with next actions
 */
import React from 'react';
import { CheckCircle2, ArrowRight, Sparkles, Zap, FolderOpen, Terminal } from 'lucide-react';
import { Button } from '../../ui/button';

interface CompletionStepProps {
  onComplete: () => void;
  onOpenProject: () => void;
}

export function CompletionStep({ onComplete, onOpenProject }: CompletionStepProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
      {/* Success icon */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500/20 to-green-600/20 flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-green-400" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-background" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-3xl font-bold text-white mb-3">You're All Set!</h1>

      {/* Subtitle */}
      <p className="text-muted-foreground text-lg mb-10 max-w-md">
        Kuroryuu is ready to help you build software faster. Let's get started!
      </p>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 max-w-xl w-full">
        {/* Open Project */}
        <button
          onClick={onOpenProject}
          className="flex items-center gap-4 p-5 rounded-xl bg-card/50 border border-border hover:border-border hover:bg-card transition-all duration-200 text-left group"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
            <FolderOpen className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <span className="font-medium text-white block">Open a Project</span>
            <span className="text-sm text-muted-foreground">Import an existing codebase</span>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-muted-foreground group-hover:translate-x-1 transition-all" />
        </button>

        {/* Quick Task */}
        <button
          onClick={onComplete}
          className="flex items-center gap-4 p-5 rounded-xl bg-card/50 border border-border hover:border-border hover:bg-card transition-all duration-200 text-left group"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
            <Zap className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1">
            <span className="font-medium text-white block">Start Building</span>
            <span className="text-sm text-muted-foreground">Create your first task</span>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-muted-foreground group-hover:translate-x-1 transition-all" />
        </button>
      </div>

      {/* What's next tips */}
      <div className="w-full max-w-xl">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Quick Tips</h3>
        <div className="grid grid-cols-1 gap-3 text-left">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-card/30">
            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">K</span>
            </div>
            <div>
              <span className="text-sm text-foreground">Press <kbd className="px-1.5 py-0.5 text-xs bg-secondary rounded border border-border">K</kbd> to open the Kanban board</span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-card/30">
            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">A</span>
            </div>
            <div>
              <span className="text-sm text-foreground">Press <kbd className="px-1.5 py-0.5 text-xs bg-secondary rounded border border-border">A</kbd> to view Agent Terminals</span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-card/30">
            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Terminal className="w-3 h-3 text-primary" />
            </div>
            <div>
              <span className="text-sm text-foreground">Use <code className="px-1.5 py-0.5 text-xs bg-secondary rounded font-mono">claude "your task"</code> in terminal for quick commands</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main CTA */}
      <div className="mt-10">
        <Button
          onClick={onComplete}
          className="px-8 py-3 text-base bg-primary hover:bg-[#c5c76a] text-background font-semibold rounded-lg transition-all duration-200 hover:scale-105"
        >
          Get Started
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
