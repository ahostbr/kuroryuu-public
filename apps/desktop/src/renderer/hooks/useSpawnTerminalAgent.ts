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
  /** Skip all bootstrap prompt injection — spawn bare CLI */
  noBootstrap?: boolean;
  /** Worktree isolation mode */
  worktreeMode?: AgentConfig['worktreeMode'];
  /** For shared worktree mode: path to the shared worktree */
  worktreePath?: string;
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
      // Map promptPath to specialistPromptPath so buildCliConfig skips worker/leader bootstrap
      specialistPromptPath: options.promptPath,
      atFiles: options.atFiles || [],
      noBootstrap: options.noBootstrap,
      worktreeMode: options.worktreeMode,
      worktreePath: options.worktreePath,
    };

    // Per-worker worktree: create git worktree for non-Claude agents before spawn.
    // Claude agents use native --worktree flag (buildCliConfig adds it to args).
    if (agentConfig.worktreeMode === 'per-worker' && agentConfig.cliProvider !== 'claude') {
      try {
        const worktreeName = agentId.replace(/[^a-z0-9-]/g, '-').slice(0, 50);
        const result = await window.electronAPI.worktree.create({
          taskId: worktreeName,
          branchName: `worker/${worktreeName}`,
          baseBranch: 'master',
        });
        if (result.error) {
          console.error('[useSpawnTerminalAgent] Failed to create worktree:', result.error);
        } else if (result.worktree?.path) {
          agentConfig.worktreePath = result.worktree.path;
        }
      } catch (err) {
        console.error('[useSpawnTerminalAgent] Worktree creation IPC failed:', err);
      }
    }

    // Register in agent-config-store (visible in TerminalGrid's worker list)
    addWorkerAgent(agentConfig);

    // Build CLI config (cmd, args, env)
    const cliConfig = buildCliConfig(agentConfig);

    // Resolve working directory
    let projectRoot = options.cwd;
    if (!projectRoot) {
      try {
        projectRoot = await window.electronAPI?.app?.getProjectRoot?.();
      } catch (err) {
        console.warn('[useSpawnTerminalAgent] getProjectRoot IPC failed:', err);
      }
    }
    if (!projectRoot) {
      // process.cwd() in Electron renderer is NOT the project root — never use it.
      // Fall back to KURORYUU_ROOT env var which is set by the desktop app on startup.
      projectRoot = process.env.KURORYUU_ROOT || process.env.KURORYUU_PROJECT_ROOT || '';
      if (!projectRoot) {
        console.error('[useSpawnTerminalAgent] Cannot resolve project root — no cwd, IPC failed, no env var');
      }
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
