/**
 * useFeatureSettings Hook
 * 
 * React hook for managing feature settings with persistence.
 * Handles loading, saving, and syncing settings with ConfigManager.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import { useState, useCallback, useEffect } from 'react';
import type { FeatureSettings } from '../components/settings/FeatureSettingsPanel';
import { DEFAULT_FEATURE_SETTINGS } from '../components/settings/FeatureSettingsPanel';

// Type for optional config API (may not be available in all builds)
interface ConfigAPI {
  getFeatureSettings?: () => Promise<{ success: boolean; data?: FeatureSettings; error?: { message: string } }>;
  setFeatureSettings?: (settings: FeatureSettings) => Promise<{ success: boolean; error?: { message: string } }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseFeatureSettingsReturn {
  settings: FeatureSettings;
  isLoading: boolean;
  error: string | null;
  updateSettings: (settings: FeatureSettings) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  reloadSettings: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════════════════

export function useFeatureSettings(): UseFeatureSettingsReturn {
  const [settings, setSettings] = useState<FeatureSettings>(DEFAULT_FEATURE_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Load settings on mount
  // ─────────────────────────────────────────────────────────────────────────────
  
  const reloadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const configApi = (window.electronAPI as { config?: ConfigAPI } | undefined)?.config;
      const result = await configApi?.getFeatureSettings?.();
      
      if (result?.success && result.data) {
        // Merge with defaults to ensure all fields exist
        setSettings({
          ...DEFAULT_FEATURE_SETTINGS,
          ...result.data,
          capture: {
            ...DEFAULT_FEATURE_SETTINGS.capture,
            ...result.data.capture,
          },
          voiceInput: {
            ...DEFAULT_FEATURE_SETTINGS.voiceInput,
            ...result.data.voiceInput,
          },
          tts: {
            ...DEFAULT_FEATURE_SETTINGS.tts,
            ...result.data.tts,
          },
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load settings';
      setError(errorMsg);
      console.error('[useFeatureSettings] Load error:', errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    reloadSettings();
  }, [reloadSettings]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Update settings
  // ─────────────────────────────────────────────────────────────────────────────
  
  const updateSettings = useCallback(async (newSettings: FeatureSettings) => {
    setError(null);

    try {
      // Optimistic update
      setSettings(newSettings);

      // Persist to config
      const configApi = (window.electronAPI as { config?: ConfigAPI } | undefined)?.config;
      const result = await configApi?.setFeatureSettings?.(newSettings);

      if (!result?.success) {
        throw new Error(result?.error?.message || 'Failed to save settings');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save settings';
      setError(errorMsg);
      console.error('[useFeatureSettings] Save error:', errorMsg);
      
      // Revert on failure
      await reloadSettings();
    }
  }, [reloadSettings]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Reset to defaults
  // ─────────────────────────────────────────────────────────────────────────────
  
  const resetToDefaults = useCallback(async () => {
    await updateSettings(DEFAULT_FEATURE_SETTINGS);
  }, [updateSettings]);
  
  return {
    settings,
    isLoading,
    error,
    updateSettings,
    resetToDefaults,
    reloadSettings,
  };
}

export default useFeatureSettings;
