/**
 * Settings Migration - One-time migration from localStorage to electron-store
 *
 * Handles migration from:
 * - Zustand persist format (kuroryuu-* keys)
 * - Direct localStorage (kuroryuu-mic-settings, etc.)
 */

import { getSettingsService } from './settings-service';
import {
  UserSettings,
  ProjectSettings,
  DEFAULT_USER_SETTINGS,
  DEFAULT_PROJECT_SETTINGS,
} from './schemas';

export interface MigrationResult {
  success: boolean;
  migrated: string[];
  errors: string[];
  skipped: string[];
}

/**
 * Known localStorage keys and their mappings to new settings
 */
const MIGRATION_MAP: Record<string, { scope: 'user' | 'project'; namespace: string; transform?: (value: unknown) => unknown }> = {
  // Mic settings (direct localStorage)
  'kuroryuu-mic-settings': {
    scope: 'project',
    namespace: 'audio.mic',
    transform: (value) => {
      // Direct JSON object, just validate
      if (typeof value === 'object' && value !== null) {
        const v = value as Record<string, unknown>;
        return {
          silenceThreshold: v.silenceThreshold ?? DEFAULT_PROJECT_SETTINGS.audio.mic.silenceThreshold,
          voiceThreshold: v.voiceThreshold ?? DEFAULT_PROJECT_SETTINGS.audio.mic.voiceThreshold,
          silenceTimeoutMs: v.silenceTimeoutMs ?? DEFAULT_PROJECT_SETTINGS.audio.mic.silenceTimeoutMs,
          sttEngine: v.sttEngine ?? DEFAULT_PROJECT_SETTINGS.audio.mic.sttEngine,
        };
      }
      return DEFAULT_PROJECT_SETTINGS.audio.mic;
    },
  },

  // Agent config store (Zustand persist format)
  'kuroryuu-agent-config': {
    scope: 'project',
    namespace: 'agents',
    transform: (value) => {
      // Zustand persist format: { state: { ... }, version: 0 }
      if (typeof value === 'object' && value !== null) {
        const v = value as Record<string, unknown>;
        const state = (v.state || v) as Record<string, unknown>;
        return {
          isSetupComplete: state.isSetupComplete ?? false,
          leaderAgent: state.leaderAgent ?? null,
          workerAgents: state.workerAgents ?? [],
        };
      }
      return DEFAULT_PROJECT_SETTINGS.agents;
    },
  },

  // Onboarding store (Zustand persist format)
  'kuroryuu-onboarding': {
    scope: 'project',
    namespace: 'onboarding',
    transform: (value) => {
      if (typeof value === 'object' && value !== null) {
        const v = value as Record<string, unknown>;
        const state = (v.state || v) as Record<string, unknown>;
        return {
          completedSteps: Array.isArray(state.completedSteps) ? state.completedSteps : [],
          currentStep: state.currentStep ?? null,
          isComplete: state.isComplete ?? false,
        };
      }
      return DEFAULT_PROJECT_SETTINGS.onboarding;
    },
  },

  // App settings (Zustand persist format)
  'kuroryuu-settings': {
    scope: 'user',
    namespace: 'ui',
    transform: (value) => {
      if (typeof value === 'object' && value !== null) {
        const v = value as Record<string, unknown>;
        const state = (v.state || v) as Record<string, unknown>;
        const appSettings = (state.appSettings || state) as Record<string, unknown>;
        return {
          theme: appSettings.theme ?? DEFAULT_USER_SETTINGS.ui.theme,
          uiScale: appSettings.uiScale ?? DEFAULT_USER_SETTINGS.ui.uiScale,
          language: appSettings.language ?? DEFAULT_USER_SETTINGS.ui.language,
          enableAnimations: appSettings.enableAnimations ?? DEFAULT_USER_SETTINGS.ui.enableAnimations,
          matrixRainOpacity: appSettings.matrixRainOpacity ?? DEFAULT_USER_SETTINGS.ui.matrixRainOpacity,
          showWelcomeOnStartup: appSettings.showWelcomeOnStartup ?? DEFAULT_USER_SETTINGS.ui.showWelcomeOnStartup,
          checkUpdatesOnStartup: appSettings.checkUpdatesOnStartup ?? DEFAULT_USER_SETTINGS.ui.checkUpdatesOnStartup,
        };
      }
      return DEFAULT_USER_SETTINGS.ui;
    },
  },

  // Terminal settings (Zustand persist format - sometimes part of kuroryuu-settings)
  'kuroryuu-terminal': {
    scope: 'user',
    namespace: 'terminal',
    transform: (value) => {
      if (typeof value === 'object' && value !== null) {
        const v = value as Record<string, unknown>;
        const state = (v.state || v) as Record<string, unknown>;
        return {
          font: state.terminalFont ?? state.font ?? DEFAULT_USER_SETTINGS.terminal.font,
          fontSize: state.terminalFontSize ?? state.fontSize ?? DEFAULT_USER_SETTINGS.terminal.fontSize,
        };
      }
      return DEFAULT_USER_SETTINGS.terminal;
    },
  },
};

/**
 * Run migration from localStorage data
 * This is called from renderer process via IPC with localStorage data
 */
export function migrateFromLocalStorage(localStorageData: Record<string, string>): MigrationResult {
  const service = getSettingsService();
  const result: MigrationResult = {
    success: true,
    migrated: [],
    errors: [],
    skipped: [],
  };

  // Check if already migrated
  const userSettings = service.getAll('user') as UserSettings | null;
  if (userSettings?._migratedAt) {
    console.log('[Migration] Already migrated at:', new Date(userSettings._migratedAt).toISOString());
    result.skipped.push('Already migrated');
    return result;
  }

  console.log('[Migration] Starting migration from localStorage...');
  console.log('[Migration] Keys found:', Object.keys(localStorageData));

  for (const [key, mapping] of Object.entries(MIGRATION_MAP)) {
    const rawValue = localStorageData[key];
    if (!rawValue) {
      result.skipped.push(`${key}: not found in localStorage`);
      continue;
    }

    try {
      // Parse JSON value
      const parsed = JSON.parse(rawValue);

      // Transform to new format
      const transformed = mapping.transform ? mapping.transform(parsed) : parsed;

      // Write to new settings
      service.set(mapping.namespace, transformed, mapping.scope);

      result.migrated.push(`${key} -> ${mapping.scope}:${mapping.namespace}`);
      console.log(`[Migration] Migrated ${key} to ${mapping.scope}:${mapping.namespace}`);
    } catch (err) {
      const errorMsg = `${key}: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(errorMsg);
      console.error(`[Migration] Failed to migrate ${key}:`, err);
    }
  }

  // Mark as migrated
  service.set('_migratedAt', Date.now(), 'user');
  service.set('_migratedAt', Date.now(), 'project');

  result.success = result.errors.length === 0;
  console.log('[Migration] Complete:', result);

  return result;
}

/**
 * Check if migration is needed
 */
export function needsMigration(): boolean {
  const service = getSettingsService();
  const userSettings = service.getAll('user') as UserSettings | null;
  return !userSettings?._migratedAt;
}

/**
 * Get list of localStorage keys that should be migrated
 */
export function getMigrationKeys(): string[] {
  return Object.keys(MIGRATION_MAP);
}
