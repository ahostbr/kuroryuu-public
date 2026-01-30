/**
 * Zustand store for Settings
 * Manages app settings, project settings, Claude profiles, and model config
 * v2: Added Reggae One font auto-selection for Kuroryuu theme
 */

import { create } from 'zustand';
import type {
  AppSettings,
  ProjectSettings,
  ClaudeProfile,
  PhaseModelConfig,
  ThemeId,
  UIScale,
  Language,
  TerminalFont,
  OAuthProvider,
  MCPServerOverride,
  EnvVariable,
  AgentPhase,
  ThinkingLevel,
  GraphitiRetentionPeriod,
} from '../types/settings';
import { AGENT_PHASE_CONFIG } from '../types/settings';

// Type guards for settings loaded from IPC
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number';
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isThemeId = (v: unknown): v is ThemeId => isString(v) && ['base', 'hacker', 'minimal', 'kuroryuu'].includes(v);
const isUIScale = (v: unknown): v is UIScale => isNumber(v) && [0.8, 0.9, 1, 1.1, 1.2].includes(v);
const isLanguage = (v: unknown): v is Language => isString(v) && ['en', 'ja', 'pt-BR'].includes(v);
const isTerminalFont = (v: unknown): v is TerminalFont => isString(v) && ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Monaco', 'Menlo', 'Consolas'].includes(v);
const isGraphitiRetention = (v: unknown): v is GraphitiRetentionPeriod => isString(v) && ['7d', '30d', '90d', 'forever'].includes(v);

type SettingsDialog = 'app' | 'project' | 'claude-profiles' | 'model-config' | 'domain-config' | 'integrations' | null;

interface SettingsState {
  // Dialog state
  activeDialog: SettingsDialog;
  openDialog: (dialog: SettingsDialog) => void;
  closeDialog: () => void;

  // App Settings
  appSettings: AppSettings;
  setTheme: (theme: ThemeId) => void;
  setUIScale: (scale: UIScale) => void;
  setLanguage: (lang: Language) => void;
  setTerminalFont: (font: TerminalFont) => void;
  setTerminalFontSize: (size: number) => void;
  setCheckUpdates: (enabled: boolean) => void;
  setShowWelcome: (enabled: boolean) => void;
  setEnableAnimations: (enabled: boolean) => void;
  setMatrixRainOpacity: (opacity: number) => void;
  setKuroryuuDecorativeFrames: (enabled: boolean) => void;
  setTrayCompanionLaunchOnStartup: (enabled: boolean) => void;
  setGraphitiEnabled: (enabled: boolean) => void;
  setGraphitiRetention: (retention: GraphitiRetentionPeriod) => void;

  // Project Settings
  projectSettings: ProjectSettings;
  connectOAuth: (provider: OAuthProvider) => Promise<void>;
  disconnectOAuth: (provider: OAuthProvider) => void;
  addMCPServer: (server: Omit<MCPServerOverride, 'id'>) => void;
  updateMCPServer: (id: string, updates: Partial<MCPServerOverride>) => void;
  removeMCPServer: (id: string) => void;
  addEnvVariable: (variable: Omit<EnvVariable, 'key'> & { key: string }) => void;
  updateEnvVariable: (key: string, updates: Partial<EnvVariable>) => void;
  removeEnvVariable: (key: string) => void;
  setProjectPath: (path: string) => void;

  // Claude Profiles
  claudeProfiles: ClaudeProfile[];
  addClaudeProfile: (profile: Omit<ClaudeProfile, 'id' | 'createdAt'>) => void;
  updateClaudeProfile: (id: string, updates: Partial<ClaudeProfile>) => void;
  removeClaudeProfile: (id: string) => void;
  setDefaultProfile: (id: string) => void;

  // Model Config
  modelConfigs: PhaseModelConfig[];
  updatePhaseModel: (phase: AgentPhase, updates: Partial<PhaseModelConfig['model']>) => void;

  // Persistence
  saveSettings: () => Promise<void>;
  loadSettings: () => Promise<void>;
}

// Default app settings
const defaultAppSettings: AppSettings = {
  theme: 'oscura-midnight',
  uiScale: 1.0,
  language: 'en',
  terminalFont: 'jetbrains-mono',
  terminalFontSize: 14,
  checkUpdatesOnStartup: true,
  showWelcomeOnStartup: true,
  enableAnimations: true,
  matrixRainOpacity: 40,
  kuroryuuDecorativeFrames: false, // Opt-in decorative dragon frames
  integrations: {
    trayCompanion: {
      launchOnStartup: false,
    },
  },
  graphiti: {
    enabled: false,  // IMPORTANT: Opt-in only, default disabled
    retention: '24h',
  },
};

// Default project settings (projectPath loaded from main process at runtime)
const defaultProjectSettings: ProjectSettings = {
  projectName: 'Kuroryuu',
  projectPath: '', // Will be set from main process via IPC
  oauth: [
    { provider: 'github', connected: false },
    { provider: 'gitlab', connected: false },
    { provider: 'bitbucket', connected: false },
  ],
  mcpServers: [
    { id: 'mcp-1', name: 'SOTS Intel', enabled: true, endpoint: 'http://localhost:8765' },
    { id: 'mcp-2', name: 'SOTS Operatio', enabled: true, endpoint: 'http://localhost:8766' },
  ],
  envVariables: [
    { key: 'NODE_ENV', value: 'development', isSecret: false },
    { key: 'ANTHROPIC_API_KEY', value: '••••••••', isSecret: true },
  ],
  gitRemote: 'https://github.com/user/kuroryuu.git',
  defaultBranch: 'main',
};

// Default Claude profiles
const defaultClaudeProfiles: ClaudeProfile[] = [
  {
    id: 'profile-1',
    name: 'Default',
    apiKey: 'sk-ant-••••••••',
    isDefault: true,
    provider: 'anthropic',
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 100000,
      tokensPerDay: 1000000,
      currentUsage: { requests: 12, tokens: 24500, resetAt: Date.now() + 3600000 },
    },
    createdAt: Date.now() - 86400000 * 30,
    lastUsed: Date.now() - 3600000,
  },
  {
    id: 'profile-2',
    name: 'Work Account',
    apiKey: 'sk-ant-••••••••',
    isDefault: false,
    provider: 'anthropic',
    rateLimit: {
      requestsPerMinute: 120,
      tokensPerMinute: 200000,
      tokensPerDay: 5000000,
      currentUsage: { requests: 5, tokens: 8200, resetAt: Date.now() + 3600000 },
    },
    createdAt: Date.now() - 86400000 * 15,
    lastUsed: Date.now() - 86400000,
  },
];

// Default model configs per phase
const defaultModelConfigs: PhaseModelConfig[] = Object.entries(AGENT_PHASE_CONFIG).map(([phase, config]) => ({
  phase: phase as AgentPhase,
  label: config.label,
  description: config.description,
  model: {
    modelId: phase === 'coding' || phase === 'qa' ? 'claude-sonnet-4-20250514' : 'claude-3-5-sonnet-20241022',
    modelName: phase === 'coding' || phase === 'qa' ? 'Claude Sonnet 4' : 'Claude 3.5 Sonnet',
    thinkingLevel: phase === 'coding' ? 'deep' : phase === 'qa' ? 'basic' : 'none',
    temperature: phase === 'ideation' ? 0.9 : 0.7,
    maxTokens: phase === 'coding' ? 8192 : 4096,
  },
}));

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // Dialog state
  activeDialog: null,
  openDialog: (dialog) => set({ activeDialog: dialog }),
  closeDialog: () => set({ activeDialog: null }),

  // App Settings
  appSettings: defaultAppSettings,
  setTheme: (theme) => {
    // Auto-select appropriate font for specific themes
    let terminalFont = get().appSettings.terminalFont;
    if (theme === 'kuroryuu' && terminalFont !== 'reggae-one') {
      terminalFont = 'reggae-one';
    } else if (theme === 'matrix' && !['share-tech-mono', 'vt323', 'ocr-a'].includes(terminalFont)) {
      terminalFont = 'share-tech-mono';
    }
    set((s) => ({ appSettings: { ...s.appSettings, theme, terminalFont } }));
    // Persist to electron-store
    window.electronAPI?.settings?.set?.('ui.theme', theme).catch(console.error);
    window.electronAPI?.settings?.set?.('terminal.font', terminalFont).catch(console.error);
  },
  setUIScale: (uiScale) => {
    set((s) => ({ appSettings: { ...s.appSettings, uiScale } }));
    window.electronAPI?.settings?.set?.('ui.uiScale', uiScale).catch(console.error);
  },
  setLanguage: (language) => {
    set((s) => ({ appSettings: { ...s.appSettings, language } }));
    window.electronAPI?.settings?.set?.('ui.language', language).catch(console.error);
  },
  setTerminalFont: (terminalFont) => {
    set((s) => ({ appSettings: { ...s.appSettings, terminalFont } }));
    window.electronAPI?.settings?.set?.('terminal.font', terminalFont).catch(console.error);
  },
  setTerminalFontSize: (terminalFontSize) => {
    set((s) => ({ appSettings: { ...s.appSettings, terminalFontSize } }));
    window.electronAPI?.settings?.set?.('terminal.fontSize', terminalFontSize).catch(console.error);
  },
  setCheckUpdates: (checkUpdatesOnStartup) => {
    set((s) => ({ appSettings: { ...s.appSettings, checkUpdatesOnStartup } }));
    window.electronAPI?.settings?.set?.('ui.checkUpdatesOnStartup', checkUpdatesOnStartup).catch(console.error);
  },
  setShowWelcome: (showWelcomeOnStartup) => {
    set((s) => ({ appSettings: { ...s.appSettings, showWelcomeOnStartup } }));
    window.electronAPI?.settings?.set?.('ui.showWelcomeOnStartup', showWelcomeOnStartup).catch(console.error);
  },
  setEnableAnimations: (enableAnimations) => {
    set((s) => ({ appSettings: { ...s.appSettings, enableAnimations } }));
    window.electronAPI?.settings?.set?.('ui.enableAnimations', enableAnimations).catch(console.error);
  },
  setMatrixRainOpacity: (matrixRainOpacity) => {
    set((s) => ({ appSettings: { ...s.appSettings, matrixRainOpacity } }));
    window.electronAPI?.settings?.set?.('ui.matrixRainOpacity', matrixRainOpacity).catch(console.error);
  },
  setKuroryuuDecorativeFrames: (_kuroryuuDecorativeFrames) => {
    // DISABLED: Feature not fully polished, force to false
    set((s) => ({ appSettings: { ...s.appSettings, kuroryuuDecorativeFrames: false } }));
    window.electronAPI?.settings?.set?.('ui.kuroryuuDecorativeFrames', false).catch(console.error);
  },
  setTrayCompanionLaunchOnStartup: (enabled) => {
    set((s) => ({
      appSettings: {
        ...s.appSettings,
        integrations: {
          ...s.appSettings.integrations,
          trayCompanion: {
            ...s.appSettings.integrations.trayCompanion,
            launchOnStartup: enabled,
          },
        },
      },
    }));
    // Persist to electron-store so main process respects it on startup
    window.electronAPI?.settings?.set?.('integrations.trayCompanion.launchOnStartup', enabled).catch(console.error);
  },
  setGraphitiEnabled: (enabled) => {
    set((s) => ({
      appSettings: {
        ...s.appSettings,
        graphiti: { ...s.appSettings.graphiti, enabled },
      },
    }));
    window.electronAPI?.settings?.set?.('graphiti.enabled', enabled).catch(console.error);
  },
  setGraphitiRetention: (retention) => {
    set((s) => ({
      appSettings: {
        ...s.appSettings,
        graphiti: { ...s.appSettings.graphiti, retention },
      },
    }));
    window.electronAPI?.settings?.set?.('graphiti.retention', retention).catch(console.error);
  },

  // Project Settings
  projectSettings: defaultProjectSettings,
  
  connectOAuth: async (provider) => {
    // Simulate OAuth flow
    await new Promise((r) => setTimeout(r, 1000));
    set((s) => ({
      projectSettings: {
        ...s.projectSettings,
        oauth: s.projectSettings.oauth.map((o) =>
          o.provider === provider
            ? { ...o, connected: true, username: 'user123', connectedAt: Date.now() }
            : o
        ),
      },
    }));
  },
  
  disconnectOAuth: (provider) => {
    set((s) => ({
      projectSettings: {
        ...s.projectSettings,
        oauth: s.projectSettings.oauth.map((o) =>
          o.provider === provider
            ? { ...o, connected: false, username: undefined, connectedAt: undefined }
            : o
        ),
      },
    }));
  },
  
  addMCPServer: (server) => {
    const newServer: MCPServerOverride = { ...server, id: `mcp-${Date.now()}` };
    set((s) => ({
      projectSettings: {
        ...s.projectSettings,
        mcpServers: [...s.projectSettings.mcpServers, newServer],
      },
    }));
  },
  
  updateMCPServer: (id, updates) => {
    set((s) => ({
      projectSettings: {
        ...s.projectSettings,
        mcpServers: s.projectSettings.mcpServers.map((m) =>
          m.id === id ? { ...m, ...updates } : m
        ),
      },
    }));
  },
  
  removeMCPServer: (id) => {
    set((s) => ({
      projectSettings: {
        ...s.projectSettings,
        mcpServers: s.projectSettings.mcpServers.filter((m) => m.id !== id),
      },
    }));
  },
  
  addEnvVariable: (variable) => {
    set((s) => ({
      projectSettings: {
        ...s.projectSettings,
        envVariables: [...s.projectSettings.envVariables, variable],
      },
    }));
  },
  
  updateEnvVariable: (key, updates) => {
    set((s) => ({
      projectSettings: {
        ...s.projectSettings,
        envVariables: s.projectSettings.envVariables.map((e) =>
          e.key === key ? { ...e, ...updates } : e
        ),
      },
    }));
  },
  
  removeEnvVariable: (key) => {
    set((s) => ({
      projectSettings: {
        ...s.projectSettings,
        envVariables: s.projectSettings.envVariables.filter((e) => e.key !== key),
      },
    }));
  },

  setProjectPath: (projectPath) => {
    set((s) => ({
      projectSettings: {
        ...s.projectSettings,
        projectPath,
      },
    }));
  },

  // Claude Profiles
  claudeProfiles: defaultClaudeProfiles,
  
  addClaudeProfile: (profile) => {
    const newProfile: ClaudeProfile = {
      ...profile,
      id: `profile-${Date.now()}`,
      createdAt: Date.now(),
    };
    set((s) => ({ claudeProfiles: [...s.claudeProfiles, newProfile] }));
  },
  
  updateClaudeProfile: (id, updates) => {
    set((s) => ({
      claudeProfiles: s.claudeProfiles.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
  },
  
  removeClaudeProfile: (id) => {
    set((s) => ({
      claudeProfiles: s.claudeProfiles.filter((p) => p.id !== id),
    }));
  },
  
  setDefaultProfile: (id) => {
    set((s) => ({
      claudeProfiles: s.claudeProfiles.map((p) => ({
        ...p,
        isDefault: p.id === id,
      })),
    }));
  },

  // Model Config
  modelConfigs: defaultModelConfigs,
  
  updatePhaseModel: (phase, updates) => {
    set((s) => ({
      modelConfigs: s.modelConfigs.map((c) =>
        c.phase === phase ? { ...c, model: { ...c.model, ...updates } } : c
      ),
    }));
  },

  // Persistence (mock)
  saveSettings: async () => {
    console.log('Saving settings...', get());
    await new Promise((r) => setTimeout(r, 500));
  },
  
  loadSettings: async () => {
    console.log('[settings-store] Loading settings from electron-store...');
    try {
      // Load all persisted app settings via IPC
      const [
        theme,
        uiScale,
        language,
        terminalFont,
        terminalFontSize,
        checkUpdatesOnStartup,
        showWelcomeOnStartup,
        enableAnimations,
        matrixRainOpacity,
        kuroryuuDecorativeFrames,
        trayCompanionLaunchOnStartup,
        graphitiEnabled,
        graphitiRetention,
      ] = await Promise.all([
        window.electronAPI?.settings?.get?.('ui.theme'),
        window.electronAPI?.settings?.get?.('ui.uiScale'),
        window.electronAPI?.settings?.get?.('ui.language'),
        window.electronAPI?.settings?.get?.('ui.terminalFont'),
        window.electronAPI?.settings?.get?.('ui.terminalFontSize'),
        window.electronAPI?.settings?.get?.('behavior.checkUpdatesOnStartup'),
        window.electronAPI?.settings?.get?.('behavior.showWelcomeOnStartup'),
        window.electronAPI?.settings?.get?.('ui.enableAnimations'),
        window.electronAPI?.settings?.get?.('ui.matrixRainOpacity'),
        window.electronAPI?.settings?.get?.('ui.kuroryuuDecorativeFrames'),
        window.electronAPI?.settings?.get?.('integrations.trayCompanion.launchOnStartup'),
        window.electronAPI?.settings?.get?.('graphiti.enabled'),
        window.electronAPI?.settings?.get?.('graphiti.retention'),
      ]);

      // Merge loaded values with defaults (only override if value is valid type)
      set((state) => {
        const newSettings = { ...state.appSettings };
        if (isThemeId(theme)) newSettings.theme = theme;
        if (isUIScale(uiScale)) newSettings.uiScale = uiScale;
        if (isLanguage(language)) newSettings.language = language;
        if (isTerminalFont(terminalFont)) newSettings.terminalFont = terminalFont;
        if (isNumber(terminalFontSize)) newSettings.terminalFontSize = terminalFontSize;
        if (isBoolean(checkUpdatesOnStartup)) newSettings.checkUpdatesOnStartup = checkUpdatesOnStartup;
        if (isBoolean(showWelcomeOnStartup)) newSettings.showWelcomeOnStartup = showWelcomeOnStartup;
        if (isBoolean(enableAnimations)) newSettings.enableAnimations = enableAnimations;
        if (isNumber(matrixRainOpacity)) newSettings.matrixRainOpacity = matrixRainOpacity;
        if (isBoolean(kuroryuuDecorativeFrames)) newSettings.kuroryuuDecorativeFrames = kuroryuuDecorativeFrames;
        if (isBoolean(trayCompanionLaunchOnStartup)) {
          newSettings.integrations = {
            ...newSettings.integrations,
            trayCompanion: { ...newSettings.integrations.trayCompanion, launchOnStartup: trayCompanionLaunchOnStartup },
          };
        }
        if (isBoolean(graphitiEnabled) || isGraphitiRetention(graphitiRetention)) {
          newSettings.graphiti = { ...newSettings.graphiti };
          if (isBoolean(graphitiEnabled)) newSettings.graphiti.enabled = graphitiEnabled;
          if (isGraphitiRetention(graphitiRetention)) newSettings.graphiti.retention = graphitiRetention;
        }
        return { appSettings: newSettings };
      });

      console.log('[settings-store] Settings loaded successfully');
    } catch (err) {
      console.error('[settings-store] Failed to load settings:', err);
    }
  },
}));
