/**
 * Types for the Insights chat screen
 */

import { getModelDisplayName } from './domain-config';

// Changed from literal union to string for dynamic model support
// Domain config can have any model ID from CLIProxyAPI (28+ models)
export type InsightsModel = string;

export interface InsightsMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: InsightsModel;
  toolCalls?: ToolCall[];
  richCards?: RichCard[];  // Rich visualization cards for tool outputs
  status?: 'pending' | 'streaming' | 'complete' | 'error';
  error?: string;
  isStreaming?: boolean;  // True while message is being progressively built
  // Response metadata
  metadata?: {
    actualModel?: string;      // Model ID from response
    finishReason?: string;     // stop, length, tool_use, etc.
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    latencyMs?: number;        // Time to complete
    backend?: string;          // lmstudio, cliproxyapi, claude
  };
}

export interface ToolCall {
  id: string;
  name: string;
  status: 'running' | 'success' | 'error';
  duration?: number;
  result?: string;
}

// Rich visualization card types
export type RichCardType = 'rag-results' | 'file-tree' | 'session-state' | 'tool-output';

export interface RichCard {
  id: string;
  type: RichCardType;
  toolCallId: string;  // Links to parent ToolCall
  data: RAGResultsData | FileTreeData | ToolOutputData;
}

export interface RAGResultsData {
  query: string;
  strategy?: string;
  matches: RAGMatch[];
  totalMatches: number;
  scanTimeMs?: number;
  filesScanned?: number;
}

export interface RAGMatch {
  path: string;
  line?: number;
  score: number;
  snippet?: string;
}

export interface FileTreeData {
  rootPath: string;
  files: FileTreeEntry[];
}

export interface FileTreeEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeEntry[];
}

export interface ToolOutputData {
  toolName: string;
  output: string;
  isJson?: boolean;
}

export interface InsightsSession {
  id: string;
  title: string;
  messages: InsightsMessage[];
  model: InsightsModel;
  createdAt: number;
  updatedAt: number;
}

export interface InsightsSettings {
  defaultModel: InsightsModel;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

// Legacy display names - kept for backwards compatibility
// New code should use getInsightsModelName() which falls back to domain-config
const LEGACY_MODEL_NAMES: Record<string, string> = {
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
  'claude-3-opus-20240229': 'Claude 3 Opus',
  'gpt-4o': 'GPT-4o',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'o1-preview': 'o1-preview',
  'local-lmstudio': 'LM Studio (Local)',
};

/**
 * Get display name for a model ID
 * Falls back to domain-config's comprehensive model name mapping
 */
export function getInsightsModelName(modelId: string): string {
  return LEGACY_MODEL_NAMES[modelId] || getModelDisplayName(modelId);
}

// Re-export for backwards compatibility (components using MODEL_DISPLAY_NAMES directly)
export const MODEL_DISPLAY_NAMES: Record<string, string> = new Proxy(LEGACY_MODEL_NAMES, {
  get(target, prop: string) {
    return target[prop] || getModelDisplayName(prop);
  }
});
