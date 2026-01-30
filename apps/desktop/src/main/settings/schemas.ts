/**
 * Settings Schemas - TypeScript interfaces and defaults for unified settings
 *
 * Settings are divided into two scopes:
 * - User-scoped: Global preferences stored in %APPDATA%/Kuroryuu/settings.json
 * - Project-scoped: Per-project settings stored in {project}/ai/settings/app-settings.json
 */

// ============================================================================
// User-Scoped Settings (Global)
// ============================================================================

export interface LayoutSettings {
  gridLayout: 'auto' | '2x2' | '3x3';
  layoutMode: 'grid' | 'splitter' | 'window';
}

export interface UISettings {
  theme: string;
  uiScale: number;
  language: string;
  enableAnimations: boolean;
  matrixRainOpacity: number;
  showWelcomeOnStartup: boolean;
  checkUpdatesOnStartup: boolean;
  layout: LayoutSettings;
}

export interface TerminalSettings {
  font: string;
  fontSize: number;
}

export interface IntegrationSettings {
  trayCompanion: {
    launchOnStartup: boolean;
  };
}

export interface UserSettings {
  ui: UISettings;
  terminal: TerminalSettings;
  integrations: IntegrationSettings;
  _version: number;
  _migratedAt?: number;
}

// ============================================================================
// Project-Scoped Settings
// ============================================================================

export interface MicSettings {
  silenceThreshold: number;
  voiceThreshold: number;
  silenceTimeoutMs: number;
  sttEngine: 'whisper' | 'google';
}

export interface TTSSettings {
  enabled: boolean;
  voice: string;
  rate: number;
  volume: number;
  backend: 'system' | 'elevenlabs';
}

export interface AudioSettings {
  mic: MicSettings;
  tts: TTSSettings;
}

export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentSettings {
  isSetupComplete: boolean;
  leaderAgent: AgentConfig | null;
  workerAgents: AgentConfig[];
}

export interface GraphitiSettings {
  enabled: boolean;
  serverUrl: string;
  autoSync: boolean;
}

export interface ProjectSettings {
  audio: AudioSettings;
  agents: AgentSettings;
  graphiti: GraphitiSettings;
  _version: number;
  _migratedAt?: number;
}

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_USER_SETTINGS: UserSettings = {
  ui: {
    theme: 'oscura-midnight',
    uiScale: 1.0,
    language: 'en',
    enableAnimations: true,
    matrixRainOpacity: 40,
    showWelcomeOnStartup: true,
    checkUpdatesOnStartup: true,
    layout: {
      gridLayout: 'auto',
      layoutMode: 'grid',
    },
  },
  terminal: {
    font: 'jetbrains-mono',
    fontSize: 14,
  },
  integrations: {
    trayCompanion: {
      launchOnStartup: false,
    },
  },
  _version: 1,
};

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  audio: {
    mic: {
      silenceThreshold: 0.12,
      voiceThreshold: 0.25,
      silenceTimeoutMs: 1500,
      sttEngine: 'whisper',
    },
    tts: {
      enabled: false,
      voice: 'default',
      rate: 1.0,
      volume: 1.0,
      backend: 'system',
    },
  },
  agents: {
    isSetupComplete: false,
    leaderAgent: null,
    workerAgents: [],
  },
  graphiti: {
    enabled: false,
    serverUrl: 'http://localhost:8000',
    autoSync: false,
  },
  _version: 1,
};

// ============================================================================
// Settings Store Schemas (for electron-store)
// ============================================================================

export type SettingsNamespace =
  | 'ui'
  | 'ui.theme'
  | 'ui.uiScale'
  | 'ui.language'
  | 'ui.enableAnimations'
  | 'ui.layout'
  | 'ui.layout.gridLayout'
  | 'ui.layout.layoutMode'
  | 'terminal'
  | 'terminal.font'
  | 'terminal.fontSize'
  | 'audio'
  | 'audio.mic'
  | 'audio.tts'
  | 'agents'
  | 'graphiti'
  | 'graphiti.enabled'
  | 'graphiti.serverUrl'
  | 'graphiti.autoSync';

export type SettingsScope = 'user' | 'project';

export interface SettingsChangeEvent {
  namespace: string;
  value: unknown;
  scope: SettingsScope;
  timestamp: number;
}
