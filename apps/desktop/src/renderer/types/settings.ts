/**
 * Types for Settings Dialogs
 * - App Settings: Theme, UI scale, language, terminal font
 * - Project Settings: OAuth, MCP servers, env vars
 * - Claude Profiles: API keys, rate limits
 * - Model Config: Per-phase model selection
 */

// ============================================================================
// App Settings Types
// ============================================================================

export type ThemeId = 'oscura-midnight' | 'dusk' | 'lime' | 'ocean' | 'retro' | 'neo' | 'forest' | 'matrix' | 'grunge' | 'kuroryuu';

export interface Theme {
  id: ThemeId;
  name: string;
  background: string;
  foreground: string;
  card: string;
  primary: string;
  secondary: string;
  muted: string;
  mutedForeground: string;
  border: string;
}

export type UIScale = 0.8 | 0.9 | 1.0 | 1.1 | 1.2;
export type Language = 'en' | 'ja' | 'zh' | 'ko' | 'de' | 'fr' | 'es';
export type TerminalFont = 'jetbrains-mono' | 'fira-code' | 'cascadia-code' | 'source-code-pro' | 'menlo' | 'share-tech-mono' | 'vt323' | 'ocr-a' | 'reggae-one';

export interface IntegrationSettings {
  trayCompanion: {
    launchOnStartup: boolean;
  };
}

// Graphiti Observability Hub Settings
export type GraphitiRetentionPeriod = '1h' | '24h' | '7d' | 'unlimited';

export interface GraphitiSettings {
  enabled: boolean;              // Opt-in toggle (default: false)
  retention: GraphitiRetentionPeriod;
}

export interface AppSettings {
  theme: ThemeId;
  uiScale: UIScale;
  language: Language;
  terminalFont: TerminalFont;
  terminalFontSize: number;
  checkUpdatesOnStartup: boolean;
  showWelcomeOnStartup: boolean;
  enableAnimations: boolean;
  matrixRainOpacity: number; // 0-100, only used when Matrix theme active
  kuroryuuDecorativeFrames: boolean; // Opt-in decorative dragon frames for Kuroryuu theme
  enableRichToolVisualizations: boolean; // Opt-in rich visualization cards for MCP tool outputs
  integrations: IntegrationSettings;
  graphiti: GraphitiSettings;
}

// ============================================================================
// Project Settings Types
// ============================================================================

export type OAuthProvider = 'github' | 'gitlab' | 'bitbucket';

export interface OAuthConfig {
  provider: OAuthProvider;
  connected: boolean;
  username?: string;
  scopes?: string[];
  connectedAt?: number;
}

export interface MCPServerOverride {
  id: string;
  name: string;
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
}

export interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface ProjectSettings {
  projectName: string;
  projectPath: string;
  oauth: OAuthConfig[];
  mcpServers: MCPServerOverride[];
  envVariables: EnvVariable[];
  gitRemote?: string;
  defaultBranch: string;
}

// ============================================================================
// Claude Profiles Types
// ============================================================================

export interface RateLimitInfo {
  requestsPerMinute: number;
  tokensPerMinute: number;
  tokensPerDay: number;
  currentUsage: {
    requests: number;
    tokens: number;
    resetAt: number;
  };
}

export interface ClaudeProfile {
  id: string;
  name: string;
  apiKey: string; // Masked in UI
  isDefault: boolean;
  provider: 'anthropic' | 'aws-bedrock' | 'gcp-vertex';
  rateLimit?: RateLimitInfo;
  createdAt: number;
  lastUsed?: number;
}

// ============================================================================
// Model Config Types
// ============================================================================

export type AgentPhase = 'spec' | 'planning' | 'coding' | 'qa' | 'insights' | 'ideation' | 'roadmap' | 'utility';
export type ThinkingLevel = 'none' | 'basic' | 'deep';

export interface ModelSelection {
  modelId: string;
  modelName: string;
  thinkingLevel: ThinkingLevel;
  temperature: number;
  maxTokens: number;
}

export interface PhaseModelConfig {
  phase: AgentPhase;
  label: string;
  description: string;
  model: ModelSelection;
}

// ============================================================================
// Theme Definitions
// ============================================================================

export const THEMES: Theme[] = [
  {
    id: 'oscura-midnight',
    name: 'Oscura Midnight',
    background: '#0B0B0F',
    foreground: '#E6E6E6',
    card: '#121216',
    primary: '#D6D876',
    secondary: '#1A1A1F',
    muted: '#1A1A1F',
    mutedForeground: '#868F97',
    border: '#232323',
  },
  {
    id: 'dusk',
    name: 'Dusk',
    background: '#131419',
    foreground: '#E6E6E6',
    card: '#1A1B22',
    primary: '#F0A868',
    secondary: '#1E1F26',
    muted: '#1E1F26',
    mutedForeground: '#8B8D94',
    border: '#2A2B32',
  },
  {
    id: 'lime',
    name: 'Lime',
    background: '#0D0F0D',
    foreground: '#E6E6E6',
    card: '#141814',
    primary: '#84CC16',
    secondary: '#1A1E1A',
    muted: '#1A1E1A',
    mutedForeground: '#7C8B7C',
    border: '#252D25',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    background: '#0B0D12',
    foreground: '#E6E6E6',
    card: '#111318',
    primary: '#0284C7',
    secondary: '#161A20',
    muted: '#161A20',
    mutedForeground: '#7B8A9A',
    border: '#1E2430',
  },
  {
    id: 'retro',
    name: 'Retro',
    background: '#100D0B',
    foreground: '#E6E6E6',
    card: '#181412',
    primary: '#D97706',
    secondary: '#1E1916',
    muted: '#1E1916',
    mutedForeground: '#9A8B7C',
    border: '#2D2520',
  },
  {
    id: 'neo',
    name: 'Neo',
    background: '#0F0B12',
    foreground: '#E6E6E6',
    card: '#161119',
    primary: '#D946EF',
    secondary: '#1C151F',
    muted: '#1C151F',
    mutedForeground: '#8B7C94',
    border: '#2A2030',
  },
  {
    id: 'forest',
    name: 'Forest',
    background: '#0A0D0A',
    foreground: '#E6E6E6',
    card: '#10140F',
    primary: '#16A34A',
    secondary: '#151A14',
    muted: '#151A14',
    mutedForeground: '#7A8B78',
    border: '#1F2A1D',
  },
  {
    id: 'matrix',
    name: 'Matrix',
    background: '#0D0208',
    foreground: '#00FF41',
    card: '#0D0208',
    primary: '#00FF41',
    secondary: '#003B00',
    muted: '#003B00',
    mutedForeground: '#008F11',
    border: '#003B00',
  },
  {
    id: 'grunge',
    name: 'Grunge',
    background: '#0a0908',
    foreground: '#e8e2dc',
    card: '#1a1715',
    primary: '#d4c4b0',
    secondary: '#2d2825',
    muted: '#3d3835',
    mutedForeground: '#8a8078',
    border: '#2a2522',
  },
  {
    id: 'kuroryuu',
    name: 'Kuroryuu',
    background: '#0a0a0c',
    foreground: '#e8d5b5',
    card: '#12100e',
    primary: '#c9a227',
    secondary: '#1a1614',
    muted: '#2a2420',
    mutedForeground: '#9a8a6a',
    border: '#3a3028',
  },
];

export const UI_SCALE_OPTIONS: { value: UIScale; label: string }[] = [
  { value: 0.8, label: '80%' },
  { value: 0.9, label: '90%' },
  { value: 1.0, label: '100%' },
  { value: 1.1, label: '110%' },
  { value: 1.2, label: '120%' },
];

export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'ko', label: '한국어' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
];

export const TERMINAL_FONT_OPTIONS: { value: TerminalFont; label: string }[] = [
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
  { value: 'fira-code', label: 'Fira Code' },
  { value: 'cascadia-code', label: 'Cascadia Code' },
  { value: 'source-code-pro', label: 'Source Code Pro' },
  { value: 'menlo', label: 'Menlo' },
  { value: 'share-tech-mono', label: 'Share Tech Mono' },
  { value: 'vt323', label: 'VT323 (Matrix)' },
  { value: 'ocr-a', label: 'OCR-A (Matrix)' },
  { value: 'reggae-one', label: 'Reggae One (Kuroryuu)' },
];

export const AGENT_PHASE_CONFIG: Record<AgentPhase, { label: string; description: string }> = {
  'spec': { label: 'Spec Generation', description: 'Creates detailed task specifications' },
  'planning': { label: 'Planning', description: 'Breaks down tasks into subtasks' },
  'coding': { label: 'Coding', description: 'Implements code changes' },
  'qa': { label: 'QA & Review', description: 'Tests and reviews code' },
  'insights': { label: 'Insights', description: 'General chat and questions' },
  'ideation': { label: 'Ideation', description: 'Brainstorming and idea generation' },
  'roadmap': { label: 'Roadmap', description: 'Project planning and milestones' },
  'utility': { label: 'Utility', description: 'Helper tasks and automation' },
};

export const AVAILABLE_MODELS = [
  // Claude family (4)
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
  // OpenAI family (5)
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'o1-preview', name: 'o1 Preview' },
  { id: 'o1-mini', name: 'o1 Mini' },
  // Gemini family (3)
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  // Qwen family (1)
  { id: 'qwen-coder', name: 'Qwen Coder' },
];
