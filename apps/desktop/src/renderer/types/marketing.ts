/**
 * Marketing Page Types
 * Types for the marketing workflow: research -> positioning -> copy -> landing -> lead magnet -> SEO -> ads -> traffic
 */

// 8-phase marketing workflow
export type MarketingPhase =
  | 'research'
  | 'positioning'
  | 'copywriting'
  | 'landing-page'
  | 'lead-magnet'
  | 'seo-content'
  | 'ads'
  | 'traffic';

export const MARKETING_PHASES: { id: MarketingPhase; label: string }[] = [
  { id: 'research', label: 'Research' },
  { id: 'positioning', label: 'Positioning' },
  { id: 'copywriting', label: 'Copywriting' },
  { id: 'landing-page', label: 'Landing Page' },
  { id: 'lead-magnet', label: 'Lead Magnet' },
  { id: 'seo-content', label: 'SEO Content' },
  { id: 'ads', label: 'Ads' },
  { id: 'traffic', label: 'Traffic' },
];

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
  type: 'image' | 'voiceover' | 'music' | 'video' | 'research' | 'scrape';
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
  phase: MarketingPhase;
}

// Setup wizard state
export interface SetupState {
  tools: ToolStatus[];
  gatewayOnline: boolean;
  cliProxyConnected: boolean;
  complete: boolean;
}
