/**
 * Marketing Page Types
 */

// Tool navigation IDs
export type MarketingToolId =
  | 'research'
  | 'scraper'
  | 'image-gen'
  | 'voiceover'
  | 'music-gen'
  | 'gallery';

// Tool installation status (google-image-gen, claude-code-video-toolkit)
export interface ToolStatus {
  id: string;
  name: string;
  description: string;
  installed: boolean;       // repo directory exists (cloned)
  depsInstalled: boolean;   // dependency marker exists (fully set up)
  path: string | null;
  version: string | null;
  repoUrl: string;
  optional: boolean;
  installing?: boolean;
  error?: string | null;
}

// Research engine result (replaces Perplexity)
export interface ResearchResult {
  content: string;
  citations: Citation[];
  model_used: string;
  mode: 'quick' | 'deep' | 'reason';
  query: string;
  timestamp: string;
}

export interface Citation {
  index: number;
  url: string;
  title: string;
  snippet: string;
}

// Web scraper result (replaces Firecrawl)
export interface ScrapeResult {
  content: string;
  title: string;
  url: string;
  word_count: number;
  extracted_at: string;
  mode: 'markdown' | 'screenshot' | 'extract';
}

// Generated asset
export interface MarketingAsset {
  id: string;
  type: 'image' | 'video' | 'voiceover' | 'music' | 'copy' | 'page';
  name: string;
  path: string;
  createdAt: string;
  size: number;
  metadata: Record<string, unknown>;
}

// SSE generation job
export interface ActiveJob {
  id: string;
  type: 'image' | 'voiceover' | 'music' | 'research' | 'scrape';
  status: 'running' | 'complete' | 'error';
  progress: number;
  message: string;
  startedAt: string;
}

// Marketing skill reference
export interface MarketingSkill {
  id: string;
  name: string;
  description: string;
  path: string;
  phase?: string;
}

// Setup wizard state
export interface SetupState {
  tools: ToolStatus[];
  gatewayOnline: boolean;
  cliProxyConnected: boolean;
  complete: boolean;
}
