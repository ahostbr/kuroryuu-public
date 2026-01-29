/**
 * Types for Onboarding Wizard
 * 8-step setup flow: Welcome → AuthMethod → Auth → CLI → DevTools → Privacy → Memory → Completion
 */

// ============================================================================
// Step Types
// ============================================================================

export type OnboardingStep =
  | 'welcome'
  | 'auth-method'
  | 'auth'
  | 'cli'
  | 'dev-tools'
  | 'privacy'
  | 'memory'
  | 'completion';

export const ONBOARDING_STEPS: OnboardingStep[] = [
  'welcome',
  'auth-method',
  'auth',
  'cli',
  'dev-tools',
  'privacy',
  'memory',
  'completion',
];

export interface StepInfo {
  id: OnboardingStep;
  title: string;
  description: string;
  required: boolean;
  canSkip: boolean;
}

export const STEP_INFO: Record<OnboardingStep, StepInfo> = {
  welcome: {
    id: 'welcome',
    title: 'Welcome',
    description: 'Get started with Kuroryuu',
    required: true,
    canSkip: false,
  },
  'auth-method': {
    id: 'auth-method',
    title: 'Authentication Method',
    description: 'Choose how to connect',
    required: true,
    canSkip: false,
  },
  auth: {
    id: 'auth',
    title: 'Authentication',
    description: 'Connect your account',
    required: false,  // Not required when using local LLM
    canSkip: true,
  },
  cli: {
    id: 'cli',
    title: 'Claude CLI',
    description: 'Install command line tools',
    required: false,
    canSkip: true,
  },
  'dev-tools': {
    id: 'dev-tools',
    title: 'Development Tools',
    description: 'Configure your IDE and terminal',
    required: false,
    canSkip: true,
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy',
    description: 'Review privacy settings',
    required: true,
    canSkip: false,
  },
  memory: {
    id: 'memory',
    title: 'Memory',
    description: 'Configure AI memory (Graphiti)',
    required: false,
    canSkip: true,
  },
  completion: {
    id: 'completion',
    title: 'Complete',
    description: 'Setup finished',
    required: true,
    canSkip: false,
  },
};

// ============================================================================
// Auth Types
// ============================================================================

/** Authentication method - includes local LLM option for LM Studio */
export type AuthMethod = 'oauth' | 'api-key' | 'local-llm';

export interface OAuthState {
  provider: 'anthropic';
  status: 'idle' | 'connecting' | 'connected' | 'error';
  email?: string;
  error?: string;
}

export interface ApiKeyState {
  key: string;
  status: 'idle' | 'testing' | 'valid' | 'invalid';
  error?: string;
}

// ============================================================================
// CLI Types
// ============================================================================

export interface CLIInstallStatus {
  installed: boolean;
  version?: string;
  path?: string;
  checking: boolean;
}

// ============================================================================
// Dev Tools Types
// ============================================================================

export type IDE = 
  | 'vscode'
  | 'cursor'
  | 'windsurf'
  | 'zed'
  | 'neovim'
  | 'jetbrains'
  | 'sublime'
  | 'other';

export type Terminal =
  | 'default'
  | 'iterm'
  | 'warp'
  | 'alacritty'
  | 'hyper'
  | 'kitty'
  | 'windows-terminal'
  | 'cmd';

export interface DevToolsConfig {
  preferredIDE: IDE;
  preferredTerminal: Terminal;
  detectAutomatically: boolean;
}

// ============================================================================
// Privacy Types
// ============================================================================

export interface PrivacyConfig {
  sendErrorReports: boolean;
  sendUsageAnalytics: boolean;
  shareAnonymousData: boolean;
  acceptedTerms: boolean;
  acceptedPrivacyPolicy: boolean;
}

// ============================================================================
// Memory Types (Graphiti)
// ============================================================================

export interface MemoryConfig {
  enabled: boolean;
  graphitiEndpoint?: string;
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
  autoSyncConversations: boolean;
  maxMemoryNodes: number;
}

// ============================================================================
// Complete Onboarding State
// ============================================================================

export interface OnboardingState {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  authMethod: AuthMethod | null;
  oauth: OAuthState;
  apiKey: ApiKeyState;
  cli: CLIInstallStatus;
  devTools: DevToolsConfig;
  privacy: PrivacyConfig;
  memory: MemoryConfig;
  isComplete: boolean;
}

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  currentStep: 'welcome',
  completedSteps: [],
  authMethod: null,
  oauth: {
    provider: 'anthropic',
    status: 'idle',
  },
  apiKey: {
    key: '',
    status: 'idle',
  },
  cli: {
    installed: false,
    checking: false,
  },
  devTools: {
    preferredIDE: 'vscode',
    preferredTerminal: 'default',
    detectAutomatically: true,
  },
  privacy: {
    sendErrorReports: true,
    sendUsageAnalytics: false,
    shareAnonymousData: false,
    acceptedTerms: false,
    acceptedPrivacyPolicy: false,
  },
  memory: {
    enabled: false,
    autoSyncConversations: false,
    maxMemoryNodes: 1000,
  },
  isComplete: false,
};
