/**
 * Agent types for Multi-Agent Message Bus (M5)
 */

export type AgentRole = 'leader' | 'worker';
export type AgentStatus = 'idle' | 'busy' | 'dead';

export interface Agent {
  agent_id: string;
  model_name: string;
  role: AgentRole;
  status: AgentStatus;
  capabilities: string[];
  current_task_id: string | null;
  last_heartbeat: string;
  registered_at: string;
}

export interface AgentRegistryStats {
  total: number;
  alive: number;
  dead: number;
  leaders: number;
  workers: number;
  idle: number;
  busy: number;
}

export interface InboxMessage {
  message_id: string;
  from_agent: string;
  to_agent: string;
  subject: string;
  body: string;
  priority: 'high' | 'normal' | 'low';
  status: 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed';
  claimed_by: string | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  result: string | null;
}

export interface InboxStats {
  total: number;
  pending: number;
  claimed: number;
  in_progress: number;
  completed: number;
  failed: number;
}

export type TaskStatus = 
  | 'pending' 
  | 'breaking_down' 
  | 'assigned' 
  | 'in_progress' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

export interface SubTask {
  subtask_id: string;
  title: string;
  description: string;
  assigned_to: string | null;
  status: TaskStatus;
  result: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface OrchestrationTask {
  task_id: string;
  title: string;
  description: string;
  submitted_by: string;
  status: TaskStatus;
  priority: number;
  subtasks: SubTask[];
  breakdown_prompt: string | null;
  leader_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  final_result: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
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
