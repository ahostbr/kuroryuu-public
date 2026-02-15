/**
 * useSpawnTerminalAgent — Unified hook for spawning terminal agents
 *
 * Any panel can spawn a properly registered terminal agent with full lifecycle:
 * AgentConfig creation → store registration → buildCliConfig → pty.create → heartbeat
 *
 * Usage:
 *   const { spawn, kill, getAgent } = useSpawnTerminalAgent();
 *   const agent = await spawn({ name: 'My Agent', promptPath: 'path/to/prompt.md' });
 *   // Render: <Terminal id={agent.ptyId} terminalId={`my-${agent.agentId}`} />
 */

import { useCallback, useRef } from 'react';
import { useAgentConfigStore } from '../stores/agent-config-store';
import type { AgentConfig } from '../stores/agent-config-store';
import { buildCliConfig, getTerminalCwd } from '../utils/build-cli-config';

export interface SpawnTerminalAgentOptions {
  /** Display name for the agent */
  name: string;
  /** Agent role (default: 'worker') */
  role?: AgentConfig['role'];
  /** CLI to spawn (default: 'claude') */
  cliProvider?: AgentConfig['cliProvider'];
  /** Prompt file to load via @file */
  promptPath?: string;
  /** Additional @files to include */
  atFiles?: string[];
  /** Extra environment variables */
  env?: Record<string, string>;
  /** Working directory (default: projectRoot) */
  cwd?: string;
  /** Enable Claude Mode for inbox polling (default: true for claude provider) */
  claudeMode?: boolean;
  /** Register with Gateway heartbeat (default: true) */
  registerHeartbeat?: boolean;
  /** Agent capabilities list */
  capabilities?: string[];
  /** Callback when PTY is created */
  onReady?: (ptyId: string) => void;
  /** Callback when PTY exits */
  onExit?: (exitCode: number) => void;
}

export interface SpawnedAgent {
  agentId: string;
  ptyId: string;
  kill: () => Promise<void>;
}

export function useSpawnTerminalAgent() {
  const addWorkerAgent = useAgentConfigStore(s => s.addWorkerAgent);
  const startHeartbeat = useAgentConfigStore(s => s.startHeartbeat);
  const removeWorkerAgent = useAgentConfigStore(s => s.removeWorkerAgent);
  const stopHeartbeat = useAgentConfigStore(s => s.stopHeartbeat);
  const spawnedRef = useRef<Map<string, SpawnedAgent>>(new Map());

  const spawn = useCallback(async (options: SpawnTerminalAgentOptions): Promise<SpawnedAgent> => {
    const agentId = `${options.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;

    // Build AgentConfig
    const agentConfig: AgentConfig = {
      id: agentId,
      name: options.name,
      role: options.role || 'worker',
      modelName: 'claude-cli',
      backend: 'claude-cli',
      capabilities: options.capabilities || [],
      enabled: true,
      cliProvider: options.cliProvider || 'claude',
      claudeModeEnabled: options.claudeMode ?? (options.cliProvider || 'claude') === 'claude',
      atFiles: [
        ...(options.promptPath ? [options.promptPath] : []),
        ...(options.atFiles || []),
      ],
    };

    // Register in agent-config-store (visible in TerminalGrid's worker list)
    addWorkerAgent(agentConfig);

    // Build CLI config (cmd, args, env)
    const cliConfig = buildCliConfig(agentConfig);

    // Resolve working directory
    let projectRoot = options.cwd;
    if (!projectRoot) {
      try {
        projectRoot = await window.electronAPI?.app?.getProjectRoot?.();
      } catch { /* fallback below */ }
    }
    if (!projectRoot) {
      projectRoot = process.cwd();
    }
    const cwd = getTerminalCwd(agentConfig, projectRoot);

    // Create PTY
    const pty = await window.electronAPI.pty.create({
      cwd,
      cols: 120,
      rows: 30,
      cmd: cliConfig?.cmd,
      args: cliConfig?.args,
      env: { ...cliConfig?.env, ...options.env },
      ownerAgentId: agentId,
      ownerRole: agentConfig.role === 'leader' ? 'leader' : 'worker',
      label: options.name,
    });

    // Start Gateway heartbeat
    if (options.registerHeartbeat !== false) {
      startHeartbeat(agentId, agentConfig);
    }

    // Build the spawned agent handle
    const spawnedAgent: SpawnedAgent = {
      agentId,
      ptyId: pty.id,
      kill: async () => {
        try { await window.electronAPI.pty.kill(pty.id); } catch { /* already dead */ }
        stopHeartbeat(agentId);
        removeWorkerAgent(agentId);
        spawnedRef.current.delete(agentId);
      },
    };

    spawnedRef.current.set(agentId, spawnedAgent);

    // Fire onReady callback
    options.onReady?.(pty.id);

    return spawnedAgent;
  }, [addWorkerAgent, startHeartbeat, stopHeartbeat, removeWorkerAgent]);

  const kill = useCallback(async (agentId: string) => {
    const agent = spawnedRef.current.get(agentId);
    if (agent) await agent.kill();
  }, []);

  const getAgent = useCallback((agentId: string): SpawnedAgent | null => {
    return spawnedRef.current.get(agentId) || null;
  }, []);

  return { spawn, kill, getAgent };
}
