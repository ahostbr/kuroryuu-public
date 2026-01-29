import { create } from 'zustand';
import type { Task, TaskStatus } from '../types/task';
import { parseTodoMd, serializeTodoMd } from '../lib/parse-todo';
import { toast } from '../components/ui/toast';

interface TaskLock {
  taskId: string;
  agentId: string;
  lockedAt: number;
}

// Skip file watcher reload after our own writes
let skipNextReload = false;
let skipReloadTimeout: NodeJS.Timeout | null = null;

export function shouldSkipReload(): boolean {
  if (skipNextReload) {
    skipNextReload = false;
    return true;
  }
  return false;
}

interface TaskStore {
  tasks: Task[];
  todoPath: string;
  isLoading: boolean;
  error: string | null;
  locks: TaskLock[];

  // Actions
  loadTasks: () => Promise<void>;
  setTodoPath: (path: string) => void;
  createTask: (task: Task) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Omit<Task, 'id'>>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  assignTask: (taskId: string, assignee: string | undefined) => Promise<void>;
  refresh: () => Promise<void>;

  // Locking
  lockTask: (taskId: string, agentId: string) => boolean;
  unlockTask: (taskId: string) => void;
  isLocked: (taskId: string) => boolean;
  getLockedBy: (taskId: string) => string | undefined;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  todoPath: '',
  isLoading: false,
  error: null,
  locks: [],
  
  setTodoPath: (path) => set({ todoPath: path }),
  
  loadTasks: async () => {
    const { todoPath } = get();
    if (!todoPath) return;
    
    set({ isLoading: true, error: null });
    
    try {
      const content = await window.electronAPI.fs.readFile(todoPath);
      const tasks = parseTodoMd(content);
      set({ tasks, isLoading: false });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg, isLoading: false });
      toast.error(`Failed to load tasks: ${errorMsg}`);
    }
  },

  createTask: async (task) => {
    const { tasks, todoPath } = get();
    const updated = [...tasks, task];
    set({ tasks: updated });

    try {
      // Skip file watcher reload after our own write
      skipNextReload = true;
      if (skipReloadTimeout) clearTimeout(skipReloadTimeout);
      skipReloadTimeout = setTimeout(() => { skipNextReload = false; }, 1000);

      const content = serializeTodoMd(updated);
      await window.electronAPI.fs.writeFile(todoPath, content);
      toast.success(`Created task ${task.id}`);
    } catch (err) {
      set({ tasks }); // Revert
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to create task: ${errorMsg}`);
    }
  },

  updateTask: async (taskId, updates) => {
    const { tasks, todoPath, isLocked } = get();

    if (!todoPath) {
      toast.error('Cannot save: todo path not set');
      return;
    }

    if (isLocked(taskId)) {
      toast.warning(`Task ${taskId} is locked by another agent`);
      return;
    }

    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      toast.error(`Task ${taskId} not found`);
      return;
    }

    const updated = tasks.map(t =>
      t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
    );
    set({ tasks: updated });

    try {
      skipNextReload = true;
      if (skipReloadTimeout) clearTimeout(skipReloadTimeout);
      skipReloadTimeout = setTimeout(() => { skipNextReload = false; }, 1000);

      const content = serializeTodoMd(updated);
      await window.electronAPI.fs.writeFile(todoPath, content);
      toast.success(`Task ${taskId} updated`);
    } catch (err) {
      set({ tasks }); // Revert
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to update task: ${errorMsg}`);
    }
  },

  deleteTask: async (taskId) => {
    const { tasks, todoPath, isLocked } = get();

    if (!todoPath) {
      toast.error('Cannot delete: todo path not set');
      return;
    }

    if (isLocked(taskId)) {
      toast.warning(`Task ${taskId} is locked by another agent`);
      return;
    }

    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      toast.error(`Task ${taskId} not found`);
      return;
    }

    const updated = tasks.filter(t => t.id !== taskId);
    set({ tasks: updated });

    try {
      skipNextReload = true;
      if (skipReloadTimeout) clearTimeout(skipReloadTimeout);
      skipReloadTimeout = setTimeout(() => { skipNextReload = false; }, 1000);

      const content = serializeTodoMd(updated);
      await window.electronAPI.fs.writeFile(todoPath, content);
      toast.success(`Task ${taskId} deleted`);
    } catch (err) {
      set({ tasks }); // Revert
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to delete task: ${errorMsg}`);
    }
  },

  updateTaskStatus: async (taskId, status) => {
    const { tasks, todoPath, isLocked } = get();

    console.log('[TaskStore] updateTaskStatus called:', { taskId, status, todoPath });

    // Check if todoPath is set
    if (!todoPath) {
      toast.error('Cannot save: todo path not set');
      console.error('[TaskStore] todoPath is empty!');
      return;
    }

    // Check lock
    if (isLocked(taskId)) {
      toast.warning(`Task ${taskId} is locked by another agent`);
      return;
    }

    const updated = tasks.map(t =>
      t.id === taskId ? { ...t, status } : t
    );
    set({ tasks: updated });

    // Persist to disk - skip file watcher reload after our own write
    try {
      skipNextReload = true;
      if (skipReloadTimeout) clearTimeout(skipReloadTimeout);
      skipReloadTimeout = setTimeout(() => { skipNextReload = false; }, 1000);

      const content = serializeTodoMd(updated);
      console.log('[TaskStore] Writing to:', todoPath);
      console.log('[TaskStore] Content preview:', content.substring(0, 200));
      await window.electronAPI.fs.writeFile(todoPath, content);
      toast.success(`Task ${taskId} moved to ${status}`);
    } catch (err) {
      // Revert on error
      set({ tasks });
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[TaskStore] Write failed:', errorMsg);
      toast.error(`Failed to update task: ${errorMsg}`);
    }
  },
  
  assignTask: async (taskId, assignee) => {
    const { tasks, todoPath } = get();
    const updated = tasks.map(t =>
      t.id === taskId ? { ...t, assignee } : t
    );
    set({ tasks: updated });

    try {
      const content = serializeTodoMd(updated);
      await window.electronAPI.fs.writeFile(todoPath, content);
    } catch (err) {
      // Revert on error
      set({ tasks });
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to assign task: ${errorMsg}`);
    }
  },
  
  refresh: async () => {
    await get().loadTasks();
  },
  
  // Locking implementation
  lockTask: (taskId, agentId) => {
    const { locks } = get();
    const existing = locks.find(l => l.taskId === taskId);
    
    if (existing) {
      // Already locked
      return false;
    }
    
    set({
      locks: [...locks, { taskId, agentId, lockedAt: Date.now() }]
    });
    return true;
  },
  
  unlockTask: (taskId) => {
    const { locks } = get();
    set({ locks: locks.filter(l => l.taskId !== taskId) });
  },
  
  isLocked: (taskId) => {
    const { locks } = get();
    return locks.some(l => l.taskId === taskId);
  },
  
  getLockedBy: (taskId) => {
    const { locks } = get();
    return locks.find(l => l.taskId === taskId)?.agentId;
  }
}));
