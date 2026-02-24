/**
 * build-cli-config.ts — Pure utility for building CLI spawn configuration
 *
 * Extracted from TerminalGrid.tsx to enable reuse by PRD, Marketing,
 * and any future panel that needs to spawn terminal agents.
 *
 * Takes an AgentConfig and returns { cmd, args, env } for PTY creation.
 */

import type { AgentConfig } from '../stores/agent-config-store';

export interface CliConfig {
  cmd?: string;
  args?: string[];
  env: Record<string, string>;
}

/**
 * Convert an AgentConfig into PTY spawn parameters.
 * Returns { cmd, args, env } — env always includes agent identity vars.
 * Returns undefined only if agentConfig is nullish.
 */
export function buildCliConfig(agentConfig: AgentConfig | null | undefined): CliConfig | undefined {
  if (!agentConfig) return undefined;

  // Build agent identity environment variables (always included)
  const agentEnv: Record<string, string> = {
    KURORYUU_AGENT_ID: agentConfig.id,
    KURORYUU_AGENT_NAME: agentConfig.name || 'Unknown',
    KURORYUU_AGENT_ROLE: agentConfig.role || 'worker',
  };

  // If no CLI provider or shell mode, return just the env (no cmd/args)
  if (!agentConfig.cliProvider || agentConfig.cliProvider === 'shell') {
    return { env: agentEnv };
  }

  const cmd = agentConfig.cliPath || agentConfig.cliProvider;
  const args: string[] = [];

  // Claude native worktree: add --worktree flag (Claude handles isolation internally)
  if (agentConfig.cliProvider === 'claude' && agentConfig.worktreeMode === 'per-worker') {
    const worktreeName = agentConfig.id.replace(/[^a-z0-9-]/g, '-').slice(0, 50);
    args.push('--worktree', worktreeName);
  }

  if (agentConfig.cliProvider === 'claude' && !agentConfig.noBootstrap) {
    // Thinker/Specialist: use their specific @ files
    if (agentConfig.thinkerBasePath || agentConfig.thinkerPersonaPath || agentConfig.specialistPromptPath) {
      if (agentConfig.thinkerBasePath) {
        args.push(`@${agentConfig.thinkerBasePath}`);
      }
      if (agentConfig.thinkerPersonaPath) {
        args.push(`@${agentConfig.thinkerPersonaPath}`);
      }
      if (agentConfig.specialistPromptPath) {
        args.push(`@${agentConfig.specialistPromptPath}`);
      }
    } else {
      // Standard worker/leader: use bootstrap file OR Ralph files
      const isLeader = agentConfig.role === 'leader';

      if (isLeader && agentConfig.ralphMode) {
        args.push('@ai/prompts/ralph/ralph_prime.md');
        args.push('@ai/prompts/ralph/ralph_loop.md');
        args.push('@ai/prompts/ralph/ralph_intervention.md');
      } else {
        const bootstrapFile = isLeader ? 'KURORYUU_LEADER.md' : 'KURORYUU_WORKER.md';
        args.push(`@${bootstrapFile}`);
      }
    }

    // Add any additional @files from wizard
    if (agentConfig.atFiles?.length) {
      agentConfig.atFiles.forEach(f => args.push(f.startsWith('@') ? f : `@${f}`));
    }
  }

  // Kiro and kuroryuu have their own args but no system prompt support
  if (agentConfig.cliProvider === 'kuroryuu') {
    args.push('--role', 'worker');
  }

  return { cmd, args, env: agentEnv };
}

/**
 * Resolve terminal working directory from AgentConfig.
 * Returns worktree path if configured, otherwise projectRoot.
 */
export function getTerminalCwd(
  agentConfig: AgentConfig | null | undefined,
  projectRoot: string,
): string {
  if (!agentConfig?.worktreeMode) {
    return projectRoot;
  }

  if (agentConfig.worktreeMode === 'shared' && agentConfig.worktreePath) {
    return agentConfig.worktreePath;
  }

  if (agentConfig.worktreeMode === 'per-worker') {
    // Claude handles its own worktree via --worktree flag (cwd stays as projectRoot).
    // Non-Claude agents get a worktree created before spawn; path stored in worktreePath.
    if (agentConfig.cliProvider === 'claude') {
      return projectRoot; // Claude's --worktree flag handles isolation
    }
    if (agentConfig.worktreePath) {
      return agentConfig.worktreePath; // Pre-created worktree for non-Claude agents
    }
    console.warn('[buildCliConfig] Per-worker worktree: no worktreePath set for non-Claude agent');
    return projectRoot;
  }

  return projectRoot;
}
