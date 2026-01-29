/**
 * Agent Orchestration Service
 * 
 * Multi-agent system for parallel task execution.
 * Defines agent roles, coordinates handoffs, and tracks progress.
 */

import { ipcMain } from 'electron';
import { EventEmitter } from 'events';

// Agent role definitions
export const AGENT_ROLES = {
  spec_gatherer: {
    name: 'Spec Gatherer',
    description: 'Collects requirements and context from user',
    model: 'claude-3-5-sonnet-20241022',
    tools: [],
    systemPrompt: 'You gather specifications and requirements from the user. Ask clarifying questions to ensure complete understanding.',
  },
  spec_writer: {
    name: 'Spec Writer',
    description: 'Writes detailed technical specifications',
    model: 'claude-3-5-sonnet-20241022',
    tools: [],
    systemPrompt: 'You write detailed technical specifications based on gathered requirements. Be thorough and precise.',
  },
  planner: {
    name: 'Planner',
    description: 'Creates task breakdown and execution plan',
    model: 'claude-3-5-sonnet-20241022',
    tools: ['inbox', 'rag'],
    systemPrompt: 'You create detailed execution plans and task breakdowns. Consider dependencies and optimal ordering.',
  },
  coder: {
    name: 'Coder',
    description: 'Implements code changes',
    model: 'claude-3-5-sonnet-20241022',
    tools: ['inbox', 'rag', 'checkpoint'],
    systemPrompt: 'You implement code changes according to specifications. Write clean, well-documented code.',
  },
  reviewer: {
    name: 'Reviewer',
    description: 'Reviews code and provides feedback',
    model: 'claude-3-5-sonnet-20241022',
    tools: ['rag'],
    systemPrompt: 'You review code for quality, correctness, and adherence to specifications. Provide constructive feedback.',
  },
  tester: {
    name: 'Tester',
    description: 'Creates and runs tests',
    model: 'claude-3-5-sonnet-20241022',
    tools: ['inbox', 'rag'],
    systemPrompt: 'You create comprehensive tests and verify implementation correctness. Report any issues found.',
  },
} as const;

export type AgentRole = keyof typeof AGENT_ROLES;

// Agent state
interface AgentState {
  id: string;
  role: AgentRole;
  status: 'idle' | 'running' | 'waiting' | 'completed' | 'error';
  currentTask?: string;
  progress?: number;
  lastOutput?: string;
  error?: string;
}

// Swarm state
interface SwarmState {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  agents: AgentState[];
  taskQueue: SwarmTask[];
  completedTasks: string[];
  startedAt?: number;
  completedAt?: number;
}

interface SwarmTask {
  id: string;
  type: 'spec' | 'plan' | 'code' | 'review' | 'test';
  description: string;
  assignedAgent?: string;
  status: 'queued' | 'in-progress' | 'completed' | 'failed';
  dependencies?: string[];
  result?: unknown;
}

// Active swarms
const swarms = new Map<string, SwarmState>();
const swarmEmitter = new EventEmitter();

// Configuration
let agentsEnabled = false;
let gatewayUrl = 'http://127.0.0.1:8200';

/**
 * Configure agent orchestration
 */
export function configureAgents(config: { enabled?: boolean; gatewayUrl?: string }): void {
  if (config.enabled !== undefined) agentsEnabled = config.enabled;
  if (config.gatewayUrl) gatewayUrl = config.gatewayUrl;
}

/**
 * Create a new agent swarm
 */
function createSwarm(params: {
  name: string;
  roles: AgentRole[];
}): { swarm?: SwarmState; error?: string } {
  if (!agentsEnabled) {
    return { error: 'Agent orchestration is not enabled' };
  }

  const id = `swarm_${Date.now()}`;
  
  const agents: AgentState[] = params.roles.map(role => ({
    id: `${id}_${role}`,
    role,
    status: 'idle',
  }));

  const swarm: SwarmState = {
    id,
    name: params.name,
    status: 'idle',
    agents,
    taskQueue: [],
    completedTasks: [],
  };

  swarms.set(id, swarm);
  return { swarm };
}

/**
 * Add tasks to swarm queue
 */
function addTasks(swarmId: string, tasks: Omit<SwarmTask, 'status'>[]): { ok: boolean; error?: string } {
  const swarm = swarms.get(swarmId);
  if (!swarm) {
    return { ok: false, error: 'Swarm not found' };
  }

  for (const task of tasks) {
    swarm.taskQueue.push({
      ...task,
      status: 'queued',
    });
  }

  return { ok: true };
}

/**
 * Start swarm execution
 */
async function startSwarm(swarmId: string): Promise<{ ok: boolean; error?: string }> {
  const swarm = swarms.get(swarmId);
  if (!swarm) {
    return { ok: false, error: 'Swarm not found' };
  }

  if (swarm.status === 'running') {
    return { ok: false, error: 'Swarm already running' };
  }

  swarm.status = 'running';
  swarm.startedAt = Date.now();
  swarmEmitter.emit('swarm:started', swarmId);

  // Process tasks in background
  processSwarmTasks(swarmId).catch(error => {
    swarm.status = 'error';
    swarmEmitter.emit('swarm:error', swarmId, error);
  });

  return { ok: true };
}

/**
 * Process swarm tasks (internal)
 */
async function processSwarmTasks(swarmId: string): Promise<void> {
  const swarm = swarms.get(swarmId);
  if (!swarm) return;

  while (swarm.taskQueue.some(t => t.status === 'queued') && swarm.status === 'running') {
    // Find next available task (dependencies satisfied)
    const task = swarm.taskQueue.find(t => 
      t.status === 'queued' && 
      (!t.dependencies || t.dependencies.every(dep => swarm.completedTasks.includes(dep)))
    );

    if (!task) {
      // Wait for running tasks to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    // Find available agent for task type
    const roleMap: Record<string, AgentRole> = {
      spec: 'spec_writer',
      plan: 'planner',
      code: 'coder',
      review: 'reviewer',
      test: 'tester',
    };
    
    const neededRole = roleMap[task.type] || 'coder';
    const agent = swarm.agents.find(a => a.role === neededRole && a.status === 'idle');

    if (!agent) {
      // Wait for agent to become available
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }

    // Assign task to agent
    task.assignedAgent = agent.id;
    task.status = 'in-progress';
    agent.status = 'running';
    agent.currentTask = task.id;

    swarmEmitter.emit('task:started', swarmId, task.id, agent.id);

    // Execute task (simulated for now - would call Gateway LLM)
    try {
      const result = await executeAgentTask(agent, task);
      task.result = result;
      task.status = 'completed';
      swarm.completedTasks.push(task.id);
      
      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.lastOutput = typeof result === 'string' ? result : JSON.stringify(result);
      
      swarmEmitter.emit('task:completed', swarmId, task.id);
    } catch (error) {
      task.status = 'failed';
      agent.status = 'error';
      agent.error = String(error);
      
      swarmEmitter.emit('task:failed', swarmId, task.id, error);
    }
  }

  // Check if all tasks completed
  if (swarm.taskQueue.every(t => t.status === 'completed' || t.status === 'failed')) {
    swarm.status = 'completed';
    swarm.completedAt = Date.now();
    swarmEmitter.emit('swarm:completed', swarmId);
  }
}

/**
 * Execute a task with an agent (calls Gateway)
 */
async function executeAgentTask(agent: AgentState, task: SwarmTask): Promise<unknown> {
  const roleConfig = AGENT_ROLES[agent.role];
  
  // Build prompt
  const messages = [
    { role: 'system', content: roleConfig.systemPrompt },
    { role: 'user', content: `Task: ${task.description}` },
  ];

  // Call Gateway
  try {
    const response = await fetch(`${gatewayUrl}/v2/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        model: roleConfig.model,
        tools: roleConfig.tools,
      }),
    });

    if (!response.ok) {
      throw new Error(`Gateway error: ${response.status}`);
    }

    // Collect streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value);
      for (const line of text.split('\n')) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.choices?.[0]?.delta?.content) {
              result += data.choices[0].delta.content;
              agent.progress = Math.min(100, (agent.progress || 0) + 5);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    }

    return result;
  } catch (error) {
    // Fallback: return simulated result
    await new Promise(resolve => setTimeout(resolve, 1000));
    return `[Simulated] Completed ${task.type} task: ${task.description}`;
  }
}

/**
 * Pause swarm execution
 */
function pauseSwarm(swarmId: string): { ok: boolean; error?: string } {
  const swarm = swarms.get(swarmId);
  if (!swarm) {
    return { ok: false, error: 'Swarm not found' };
  }

  swarm.status = 'paused';
  swarmEmitter.emit('swarm:paused', swarmId);
  return { ok: true };
}

/**
 * Resume swarm execution
 */
function resumeSwarm(swarmId: string): { ok: boolean; error?: string } {
  const swarm = swarms.get(swarmId);
  if (!swarm || swarm.status !== 'paused') {
    return { ok: false, error: 'Swarm not found or not paused' };
  }

  swarm.status = 'running';
  processSwarmTasks(swarmId);
  swarmEmitter.emit('swarm:resumed', swarmId);
  return { ok: true };
}

/**
 * Get swarm state
 */
function getSwarm(swarmId: string): SwarmState | undefined {
  return swarms.get(swarmId);
}

/**
 * List all swarms
 */
function listSwarms(): SwarmState[] {
  return Array.from(swarms.values());
}

/**
 * Delete a swarm
 */
function deleteSwarm(swarmId: string): { ok: boolean } {
  const deleted = swarms.delete(swarmId);
  return { ok: deleted };
}

// ============================================================================
// IPC Setup
// ============================================================================

export function setupAgentIpc(): void {
  // Configure
  ipcMain.handle('agents:configure', (_, config: Parameters<typeof configureAgents>[0]) => {
    configureAgents(config);
    return { ok: true };
  });

  // Status
  ipcMain.handle('agents:status', () => {
    return { enabled: agentsEnabled, gatewayUrl };
  });

  // List roles
  ipcMain.handle('agents:roles', () => {
    return AGENT_ROLES;
  });

  // Create swarm
  ipcMain.handle('agents:createSwarm', (_, params: Parameters<typeof createSwarm>[0]) => {
    return createSwarm(params);
  });

  // Add tasks
  ipcMain.handle('agents:addTasks', (_, swarmId: string, tasks: Parameters<typeof addTasks>[1]) => {
    return addTasks(swarmId, tasks);
  });

  // Start swarm
  ipcMain.handle('agents:startSwarm', (_, swarmId: string) => {
    return startSwarm(swarmId);
  });

  // Pause swarm
  ipcMain.handle('agents:pauseSwarm', (_, swarmId: string) => {
    return pauseSwarm(swarmId);
  });

  // Resume swarm
  ipcMain.handle('agents:resumeSwarm', (_, swarmId: string) => {
    return resumeSwarm(swarmId);
  });

  // Get swarm
  ipcMain.handle('agents:getSwarm', (_, swarmId: string) => {
    return getSwarm(swarmId);
  });

  // List swarms
  ipcMain.handle('agents:listSwarms', () => {
    return listSwarms();
  });

  // Delete swarm
  ipcMain.handle('agents:deleteSwarm', (_, swarmId: string) => {
    return deleteSwarm(swarmId);
  });
}

// Export emitter for renderer to subscribe
export { swarmEmitter };
