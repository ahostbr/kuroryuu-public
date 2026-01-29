import { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../stores/task-store';
import { useAgentStore } from '../stores/agent-store';
import { Badge } from './ui/badge';
import { toast } from './ui/toast';
import { Play, Square, User, UserX, Loader2, ChevronDown, Bot } from 'lucide-react';
import type { Task, TaskStatus } from '../types/task';

interface TaskActionsProps {
  task: Task;
  onStatusChange?: (newStatus: TaskStatus) => void;
}

export function TaskActions({ task, onStatusChange }: TaskActionsProps) {
  const { updateTaskStatus, assignTask, isLocked, lockTask, unlockTask } = useTaskStore();
  const { agents, fetchAgents } = useAgentStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const locked = isLocked(task.id);

  // Fetch agents on mount
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAgentDropdown(false);
      }
    };
    if (showAgentDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAgentDropdown]);

  // Filter for alive agents only
  const aliveAgents = agents.filter(a => a.status !== 'dead');

  const handleStart = async () => {
    if (locked) {
      toast.warning('Task is locked by another agent');
      return;
    }

    setIsUpdating(true);
    try {
      await updateTaskStatus(task.id, 'active');
      onStatusChange?.('active');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStop = async () => {
    setIsUpdating(true);
    try {
      await updateTaskStatus(task.id, 'backlog');
      onStatusChange?.('backlog');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleComplete = async () => {
    setIsUpdating(true);
    try {
      await updateTaskStatus(task.id, 'done');
      onStatusChange?.('done');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAssignToAgent = async (agentId: string) => {
    setIsUpdating(true);
    setShowAgentDropdown(false);
    try {
      await assignTask(task.id, agentId);
      lockTask(task.id, agentId);
      toast.info(`Task assigned to ${agentId}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUnassign = async () => {
    setIsUpdating(true);
    try {
      await assignTask(task.id, undefined);
      unlockTask(task.id);
      toast.info('Task unassigned');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Status badge */}
      <Badge variant={task.status}>{task.status}</Badge>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {task.status === 'backlog' && (
          <button
            onClick={handleStart}
            disabled={isUpdating || locked}
            className="p-1.5 rounded bg-primary/20 hover:bg-primary/30 text-primary disabled:opacity-50 transition-colors"
            title="Start task"
          >
            {isUpdating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
        )}

        {task.status === 'active' && (
          <>
            <button
              onClick={handleStop}
              disabled={isUpdating}
              className="p-1.5 rounded bg-muted hover:bg-muted text-foreground disabled:opacity-50 transition-colors"
              title="Stop task"
            >
              {isUpdating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={handleComplete}
              disabled={isUpdating}
              className="p-1.5 rounded bg-green-500/20 hover:bg-green-500/30 text-green-400 disabled:opacity-50 transition-colors"
              title="Mark complete"
            >
              Done
            </button>
          </>
        )}

        {task.status === 'done' && (
          <button
            onClick={handleStop}
            disabled={isUpdating}
            className="p-1.5 rounded bg-muted hover:bg-muted text-foreground disabled:opacity-50 transition-colors"
            title="Reopen task"
          >
            Reopen
          </button>
        )}

        {/* Assign/Unassign button with dropdown */}
        <div className="relative" ref={dropdownRef}>
          {task.assignee ? (
            <button
              onClick={handleUnassign}
              disabled={isUpdating}
              className="p-1.5 rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors disabled:opacity-50"
              title={`Unassign from ${task.assignee}`}
            >
              <UserX className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setShowAgentDropdown(!showAgentDropdown)}
              disabled={isUpdating}
              className="flex items-center gap-0.5 p-1.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors disabled:opacity-50"
              title="Assign task"
            >
              <User className="w-4 h-4" />
              <ChevronDown className="w-3 h-3" />
            </button>
          )}

          {/* Agent Dropdown */}
          {showAgentDropdown && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="p-2 border-b border-border">
                <span className="text-xs font-medium text-muted-foreground">Assign to Agent</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {aliveAgents.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    No agents available
                  </div>
                ) : (
                  aliveAgents.map(agent => (
                    <button
                      key={agent.agent_id}
                      onClick={() => handleAssignToAgent(agent.agent_id)}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
                    >
                      <Bot className={`w-4 h-4 ${agent.status === 'idle' ? 'text-green-400' : 'text-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {agent.agent_id}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {agent.role} · {agent.status}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
