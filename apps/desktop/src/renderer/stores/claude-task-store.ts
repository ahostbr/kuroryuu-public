import { create } from 'zustand';

/**
 * Claude Task - represents a task created by Claude Code's TaskCreate/TaskUpdate
 * These are synced from the ## Claude Tasks section of ai/todo.md
 */
export interface ClaudeTask {
  id: string;           // T001, T002, etc.
  description: string;  // Task description
  status: 'pending' | 'in_progress' | 'completed';
  worklog?: string;     // Path to worklog if linked
  createdAt?: Date;     // Parsed from (created: timestamp)
  completedAt?: Date;   // Parsed from (completed: timestamp)
}

export interface ClaudeTaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  completionRate: number; // 0-100
}

interface ClaudeTaskStore {
  tasks: ClaudeTask[];
  todoPath: string;
  isLoading: boolean;
  error: string | null;
  displayLimit: number; // 0 = all

  // Computed
  stats: ClaudeTaskStats;

  // Actions
  loadTasks: () => Promise<void>;
  setTodoPath: (path: string) => void;
  setDisplayLimit: (limit: number) => void;
  refresh: () => Promise<void>;
}

/**
 * Parse all T### tasks from todo.md content
 * Searches all sections (Backlog, Active, Done, etc.) for task lines
 */
function parseClaudeTasks(content: string): ClaudeTask[] {
  const tasks: ClaudeTask[] = [];

  // Normalize line endings (Windows CRLF -> LF)
  const normalizedContent = content.replace(/\r\n/g, '\n');

  // Match task lines anywhere in the file:
  // - [ ] T###: description @agent [worklog: ...] (created: ...) (completed: ...)
  // - [x] T###: ...
  // - [~] T###: ... (in progress)
  const taskPattern = /^- \[([ x~])\] (T\d{3,}):\s*(.+)$/gm;
  let match;

  while ((match = taskPattern.exec(normalizedContent)) !== null) {
    const checkbox = match[1];
    const isCompleted = checkbox === 'x';
    const isInProgress = checkbox === '~';
    const id = match[2];
    const rest = match[3];

    // Parse description (everything before @agent or [worklog: or (created:)
    let description = rest;
    const atAgentIdx = rest.indexOf('@agent');
    if (atAgentIdx > 0) {
      description = rest.substring(0, atAgentIdx).trim();
    }

    // Parse worklog
    let worklog: string | undefined;
    const worklogMatch = rest.match(/\[worklog:\s*([^\]]+)\]/);
    if (worklogMatch && worklogMatch[1] !== 'pending') {
      worklog = worklogMatch[1].trim();
    }

    // Parse created timestamp
    let createdAt: Date | undefined;
    const createdMatch = rest.match(/\(created:\s*([^)]+)\)/);
    if (createdMatch) {
      createdAt = new Date(createdMatch[1].trim());
      if (isNaN(createdAt.getTime())) createdAt = undefined;
    }

    // Parse completed timestamp
    let completedAt: Date | undefined;
    const completedMatch = rest.match(/\(completed:\s*([^)]+)\)/);
    if (completedMatch) {
      completedAt = new Date(completedMatch[1].trim());
      if (isNaN(completedAt.getTime())) completedAt = undefined;
    }

    tasks.push({
      id,
      description,
      status: isCompleted ? 'completed' : isInProgress ? 'in_progress' : 'pending',
      worklog,
      createdAt,
      completedAt,
    });
  }

  return tasks;
}

/**
 * Calculate stats from tasks
 */
function calculateStats(tasks: ClaudeTask[]): ClaudeTaskStats {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, pending, inProgress, completed, completionRate };
}

export const useClaudeTaskStore = create<ClaudeTaskStore>((set, get) => ({
  tasks: [],
  todoPath: '',
  isLoading: false,
  error: null,
  displayLimit: 0, // 0 = all
  stats: { total: 0, pending: 0, inProgress: 0, completed: 0, completionRate: 0 },

  setTodoPath: (path) => set({ todoPath: path }),

  setDisplayLimit: (limit) => set({ displayLimit: limit }),

  loadTasks: async () => {
    const { todoPath } = get();
    if (!todoPath) return;

    set({ isLoading: true, error: null });

    try {
      const content = await window.electronAPI.fs.readFile(todoPath);
      const tasks = parseClaudeTasks(content);
      const stats = calculateStats(tasks);
      set({ tasks, stats, isLoading: false });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg, isLoading: false });
    }
  },

  refresh: async () => {
    await get().loadTasks();
  },
}));

// Export helper for components that need filtered tasks
export function getDisplayTasks(tasks: ClaudeTask[], limit: number): ClaudeTask[] {
  if (limit === 0) return tasks;
  return tasks.slice(0, limit);
}
