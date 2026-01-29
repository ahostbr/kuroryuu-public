/**
 * Domain Config Types
 *
 * Unified provider/model selection for all 14 LLM generation domains.
 * Each domain can be configured with a specific provider and model.
 */

import type { ThinkingLevel } from './settings';

// ============================================================================
// Provider Types
// ============================================================================

export type LLMProvider = 'lmstudio' | 'claude' | 'cliproxyapi' | 'gateway-auto' | 'claude-cli' | 'claude-cli-pty';

export interface ProviderInfo {
  id: LLMProvider;
  name: string;
  description: string;
  color: string; // Tailwind color class for UI indicator
  healthEndpoint?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'gateway-auto',
    name: 'Gateway (Auto)',
    description: 'Automatic fallback chain - uses first healthy backend',
    color: 'purple',
    healthEndpoint: 'http://127.0.0.1:8200/health',
  },
  {
    id: 'lmstudio',
    name: 'LMStudio',
    description: 'Local LM Studio server for privacy-first inference',
    color: 'green',
    healthEndpoint: 'http://127.0.0.1:1234/api/v0/models',
  },
  {
    id: 'cliproxyapi',
    name: 'CLI Proxy',
    description: 'Claude, GPT, Gemini via CLI Proxy API - multi-provider support',
    color: 'blue',
    healthEndpoint: 'http://127.0.0.1:8317/health',
  },
  {
    id: 'claude',
    name: 'Claude API',
    description: 'Direct Claude API - requires API key',
    color: 'orange',
  },
  // NOTE: Claude CLI and Claude PTY hidden for public release - not fully functional
  // {
  //   id: 'claude-cli',
  //   name: 'Claude CLI',
  //   description: 'Direct via Claude Code CLI - real Opus 4.5 access (Max subscription)',
  //   color: 'amber',
  // },
  // {
  //   id: 'claude-cli-pty',
  //   name: 'Claude PTY',
  //   description: 'Persistent Claude CLI session - full features (/compact, skills, etc.)',
  //   color: 'yellow',
  // },
];

// ============================================================================
// Domain Types
// ============================================================================

export type DomainId =
  | 'code-editor'  // Unified AI Chat (Code Editor + Insights combined)
  | 'prd'
  | 'ideation'
  | 'roadmap'
  | 'formulas'
  | 'voice';

export type DomainCategory = 'generation' | 'assistant';

export interface DomainInfo {
  id: DomainId;
  label: string;
  description: string;
  icon: string;
  category: DomainCategory;
  defaultProvider: LLMProvider;
  defaultModel: string;
  supportsThinking: boolean; // Whether thinking level is configurable
}

export const DOMAINS: DomainInfo[] = [
  // Generation domains - content creation via LLM
  {
    id: 'prd',
    label: 'PRD Generation',
    description: 'Product requirements documents',
    icon: '📋',
    category: 'generation',
    defaultProvider: 'gateway-auto',
    defaultModel: 'mistralai/devstral-small-2-2512',
    supportsThinking: false,
  },
  {
    id: 'ideation',
    label: 'Ideation',
    description: 'Improvement ideas and suggestions',
    icon: '💡',
    category: 'generation',
    defaultProvider: 'gateway-auto',
    defaultModel: 'mistralai/devstral-small-2-2512',
    supportsThinking: false,
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    description: 'Product roadmap features',
    icon: '🗺️',
    category: 'generation',
    defaultProvider: 'gateway-auto',
    defaultModel: 'mistralai/devstral-small-2-2512',
    supportsThinking: false,
  },
  {
    id: 'formulas',
    label: 'Formulas',
    description: 'Workflow template execution',
    icon: '📐',
    category: 'generation',
    defaultProvider: 'gateway-auto',
    defaultModel: 'mistralai/devstral-small-2-2512',
    supportsThinking: false,
  },

  // Assistant domains - interactive chat features
  {
    id: 'code-editor',
    label: 'Insights',
    description: 'AI chat assistant',
    icon: '🧠',
    category: 'assistant',
    defaultProvider: 'cliproxyapi',
    defaultModel: 'claude-3-5-sonnet-20241022',
    supportsThinking: true,
  },
  {
    id: 'voice',
    label: 'TTS Tray Companion',
    description: 'Speech synthesis for tray',
    icon: '🔊',
    category: 'assistant',
    defaultProvider: 'gateway-auto',
    defaultModel: '',
    supportsThinking: false,
  },
];

// ============================================================================
// Domain Config (User Preferences)
// ============================================================================

export interface DomainConfig {
  provider: LLMProvider;
  modelId: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  thinkingLevel: ThinkingLevel;
}

// ============================================================================
// Model Info (fetched from providers)
// ============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: LLMProvider;
  source?: string; // Actual source provider within CLI Proxy ('antigravity', 'claude', 'github-copilot', etc.)
  contextWindow?: number;
  supportsTools?: boolean;
}

// ============================================================================
// Provider Health Status
// ============================================================================

export interface ProviderHealth {
  provider: LLMProvider;
  healthy: boolean;
  lastChecked: number;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get domain info by ID
 */
export function getDomainInfo(domainId: DomainId): DomainInfo | undefined {
  return DOMAINS.find(d => d.id === domainId);
}

/**
 * Get provider info by ID
 */
export function getProviderInfo(providerId: LLMProvider): ProviderInfo | undefined {
  return PROVIDERS.find(p => p.id === providerId);
}

/**
 * Get domains by category
 */
export function getDomainsByCategory(category: DomainCategory): DomainInfo[] {
  return DOMAINS.filter(d => d.category === category);
}

/**
 * Get default config for a domain
 */
export function getDefaultDomainConfig(domainId: DomainId): DomainConfig {
  const domain = getDomainInfo(domainId);
  if (!domain) {
    // Fallback defaults
    return {
      provider: 'gateway-auto',
      modelId: '',
      modelName: 'Auto',
      temperature: 0.7,
      maxTokens: 4096,
      thinkingLevel: 'none',
    };
  }

  // Set appropriate defaults based on domain category
  const defaults: Record<DomainCategory, Partial<DomainConfig>> = {
    generation: { temperature: 0.7, maxTokens: 4096, thinkingLevel: 'none' },
    assistant: { temperature: 0.7, maxTokens: 4096, thinkingLevel: 'none' },
  };

  const categoryDefaults = defaults[domain.category];

  return {
    provider: domain.defaultProvider,
    modelId: domain.defaultModel,
    modelName: domain.defaultModel ? getModelDisplayName(domain.defaultModel) : 'Auto',
    temperature: categoryDefaults.temperature ?? 0.7,
    maxTokens: categoryDefaults.maxTokens ?? 4096,
    thinkingLevel: domain.supportsThinking ? (categoryDefaults.thinkingLevel ?? 'none') : 'none',
  };
}

/**
 * Get display name for model ID
 */
export function getModelDisplayName(modelId: string): string {
  const modelNames: Record<string, string> = {
    // Claude family
    'claude-sonnet-4-20250514': 'Claude Sonnet 4',
    'claude-opus-4-5-20251101': 'Claude Opus 4.5',
    'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
    'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
    'claude-3-opus-20240229': 'Claude 3 Opus',
    'claude-3-haiku-20240307': 'Claude 3 Haiku',
    // OpenAI GPT family
    'gpt-4o': 'GPT-4o',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-4o-mini': 'GPT-4o Mini',
    'o1-preview': 'o1 Preview',
    'o1-mini': 'o1 Mini',
    'o1': 'o1',
    'o3-mini': 'o3 Mini',
    // GPT-5 / Codex family
    'gpt-5-codex': 'GPT-5 Codex',
    'gpt-5-medium': 'GPT-5 Medium',
    // Gemini family
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.0-flash': 'Gemini 2.0 Flash',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-1.5-flash': 'Gemini 1.5 Flash',
    // Gemini 3 family (preview)
    'gemini-3-pro-preview': 'Gemini 3 Pro',
    'gemini-3-flash-preview': 'Gemini 3 Flash',
    'gemini-3-pro-image-preview': 'Gemini 3 Pro Image',
    // Qwen family
    'qwen-coder': 'Qwen Coder',
    'qwen-coder-plus': 'Qwen Coder Plus',
    // DeepSeek family
    'deepseek-coder': 'DeepSeek Coder',
    'deepseek-v3': 'DeepSeek V3',
    // iFlow / Antigravity
    'iflow': 'iFlow',
    'antigravity': 'Antigravity',
    // GitHub Copilot (CLIProxyAPIPlus)
    'copilot': 'GitHub Copilot',
    // Kiro / AWS (CLIProxyAPIPlus)
    'kiro': 'Kiro (CodeWhisperer)',
    // Local models
    'mistralai/devstral-small-2-2512': 'Devstral Small',
  };

  return modelNames[modelId] || modelId.split('/').pop() || modelId;
}

// ============================================================================
// Model Family Detection
// ============================================================================

export type ModelFamily = 'claude' | 'openai' | 'gpt5' | 'gemini' | 'qwen' | 'deepseek' | 'copilot' | 'kiro' | 'local' | 'other';

/**
 * Detect model family from model ID
 */
export function getModelFamily(modelId: string): ModelFamily {
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
 * Display labels for model families
 */
export const MODEL_FAMILY_LABELS: Record<ModelFamily, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI (GPT/o-series)',
  gpt5: 'GPT-5 (Codex)',
  gemini: 'Gemini (Google)',
  qwen: 'Qwen (Alibaba)',
  deepseek: 'DeepSeek',
  copilot: 'GitHub Copilot',
  kiro: 'Kiro (AWS)',
  local: 'Local Models',
  other: 'Other',
};

/**
 * Sort order for model families (most relevant first)
 */
export const FAMILY_SORT_ORDER: ModelFamily[] = [
  'claude',
  'openai',
  'gpt5',
  'gemini',
  'qwen',
  'deepseek',
  'copilot',
  'kiro',
  'local',
  'other',
];

/**
 * Group models by family, maintaining sort order
 */
export function groupModelsByFamily(
  models: ModelInfo[]
): Map<ModelFamily, ModelInfo[]> {
  const grouped = new Map<ModelFamily, ModelInfo[]>();

  // Initialize in sort order
  for (const family of FAMILY_SORT_ORDER) {
    grouped.set(family, []);
  }

  // Group models
  for (const model of models) {
    const family = getModelFamily(model.id);
    const familyModels = grouped.get(family) || [];
    familyModels.push(model);
    grouped.set(family, familyModels);
  }

  // Remove empty groups
  for (const [family, familyModels] of grouped) {
    if (familyModels.length === 0) {
      grouped.delete(family);
    }
  }

  return grouped;
}

/**
 * Get formatted label for optgroup (with optional count)
 */
export function getFamilyGroupLabel(
  family: ModelFamily,
  count?: number,
  showCount: boolean = true
): string {
  const baseLabel = MODEL_FAMILY_LABELS[family];
  if (showCount && count !== undefined && count > 0) {
    return `${baseLabel} (${count})`;
  }
  return baseLabel;
}

/**
 * Provider color classes for UI
 */
export function getProviderColorClass(provider: LLMProvider): string {
  const colors: Record<LLMProvider, string> = {
    'gateway-auto': 'text-purple-400 bg-purple-400/10',
    'lmstudio': 'text-green-400 bg-green-400/10',
    'cliproxyapi': 'text-blue-400 bg-blue-400/10',
    'claude': 'text-orange-400 bg-orange-400/10',
    'claude-cli': 'text-amber-400 bg-amber-400/10',
    'claude-cli-pty': 'text-yellow-400 bg-yellow-400/10',
  };
  return colors[provider] || 'text-gray-400 bg-gray-400/10';
}

/**
 * Provider border color classes for UI
 */
export function getProviderBorderClass(provider: LLMProvider): string {
  const colors: Record<LLMProvider, string> = {
    'gateway-auto': 'border-purple-400/30',
    'lmstudio': 'border-green-400/30',
    'cliproxyapi': 'border-blue-400/30',
    'claude': 'border-orange-400/30',
    'claude-cli': 'border-amber-400/30',
    'claude-cli-pty': 'border-yellow-400/30',
  };
  return colors[provider] || 'border-gray-400/30';
}
