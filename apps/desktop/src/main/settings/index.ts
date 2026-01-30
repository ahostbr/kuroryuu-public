/**
 * Settings Module - Unified settings persistence
 *
 * Usage:
 *   import { getSettingsService, initSettingsService } from './settings';
 *
 *   // Initialize with project path
 *   initSettingsService(projectRoot);
 *
 *   // Get/set settings
 *   const mic = service.get('audio.mic');
 *   service.set('audio.mic.silenceThreshold', 0.15);
 */

export { SettingsService, getSettingsService, initSettingsService, type BackupInfo } from './settings-service';
export {
  // Types
  type UserSettings,
  type ProjectSettings,
  type UISettings,
  type TerminalSettings,
  type MicSettings,
  type TTSSettings,
  type AudioSettings,
  type AgentConfig,
  type AgentSettings,
  type SettingsNamespace,
  type SettingsScope,
  type SettingsChangeEvent,
  // Defaults
  DEFAULT_USER_SETTINGS,
  DEFAULT_PROJECT_SETTINGS,
} from './schemas';
export {
  migrateFromLocalStorage,
  needsMigration,
  getMigrationKeys,
  type MigrationResult,
} from './migration';
