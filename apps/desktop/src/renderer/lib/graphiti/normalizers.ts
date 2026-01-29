/**
 * Graphiti Event Normalizers
 * Convert existing event types to canonical GraphitiEvent format
 */
import { v4 as uuidv4 } from 'uuid';
import type {
  GraphitiEvent,
  GraphitiEventCategory,
  GraphitiSeverity,
  GraphitiSource,
} from '../../types/graphiti-event';
import type { TrafficEvent, TrafficEventDetail } from '../../types/traffic';
import type { Agent, InboxMessage, OrchestrationTask, SubTask, TaskStatus } from '../../types/agents';
import type { LiveAgent, ToolExecution } from '../../types/command-center';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map task status to severity
 */
function taskStatusToSeverity(status: TaskStatus): GraphitiSeverity {
  switch (status) {
    case 'failed':
    case 'cancelled':
      return 'error';
    case 'breaking_down':
    case 'assigned':
    case 'in_progress':
      return 'info';
    case 'completed':
      return 'debug';
    case 'pending':
    default:
      return 'info';
  }
}

/**
 * Map HTTP status code to severity
 */
function httpStatusToSeverity(status?: number): GraphitiSeverity {
  if (!status) return 'info';
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  if (status >= 300) return 'info';
  return 'debug';
}

/**
 * Map agent status to severity
 */
function agentStatusToSeverity(status: string): GraphitiSeverity {
  switch (status) {
    case 'dead':
      return 'error';
    case 'busy':
      return 'info';
    case 'idle':
    default:
      return 'debug';
  }
}

// ============================================================================
// Traffic Event Normalizer
// ============================================================================

/**
 * Normalize TrafficEvent to GraphitiEvent
 */
export function normalizeTrafficEvent(event: TrafficEvent): GraphitiEvent {
  return {
    id: event.id,
    timestamp: event.timestamp,
    category: 'traffic',
    type: event.type,

    // Correlation IDs
    correlationId: event.metadata?.correlationId as string | undefined,
    sessionId: event.metadata?.sessionId as string | undefined,
    agentId: event.metadata?.agentId as string | undefined,

    // Metadata
    source: (event.source === 'gateway' || event.source === 'mcp_core')
      ? event.source as GraphitiSource
      : 'gateway',
    severity: httpStatusToSeverity(event.status),
    payload: {
      source: event.source,
      destination: event.destination,
      endpoint: event.endpoint,
      method: event.method,
      status: event.status,
      payloadSize: event.payloadSize,
      ...event.metadata,
    },

    // Optional
    duration: event.duration,
    status: event.status,
  };
}

/**
 * Normalize TrafficEventDetail to GraphitiEvent (with full request/response data)
 */
export function normalizeTrafficEventDetail(event: TrafficEventDetail): GraphitiEvent {
  const base = normalizeTrafficEvent(event);
  return {
    ...base,
    correlationId: event.correlation_id || base.correlationId,
    payload: {
      ...base.payload,
      requestHeaders: event.request_headers,
      requestBody: event.request_body,
      responseHeaders: event.response_headers,
      responseBody: event.response_body,
      clientIp: event.client_ip,
      userAgent: event.user_agent,
      queryParams: event.query_params,
    },
    error: event.error_type ? {
      code: event.error_type,
      message: event.error_message || 'Unknown error',
    } : undefined,
  };
}

// ============================================================================
// Agent Event Normalizers
// ============================================================================

/**
 * Normalize Agent (from agent-store) to GraphitiEvent
 */
export function normalizeAgentEvent(
  agent: Agent,
  eventType: 'agent_registered' | 'agent_heartbeat' | 'agent_status_change' | 'agent_deregistered' = 'agent_heartbeat'
): GraphitiEvent {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    category: 'agent',
    type: eventType,

    // Correlation IDs
    agentId: agent.agent_id,
    taskId: agent.current_task_id || undefined,

    // Metadata
    source: 'gateway',
    severity: agentStatusToSeverity(agent.status),
    payload: {
      modelName: agent.model_name,
      role: agent.role,
      status: agent.status,
      capabilities: agent.capabilities,
      currentTaskId: agent.current_task_id,
      lastHeartbeat: agent.last_heartbeat,
      registeredAt: agent.registered_at,
    },
  };
}

/**
 * Normalize LiveAgent (from command-center-store) to GraphitiEvent
 */
export function normalizeLiveAgentEvent(
  agent: LiveAgent,
  eventType: 'agent_registered' | 'agent_heartbeat' | 'agent_status_change' | 'agent_deregistered' = 'agent_heartbeat'
): GraphitiEvent {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    category: 'agent',
    type: eventType,

    // Correlation IDs
    agentId: agent.id,
    taskId: agent.currentTaskId,
    sessionId: agent.ptySessionId,

    // Metadata
    source: 'gateway',
    severity: agentStatusToSeverity(agent.status),
    payload: {
      role: agent.role,
      status: agent.status,
      model: agent.model,
      capabilities: agent.capabilities,
      currentTaskId: agent.currentTaskId,
      lastHeartbeat: agent.lastHeartbeat,
      registeredAt: agent.registeredAt,
      ptySessionId: agent.ptySessionId,
      metadata: agent.metadata,
    },
  };
}

// ============================================================================
// Task Event Normalizers
// ============================================================================

/**
 * Normalize OrchestrationTask to GraphitiEvent
 */
export function normalizeTaskEvent(
  task: OrchestrationTask,
  eventType: 'task_created' | 'task_status_change' | 'task_completed' | 'task_failed' = 'task_status_change'
): GraphitiEvent {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    category: 'task',
    type: eventType,

    // Correlation IDs
    taskId: task.task_id,
    agentId: task.leader_id || undefined,

    // Metadata
    source: 'gateway',
    severity: taskStatusToSeverity(task.status),
    payload: {
      title: task.title,
      description: task.description,
      submittedBy: task.submitted_by,
      status: task.status,
      priority: task.priority,
      subtaskCount: task.subtasks.length,
      leaderId: task.leader_id,
      createdAt: task.created_at,
      startedAt: task.started_at,
      completedAt: task.completed_at,
      finalResult: task.final_result,
      error: task.error,
      metadata: task.metadata,
    },
    error: task.error ? {
      code: 'TASK_ERROR',
      message: task.error,
    } : undefined,
  };
}

/**
 * Normalize SubTask to GraphitiEvent
 */
export function normalizeSubTaskEvent(
  subtask: SubTask,
  parentTaskId: string,
  eventType: 'subtask_created' | 'subtask_status_change' | 'subtask_completed' | 'subtask_failed' = 'subtask_status_change'
): GraphitiEvent {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    category: 'task',
    type: eventType,

    // Correlation IDs
    taskId: parentTaskId,
    agentId: subtask.assigned_to || undefined,

    // Metadata
    source: 'gateway',
    severity: taskStatusToSeverity(subtask.status),
    payload: {
      subtaskId: subtask.subtask_id,
      title: subtask.title,
      description: subtask.description,
      assignedTo: subtask.assigned_to,
      status: subtask.status,
      result: subtask.result,
      createdAt: subtask.created_at,
      startedAt: subtask.started_at,
      completedAt: subtask.completed_at,
    },
  };
}

// ============================================================================
// Tool Execution Normalizer
// ============================================================================

/**
 * Normalize ToolExecution to GraphitiEvent
 */
export function normalizeToolExecutionEvent(
  execution: ToolExecution,
  sessionId?: string,
  agentId?: string
): GraphitiEvent {
  const severity: GraphitiSeverity =
    execution.status === 'error' ? 'error' :
    execution.status === 'success' ? 'debug' : 'info';

  return {
    id: execution.id,
    timestamp: execution.startTime,
    category: 'tool',
    type: 'tool_execution',

    // Correlation IDs
    sessionId,
    agentId,

    // Metadata
    source: 'mcp_core',
    severity,
    payload: {
      toolName: execution.toolName,
      args: execution.args,
      status: execution.status,
      startTime: execution.startTime,
      endTime: execution.endTime,
      result: execution.result,
      error: execution.error,
    },
    duration: execution.durationMs,
    error: execution.error ? {
      code: 'TOOL_ERROR',
      message: execution.error,
    } : undefined,
  };
}

// ============================================================================
// Inbox Message Normalizer
// ============================================================================

/**
 * Normalize InboxMessage to GraphitiEvent
 */
export function normalizeInboxMessageEvent(
  message: InboxMessage,
  eventType: 'message_sent' | 'message_claimed' | 'message_completed' = 'message_sent'
): GraphitiEvent {
  const severity: GraphitiSeverity =
    message.status === 'failed' ? 'error' :
    message.status === 'completed' ? 'debug' :
    message.priority === 'high' ? 'warn' : 'info';

  return {
    id: uuidv4(),
    timestamp: message.created_at,
    category: 'session',  // Inbox messages relate to agent sessions/coordination
    type: eventType,

    // Correlation IDs
    agentId: message.from_agent,

    // Metadata
    source: 'gateway',
    severity,
    payload: {
      messageId: message.message_id,
      fromAgent: message.from_agent,
      toAgent: message.to_agent,
      subject: message.subject,
      body: message.body,
      priority: message.priority,
      status: message.status,
      claimedBy: message.claimed_by,
      claimedAt: message.claimed_at,
      completedAt: message.completed_at,
      result: message.result,
    },
  };
}

// ============================================================================
// Session Event Normalizers
// ============================================================================

/**
 * Create a session start event
 */
export function createSessionStartEvent(
  sessionId: string,
  agentId?: string,
  metadata?: Record<string, unknown>
): GraphitiEvent {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    category: 'session',
    type: 'session_start',

    sessionId,
    agentId,

    source: 'desktop',
    severity: 'info',
    payload: {
      sessionId,
      agentId,
      ...metadata,
    },
  };
}

/**
 * Create a session end event
 */
export function createSessionEndEvent(
  sessionId: string,
  agentId?: string,
  duration?: number,
  metadata?: Record<string, unknown>
): GraphitiEvent {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    category: 'session',
    type: 'session_end',

    sessionId,
    agentId,

    source: 'desktop',
    severity: 'info',
    duration,
    payload: {
      sessionId,
      agentId,
      duration,
      ...metadata,
    },
  };
}

// ============================================================================
// Memory Event Normalizers
// ============================================================================

/**
 * Create a memory operation event
 */
export function createMemoryEvent(
  operation: 'memory_added' | 'memory_searched' | 'memory_sync',
  payload: Record<string, unknown>,
  sessionId?: string,
  agentId?: string
): GraphitiEvent {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    category: 'memory',
    type: operation,

    sessionId,
    agentId,

    source: 'desktop',
    severity: 'debug',
    payload,
  };
}

// ============================================================================
// Hook Event Normalizers
// ============================================================================

export type HookEventType =
  | 'session_start'
  | 'session_end'
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'tool_error'
  | 'pre_compact'
  | 'post_compact'
  | 'notification'
  | 'subagent_stop'
  | 'user_prompt_submit';

/**
 * Normalize a hook event payload to GraphitiEvent
 */
export function normalizeHookEvent(
  hookType: HookEventType,
  payload: Record<string, unknown>,
  sessionId?: string,
  agentId?: string
): GraphitiEvent {
  // Determine severity based on hook type
  let severity: GraphitiSeverity = 'info';
  if (hookType === 'tool_error') severity = 'error';
  else if (hookType === 'notification') severity = 'warn';
  else if (hookType === 'session_start' || hookType === 'session_end') severity = 'info';
  else severity = 'debug';

  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    category: 'hook',
    type: hookType,

    sessionId,
    agentId,

    source: 'gateway',
    severity,
    payload,
  };
}

// ============================================================================
// System Event Normalizers
// ============================================================================

/**
 * Create a system event (errors, warnings, status changes)
 */
export function createSystemEvent(
  type: string,
  severity: GraphitiSeverity,
  message: string,
  payload?: Record<string, unknown>
): GraphitiEvent {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    category: 'system',
    type,

    source: 'desktop',
    severity,
    payload: {
      message,
      ...payload,
    },
    error: severity === 'error' || severity === 'critical' ? {
      code: type.toUpperCase(),
      message,
    } : undefined,
  };
}
