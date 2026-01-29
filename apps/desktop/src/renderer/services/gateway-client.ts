/**
 * Gateway Client
 *
 * Client wrapper for Kuroryuu's Gateway service (port 8200)
 * Provides access to SSE streaming, harness, hooks, and LLM backends
 */

import type { LLMProvider } from '../types/domain-config';

interface GatewayResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMBackend {
  id: string;
  name: string;
  type: 'claude' | 'lmstudio' | 'openai' | 'custom';
  models: string[];
  available: boolean;
}

interface StreamChunk {
  type: 'content' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

/**
 * Check if Gateway is healthy
 */
export async function checkGatewayHealth(): Promise<boolean> {
  try {
    const result = await window.electronAPI.gateway.health();
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * List available LLM backends
 */
export async function listBackends(): Promise<LLMBackend[]> {
  try {
    const result = await window.electronAPI.gateway.backends();
    if (result.backends && Array.isArray(result.backends)) {
      return result.backends as LLMBackend[];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Current backend info returned from Gateway
 */
interface CurrentBackend {
  name: string;
  base_url?: string;
  model?: string;
  supports_native_tools?: boolean;
}

/**
 * Get currently active backend from fallback chain (first healthy backend)
 *
 * Uses circuit breaker pattern - returns the backend that would be used
 * for the next request. Useful for showing users which backend is active.
 */
export async function getCurrentBackend(): Promise<GatewayResult<CurrentBackend>> {
  try {
    const response = await fetch('http://127.0.0.1:8200/api/backends/current');
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return {
          ok: true,
          data: {
            name: data.backend,
            base_url: data.base_url,
            model: data.model,
            supports_native_tools: data.supports_native_tools,
          },
        };
      }
      return { ok: false, error: data.error || 'No healthy backend available' };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Send chat messages and get streaming response
 * Note: Response is collected into chunks array (not true streaming from renderer)
 */
export async function chat(
  messages: ChatMessage[],
  model: string,
  harness?: string
): Promise<GatewayResult<{ response: string; chunks: StreamChunk[] }>> {
  try {
    const options = harness ? { harness } : undefined;
    const result = await window.electronAPI.gateway.chat(messages, model, options);
    
    if (!result.ok || result.error) {
      return { ok: false, error: result.error || 'Unknown error' };
    }

    // Parse chunks and assemble response
    const chunks: StreamChunk[] = [];
    let response = '';

    for (const chunkStr of result.chunks || []) {
      try {
        const chunk = JSON.parse(chunkStr) as StreamChunk;
        chunks.push(chunk);
        
        if (chunk.type === 'content' && chunk.content) {
          response += chunk.content;
        }
      } catch {
        // Skip unparseable chunks
      }
    }

    return { ok: true, data: { response, chunks } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Invoke a harness prompt
 */
export async function invokeHarness(
  promptName: string,
  context: Record<string, unknown>
): Promise<GatewayResult<unknown>> {
  try {
    const result = await window.electronAPI.gateway.harness(promptName, context);
    
    if (result.error) {
      return { ok: false, error: result.error };
    }

    return { ok: true, data: result.result };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Call MCP tool via Gateway
 */
export async function mcpViaGateway(
  tool: string,
  args: Record<string, unknown>
): Promise<GatewayResult<unknown>> {
  try {
    const result = await window.electronAPI.gateway.mcp(tool, args);
    
    if (result.error) {
      return { ok: false, error: result.error };
    }

    return { ok: true, data: result.result };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ============ GENERATION HELPERS ============

/**
 * Generate roadmap features using LLM with repo_intel context
 */
export async function generateRoadmap(
  projectDescription: string,
  existingFeatures: string[],
  model = 'claude-3-5-sonnet',
  config?: {
    productVision?: string;
    targetAudience?: string;
    timeframe?: string;
    focusAreas?: string[];
    provider?: LLMProvider;
  }
): Promise<GatewayResult<{ features: unknown[] }>> {
  // Try repo_intel-powered endpoint first
  try {
    const response = await fetch('http://127.0.0.1:8200/v1/repo_intel/roadmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_vision: config?.productVision || projectDescription,
        target_audience: config?.targetAudience || '',
        timeframe: config?.timeframe || 'quarter',
        focus_areas: config?.focusAreas || [],
        max_features: 12,
        model,
        backend: config?.provider, // Gateway uses 'backend' parameter
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.ok && data.features) {
        return { ok: true, data: { features: data.features } };
      }
    }
  } catch {
    // Fall through to legacy method
  }

  // Legacy: Direct LLM call without repo_intel context
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a product strategist. Generate a roadmap of features for the given project.
Output as JSON array with objects containing: name, description, phase (Now/Next/Later/Future), priority (high/medium/low), effort (small/medium/large).`,
    },
    {
      role: 'user',
      content: `Project: ${projectDescription}

Existing features: ${existingFeatures.join(', ') || 'None'}

Generate 8-12 features for the roadmap.`,
    },
  ];

  const result = await chat(messages, model);
  
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error };
  }

  try {
    // Extract JSON from response
    const match = result.data.response.match(/\[[\s\S]*\]/);
    if (match) {
      const features = JSON.parse(match[0]);
      return { ok: true, data: { features } };
    }
    return { ok: false, error: 'Failed to parse roadmap response' };
  } catch (e) {
    return { ok: false, error: `Parse error: ${e}` };
  }
}

/**
 * Generate ideas for improvements using repo_intel context
 */
export async function generateIdeas(
  projectDescription: string,
  categories: string[],
  model = 'claude-3-5-sonnet',
  config?: {
    maxIdeas?: number;
    focusApps?: string[];
    includeTodos?: boolean;
    provider?: LLMProvider;
  }
): Promise<GatewayResult<{ ideas: unknown[] }>> {
  // Try repo_intel-powered endpoint first
  try {
    // Map category display names to API values
    const categoryMap: Record<string, string> = {
      'Code Improvements': 'improvement',
      'Security Vulnerabilities': 'vulnerability',
      'Performance Optimizations': 'performance',
      'Documentation': 'documentation',
      'Testing': 'testing',
    };

    const apiCategories = categories.map(c => categoryMap[c] || c.toLowerCase());

    const response = await fetch('http://127.0.0.1:8200/v1/repo_intel/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categories: apiCategories,
        max_ideas: config?.maxIdeas || 20,
        focus_apps: config?.focusApps || [],
        include_todos: config?.includeTodos ?? true,
        model,
        backend: config?.provider, // Gateway uses 'backend' parameter
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.ok && data.ideas) {
        return { ok: true, data: { ideas: data.ideas } };
      }
    }
  } catch {
    // Fall through to legacy method
  }

  // Legacy: Direct LLM call without repo_intel context
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a creative software consultant. Generate improvement ideas for the given project.
Output as JSON array with objects containing: title, description, category (one of: ${categories.join(', ')}), impact (high/medium/low).`,
    },
    {
      role: 'user',
      content: `Project: ${projectDescription}

Generate 10-15 ideas across these categories: ${categories.join(', ')}`,
    },
  ];

  const result = await chat(messages, model);
  
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error };
  }

  try {
    const match = result.data.response.match(/\[[\s\S]*\]/);
    if (match) {
      const ideas = JSON.parse(match[0]);
      return { ok: true, data: { ideas } };
    }
    return { ok: false, error: 'Failed to parse ideas response' };
  } catch (e) {
    return { ok: false, error: `Parse error: ${e}` };
  }
}

/**
 * Generate changelog from completed tasks or git history
 */
export async function generateChangelog(
  items: string[],
  format: 'markdown' | 'keep-a-changelog' | 'semantic',
  model = 'claude-3-5-sonnet',
  provider?: LLMProvider
): Promise<GatewayResult<{ changelog: string }>> {
  const formatInstructions = {
    markdown: 'Use simple markdown with bullet points grouped by type (Added, Changed, Fixed, Removed).',
    'keep-a-changelog': 'Follow Keep a Changelog format (keepachangelog.com).',
    semantic: 'Group by semantic version impact (Breaking, Features, Fixes, Other).',
  };

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a technical writer. Generate a changelog from the given items.
${formatInstructions[format]}`,
    },
    {
      role: 'user',
      content: `Items:\n${items.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

Generate a well-formatted changelog.`,
    },
  ];

  const result = await chat(messages, model);
  
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error };
  }

  return { ok: true, data: { changelog: result.data.response } };
}

// ============ REPO INTEL HELPERS ============

interface RepoIntelStatus {
  indexed: boolean;
  last_indexed: string | null;
  total_files: number;
  total_symbols: number;
  total_todos: number;
  available_reports: string[];
}

/**
 * Get repo_intel index status
 */
export async function getRepoIntelStatus(): Promise<GatewayResult<RepoIntelStatus>> {
  try {
    const response = await fetch('http://127.0.0.1:8200/v1/repo_intel/status');
    if (response.ok) {
      const data = await response.json();
      return { ok: true, data };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Refresh repo_intel index
 */
export async function refreshRepoIntel(full = false): Promise<GatewayResult<{ stdout: string }>> {
  try {
    const response = await fetch(`http://127.0.0.1:8200/v1/repo_intel/refresh?full=${full}`, {
      method: 'POST',
    });
    if (response.ok) {
      const data = await response.json();
      return { ok: data.ok, data, error: data.error };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Get codebase context from repo_intel
 */
export async function getCodebaseContext(): Promise<GatewayResult<unknown>> {
  try {
    const response = await fetch('http://127.0.0.1:8200/v1/repo_intel/context');
    if (response.ok) {
      const data = await response.json();
      return { ok: true, data };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ============ IDEA SESSION MANAGEMENT ============

import type { IdeaSessionSummary, IdeaSession, SavedIdea } from '../types/ideation';

/**
 * List all saved idea sessions
 */
export async function listIdeaSessions(): Promise<GatewayResult<IdeaSessionSummary[]>> {
  try {
    const response = await fetch('http://127.0.0.1:8200/v1/repo_intel/sessions');
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return { ok: true, data: data.sessions };
      }
      return { ok: false, error: data.error };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Save ideas to a new session
 */
export async function saveIdeaSession(
  name: string,
  description: string,
  ideas: SavedIdea[],
  config: Record<string, unknown> = {}
): Promise<GatewayResult<{ session_id: string }>> {
  try {
    const response = await fetch('http://127.0.0.1:8200/v1/repo_intel/sessions/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, ideas, config }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return { ok: true, data: { session_id: data.session_id } };
      }
      return { ok: false, error: data.error };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Load a saved idea session
 */
export async function loadIdeaSession(sessionId: string): Promise<GatewayResult<IdeaSession>> {
  try {
    const response = await fetch(`http://127.0.0.1:8200/v1/repo_intel/sessions/${sessionId}`);
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return { ok: true, data: data.session };
      }
      return { ok: false, error: data.error };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Update an existing session
 */
export async function updateIdeaSession(
  sessionId: string,
  name: string,
  description: string,
  ideas: SavedIdea[],
  config: Record<string, unknown> = {}
): Promise<GatewayResult<{ session_id: string }>> {
  try {
    const response = await fetch(`http://127.0.0.1:8200/v1/repo_intel/sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, ideas, config }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return { ok: true, data: { session_id: data.session_id } };
      }
      return { ok: false, error: data.error };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Delete a saved session
 */
export async function deleteIdeaSession(sessionId: string): Promise<GatewayResult<void>> {
  try {
    const response = await fetch(`http://127.0.0.1:8200/v1/repo_intel/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return { ok: true };
      }
      return { ok: false, error: data.error };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Export a session to markdown or JSON
 */
export async function exportIdeaSession(
  sessionId: string,
  format: 'markdown' | 'json' = 'markdown'
): Promise<GatewayResult<{ content: string; format: string }>> {
  try {
    const response = await fetch(
      `http://127.0.0.1:8200/v1/repo_intel/sessions/${sessionId}/export?format=${format}`,
      { method: 'POST' }
    );
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return { ok: true, data: { content: data.content, format: data.format } };
      }
      return { ok: false, error: data.error };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ============ CHANGELOG HELPERS ============

import type {
  GitHistoryOptions,
  ChangelogConfig,
  ChangelogEntry
} from '../types/changelog';

interface GitCommitEntry {
  id: string;
  hash: string;
  message: string;
  author: string;
  date: string;
  type: 'feature' | 'fix' | 'improvement' | 'breaking' | 'docs' | 'other';
  title: string;
  selected: boolean;
}

interface TaskEntry {
  id: string;
  type: 'feature' | 'fix' | 'improvement' | 'breaking' | 'docs' | 'other';
  title: string;
  description?: string;
  taskId?: string;
  selected: boolean;
}

/**
 * Fetch git commit history with filtering
 */
export async function getGitHistory(
  options: GitHistoryOptions
): Promise<GatewayResult<{ entries: GitCommitEntry[]; total: number }>> {
  try {
    const params = new URLSearchParams();
    params.set('mode', options.mode);

    if (options.mode === 'count' && options.count) {
      params.set('count', String(options.count));
    }
    if (options.mode === 'date-range') {
      if (options.startDate) params.set('start_date', options.startDate);
      if (options.endDate) params.set('end_date', options.endDate);
    }
    if (options.mode === 'tags') {
      if (options.startTag) params.set('start_tag', options.startTag);
      if (options.endTag) params.set('end_tag', options.endTag);
    }
    params.set('include_merges', String(options.includeMergeCommits));

    const response = await fetch(`http://127.0.0.1:8200/v1/changelog/git-history?${params}`);
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return { ok: true, data: { entries: data.entries, total: data.total } };
      }
      return { ok: false, error: data.error };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Fetch done tasks from ai/todo.md
 */
export async function getDoneTasks(): Promise<GatewayResult<{ entries: TaskEntry[]; total: number }>> {
  try {
    const response = await fetch('http://127.0.0.1:8200/v1/changelog/tasks');
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return { ok: true, data: { entries: data.entries, total: data.total } };
      }
      return { ok: false, error: data.error };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Generate formatted changelog using LLM
 */
export async function generateChangelogV2(
  entries: ChangelogEntry[],
  config: ChangelogConfig
): Promise<GatewayResult<{ content: string }>> {
  try {
    const response = await fetch('http://127.0.0.1:8200/v1/changelog/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: entries.filter(e => e.selected).map(e => ({
          type: e.type,
          title: e.title,
          description: e.description,
        })),
        version: config.version,
        releaseDate: config.releaseDate,
        format: config.format,
        audience: config.audience,
        emojiLevel: config.emojiLevel,
        customInstructions: config.customInstructions,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return { ok: true, data: { content: data.content } };
      }
      return { ok: false, error: data.error };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Generate PRD (Product Requirements Document) using LMStudio with repo_intel context
 */
export async function generatePRD(request: {
  title: string;
  description: string;
  scope: 'feature' | 'epic' | 'task';
  include_tech_spec: boolean;
  include_acceptance: boolean;
  model?: string;
  provider?: LLMProvider;
}): Promise<GatewayResult<{
  id: string;
  title: string;
  scope: string;
  status: string;
  content: string;
  created_at: string;
  updated_at: string;
}> & {
  task_created?: boolean;
  task_id?: string;
  message?: string;
}> {
  try {
    const response = await fetch('http://127.0.0.1:8200/v1/prd/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...request,
        backend: request.provider, // Gateway uses 'backend' parameter
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        // Pass through task creation fields if present
        return {
          ok: true,
          data: data.data,
          task_created: data.task_created,
          task_id: data.task_id,
          message: data.message,
        };
      }
      return { ok: false, error: data.error || 'PRD generation failed' };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Export all as namespace
export const gatewayClient = {
  health: checkGatewayHealth,
  backends: listBackends,
  currentBackend: getCurrentBackend,
  chat,
  harness: invokeHarness,
  mcp: mcpViaGateway,
  generate: {
    roadmap: generateRoadmap,
    ideas: generateIdeas,
    changelog: generateChangelog,
    prd: generatePRD,
  },
  repoIntel: {
    status: getRepoIntelStatus,
    refresh: refreshRepoIntel,
    context: getCodebaseContext,
  },
  sessions: {
    list: listIdeaSessions,
    save: saveIdeaSession,
    load: loadIdeaSession,
    update: updateIdeaSession,
    delete: deleteIdeaSession,
    export: exportIdeaSession,
  },
  changelog: {
    gitHistory: getGitHistory,
    tasks: getDoneTasks,
    generate: generateChangelogV2,
  },
};
