import { ipcMain, BrowserWindow } from 'electron';
import { getTaskService, type TaskStatus, type Task, type ClaudeTask, type TaskMeta } from '../services/task-service';

// Get the singleton instance
const taskService = getTaskService();

// Track windows subscribed to task change events
const subscribedWindows = new Set<number>();

/**
 * Response wrapper for operations that can fail
 */
interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Register all task-related IPC handlers
 * Call this during app initialization in main process
 */
export function registerTaskHandlers(): void {
  // Note: TaskService should be initialized with projectRoot before calling this
  // (done in index.ts via getTaskService().initialize(projectRoot))

  // ============================================================================
  // Core CRUD Operations
  // ============================================================================

  /**
   * List all tasks
   * Returns: Task[]
   */
  ipcMain.handle('tasks:list', async (): Promise<Task[]> => {
    try {
      return await taskService.listTasks();
    } catch (error) {
      console.error('[task-handlers] Error listing tasks:', error);
      throw error;
    }
  });

  /**
   * Get a single task by ID
   * Returns: Task | null
   */
  ipcMain.handle('tasks:get', async (_event, id: string): Promise<Task | null> => {
    try {
      return await taskService.getTask(id);
    } catch (error) {
      console.error(`[task-handlers] Error getting task ${id}:`, error);
      throw error;
    }
  });

  /**
   * Create a new task
   * Returns: OperationResult<Task>
   */
  ipcMain.handle('tasks:create', async (_event, data: Omit<Task, 'id'>): Promise<OperationResult<Task>> => {
    try {
      const task = await taskService.createTask(data);
      return { success: true, data: task };
    } catch (error) {
      console.error('[task-handlers] Error creating task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task'
      };
    }
  });

  /**
   * Update an existing task
   * Returns: OperationResult<Task>
   */
  ipcMain.handle('tasks:update', async (_event, id: string, updates: Partial<Task>): Promise<OperationResult<Task>> => {
    try {
      const task = await taskService.updateTask(id, updates);
      return { success: true, data: task };
    } catch (error) {
      console.error(`[task-handlers] Error updating task ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update task'
      };
    }
  });

  /**
   * Delete a task
   * Returns: OperationResult
   */
  ipcMain.handle('tasks:delete', async (_event, id: string): Promise<OperationResult> => {
    try {
      await taskService.deleteTask(id);
      return { success: true };
    } catch (error) {
      console.error(`[task-handlers] Error deleting task ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete task'
      };
    }
  });

  // ============================================================================
  // Status Operations
  // ============================================================================

  /**
   * Update task status
   * Returns: OperationResult<Task>
   */
  ipcMain.handle('tasks:setStatus', async (_event, id: string, status: TaskStatus): Promise<OperationResult<Task>> => {
    try {
      const task = await taskService.updateTaskStatus(id, status);
      return { success: true, data: task };
    } catch (error) {
      console.error(`[task-handlers] Error setting status for task ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update task status'
      };
    }
  });

  /**
   * Assign task to an agent
   * Returns: OperationResult<Task>
   */
  ipcMain.handle('tasks:assign', async (_event, id: string, assignee: string): Promise<OperationResult<Task>> => {
    try {
      const task = await taskService.assignTask(id, assignee);
      return { success: true, data: task };
    } catch (error) {
      console.error(`[task-handlers] Error assigning task ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to assign task'
      };
    }
  });

  // ============================================================================
  // Claude Task Monitoring
  // ============================================================================

  /**
   * List Claude-specific tasks (from ## Claude Tasks section)
   * Returns: ClaudeTask[]
   */
  ipcMain.handle('tasks:claudeList', async (): Promise<ClaudeTask[]> => {
    try {
      return await taskService.listClaudeTasks();
    } catch (error) {
      console.error('[task-handlers] Error listing Claude tasks:', error);
      throw error;
    }
  });

  // ============================================================================
  // Task Metadata (Sidecar)
  // ============================================================================

  /**
   * Get task metadata from sidecar
   * Returns: TaskMeta | null
   */
  ipcMain.handle('tasks:getMeta', async (_event, id: string): Promise<TaskMeta | null> => {
    try {
      return await taskService.getTaskMeta(id);
    } catch (error) {
      console.error(`[task-handlers] Error getting meta for task ${id}:`, error);
      return null;
    }
  });

  /**
   * Update task metadata in sidecar
   * Returns: OperationResult<TaskMeta>
   */
  ipcMain.handle('tasks:updateMeta', async (_event, id: string, updates: Partial<TaskMeta>): Promise<OperationResult<TaskMeta>> => {
    try {
      const meta = await taskService.updateTaskMeta(id, updates);
      return { success: true, data: meta };
    } catch (error) {
      console.error(`[task-handlers] Error updating meta for task ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update task metadata'
      };
    }
  });

  /**
   * Link worklog to task in sidecar
   * Returns: OperationResult<TaskMeta>
   */
  ipcMain.handle('tasks:linkWorklog', async (_event, id: string, path: string): Promise<OperationResult<TaskMeta>> => {
    try {
      const meta = await taskService.linkWorklog(id, path);
      return { success: true, data: meta };
    } catch (error) {
      console.error(`[task-handlers] Error linking worklog for task ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to link worklog'
      };
    }
  });

  // ============================================================================
  // File Watching
  // ============================================================================

  /**
   * Start watching todo.md for changes
   * Subscribes the calling window to 'tasks:changed' events
   * Returns: OperationResult
   */
  ipcMain.handle('tasks:watch', async (event): Promise<OperationResult> => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return {
          success: false,
          error: 'Could not find window for event sender'
        };
      }

      // Add window to subscription list
      subscribedWindows.add(window.id);
      console.log(`[task-handlers] Window ${window.id} subscribed to task changes`);

      // Start file watching if not already started
      taskService.startWatching();

      // Clean up subscription when window closes
      window.on('closed', () => {
        subscribedWindows.delete(window.id);
        console.log(`[task-handlers] Window ${window.id} unsubscribed (closed)`);

        // Stop watching if no more subscribers
        if (subscribedWindows.size === 0) {
          taskService.stopWatching();
        }
      });

      return { success: true };
    } catch (error) {
      console.error('[task-handlers] Error starting watch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start watching'
      };
    }
  });

  /**
   * Stop watching todo.md for changes
   * Unsubscribes the calling window from 'tasks:changed' events
   * Returns: OperationResult
   */
  ipcMain.handle('tasks:unwatch', async (event): Promise<OperationResult> => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return {
          success: false,
          error: 'Could not find window for event sender'
        };
      }

      // Remove window from subscription list
      subscribedWindows.delete(window.id);
      console.log(`[task-handlers] Window ${window.id} unsubscribed from task changes`);

      // Stop watching if no more subscribers
      if (subscribedWindows.size === 0) {
        taskService.stopWatching();
      }

      return { success: true };
    } catch (error) {
      console.error('[task-handlers] Error stopping watch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop watching'
      };
    }
  });

  // ============================================================================
  // Event Broadcasting
  // ============================================================================

  /**
   * Listen for task changes from the service and broadcast to all subscribed windows
   */
  taskService.onTasksChanged((tasks: Task[]) => {
    console.log(`[task-handlers] Broadcasting task changes to ${subscribedWindows.size} windows`);

    // Iterate over subscribed windows and send update
    for (const windowId of subscribedWindows) {
      const window = BrowserWindow.fromId(windowId);

      // Check if window still exists and is not destroyed
      if (window && !window.isDestroyed()) {
        window.webContents.send('tasks:changed', tasks);
      } else {
        // Clean up dead window references
        subscribedWindows.delete(windowId);
        console.log(`[task-handlers] Removed destroyed window ${windowId} from subscriptions`);
      }
    }

    // Stop watching if all windows were destroyed
    if (subscribedWindows.size === 0) {
      taskService.stopWatching();
    }
  });
}

/**
 * Cleanup function to call on app shutdown
 */
export function unregisterTaskHandlers(): void {
  // Stop file watching
  taskService.stopWatching();

  // Clear subscriptions
  subscribedWindows.clear();

  // Remove all task-related IPC handlers
  const channels = [
    'tasks:list',
    'tasks:get',
    'tasks:create',
    'tasks:update',
    'tasks:delete',
    'tasks:setStatus',
    'tasks:assign',
    'tasks:claudeList',
    'tasks:getMeta',
    'tasks:updateMeta',
    'tasks:linkWorklog',
    'tasks:watch',
    'tasks:unwatch'
  ];

  channels.forEach(channel => {
    ipcMain.removeHandler(channel);
  });

  console.log('[task-handlers] Unregistered all task handlers');
}
