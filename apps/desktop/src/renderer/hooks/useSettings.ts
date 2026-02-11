/**
 * useSettings - React hook for unified settings access
 *
 * Provides type-safe access to settings with auto-subscription to changes.
 *
 * Usage:
 *   const [micSettings, setMicSettings] = useSettings('audio.mic');
 *   const [theme] = useSettings('ui.theme');
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// Settings types (mirrors main process schemas)
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

export interface GraphitiSettings {
  enabled: boolean;
  serverUrl: string;
  autoSync: boolean;
}

export interface GitHubWorkflowSettings {
  enabled: boolean;
  autoCreateWorktree: boolean;
  autoCreatePR: boolean;
  requireReviewBeforeMerge: boolean;
  defaultBaseBranch: string;
  branchPrefix: string;
  autoDeleteBranchAfterMerge: boolean;
}

// Defaults (in case API fails)
const DEFAULT_MIC_SETTINGS: MicSettings = {
  silenceThreshold: 0.12,
  voiceThreshold: 0.25,
  silenceTimeoutMs: 1500,
  sttEngine: 'whisper',
};

const DEFAULT_TTS_SETTINGS: TTSSettings = {
  enabled: false,
  voice: 'default',
  rate: 1.0,
  volume: 1.0,
  backend: 'system',
};

const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  gridLayout: 'auto',
  layoutMode: 'grid',
};

const DEFAULT_UI_SETTINGS: UISettings = {
  theme: 'oscura-midnight',
  uiScale: 1.0,
  language: 'en',
  enableAnimations: true,
  matrixRainOpacity: 40,
  showWelcomeOnStartup: true,
  checkUpdatesOnStartup: true,
  layout: DEFAULT_LAYOUT_SETTINGS,
};

const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  font: 'jetbrains-mono',
  fontSize: 14,
};

const DEFAULT_GRAPHITI_SETTINGS: GraphitiSettings = {
  enabled: false,
  serverUrl: 'http://localhost:8000',
  autoSync: false,
};

const DEFAULT_GITHUB_WORKFLOW_SETTINGS: GitHubWorkflowSettings = {
  enabled: false,
  autoCreateWorktree: true,
  autoCreatePR: true,
  requireReviewBeforeMerge: true,
  defaultBaseBranch: 'master',
  branchPrefix: 'task/',
  autoDeleteBranchAfterMerge: true,
};

// Namespace to default mapping
const NAMESPACE_DEFAULTS: Record<string, unknown> = {
  'audio.mic': DEFAULT_MIC_SETTINGS,
  'audio.tts': DEFAULT_TTS_SETTINGS,
  'ui': DEFAULT_UI_SETTINGS,
  'ui.layout': DEFAULT_LAYOUT_SETTINGS,
  'terminal': DEFAULT_TERMINAL_SETTINGS,
  'graphiti': DEFAULT_GRAPHITI_SETTINGS,
  'githubWorkflow': DEFAULT_GITHUB_WORKFLOW_SETTINGS,
};

type SettingsScope = 'user' | 'project';

interface UseSettingsOptions {
  scope?: SettingsScope;
}

/**
 * Hook for accessing and updating settings
 *
 * @param namespace Dot-notation path (e.g., 'audio.mic', 'ui.theme')
 * @param options Optional settings (scope override)
 * @returns [value, setValue, { loading, error }]
 */
export function useSettings<T = unknown>(
  namespace: string,
  options?: UseSettingsOptions
): [T, (value: T | ((prev: T) => T)) => void, { loading: boolean; error: string | null }] {
  const defaultValue = (NAMESPACE_DEFAULTS[namespace] ?? null) as T;
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Load initial value
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setError(null);

    window.electronAPI.settings
      .get(namespace, options?.scope)
      .then((result) => {
        if (mountedRef.current) {
          setValue((result ?? defaultValue) as T);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          console.error(`[useSettings] Failed to load ${namespace}:`, err);
          setError(err.message || String(err));
          setLoading(false);
        }
      });

    return () => {
      mountedRef.current = false;
    };
  }, [namespace, options?.scope]);

  // Subscribe to changes
  useEffect(() => {
    const unsubscribe = window.electronAPI.settings.onChanged((event) => {
      // Check if this change affects our namespace
      if (event.namespace === namespace || event.namespace.startsWith(namespace + '.') || namespace.startsWith(event.namespace + '.')) {
        // Reload value
        window.electronAPI.settings.get(namespace, options?.scope).then((result) => {
          if (mountedRef.current) {
            setValue((result ?? defaultValue) as T);
          }
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [namespace, options?.scope]);

  // Setter function
  const updateValue = useCallback(
    (newValueOrUpdater: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const newValue = typeof newValueOrUpdater === 'function'
          ? (newValueOrUpdater as (prev: T) => T)(prev)
          : newValueOrUpdater;

        // Persist to backend
        window.electronAPI.settings.set(namespace, newValue, options?.scope).catch((err) => {
          console.error(`[useSettings] Failed to save ${namespace}:`, err);
          setError(err.message || String(err));
        });

        return newValue;
      });
    },
    [namespace, options?.scope]
  );

  return [value, updateValue, { loading, error }];
}

/**
 * Hook for updating a partial setting (merge)
 */
export function useSettingsUpdate(namespace: string, options?: UseSettingsOptions) {
  return useCallback(
    async (partial: Record<string, unknown>) => {
      try {
        await window.electronAPI.settings.update(namespace, partial, options?.scope);
        return { ok: true };
      } catch (err) {
        console.error(`[useSettingsUpdate] Failed to update ${namespace}:`, err);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [namespace, options?.scope]
  );
}

/**
 * Hook for resetting settings to defaults
 */
export function useSettingsReset(namespace: string, options?: UseSettingsOptions) {
  return useCallback(async () => {
    try {
      await window.electronAPI.settings.reset(namespace, options?.scope);
      return { ok: true };
    } catch (err) {
      console.error(`[useSettingsReset] Failed to reset ${namespace}:`, err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [namespace, options?.scope]);
}

/**
 * Hook to run migration on first load
 */
export function useSettingsMigration() {
  const [migrationStatus, setMigrationStatus] = useState<{
    needed: boolean;
    running: boolean;
    result: { success: boolean; migrated: string[]; errors: string[]; skipped: string[] } | null;
  }>({
    needed: false,
    running: false,
    result: null,
  });

  useEffect(() => {
    // Check if migration is needed
    window.electronAPI.settings.needsMigration().then((needed) => {
      setMigrationStatus((s) => ({ ...s, needed }));

      if (needed) {
        // Collect localStorage data and run migration
        setMigrationStatus((s) => ({ ...s, running: true }));

        window.electronAPI.settings.getMigrationKeys().then((keys) => {
          const data: Record<string, string> = {};
          for (const key of keys) {
            const value = localStorage.getItem(key);
            if (value) {
              data[key] = value;
            }
          }

          window.electronAPI.settings.migrate(data).then((result) => {
            setMigrationStatus({ needed: false, running: false, result });
            console.log('[useSettingsMigration] Migration complete:', result);
          });
        });
      }
    });
  }, []);

  return migrationStatus;
}

export default useSettings;
