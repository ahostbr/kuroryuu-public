/**
 * Clawdbot Provider Configuration Types
 * TypeScript interfaces for provider config, models, and task results
 */

export interface ClawdbotModelConfig {
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
}

export interface LMStudioProviderConfig {
  enabled: boolean;
  baseUrl: string;  // Default: http://localhost:1234/v1
  models: ClawdbotModelConfig[];
  primaryModel?: string;
}

export interface OllamaProviderConfig {
  enabled: boolean;
  baseUrl: string;  // Default: http://localhost:11434
  models: ClawdbotModelConfig[];
  primaryModel?: string;
}

export interface AnthropicProviderConfig {
  enabled: boolean;
  apiKey: string;
}

export interface OpenAIProviderConfig {
  enabled: boolean;
  apiKey: string;
}

export interface ClawdbotProviderConfig {
  lmstudio?: LMStudioProviderConfig;
  ollama?: OllamaProviderConfig;
  anthropic?: AnthropicProviderConfig;
  openai?: OpenAIProviderConfig;
}

export interface ClawdbotTaskResult {
  id: string;
  prompt: string;
  result?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
}

export interface ClawdbotFullConfig {
  gateway: {
    mode: string;
    auth: {
      mode: string;
      token: string;
    };
    controlUi?: {
      allowInsecureAuth?: boolean;
    };
  };
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
      };
    };
  };
  models?: {
    mode?: string;
    providers?: {
      lmstudio?: {
        baseUrl: string;
        apiKey?: string;
        api: string;
        models: ClawdbotModelConfig[];
      };
      ollama?: {
        baseUrl: string;
        apiKey?: string;
        api: string;
        models: ClawdbotModelConfig[];
      };
      anthropic?: {
        apiKey: string;
        api: string;
      };
      openai?: {
        apiKey: string;
        api: string;
      };
    };
  };
}

export type ProviderType = 'lmstudio' | 'ollama' | 'anthropic' | 'openai';

export interface TestProviderResult {
  ok: boolean;
  error?: string;
  models?: ClawdbotModelConfig[];
}
