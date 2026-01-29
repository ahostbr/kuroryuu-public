/**
 * Gateway Orchestration Client
 *
 * Connects Desktop to Gateway's /v1/orchestration/* endpoints.
 *
 * NOTE: Deprecated task CRUD and worker polling endpoints have been REMOVED.
 * Tasks are now managed via ai/todo.md (see task-store.ts for Kanban).
 * Workers receive tasks via k_inbox from leader.
 *
 * ACTIVE: single-agent, recovery, cancel, finalize endpoints
 */

import { ipcMain } from 'electron';

// Gateway URL (configurable)
let GATEWAY_URL = 'http://127.0.0.1:8200';

export function setGatewayUrl(url: string): void {
  GATEWAY_URL = url;
}

// ============================================================================
// NOTE: Deprecated types and functions REMOVED
// - CreateTaskParams, SubtaskDefinition, Task, Subtask, PollResult types
// - createTask, breakdownTask, listTasks, getTask functions
// - pollForWork, claimSubtask, startSubtask, reportResult, releaseSubtask functions
// Tasks are managed via ai/todo.md; workers coordinate via k_inbox
// ============================================================================

/**
 * Cancel a task
 */
async function cancelTask(taskId: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, reason }),
    });
    
    const data = await res.json();
    return { ok: data.ok, error: data.message };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Finalize a completed task
 */
async function finalizeTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    });
    
    const data = await res.json();
    return { ok: data.ok, error: data.message };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// ============================================================================
// IPC Setup - Expose to Renderer (deprecated handlers REMOVED)
// ============================================================================

export function setupOrchestrationIpc(): void {
  // Configure gateway URL
  ipcMain.handle('orchestration:configure', (_, url: string) => {
    setGatewayUrl(url);
    return { ok: true, gatewayUrl: GATEWAY_URL };
  });

  // NOTE: Deprecated IPC handlers REMOVED:
  // - orchestration:createTask, breakdownTask, listTasks, getTask
  // - orchestration:poll, claim, start, result, release
  // - orchestration:stats
  // Tasks managed via ai/todo.md; workers coordinate via k_inbox

  // Cancel task (KEPT)
  ipcMain.handle('orchestration:cancel', (_, taskId: string, reason?: string) => {
    return cancelTask(taskId, reason);
  });

  // Finalize task (KEPT)
  ipcMain.handle('orchestration:finalize', (_, taskId: string) => {
    return finalizeTask(taskId);
  });

  // ============================================================================
  // SingleAgentMode IPC Handlers
  // ============================================================================

  // Get single agent status
  ipcMain.handle('orchestration:singleAgent:status', (_, agentId: string, projectRoot?: string) => {
    return getSingleAgentStatus(agentId, projectRoot);
  });

  // Assign task to single agent
  ipcMain.handle('orchestration:singleAgent:assign', (_, agentId: string, taskId: string, projectRoot?: string, resetProgress?: boolean) => {
    return assignTaskToSingleAgent(agentId, taskId, projectRoot, resetProgress);
  });

  // Execute one subtask
  ipcMain.handle('orchestration:singleAgent:execute', (_, agentId: string, projectRoot?: string) => {
    return executeSingleSubtask(agentId, projectRoot);
  });

  // Reset single agent state
  ipcMain.handle('orchestration:singleAgent:reset', (_, agentId: string, projectRoot?: string) => {
    return resetSingleAgent(agentId, projectRoot);
  });

  // Get single agent context
  ipcMain.handle('orchestration:singleAgent:context', (_, agentId: string, projectRoot?: string) => {
    return getSingleAgentContext(agentId, projectRoot);
  });

  // ============================================================================
  // Recovery Manager IPC Handlers
  // ============================================================================

  // Pause a task
  ipcMain.handle('orchestration:recovery:pause', (_, taskId: string, reason?: string, message?: string, pausedBy?: string) => {
    return pauseTask(taskId, reason, message, pausedBy);
  });

  // Resume a task
  ipcMain.handle('orchestration:recovery:resume', (_, taskId: string, resumedBy?: string) => {
    return resumeTask(taskId, resumedBy);
  });

  // List paused tasks
  ipcMain.handle('orchestration:recovery:listPaused', () => {
    return listPausedTasks();
  });

  // Check if task is paused
  ipcMain.handle('orchestration:recovery:isPaused', (_, taskId: string) => {
    return isTaskPaused(taskId);
  });

  // Pause all tasks
  ipcMain.handle('orchestration:recovery:pauseAll', (_, reason?: string, message?: string) => {
    return pauseAllTasks(reason, message);
  });

  // Resume all tasks
  ipcMain.handle('orchestration:recovery:resumeAll', () => {
    return resumeAllTasks();
  });

  // Create checkpoint
  ipcMain.handle('orchestration:recovery:createCheckpoint', (_, taskId: string, reason?: string, createdBy?: string, includeAgentStates?: boolean) => {
    return createCheckpoint(taskId, reason, createdBy, includeAgentStates);
  });

  // List checkpoints
  ipcMain.handle('orchestration:recovery:listCheckpoints', (_, taskId: string) => {
    return listCheckpoints(taskId);
  });

  // Restore checkpoint
  ipcMain.handle('orchestration:recovery:restore', (_, taskId: string, checkpointId: string, restoreAgentStates?: boolean) => {
    return restoreCheckpoint(taskId, checkpointId, restoreAgentStates);
  });

  // Delete checkpoint
  ipcMain.handle('orchestration:recovery:deleteCheckpoint', (_, taskId: string, checkpointId: string) => {
    return deleteCheckpoint(taskId, checkpointId);
  });

  // Rollback subtask
  ipcMain.handle('orchestration:recovery:rollback', (_, taskId: string, subtaskId: string, reason?: string) => {
    return rollbackSubtask(taskId, subtaskId, reason);
  });

  // Get retry info
  ipcMain.handle('orchestration:recovery:retryInfo', (_, subtaskId: string) => {
    return getRetryInfo(subtaskId);
  });

  // Prepare shutdown
  ipcMain.handle('orchestration:recovery:shutdown', () => {
    return prepareShutdown();
  });

  // Recover from shutdown
  ipcMain.handle('orchestration:recovery:startup', () => {
    return recoverFromShutdown();
  });

  // Get recovery stats
  ipcMain.handle('orchestration:recovery:stats', () => {
    return getRecoveryStats();
  });
}

// ============================================================================
// SingleAgentMode API Functions
// ============================================================================

/**
 * Get status of a single agent executor
 */
async function getSingleAgentStatus(agentId: string, projectRoot?: string): Promise<{
  ok: boolean;
  agent_id?: string;
  current_task_id?: string;
  subtask_index?: number;
  total_subtasks?: number;
  completed_count?: number;
  failed_count?: number;
  reboot_count?: number;
  last_checkpoint?: string;
  error?: string;
}> {
  try {
    const params = new URLSearchParams();
    if (projectRoot) params.set('project_root', projectRoot);
    
    const url = `${GATEWAY_URL}/v1/orchestration/single-agent/${encodeURIComponent(agentId)}/status${params.toString() ? '?' + params : ''}`;
    const res = await fetch(url, { method: 'GET' });
    
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }
    
    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Assign a task to a single agent
 */
async function assignTaskToSingleAgent(
  agentId: string,
  taskId: string,
  projectRoot?: string,
  resetProgress = true,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/single-agent/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        task_id: taskId,
        project_root: projectRoot,
        reset_progress: resetProgress,
      }),
    });
    
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }
    
    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Execute one subtask for a single agent
 * Returns the context prompt and subtask details
 */
async function executeSingleSubtask(agentId: string, projectRoot?: string): Promise<{
  ok: boolean;
  status?: string;
  task_id?: string;
  subtask_id?: string;
  context_prompt?: string;
  remaining?: number;
  reboot_count?: number;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/single-agent/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        project_root: projectRoot,
      }),
    });
    
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }
    
    const data = await res.json();
    // Map 'result' to 'context_prompt' for clarity
    return {
      ...data,
      context_prompt: data.result,
    };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Reset a single agent's state
 */
async function resetSingleAgent(agentId: string, projectRoot?: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const params = new URLSearchParams({ agent_id: agentId });
    if (projectRoot) params.set('project_root', projectRoot);
    
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/single-agent/reset?${params}`, {
      method: 'POST',
    });
    
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }
    
    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Get a single agent's context summary
 */
async function getSingleAgentContext(agentId: string, projectRoot?: string): Promise<{
  ok: boolean;
  agent_id?: string;
  context_summary?: string;
  next_action?: string;
  files_touched?: string[];
  completed_subtasks?: string[];
  error?: string;
}> {
  try {
    const params = new URLSearchParams();
    if (projectRoot) params.set('project_root', projectRoot);
    
    const url = `${GATEWAY_URL}/v1/orchestration/single-agent/${encodeURIComponent(agentId)}/context${params.toString() ? '?' + params : ''}`;
    const res = await fetch(url, { method: 'GET' });
    
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }
    
    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// ============================================================================
// Recovery API Functions
// ============================================================================

/**
 * Pause a task
 */
async function pauseTask(
  taskId: string,
  reason = 'user_request',
  message = '',
  pausedBy = 'user',
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/recovery/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        reason,
        message,
        paused_by: pausedBy,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Resume a paused task
 */
async function resumeTask(
  taskId: string,
  resumedBy = 'user',
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/recovery/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        resumed_by: resumedBy,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * List all paused tasks
 */
async function listPausedTasks(): Promise<{
  ok: boolean;
  paused_tasks?: Array<{
    task_id: string;
    paused_at: string;
    paused_by: string;
    reason: string;
    message: string;
    affected_subtasks: string[];
  }>;
  error?: string;
}> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/recovery/paused`, {
      method: 'GET',
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Check if a task is paused
 */
async function isTaskPaused(taskId: string): Promise<{
  ok: boolean;
  task_id?: string;
  is_paused?: boolean;
  pause_info?: {
    paused_at: string;
    reason: string;
    message: string;
  } | null;
  error?: string;
}> {
  try {
    const res = await fetch(
      `${GATEWAY_URL}/v1/orchestration/recovery/task/${encodeURIComponent(taskId)}/is-paused`,
      { method: 'GET' },
    );

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Pause all active tasks
 */
async function pauseAllTasks(
  reason = 'system_maintenance',
  message = '',
): Promise<{ ok: boolean; paused_count?: number; error?: string }> {
  try {
    const params = new URLSearchParams({ reason, message });
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/recovery/pause-all?${params}`, {
      method: 'POST',
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Resume all paused tasks
 */
async function resumeAllTasks(): Promise<{ ok: boolean; resumed_count?: number; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/recovery/resume-all`, {
      method: 'POST',
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Create a checkpoint for a task
 */
async function createCheckpoint(
  taskId: string,
  reason = '',
  createdBy = 'user',
  includeAgentStates = true,
): Promise<{ ok: boolean; message?: string; checkpoint_id?: string; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/recovery/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        reason,
        created_by: createdBy,
        include_agent_states: includeAgentStates,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * List checkpoints for a task
 */
async function listCheckpoints(taskId: string): Promise<{
  ok: boolean;
  task_id?: string;
  checkpoints?: Array<{
    checkpoint_id: string;
    created_at: string;
    created_by: string;
    reason: string;
    has_agent_states: boolean;
  }>;
  error?: string;
}> {
  try {
    const res = await fetch(
      `${GATEWAY_URL}/v1/orchestration/recovery/checkpoints/${encodeURIComponent(taskId)}`,
      { method: 'GET' },
    );

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Restore a task from checkpoint
 */
async function restoreCheckpoint(
  taskId: string,
  checkpointId: string,
  restoreAgentStates = true,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/recovery/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        checkpoint_id: checkpointId,
        restore_agent_states: restoreAgentStates,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Delete a checkpoint
 */
async function deleteCheckpoint(taskId: string, checkpointId: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(
      `${GATEWAY_URL}/v1/orchestration/recovery/checkpoint/${encodeURIComponent(taskId)}/${encodeURIComponent(checkpointId)}`,
      { method: 'DELETE' },
    );

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Rollback a subtask to pending state
 */
async function rollbackSubtask(
  taskId: string,
  subtaskId: string,
  reason = 'Manual rollback',
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/recovery/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        subtask_id: subtaskId,
        reason,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Get retry info for a subtask
 */
async function getRetryInfo(subtaskId: string): Promise<{
  ok: boolean;
  subtask_id?: string;
  retry_count?: number;
  should_retry?: boolean;
  max_retries?: number;
  error?: string;
}> {
  try {
    const res = await fetch(
      `${GATEWAY_URL}/v1/orchestration/recovery/retry/${encodeURIComponent(subtaskId)}`,
      { method: 'GET' },
    );

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Prepare for graceful shutdown
 */
async function prepareShutdown(): Promise<{
  ok: boolean;
  paused_count?: number;
  checkpoint_count?: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/recovery/shutdown`, {
      method: 'POST',
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Recover from shutdown
 */
async function recoverFromShutdown(): Promise<{
  ok: boolean;
  loaded_pauses?: number;
  recovered?: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/recovery/startup`, {
      method: 'POST',
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Get recovery stats
 */
async function getRecoveryStats(): Promise<{
  ok: boolean;
  paused_tasks?: number;
  total_checkpoints?: number;
  tracked_retries?: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orchestration/recovery/stats`, {
      method: 'GET',
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}
