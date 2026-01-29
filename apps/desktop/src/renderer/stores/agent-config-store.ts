/**
 * Agent Config Store - Persistent agent configuration
 *
 * Stores user's agent setup:
 * - Leader agent configuration
 * - Worker agent configurations
 * - Manages heartbeat lifecycle
 *
 * Storage: File-based at ai/checkpoints/agent-config.json (not localStorage)
 */
import { create } from 'zustand';

const GATEWAY_URL = 'http://127.0.0.1:8200';
const CONFIG_FILE_PATH = 'ai/checkpoints/agent-config.json';

export interface AgentConfig {
  id: string;
  name: string;
  role: 'leader' | 'worker' | 'thinker' | 'specialist' | 'workflow';
  modelName: string;
  backend: 'lmstudio' | 'claude' | 'claude-cli' | 'openai' | 'custom' | 'terminal';
  capabilities: string[];
  enabled: boolean;
  // Extended fields for leader setup
  endpoint?: string;        // API URL (e.g., http://169.254.83.107:1234)
  apiKey?: string;          // For cloud providers (Claude, OpenAI)
  bootstrapPath?: string;   // Path to bootstrap .md file
  temperature?: number;     // 0.0-1.0
  maxTokens?: number;       // Max response tokens
  // CLI provider fields (for direct CLI launch)
  cliProvider?: 'claude' | 'kiro' | 'kuroryuu' | 'shell';
  cliPath?: string;         // Optional custom path to CLI
  systemPrompt?: string;    // System prompt text (Claude only)
  atFiles?: string[];       // @ file references (Claude only)
  initialPrompt?: string;   // First message to send after launch
  claudeModeEnabled?: boolean; // Enable Claude Mode for inbox polling (Claude only)
  isTerminalOnly?: boolean;  // True if agent is terminal-only mode
  // Thinker/Specialist prompt files (for buildCliConfig to use)
  thinkerBasePath?: string;       // e.g., "ai/prompt_packs/thinkers/_base_thinker.md"
  thinkerPersonaPath?: string;    // e.g., "ai/prompt_packs/thinkers/visionary.md"
  specialistPromptPath?: string;  // e.g., "ai/prompt_packs/workflow_specialists/executor.md"
  // Worktree mode (opt-in only, default: undefined = main branch)
  worktreeMode?: 'shared' | 'per-worker';  // undefined = main branch (default)
  worktreePath?: string;                    // For shared mode: which worktree path
  // Ralph mode - leader personality for autonomous task orchestration
  ralphMode?: boolean;                      // When true, leader spawns as Ralph with k_pty monitoring
}

interface AgentConfigState {
  // Configuration
  isSetupComplete: boolean;
  leaderAgent: AgentConfig | null;
  workerAgents: AgentConfig[];
  resetCounter: number;  // Increments on reset to force wizard remount with fresh state
  isHydrated: boolean;   // True after config loaded from file (prevents race conditions)

  // Runtime state
  activeHeartbeats: Map<string, ReturnType<typeof setInterval>>;
  
  // Actions
  setLeaderAgent: (config: AgentConfig) => void;
  addWorkerAgent: (config: AgentConfig) => void;
  removeWorkerAgent: (id: string) => void;
  completeSetup: () => void;
  resetSetup: () => void;
  
  // Heartbeat management
  startHeartbeat: (agentId: string, config: AgentConfig) => Promise<void>;
  stopHeartbeat: (agentId: string) => void;
  stopAllHeartbeats: () => void;
  startAllHeartbeats: () => void;
}

// Register an agent with the gateway
async function registerAgent(config: AgentConfig): Promise<boolean> {
  try {
    const response = await fetch(`${GATEWAY_URL}/v1/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: config.id,
        model_name: config.modelName,
        role: config.role,
        capabilities: config.capabilities,
      }),
    });
    return response.ok;
  } catch (error) {
    console.error(`Failed to register agent ${config.id}:`, error);
    return false;
  }
}

// Send heartbeat to gateway
async function sendHeartbeat(agentId: string): Promise<boolean> {
  try {
    const response = await fetch(`${GATEWAY_URL}/v1/agents/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId }),
    });
    return response.ok;
  } catch (error) {
    console.error(`Heartbeat failed for ${agentId}:`, error);
    return false;
  }
}

// Deregister an agent from the gateway (silent on 404 - agent already gone)
export async function deregisterAgent(agentId: string): Promise<boolean> {
  try {
    const response = await fetch(`${GATEWAY_URL}/v1/agents/${agentId}`, {
      method: 'DELETE',
    });
    // 404 means already deleted - that's fine, return success silently
    if (response.status === 404) {
      return true;
    }
    return response.ok;
  } catch {
    // Network error - gateway might be down, fail silently
    return false;
  }
}

// Clear ALL agents from the gateway (including dead ones)
async function clearAllGatewayAgents(): Promise<number> {
  try {
    // Get all agents including dead
    const response = await fetch(`${GATEWAY_URL}/v1/agents/list?include_dead=true`);
    if (!response.ok) return 0;

    const data = await response.json();
    const agents = data.agents || [];

    // Delete each agent
    for (const agent of agents) {
      await deregisterAgent(agent.agent_id);
    }
    return agents.length;
  } catch (error) {
    console.error('Failed to clear gateway agents:', error);
    return 0;
  }
}

// Check for and clear stale agents (agents in registry but no live PTY)
// Called on app startup when wizard is about to be shown
export async function checkAndClearStaleAgents(): Promise<{ hadStaleAgents: boolean; clearedCount: number }> {
  try {
    // Get agents from gateway
    const response = await fetch(`${GATEWAY_URL}/v1/agents/list?include_dead=true`);
    if (!response.ok) return { hadStaleAgents: false, clearedCount: 0 };

    const data = await response.json();
    const agents = data.agents || [];

    if (agents.length === 0) {
      return { hadStaleAgents: false, clearedCount: 0 };
    }

    // Agents exist but we're showing wizard = they are stale
    console.log(`[AgentConfig] Found ${agents.length} stale agent(s) from previous session, clearing registry...`);
    const clearedCount = await clearAllGatewayAgents();

    return { hadStaleAgents: true, clearedCount };
  } catch (error) {
    console.error('[AgentConfig] Failed to check stale agents:', error);
    return { hadStaleAgents: false, clearedCount: 0 };
  }
}

// Non-persisted runtime state (heartbeat intervals and configs for re-registration)
const runtimeState = {
  activeHeartbeats: new Map<string, ReturnType<typeof setInterval>>(),
  agentConfigs: new Map<string, AgentConfig>(), // Store configs for auto re-registration
  isShuttingDown: false, // Flag to prevent heartbeats during shutdown
};

// ═══════════════════════════════════════════════════════════════════════════════
// File-based persistence (replaces localStorage)
// ═══════════════════════════════════════════════════════════════════════════════

interface PersistedState {
  isSetupComplete: boolean;
  leaderAgent: AgentConfig | null;
  workerAgents: AgentConfig[];
  resetCounter: number;
}

// Get full path to config file (resolve project root)
async function getConfigFilePath(): Promise<string> {
  try {
    const root = await window.electronAPI?.app?.getProjectRoot?.();
    if (root) {
      // Normalize path separators
      const normalizedRoot = root.replace(/\\/g, '/');
      return `${normalizedRoot}/${CONFIG_FILE_PATH}`;
    }
  } catch (err) {
    console.error('[AgentConfig] Failed to get project root:', err);
  }
  // No hardcoded fallback - return relative path (will fail gracefully if main process unavailable)
  return CONFIG_FILE_PATH;
}

// Save config to file
async function saveConfigToFile(state: PersistedState): Promise<void> {
  try {
    const fullPath = await getConfigFilePath();
    const json = JSON.stringify(state, null, 2);
    if (window.electronAPI?.fs?.writeFile) {
      await window.electronAPI.fs.writeFile(fullPath, json);
    }
  } catch (error) {
    console.error('[AgentConfig] Failed to save config:', error);
  }
}

// Load config from file
async function loadConfigFromFile(): Promise<PersistedState | null> {
  try {
    const fullPath = await getConfigFilePath();
    if (window.electronAPI?.fs?.readFile) {
      const content = await window.electronAPI.fs.readFile(fullPath);
      if (content) {
        const parsed = JSON.parse(content);
        return parsed;
      }
    }
  } catch {
    // File doesn't exist or invalid JSON - that's OK, start fresh
  }
  return null;
}

// Initialize store from file (call on app start)
export async function initAgentConfigFromFile(): Promise<void> {
  // Clear old localStorage entry (migration from localStorage to file)
  try {
    localStorage.removeItem('kuroryuu-agent-config');
  } catch {
    // Ignore if localStorage not available
  }

  // Clear ALL stale agents from Gateway on every app start
  // This prevents ghost agents from persisting across restarts
  await clearAllGatewayAgents();

  const saved = await loadConfigFromFile();
  if (saved) {
    useAgentConfigStore.setState({
      isSetupComplete: saved.isSetupComplete,
      leaderAgent: saved.leaderAgent,
      workerAgents: saved.workerAgents,
      resetCounter: saved.resetCounter,
      isHydrated: true,  // Mark hydration complete
    });
  } else {
    // No saved config, but still mark hydrated so components can proceed
    useAgentConfigStore.setState({ isHydrated: true });
  }
}

// Helper to persist after state change
function persistState(get: () => AgentConfigState): void {
  const state = get();
  saveConfigToFile({
    isSetupComplete: state.isSetupComplete,
    leaderAgent: state.leaderAgent,
    workerAgents: state.workerAgents,
    resetCounter: state.resetCounter,
  });
}

export const useAgentConfigStore = create<AgentConfigState>()(
    (set, get) => ({
      // Initial state
      isSetupComplete: false,
      leaderAgent: null,
      workerAgents: [],
      resetCounter: 0,
      isHydrated: false,
      activeHeartbeats: runtimeState.activeHeartbeats,
      
      // Set leader agent
      setLeaderAgent: (config) => {
        set({ leaderAgent: { ...config, role: 'leader' } });
        persistState(get);
      },
      
      // Add worker agent
      addWorkerAgent: (config) => {
        const workerConfig = { ...config, role: 'worker' as const };
        set(state => ({
          workerAgents: [...state.workerAgents, workerConfig],
        }));
        persistState(get);

        // If setup is already complete, start heartbeat for this worker immediately
        const { isSetupComplete, startHeartbeat } = get();
        if (isSetupComplete && workerConfig.enabled) {
          startHeartbeat(workerConfig.id, workerConfig);
        }
      },
      
      // Remove worker agent
      removeWorkerAgent: (id) => {
        const { stopHeartbeat } = get();
        stopHeartbeat(id);
        deregisterAgent(id); // Also remove from Gateway
        set(state => ({
          workerAgents: state.workerAgents.filter(w => w.id !== id),
        }));
        persistState(get);
      },
      
      // Complete setup and start heartbeats
      completeSetup: () => {
        set({ isSetupComplete: true });
        persistState(get);
        get().startAllHeartbeats();
      },
      
      // Reset setup - true reset, clears everything and increments counter
      resetSetup: () => {
        const { stopAllHeartbeats } = get();
        stopAllHeartbeats();

        // Clear ALL agents from Gateway (including dead ones from previous sessions)
        clearAllGatewayAgents();

        set((state) => ({
          isSetupComplete: false,
          leaderAgent: null,
          workerAgents: [],
          resetCounter: state.resetCounter + 1,
        }));
        persistState(get);
      },
      
      // Start heartbeat for an agent
      startHeartbeat: async (agentId, config) => {
        // Don't start duplicate heartbeats
        if (runtimeState.activeHeartbeats.has(agentId)) {
          return;
        }

        // Store config for auto re-registration on heartbeat failure
        runtimeState.agentConfigs.set(agentId, config);

        // First register
        const registered = await registerAgent(config);
        if (!registered) {
          console.error(`Failed to register ${agentId}`);
          runtimeState.agentConfigs.delete(agentId);
          return;
        }

        // Then start heartbeat interval with auto re-registration
        const interval = setInterval(async () => {
          // Skip heartbeat if app is shutting down
          if (runtimeState.isShuttingDown) return;

          const success = await sendHeartbeat(agentId);
          if (!success) {
            // Skip re-registration attempts if shutting down
            if (runtimeState.isShuttingDown) return;

            // Heartbeat failed (404 = agent was reaped by Gateway timeout)
            // Try to re-register instead of giving up
            console.warn(`Heartbeat failed for ${agentId}, attempting re-registration...`);
            const storedConfig = runtimeState.agentConfigs.get(agentId);
            if (storedConfig) {
              const reregistered = await registerAgent(storedConfig);
              if (reregistered) {
                console.log(`Re-registered ${agentId} after heartbeat failure`);
                return; // Continue heartbeating
              }
            }
            // Re-registration failed - stop heartbeating
            console.error(`Failed to re-register ${agentId}, stopping heartbeat`);
            get().stopHeartbeat(agentId);
          }
        }, 5000); // 5 second heartbeat

        runtimeState.activeHeartbeats.set(agentId, interval);
      },
      
      // Stop heartbeat for an agent
      stopHeartbeat: (agentId) => {
        const interval = runtimeState.activeHeartbeats.get(agentId);
        if (interval) {
          clearInterval(interval);
          runtimeState.activeHeartbeats.delete(agentId);
        }
        runtimeState.agentConfigs.delete(agentId);
      },

      // Stop all heartbeats (called during shutdown)
      stopAllHeartbeats: () => {
        // Set flag FIRST to prevent in-flight heartbeats from re-registering
        runtimeState.isShuttingDown = true;

        for (const [, interval] of runtimeState.activeHeartbeats) {
          clearInterval(interval);
        }
        runtimeState.activeHeartbeats.clear();
        runtimeState.agentConfigs.clear();
      },
      
      // Start heartbeats for all configured agents
      startAllHeartbeats: () => {
        const { leaderAgent, workerAgents, startHeartbeat } = get();

        if (leaderAgent && leaderAgent.enabled) {
          startHeartbeat(leaderAgent.id, leaderAgent);
        }

        for (const worker of workerAgents) {
          if (worker.enabled) {
            startHeartbeat(worker.id, worker);
          }
        }
      },
    })
);
