/**
 * Model Registry Service
 *
 * Fetches available models from each provider dynamically.
 * Provides health checks and model discovery for the domain config system.
 */

import type { LLMProvider, ModelInfo, ProviderHealth } from '../types/domain-config';

// ============================================================================
// Static Model Lists
// ============================================================================

/**
 * Claude models available through direct API or CLIProxyAPI
 */
export function getClaudeModels(): ModelInfo[] {
  return [
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      provider: 'claude',
      contextWindow: 200000,
      supportsTools: true,
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      provider: 'claude',
      contextWindow: 200000,
      supportsTools: true,
    },
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      provider: 'claude',
      contextWindow: 200000,
      supportsTools: true,
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      provider: 'claude',
      contextWindow: 200000,
      supportsTools: true,
    },
  ];
}

// ============================================================================
// Dynamic Model Fetching
// ============================================================================

// Cache for LM Studio availability (avoid spamming connection refused errors)
let _lmStudioCache: { models: ModelInfo[]; timestamp: number; available: boolean } | null = null;
const LMSTUDIO_CACHE_TTL = 60000; // 1 minute TTL for unavailable status

/**
 * Fetch available models from LMStudio
 * Caches unavailability to avoid console spam from connection refused errors
 */
export async function fetchLMStudioModels(): Promise<ModelInfo[]> {
  // Check cache - if LM Studio was recently unavailable, don't retry
  if (_lmStudioCache) {
    const age = Date.now() - _lmStudioCache.timestamp;
    if (age < LMSTUDIO_CACHE_TTL) {
      // Return cached models (or empty if unavailable)
      return _lmStudioCache.models;
    }
  }

  try {
    const response = await fetch('http://127.0.0.1:1234/api/v0/models', {
      signal: AbortSignal.timeout(3000), // Reduced timeout
    });

    if (!response.ok) {
      _lmStudioCache = { models: [], timestamp: Date.now(), available: false };
      return [];
    }

    const data = await response.json();

    // LMStudio returns { data: [{ id, object, ... }] }
    if (!data.data || !Array.isArray(data.data)) {
      _lmStudioCache = { models: [], timestamp: Date.now(), available: false };
      return [];
    }

    const models = data.data.map((model: { id: string; [key: string]: unknown }) => ({
      id: model.id,
      name: formatModelName(model.id),
      provider: 'lmstudio' as LLMProvider,
      contextWindow: 32768, // Default for most local models
      supportsTools: true, // Local models can use MCP tools through Gateway
    }));

    _lmStudioCache = { models, timestamp: Date.now(), available: true };
    return models;
  } catch {
    // Cache the failure to avoid repeated connection refused spam
    _lmStudioCache = { models: [], timestamp: Date.now(), available: false };
    return [];
  }
}

/**
 * Fetch available models from Gateway (combines all healthy backends)
 */
export async function fetchGatewayModels(): Promise<ModelInfo[]> {
  try {
    const response = await fetch('http://127.0.0.1:8200/api/backends', {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn('Gateway not available:', response.status);
      return [];
    }

    const data = await response.json();
    const models: ModelInfo[] = [];

    // Gateway returns { backends: [{ name, models: [...], available }] }
    if (data.backends && Array.isArray(data.backends)) {
      for (const backend of data.backends) {
        if (backend.available && backend.models) {
          for (const modelId of backend.models) {
            models.push({
              id: modelId,
              name: formatModelName(modelId),
              provider: 'gateway-auto',
              supportsTools: backend.name === 'claude' || backend.name === 'cliproxyapi',
            });
          }
        }
      }
    }

    return models;
  } catch (e) {
    console.warn('Failed to fetch Gateway models:', e);
    return [];
  }
}

/**
 * Infer the actual source provider from a model ID
 *
 * CLI Proxy aggregates multiple providers - this function determines
 * which actual backend serves the model based on naming conventions.
 */
export function inferSourceFromId(modelId: string): string {
  const id = modelId.toLowerCase();

  // Kiro models (AWS CodeWhisperer)
  if (id.startsWith('kiro-')) return 'kiro';

  // Antigravity models (Gemini-Claude hybrids, iFlow, etc.)
  if (id.startsWith('gemini-claude-') || id.includes('antigravity') || id.includes('iflow')) return 'antigravity';

  // Direct Claude models (official Anthropic API)
  if (id.includes('claude') && !id.startsWith('gemini-claude-') && !id.startsWith('kiro-')) return 'claude';

  // Direct Gemini models (Google AI)
  if (id.includes('gemini') && !id.startsWith('gemini-claude-')) return 'gemini';

  // OpenAI models (GPT, o1, o3 series)
  if (id.includes('gpt') || id.startsWith('o1') || id.startsWith('o3')) return 'openai';

  // GitHub Copilot
  if (id.includes('copilot')) return 'github-copilot';

  // Qwen models
  if (id.includes('qwen')) return 'qwen';

  // DeepSeek models
  if (id.includes('deepseek')) return 'deepseek';

  return 'other';
}

/**
 * Fetch models available through CLIProxyAPI
 *
 * CLIProxyAPI (port 8317) supports multiple providers:
 * - Claude Code CLI
 * - ChatGPT Codex (OpenAI)
 * - Gemini CLI
 * - Qwen Code
 * - iFlow, Antigravity, etc.
 *
 * IMPORTANT: Always returns the static master list as source of truth.
 * The API fetch is only used to check availability, not for model metadata.
 * This ensures consistent source grouping and context window info.
 */
export async function fetchCLIProxyModels(): Promise<ModelInfo[]> {
  // Always return the static master list - it's our canonical source of truth
  // for model IDs, display names, sources, context windows, and tool support.
  //
  // The API endpoint doesn't reliably return source information (owned_by),
  // which breaks our provider grouping in the UI.
  return getStaticCLIProxyModels();
}

/**
 * Get context window size for a model
 */
function getContextWindowForModel(modelId: string): number {
  const family = getModelFamily(modelId);
  const id = modelId.toLowerCase();

  // Check for codex variants first (larger context)
  if (id.includes('codex')) {
    return 200000;
  }

  switch (family) {
    case 'claude': return 200000;
    case 'openai': return 128000;
    case 'gpt5': return 128000;  // GPT-5 series
    case 'gemini': return 1000000;
    case 'copilot': return 128000;  // GitHub Copilot models
    case 'kiro': return 200000;  // Kiro uses Claude backend
    case 'qwen': return 32000;
    case 'deepseek': return 64000;
    case 'local': return 32768;
    default: return 32768;
  }
}

// ============================================================================
// Health Checks
// ============================================================================

/**
 * Check provider health
 */
export async function checkProviderHealth(provider: LLMProvider): Promise<ProviderHealth> {
  const result: ProviderHealth = {
    provider,
    healthy: false,
    lastChecked: Date.now(),
  };

  try {
    switch (provider) {
      case 'gateway-auto': {
        const response = await fetch('http://127.0.0.1:8200/health', {
          signal: AbortSignal.timeout(3000),
        });
        result.healthy = response.ok;
        break;
      }

      case 'lmstudio': {
        // Use cached availability to avoid connection refused spam
        if (_lmStudioCache && Date.now() - _lmStudioCache.timestamp < LMSTUDIO_CACHE_TTL) {
          result.healthy = _lmStudioCache.available;
          break;
        }
        const response = await fetch('http://127.0.0.1:1234/api/v0/models', {
          signal: AbortSignal.timeout(3000),
        });
        result.healthy = response.ok;
        _lmStudioCache = { models: [], timestamp: Date.now(), available: response.ok };
        break;
      }

      case 'cliproxyapi': {
        // CLIProxyAPI requires auth - use /v1/models endpoint (no /health endpoint)
        const response = await fetch('http://127.0.0.1:8317/v1/models', {
          headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
          signal: AbortSignal.timeout(3000),
        });
        result.healthy = response.ok;
        break;
      }

      case 'claude': {
        // Claude API requires API key - assume healthy if key is configured
        // This would need to be validated separately with a real API call
        result.healthy = true;
        break;
      }

      case 'claude-cli': {
        // Check Gateway backend health for claude-cli
        const response = await fetch('http://127.0.0.1:8200/api/backends', {
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          const data = await response.json();
          result.healthy = data.backends?.['claude-cli']?.health?.ok ?? false;
        }
        break;
      }

      case 'claude-cli-pty': {
        // Check Gateway backend health for claude-cli-pty
        const response = await fetch('http://127.0.0.1:8200/api/backends', {
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          const data = await response.json();
          result.healthy = data.backends?.['claude-cli-pty']?.health?.ok ?? false;
        }
        break;
      }
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}

/**
 * Check all provider health statuses
 */
export async function checkAllProvidersHealth(): Promise<Record<LLMProvider, ProviderHealth>> {
  const providers: LLMProvider[] = ['gateway-auto', 'lmstudio', 'cliproxyapi', 'claude', 'claude-cli', 'claude-cli-pty'];

  const results = await Promise.all(
    providers.map(provider => checkProviderHealth(provider))
  );

  const healthMap: Record<LLMProvider, ProviderHealth> = {} as Record<LLMProvider, ProviderHealth>;
  for (const result of results) {
    healthMap[result.provider] = result;
  }

  return healthMap;
}

// ============================================================================
// Unified Model Fetching
// ============================================================================

/**
 * Fetch all available models from all providers
 */
export async function fetchAllModels(): Promise<ModelInfo[]> {
  const [lmstudioModels, gatewayModels, cliproxyModels] = await Promise.all([
    fetchLMStudioModels(),
    fetchGatewayModels(),
    fetchCLIProxyModels(),
  ]);

  // Combine all models, deduplicating by id+provider
  const allModels: ModelInfo[] = [
    ...lmstudioModels,
    ...gatewayModels,
    ...getClaudeModels(), // Always include Claude models for direct API
    ...cliproxyModels,
  ];

  // Deduplicate by source+id (not provider+id!)
  // This allows same model ID from different sources (e.g., gpt-5 from openai AND github-copilot)
  const seen = new Set<string>();
  return allModels.filter(model => {
    const key = `${model.source || model.provider}:${model.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Fetch models for a specific provider
 */
export async function fetchModelsForProvider(provider: LLMProvider): Promise<ModelInfo[]> {
  switch (provider) {
    case 'lmstudio':
      return fetchLMStudioModels();

    case 'gateway-auto':
      return fetchGatewayModels();

    case 'cliproxyapi':
      return fetchCLIProxyModels();

    case 'claude':
      return getClaudeModels();

    default:
      return [];
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Detect model family from model ID
 * Note: This function is duplicated in domain-config.ts for full type support
 */
export function getModelFamily(modelId: string): 'claude' | 'openai' | 'gpt5' | 'gemini' | 'qwen' | 'deepseek' | 'copilot' | 'kiro' | 'local' | 'other' {
  const id = modelId.toLowerCase();
  if (id.includes('claude')) return 'claude';
  // GPT-5 before GPT to match more specific pattern first
  if (id.includes('gpt-5') || id.includes('gpt5')) return 'gpt5';
  if (id.includes('gpt') || id.startsWith('o1-') || id.startsWith('o3-') || id === 'o1' || id === 'o3') return 'openai';
  if (id.includes('gemini')) return 'gemini';
  if (id.includes('qwen')) return 'qwen';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('copilot')) return 'copilot';
  if (id.includes('kiro') || id.includes('codewhisperer')) return 'kiro';
  if (id.includes('devstral') || id.includes('mistral') || id.includes('llama')) return 'local';
  return 'other';
}

/**
 * Check if model supports native tool calling
 *
 * Tool support matrix:
 * - Claude: ALL models support tools
 * - OpenAI GPT-4/GPT-4o/GPT-5: Support tools (function calling)
 * - OpenAI o3-mini: Supports tools (reasoning + function calling)
 * - OpenAI o1 series: NO tools (reasoning only)
 * - Gemini: ALL models support tools
 * - Copilot: Supports tools
 * - Local (devstral, mistral, llama): Support tools via MCP
 * - Qwen/DeepSeek: No tool support
 * - Kiro base: No tool support (code completion only)
 * - Kiro agentic: Supports tools (agentic mode enables tool use)
 */
export function modelSupportsTools(modelId: string): boolean {
  const family = getModelFamily(modelId);
  const id = modelId.toLowerCase();

  if (family === 'claude') return true;
  if (family === 'gpt5') return true; // GPT-5 Codex supports tools
  if (family === 'openai') {
    // o1 models don't support tools (reasoning only)
    if (id.startsWith('o1-') || id === 'o1') return false;
    // o3-mini supports tools (reasoning + function calling)
    if (id.startsWith('o3-') || id === 'o3') return true;
    return true; // GPT-4, GPT-4o, etc. support tools
  }
  if (family === 'gemini') return true;
  if (family === 'copilot') return true; // GitHub Copilot supports function calling
  if (family === 'local') return true; // Local models can use MCP tools
  if (family === 'qwen') return false; // Qwen Code typically doesn't support tools
  if (family === 'deepseek') return false; // DeepSeek doesn't support tools
  if (family === 'kiro') {
    // Kiro agentic models support tools, base models do not
    return id.includes('agentic');
  }

  // Special models from GitHub Copilot that have unique IDs
  if (id.includes('grok')) return true; // Grok Code Fast
  if (id.includes('oswe') || id.includes('raptor')) return true; // Raptor mini (oswe-vscode-prime)

  return false;
}

/**
 * Get static CLI Proxy models (fallback when live fetch fails)
 *
 * MASTER MODEL LIST - Exact match from management gateway (61 models)
 * Source: CLIProxyAPI management.html + Architecture doc tool support
 *
 * Tool Support (per Architecture Doc):
 * - claude, openai, gemini, github-copilot: supportsTools: true
 * - antigravity, kiro: supportsTools: false
 */
export function getStaticCLIProxyModels(): ModelInfo[] {
  return [
    // ===== ANTIGRAVITY (10) - NO TOOLS =====
    { id: 'gemini-claude-sonnet-4-5-thinking', name: 'Claude Sonnet 4.5 (Thinking)', provider: 'cliproxyapi', source: 'antigravity', contextWindow: 200000, supportsTools: false },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'cliproxyapi', source: 'antigravity', contextWindow: 1000000, supportsTools: false },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'cliproxyapi', source: 'antigravity', contextWindow: 1000000, supportsTools: false },
    { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image', provider: 'cliproxyapi', source: 'antigravity', contextWindow: 1000000, supportsTools: false },
    { id: 'gemini-claude-opus-4-5-thinking', name: 'Claude Opus 4.5 (Thinking)', provider: 'cliproxyapi', source: 'antigravity', contextWindow: 200000, supportsTools: false },
    { id: 'tab_flash_lite_preview', name: 'Tab Flash Lite Preview', provider: 'cliproxyapi', source: 'antigravity', contextWindow: 1000000, supportsTools: false },
    { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)', provider: 'cliproxyapi', source: 'antigravity', contextWindow: 128000, supportsTools: false },
    { id: 'gemini-claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'cliproxyapi', source: 'antigravity', contextWindow: 200000, supportsTools: false },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'cliproxyapi', source: 'antigravity', contextWindow: 1000000, supportsTools: false },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (High)', provider: 'cliproxyapi', source: 'antigravity', contextWindow: 1000000, supportsTools: false },

    // ===== CLAUDE-CLI (Direct via Claude Code CLI) =====
    { id: 'claude-opus-4-5-direct', name: 'OPUS4.5-MAX', provider: 'claude-cli', source: 'claude', contextWindow: 200000, supportsTools: true },

    // ===== CLAUDE-CLI-PTY (Persistent Claude Code CLI session) =====
    { id: 'claude-opus-4-5-pty', name: 'OPUS4.5-PTY', provider: 'claude-cli-pty', source: 'claude', contextWindow: 200000, supportsTools: true },

    // ===== CLAUDE (8) =====
    { id: 'claude-haiku-4-5-20251001', name: 'Claude 4.5 Haiku', provider: 'cliproxyapi', source: 'claude', contextWindow: 200000, supportsTools: true },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude 4.5 Sonnet', provider: 'cliproxyapi', source: 'claude', contextWindow: 200000, supportsTools: true },
    { id: 'claude-opus-4-5-20251101', name: 'Claude 4.5 Opus', provider: 'cliproxyapi', source: 'claude', contextWindow: 200000, supportsTools: true },
    { id: 'claude-opus-4-1-20250805', name: 'Claude 4.1 Opus', provider: 'cliproxyapi', source: 'claude', contextWindow: 200000, supportsTools: true },
    { id: 'claude-opus-4-20250514', name: 'Claude 4 Opus', provider: 'cliproxyapi', source: 'claude', contextWindow: 200000, supportsTools: true },
    { id: 'claude-sonnet-4-20250514', name: 'Claude 4 Sonnet', provider: 'cliproxyapi', source: 'claude', contextWindow: 200000, supportsTools: true },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', provider: 'cliproxyapi', source: 'claude', contextWindow: 200000, supportsTools: true },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'cliproxyapi', source: 'claude', contextWindow: 200000, supportsTools: true },

    // ===== OPENAI (9) =====
    { id: 'gpt-5', name: 'GPT 5', provider: 'cliproxyapi', source: 'openai', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-5-codex', name: 'GPT 5 Codex', provider: 'cliproxyapi', source: 'openai', contextWindow: 200000, supportsTools: true },
    { id: 'gpt-5-codex-mini', name: 'GPT 5 Codex Mini', provider: 'cliproxyapi', source: 'openai', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-5.1', name: 'GPT 5.1', provider: 'cliproxyapi', source: 'openai', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-5.1-codex', name: 'GPT 5.1 Codex', provider: 'cliproxyapi', source: 'openai', contextWindow: 200000, supportsTools: true },
    { id: 'gpt-5.1-codex-mini', name: 'GPT 5.1 Codex Mini', provider: 'cliproxyapi', source: 'openai', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-5.1-codex-max', name: 'GPT 5.1 Codex Max', provider: 'cliproxyapi', source: 'openai', contextWindow: 200000, supportsTools: true },
    { id: 'gpt-5.2', name: 'GPT 5.2', provider: 'cliproxyapi', source: 'openai', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-5.2-codex', name: 'GPT 5.2 Codex', provider: 'cliproxyapi', source: 'openai', contextWindow: 200000, supportsTools: true },

    // ===== GITHUB-COPILOT (21) =====
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-5', name: 'GPT-5', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-5-codex', name: 'GPT-5 Codex', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 200000, supportsTools: true },
    { id: 'gpt-5.1', name: 'GPT-5.1', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 200000, supportsTools: true },
    { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 200000, supportsTools: true },
    { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 128000, supportsTools: true },
    { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 200000, supportsTools: true },
    { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 200000, supportsTools: true },
    { id: 'claude-opus-4.1', name: 'Claude Opus 4.1', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 200000, supportsTools: true },
    { id: 'claude-opus-4.5', name: 'Claude Opus 4.5', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 200000, supportsTools: true },
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 200000, supportsTools: true },
    { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 200000, supportsTools: true },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 1000000, supportsTools: true },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 1000000, supportsTools: true },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 1000000, supportsTools: true },
    { id: 'grok-code-fast-1', name: 'Grok Code Fast 1', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 128000, supportsTools: true },
    { id: 'oswe-vscode-prime', name: 'Raptor mini (Preview)', provider: 'cliproxyapi', source: 'github-copilot', contextWindow: 128000, supportsTools: true },

    // ===== KIRO (9) - Base models NO TOOLS, Agentic models HAVE TOOLS =====
    { id: 'kiro-auto', name: 'Kiro Auto', provider: 'cliproxyapi', source: 'kiro', contextWindow: 128000, supportsTools: false },
    { id: 'kiro-claude-opus-4-5', name: 'Kiro Claude Opus 4.5', provider: 'cliproxyapi', source: 'kiro', contextWindow: 200000, supportsTools: false },
    { id: 'kiro-claude-sonnet-4-5', name: 'Kiro Claude Sonnet 4.5', provider: 'cliproxyapi', source: 'kiro', contextWindow: 200000, supportsTools: false },
    { id: 'kiro-claude-sonnet-4', name: 'Kiro Claude Sonnet 4', provider: 'cliproxyapi', source: 'kiro', contextWindow: 200000, supportsTools: false },
    { id: 'kiro-claude-haiku-4-5', name: 'Kiro Claude Haiku 4.5', provider: 'cliproxyapi', source: 'kiro', contextWindow: 200000, supportsTools: false },
    { id: 'kiro-claude-opus-4-5-agentic', name: 'Kiro Claude Opus 4.5 (Agentic)', provider: 'cliproxyapi', source: 'kiro', contextWindow: 200000, supportsTools: true },
    { id: 'kiro-claude-sonnet-4-5-agentic', name: 'Kiro Claude Sonnet 4.5 (Agentic)', provider: 'cliproxyapi', source: 'kiro', contextWindow: 200000, supportsTools: true },
    { id: 'kiro-claude-sonnet-4-agentic', name: 'Kiro Claude Sonnet 4 (Agentic)', provider: 'cliproxyapi', source: 'kiro', contextWindow: 200000, supportsTools: true },
    { id: 'kiro-claude-haiku-4-5-agentic', name: 'Kiro Claude Haiku 4.5 (Agentic)', provider: 'cliproxyapi', source: 'kiro', contextWindow: 200000, supportsTools: true },

    // ===== GEMINI (5) =====
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'cliproxyapi', source: 'gemini', contextWindow: 1000000, supportsTools: true },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'cliproxyapi', source: 'gemini', contextWindow: 1000000, supportsTools: true },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'cliproxyapi', source: 'gemini', contextWindow: 1000000, supportsTools: true },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', provider: 'cliproxyapi', source: 'gemini', contextWindow: 1000000, supportsTools: true },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', provider: 'cliproxyapi', source: 'gemini', contextWindow: 1000000, supportsTools: true },
  ];
}

/**
 * Format model ID to human-readable name
 */
function formatModelName(modelId: string): string {
  // Known model name mappings - MASTER LIST (matches getStaticCLIProxyModels)
  const knownNames: Record<string, string> = {
    // ===== ANTIGRAVITY =====
    'gemini-claude-sonnet-4-5-thinking': 'Claude Sonnet 4.5 (Thinking)',
    'gemini-claude-opus-4-5-thinking': 'Claude Opus 4.5 (Thinking)',
    'gemini-claude-sonnet-4-5': 'Claude Sonnet 4.5',
    'tab_flash_lite_preview': 'Tab Flash Lite Preview',
    'gpt-oss-120b-medium': 'GPT-OSS 120B (Medium)',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',

    // ===== CLAUDE =====
    'claude-haiku-4-5-20251001': 'Claude 4.5 Haiku',
    'claude-sonnet-4-5-20250929': 'Claude 4.5 Sonnet',
    'claude-opus-4-5-20251101': 'Claude 4.5 Opus',
    'claude-opus-4-1-20250805': 'Claude 4.1 Opus',
    'claude-opus-4-20250514': 'Claude 4 Opus',
    'claude-sonnet-4-20250514': 'Claude 4 Sonnet',
    'claude-3-7-sonnet-20250219': 'Claude 3.7 Sonnet',
    'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',

    // ===== OPENAI =====
    'gpt-5': 'GPT 5',
    'gpt-5-codex': 'GPT 5 Codex',
    'gpt-5-codex-mini': 'GPT 5 Codex Mini',
    'gpt-5.1': 'GPT 5.1',
    'gpt-5.1-codex': 'GPT 5.1 Codex',
    'gpt-5.1-codex-mini': 'GPT 5.1 Codex Mini',
    'gpt-5.1-codex-max': 'GPT 5.1 Codex Max',
    'gpt-5.2': 'GPT 5.2',
    'gpt-5.2-codex': 'GPT 5.2 Codex',

    // ===== GITHUB-COPILOT =====
    'gpt-4.1': 'GPT-4.1',
    'gpt-4o': 'GPT-4o',
    'gpt-5-mini': 'GPT-5 Mini',
    'claude-haiku-4.5': 'Claude Haiku 4.5',
    'claude-opus-4.1': 'Claude Opus 4.1',
    'claude-opus-4.5': 'Claude Opus 4.5',
    'claude-sonnet-4': 'Claude Sonnet 4',
    'claude-sonnet-4.5': 'Claude Sonnet 4.5',
    'grok-code-fast-1': 'Grok Code Fast 1',
    'oswe-vscode-prime': 'Raptor mini (Preview)',

    // ===== KIRO =====
    'kiro-auto': 'Kiro Auto',
    'kiro-claude-opus-4-5': 'Kiro Claude Opus 4.5',
    'kiro-claude-sonnet-4-5': 'Kiro Claude Sonnet 4.5',
    'kiro-claude-sonnet-4': 'Kiro Claude Sonnet 4',
    'kiro-claude-haiku-4-5': 'Kiro Claude Haiku 4.5',
    'kiro-claude-opus-4-5-agentic': 'Kiro Claude Opus 4.5 (Agentic)',
    'kiro-claude-sonnet-4-5-agentic': 'Kiro Claude Sonnet 4.5 (Agentic)',
    'kiro-claude-sonnet-4-agentic': 'Kiro Claude Sonnet 4 (Agentic)',
    'kiro-claude-haiku-4-5-agentic': 'Kiro Claude Haiku 4.5 (Agentic)',

    // ===== GEMINI =====
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-3-pro-preview': 'Gemini 3 Pro Preview',
    'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
    'gemini-3-pro-image-preview': 'Gemini 3 Pro Image',
  };

  if (knownNames[modelId]) {
    return knownNames[modelId];
  }

  // Handle HuggingFace-style IDs (org/model-name)
  if (modelId.includes('/')) {
    const parts = modelId.split('/');
    const modelPart = parts[parts.length - 1];
    return formatModelName(modelPart);
  }

  // Convert kebab-case to Title Case
  return modelId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/([0-9]+)([a-z])/gi, '$1 $2') // Add space between numbers and letters
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get current active backend from Gateway
 */
export async function getCurrentBackend(): Promise<{
  name: string;
  model?: string;
  supportsNativeTools?: boolean;
} | null> {
  try {
    const response = await fetch('http://127.0.0.1:8200/api/backends/current', {
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.ok) return null;

    return {
      name: data.backend,
      model: data.model,
      supportsNativeTools: data.supports_native_tools,
    };
  } catch {
    return null;
  }
}
