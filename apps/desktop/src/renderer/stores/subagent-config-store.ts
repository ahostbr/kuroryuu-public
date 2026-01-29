/**
 * Sub-Agent Config Store
 * 
 * Manages Claude Code sub-agent configurations per terminal/agent.
 * Supports export to .claude/agents/*.md files for Claude Code integration.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Available routed tools (k_* prefix from tool consolidation)
export const AVAILABLE_TOOLS = [
  'k_session',    // Session/hook lifecycle
  'k_files',      // File operations
  'k_memory',     // Working memory
  'k_inbox',      // Message queue
  'k_checkpoint', // Persistence
  'k_rag',        // Search
  'k_interact',   // Human-in-the-loop (LEADER-ONLY)
  'k_capture',    // Visual capture
] as const;

export type AvailableTool = typeof AVAILABLE_TOOLS[number];
export type SubAgentModel = 'inherit' | 'sonnet' | 'opus' | 'haiku';
export type PermissionMode = 'default' | 'strict';

export interface SubAgentConfig {
  id: string;                    // Matches agent/terminal ID
  name: string;                  // Display name for the sub-agent
  description: string;           // When this sub-agent should be invoked
  tools: AvailableTool[];        // Enabled tools (checkboxes)
  model: SubAgentModel;          // Model hint
  permissionMode: PermissionMode;
  systemPrompt: string;          // Custom system prompt (or default from bootstrap)
  syncOnSave: boolean;           // Auto-export to .claude/agents/ on change
  lastExported?: number;         // Timestamp of last export
}

interface SubAgentConfigState {
  // Per-agent configurations keyed by agentId
  configs: Record<string, SubAgentConfig>;
  
  // Default templates
  defaultLeaderPrompt: string;
  defaultWorkerPrompt: string;
  
  // Actions
  getConfig: (agentId: string) => SubAgentConfig | undefined;
  setConfig: (agentId: string, config: Partial<SubAgentConfig>) => void;
  removeConfig: (agentId: string) => void;
  
  // Tool management
  enableTool: (agentId: string, tool: AvailableTool) => void;
  disableTool: (agentId: string, tool: AvailableTool) => void;
  setTools: (agentId: string, tools: AvailableTool[]) => void;
  
  // Export to .claude/agents/
  exportConfig: (agentId: string, options?: { lmstudioUrl?: string; enhance?: boolean }) => Promise<{ success: boolean; path?: string; enhanced?: boolean; error?: string }>;
  exportAllConfigs: () => Promise<{ success: number; failed: number }>;

  // Preview generation (returns markdown without writing file)
  previewConfig: (agentId: string, options?: { lmstudioUrl?: string; enhance?: boolean }) => Promise<{ success: boolean; markdown: string; enhanced?: boolean; error?: string }>;
  
  // Sync settings
  setSyncOnSave: (agentId: string, enabled: boolean) => void;
  
  // Initialize with defaults
  initializeConfig: (agentId: string, role: 'leader' | 'worker', name: string) => void;

  // Clear all configs (for full reset)
  clearAll: () => void;
}

// Default system prompts (from KURORYUU_LEADER.md / KURORYUU_WORKER.md)
const DEFAULT_LEADER_PROMPT = `# KURORYUU LEADER

You are the **LEADER AGENT** in the Kuroryuu multi-agent orchestration system.

## Your Responsibilities
- Coordinate workflow across multiple workers
- Break down user requests into subtasks
- Assign subtasks to available workers
- Monitor completion and aggregate results
- Handle human-in-the-loop interactions (ask_user, request_approval, present_plan)

## Tools Available
Use k_* routed tools for all operations. Call k_interact for human clarification.

## Rules
- ONE Leader at a time
- Workers execute, you coordinate
- Escalate ambiguity to humans via k_interact(action="ask")
`;

const DEFAULT_WORKER_PROMPT = `# KURORYUU WORKER

You are a **WORKER AGENT** in the Kuroryuu multi-agent orchestration system.

## Your Responsibilities
- Poll for available subtasks
- Claim and execute assigned work
- Report results back to leader
- Escalate blockers (don't block waiting for human input)

## Tools Available
Use k_* routed tools for all operations. You CANNOT use k_interact (leader-only).

## Rules
- Execute one subtask at a time
- Report success or failure honestly
- If stuck, release subtask and let leader reassign
- Stay in your lane - do your subtask, nothing more
`;

// Generate YAML frontmatter + system prompt in Claude Code format
function generateSubAgentMarkdown(config: SubAgentConfig): string {
  const toolsList = config.tools.length > 0 ? config.tools.join(', ') : 'inherit';
  
  return `---
name: ${config.name}
description: ${config.description}
tools: ${toolsList}
model: ${config.model}
permissionMode: ${config.permissionMode}
---

${config.systemPrompt}
`;
}

export const useSubAgentConfigStore = create<SubAgentConfigState>()(
  persist(
    (set, get) => ({
      configs: {},
      defaultLeaderPrompt: DEFAULT_LEADER_PROMPT,
      defaultWorkerPrompt: DEFAULT_WORKER_PROMPT,
      
      getConfig: (agentId) => get().configs[agentId],
      
      setConfig: (agentId, config) => {
        set((state) => ({
          configs: {
            ...state.configs,
            [agentId]: {
              ...state.configs[agentId],
              ...config,
            },
          },
        }));
        
        // Auto-export if syncOnSave is enabled
        const fullConfig = get().configs[agentId];
        if (fullConfig?.syncOnSave) {
          get().exportConfig(agentId);
        }
      },
      
      removeConfig: (agentId) => {
        set((state) => {
          const { [agentId]: _, ...rest } = state.configs;
          return { configs: rest };
        });
      },
      
      enableTool: (agentId, tool) => {
        set((state) => {
          const config = state.configs[agentId];
          if (!config) return state;
          
          const tools = config.tools.includes(tool)
            ? config.tools
            : [...config.tools, tool];
          
          return {
            configs: {
              ...state.configs,
              [agentId]: { ...config, tools },
            },
          };
        });
        
        const fullConfig = get().configs[agentId];
        if (fullConfig?.syncOnSave) {
          get().exportConfig(agentId);
        }
      },
      
      disableTool: (agentId, tool) => {
        set((state) => {
          const config = state.configs[agentId];
          if (!config) return state;
          
          const tools = config.tools.filter((t) => t !== tool);
          
          return {
            configs: {
              ...state.configs,
              [agentId]: { ...config, tools },
            },
          };
        });
        
        const fullConfig = get().configs[agentId];
        if (fullConfig?.syncOnSave) {
          get().exportConfig(agentId);
        }
      },
      
      setTools: (agentId, tools) => {
        set((state) => {
          const config = state.configs[agentId];
          if (!config) return state;
          
          return {
            configs: {
              ...state.configs,
              [agentId]: { ...config, tools },
            },
          };
        });
        
        const fullConfig = get().configs[agentId];
        if (fullConfig?.syncOnSave) {
          get().exportConfig(agentId);
        }
      },
      
      previewConfig: async (agentId, options) => {
        const config = get().configs[agentId];
        if (!config) {
          return { success: false, markdown: '', error: 'Config not found' };
        }

        // Build URL with optional lmstudio_url query param
        const url = new URL('http://127.0.0.1:8200/v1/subagent/generate');
        if (options?.lmstudioUrl) {
          url.searchParams.set('lmstudio_url', options.lmstudioUrl);
        }

        try {
          const response = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId,
              config,
              enhance: options?.enhance ?? false,
            }),
          });

          if (!response.ok) {
            const text = await response.text();
            return { success: false, markdown: '', error: `Gateway error: ${response.status} - ${text}` };
          }

          const data = await response.json();
          return {
            success: true,
            markdown: data.markdown || '',
            enhanced: data.enhanced || false,
          };
        } catch (error) {
          // Fallback to local template
          console.log('[SubAgentConfig] Gateway unavailable, using local template');
          return {
            success: true,
            markdown: generateSubAgentMarkdown(config),
            enhanced: false,
          };
        }
      },

      exportConfig: async (agentId, options) => {
        const config = get().configs[agentId];
        if (!config) {
          return { success: false, error: 'Config not found' };
        }

        const filename = `kuroryuu-${config.name.toLowerCase().replace(/\s+/g, '-')}.md`;
        let finalMarkdown = generateSubAgentMarkdown(config);
        let wasEnhanced = false;

        try {
          // Try LMStudio-enhanced generation if enabled
          const shouldEnhance = options?.enhance ?? true;
          if (shouldEnhance) {
            try {
              const url = new URL('http://127.0.0.1:8200/v1/subagent/generate');
              if (options?.lmstudioUrl) {
                url.searchParams.set('lmstudio_url', options.lmstudioUrl);
              }

              const response = await fetch(url.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  agentId,
                  config,
                  enhance: true,
                }),
              });

              if (response.ok) {
                const data = await response.json();
                if (data.markdown) {
                  finalMarkdown = data.markdown;
                  wasEnhanced = data.enhanced || false;
                }
              }
            } catch {
              // LMStudio not available, use local template
              console.log('[SubAgentConfig] LMStudio unavailable, using local template');
            }
          }

          // Write to .claude/agents/ directory
          const path = `.claude/agents/${filename}`;

          // Use Electron IPC to write file
          if (window.electronAPI?.fs?.writeFile) {
            await window.electronAPI.fs.writeFile(path, finalMarkdown);
          } else {
            // Fallback: call MCP k_files
            const response = await fetch('http://127.0.0.1:8100/mcp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: {
                  name: 'k_files',
                  arguments: {
                    action: 'write',
                    path: path,
                    content: finalMarkdown,
                  },
                },
              }),
            });

            if (!response.ok) {
              throw new Error(`MCP write failed: ${response.status}`);
            }
          }

          // Update last exported timestamp
          set((state) => ({
            configs: {
              ...state.configs,
              [agentId]: {
                ...state.configs[agentId],
                lastExported: Date.now(),
              },
            },
          }));

          return { success: true, path, enhanced: wasEnhanced };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Export failed',
          };
        }
      },
      
      exportAllConfigs: async () => {
        const configs = get().configs;
        let success = 0;
        let failed = 0;
        
        for (const agentId of Object.keys(configs)) {
          const result = await get().exportConfig(agentId);
          if (result.success) {
            success++;
          } else {
            failed++;
          }
        }
        
        return { success, failed };
      },
      
      setSyncOnSave: (agentId, enabled) => {
        set((state) => {
          const config = state.configs[agentId];
          if (!config) return state;
          
          return {
            configs: {
              ...state.configs,
              [agentId]: { ...config, syncOnSave: enabled },
            },
          };
        });
      },
      
      initializeConfig: (agentId, role, name) => {
        const state = get();

        // Don't overwrite existing config
        if (state.configs[agentId]) return;

        const isLeader = role === 'leader';
        const defaultTools: AvailableTool[] = isLeader
          ? ['k_session', 'k_files', 'k_memory', 'k_inbox', 'k_checkpoint', 'k_rag', 'k_interact']
          : ['k_session', 'k_files', 'k_memory', 'k_inbox', 'k_checkpoint', 'k_rag'];

        const newConfig: SubAgentConfig = {
          id: agentId,
          name: name || (isLeader ? 'Leader' : 'Worker'),
          description: isLeader
            ? 'Kuroryuu leader agent - coordinates multi-agent workflows'
            : 'Kuroryuu worker agent - executes subtasks assigned by leader',
          tools: defaultTools,
          model: 'inherit',
          permissionMode: 'default',
          systemPrompt: isLeader ? state.defaultLeaderPrompt : state.defaultWorkerPrompt,
          syncOnSave: false, // Default to manual export
        };

        set((state) => ({
          configs: {
            ...state.configs,
            [agentId]: newConfig,
          },
        }));
      },

      clearAll: () => {
        set(() => ({ configs: {} }));
      },
    }),
    {
      name: 'kuroryuu-subagent-configs',
      partialize: (state) => ({
        configs: state.configs,
        defaultLeaderPrompt: state.defaultLeaderPrompt,
        defaultWorkerPrompt: state.defaultWorkerPrompt,
      }),
    }
  )
);
