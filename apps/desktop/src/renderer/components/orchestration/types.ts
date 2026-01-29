/**
 * Shared types for orchestration components
 */

export interface OrchestrationTask {
  task_id: string;
  title: string;
  description: string;
  status: 'pending' | 'breaking_down' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  submitted_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  subtasks: Subtask[];
  error: string | null;
}

export interface Subtask {
  id: string;
  description: string;
  status: 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed';
  assigned_to: string | null;
  result: unknown;
}

export interface OrchestrationStats {
  total: number;
  pending: number;
  breaking_down: number;
  assigned: number;
  in_progress: number;
  completed: number;
  failed: number;
  cancelled: number;
  total_subtasks: number;
  pending_subtasks: number;
}

export interface OrchestrationEvent {
  id: string;
  type: 'created' | 'claimed' | 'started' | 'completed' | 'failed';
  taskId: string;
  taskTitle: string;
  agentId?: string;
  timestamp: string;
}

// Status colors for badges
export const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  breaking_down: { bg: 'bg-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-400' },
  assigned: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  in_progress: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-400 animate-pulse' },
  completed: { bg: 'bg-green-500/20', text: 'text-green-400', dot: 'bg-green-400' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-400' },
  cancelled: { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  claimed: { bg: 'bg-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-400' },
};
