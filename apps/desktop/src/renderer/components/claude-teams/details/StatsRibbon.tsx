import React from 'react';
import { Users, ListTodo, MessageSquare } from 'lucide-react';
import { CompletionRing } from './CompletionRing';

interface StatsRibbonProps {
  memberCount: number;
  taskCompleted: number;
  taskTotal: number;
  messageCount: number;
  completionPct: number;
}

export function StatsRibbon({ memberCount, taskCompleted, taskTotal, messageCount, completionPct }: StatsRibbonProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {/* Members */}
      <div className="td-stats-card bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 flex items-center gap-2.5">
        <Users className="w-4 h-4 text-primary flex-shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Members</span>
          <span className="text-sm font-semibold text-primary">{memberCount}</span>
        </div>
      </div>

      {/* Completion */}
      <div className="td-stats-card bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 flex items-center gap-2.5">
        <CompletionRing percentage={completionPct} size={36} />
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Completion</span>
          <span className="text-sm font-semibold text-foreground">{completionPct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Tasks */}
      <div className="td-stats-card bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 flex items-center gap-2.5">
        <ListTodo className="w-4 h-4 text-foreground flex-shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Tasks</span>
          <span className="text-sm font-semibold text-foreground">{taskCompleted}/{taskTotal}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="td-stats-card bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 flex items-center gap-2.5">
        <MessageSquare className="w-4 h-4 text-info flex-shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Messages</span>
          <span className="text-sm font-semibold text-info">{messageCount}</span>
        </div>
      </div>
    </div>
  );
}
