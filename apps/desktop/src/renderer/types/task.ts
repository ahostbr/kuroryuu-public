export type TaskStatus = 'backlog' | 'active' | 'delayed' | 'done';

export type TaskCategory = 
  | 'feature' 
  | 'bug_fix' 
  | 'refactoring' 
  | 'documentation' 
  | 'security' 
  | 'performance' 
  | 'ui_ux' 
  | 'infrastructure' 
  | 'testing';

export type TaskPhase = 
  | 'idle' 
  | 'planning' 
  | 'coding' 
  | 'qa_review' 
  | 'qa_fixing' 
  | 'complete';

export interface Task {
  id: string;           // T001, T002, etc.
  title: string;
  description?: string;
  status: TaskStatus;
  assignee?: string;    // agent_001, etc.
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  category?: TaskCategory;
  complexity?: 'sm' | 'md' | 'lg';
  phase?: TaskPhase;
  createdAt?: string;
  updatedAt?: string;
  notes?: string;       // "**SKIPPED** - reason", "**DEFERRED** - reason"
  contextFiles?: string[]; // Files attached to task
}

export interface TaskFile {
  path: string;
  tasks: Task[];
  lastModified: number;
}
