/**
 * Domain Config Store
 *
 * Central Zustand store for managing provider/model configuration
 * across all 14 LLM generation domains. Persists to localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  DomainId,
  DomainConfig,
  LLMProvider,
  ModelInfo,
  ProviderHealth,
} from '../types/domain-config';
import {
  DOMAINS,
  getDefaultDomainConfig,
  getDomainInfo,
} from '../types/domain-config';
import {
  fetchAllModels,
  fetchModelsForProvider,
  checkAllProvidersHealth,
  checkProviderHealth,
} from '../services/model-registry';

// ============================================================================
// Store Types
// ============================================================================

interface DomainConfigState {
  // Per-domain configurations
  configs: Record<DomainId, DomainConfig>;

  // Available models (fetched from providers)
  availableModels: ModelInfo[];
  modelsLoading: boolean;
  modelsLastFetched: number | null;

  // Provider health status
  providerHealth: Record<LLMProvider, ProviderHealth>;
  healthLoading: boolean;
  healthLastChecked: number | null;

  // UI state
  isDialogOpen: boolean;

  // Actions
  updateDomainConfig: (domain: DomainId, updates: Partial<DomainConfig>) => void;
  fetchAvailableModels: () => Promise<void>;
  fetchModelsForProvider: (provider: LLMProvider) => Promise<ModelInfo[]>;
  checkProviderHealth: () => Promise<void>;
  checkSingleProviderHealth: (provider: LLMProvider) => Promise<ProviderHealth>;
  resetDomainToDefault: (domain: DomainId) => void;
  resetAllToDefaults: () => void;
  openDialog: () => void;
  closeDialog: () => void;
  exportToFile: () => Promise<{ success: boolean; path?: string; error?: string } | undefined>;
  importFromFile: () => Promise<{ success: boolean; error?: string }>;

  // Selectors
  getConfigForDomain: (domain: DomainId) => DomainConfig;
  getModelsForProvider: (provider: LLMProvider) => ModelInfo[];
  isProviderHealthy: (provider: LLMProvider) => boolean;
}

// ============================================================================
// Initial State
// ============================================================================

function createInitialConfigs(): Record<DomainId, DomainConfig> {
  const configs: Partial<Record<DomainId, DomainConfig>> = {};
  for (const domain of DOMAINS) {
    configs[domain.id] = getDefaultDomainConfig(domain.id);
  }
  return configs as Record<DomainId, DomainConfig>;
}

const initialProviderHealth: Record<LLMProvider, ProviderHealth> = {
  'gateway-auto': { provider: 'gateway-auto', healthy: false, lastChecked: 0 },
  'lmstudio': { provider: 'lmstudio', healthy: false, lastChecked: 0 },
  'cliproxyapi': { provider: 'cliproxyapi', healthy: true, lastChecked: 0 }, // Primary provider via Claude Code CLI
  'claude': { provider: 'claude', healthy: false, lastChecked: 0 }, // Requires API key
  'claude-cli': { provider: 'claude-cli', healthy: false, lastChecked: 0 },
  'claude-cli-pty': { provider: 'claude-cli-pty', healthy: false, lastChecked: 0 },
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useDomainConfigStore = create<DomainConfigState>()(
  persist(
    (set, get) => ({
      // Initial state
      configs: createInitialConfigs(),
      availableModels: [],
      modelsLoading: false,
      modelsLastFetched: null,
      providerHealth: initialProviderHealth,
      healthLoading: false,
      healthLastChecked: null,
      isDialogOpen: false,

      // Update domain config
      updateDomainConfig: (domain, updates) => {
        set(state => ({
          configs: {
            ...state.configs,
            [domain]: {
              ...state.configs[domain],
              ...updates,
            },
          },
        }));
        // Auto-export to shared file for Tray Companion sync
        setTimeout(() => {
          get().exportToFile();
        }, 100); // Debounce to avoid rapid exports
      },

      // Fetch all available models
      fetchAvailableModels: async () => {
        set({ modelsLoading: true });
        try {
          const models = await fetchAllModels();
          set({
            availableModels: models,
            modelsLoading: false,
            modelsLastFetched: Date.now(),
          });
        } catch (e) {
          console.error('Failed to fetch models:', e);
          set({ modelsLoading: false });
        }
      },

      // Fetch models for specific provider
      fetchModelsForProvider: async (provider) => {
        try {
          const models = await fetchModelsForProvider(provider);
          // Merge with existing models (don't replace)
          const existingModels = get().availableModels.filter(m => m.provider !== provider);
          set({ availableModels: [...existingModels, ...models] });
          return models;
        } catch (e) {
          console.error(`Failed to fetch models for ${provider}:`, e);
          return [];
        }
      },

      // Check all provider health
      checkProviderHealth: async () => {
        set({ healthLoading: true });
        try {
          const health = await checkAllProvidersHealth();
          set({
            providerHealth: health,
            healthLoading: false,
            healthLastChecked: Date.now(),
          });
        } catch (e) {
          console.error('Failed to check provider health:', e);
          set({ healthLoading: false });
        }
      },

      // Check single provider health
      checkSingleProviderHealth: async (provider) => {
        try {
          const health = await checkProviderHealth(provider);
          set(state => ({
            providerHealth: {
              ...state.providerHealth,
              [provider]: health,
            },
          }));
          return health;
        } catch (e) {
          console.error(`Failed to check health for ${provider}:`, e);
          return get().providerHealth[provider];
        }
      },

      // Reset single domain to default
      resetDomainToDefault: (domain) => {
        set(state => ({
          configs: {
            ...state.configs,
            [domain]: getDefaultDomainConfig(domain),
          },
        }));
        // Auto-export after reset
        setTimeout(() => get().exportToFile(), 100);
      },

      // Reset all domains to defaults
      resetAllToDefaults: () => {
        set({ configs: createInitialConfigs() });
        // Auto-export after reset
        setTimeout(() => get().exportToFile(), 100);
      },

      // Dialog controls
      openDialog: () => set({ isDialogOpen: true }),
      closeDialog: () => set({ isDialogOpen: false }),

      // Get config for domain (with fallback)
      getConfigForDomain: (domain) => {
        const config = get().configs[domain];
        if (!config) {
          return getDefaultDomainConfig(domain);
        }
        return config;
      },

      // Get models for specific provider
      getModelsForProvider: (provider) => {
        return get().availableModels.filter(m => m.provider === provider);
      },

      // Check if provider is healthy
      isProviderHealthy: (provider) => {
        return get().providerHealth[provider]?.healthy ?? false;
      },

      // Export configs to shared file (for Tray Companion sync)
      exportToFile: async () => {
        const state = get();
        try {
          const result = await (window as any).electronAPI?.domainConfig?.export({
            version: 1,
            lastUpdated: new Date().toISOString(),
            configs: state.configs,
          });
          if (result?.success) {
            console.log('[DomainConfigStore] Exported config to file');
          }
          return result;
        } catch (error) {
          console.error('[DomainConfigStore] Failed to export config:', error);
          return { success: false, error: String(error) };
        }
      },

      // Import configs from shared file
      importFromFile: async () => {
        try {
          const result = await (window as any).electronAPI?.domainConfig?.import?.();
          if (result?.success && result?.data?.configs) {
            set({ configs: result.data.configs });
            console.log('[DomainConfigStore] Imported config from file');
            return { success: true };
          }
          return { success: false, error: result?.error || 'No config data found' };
        } catch (error) {
          console.error('[DomainConfigStore] Failed to import config:', error);
          return { success: false, error: String(error) };
        }
      },
    }),
    {
      name: 'kuroryuu-domain-config',
      partialize: (state) => ({
        // Only persist configs (not loading states or health)
        configs: state.configs,
      }),
      onRehydrateStorage: () => (state) => {
        // After hydration from localStorage, import from shared file
        // This allows external tools (CLI, manual edits) to update config
        if (state?.importFromFile) {
          setTimeout(async () => {
            const result = await state.importFromFile?.();
            if (result?.success) {
              console.log('[DomainConfigStore] Auto-imported config from file on hydration');
            } else {
              // File doesn't exist or failed - export current state
              state.exportToFile?.();
              console.log('[DomainConfigStore] No file to import, exported current config');
            }
          }, 1000); // Delay to ensure Electron APIs are ready
        }
      },
    }
  )
);

// ============================================================================
// Selectors (for use outside of components)
// ============================================================================

/**
 * Get domain config from store (non-hook version)
 */
export function getDomainConfig(domain: DomainId): DomainConfig {
  return useDomainConfigStore.getState().getConfigForDomain(domain);
}

/**
 * Get provider and model for a domain
 */
export function getDomainProviderAndModel(domain: DomainId): {
  provider: LLMProvider;
  modelId: string;
} {
  const config = getDomainConfig(domain);
  return {
    provider: config.provider,
    modelId: config.modelId,
  };
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Map feature name to DomainId
 */
export function featureToDomainId(feature: string): DomainId | null {
  const mapping: Record<string, DomainId> = {
    'insights': 'code-editor',      // Legacy: insights now uses code-editor
    'ideation': 'ideation',
    'roadmap': 'roadmap',
    'prd': 'prd',
    'code-editor': 'code-editor',
    'formulas': 'formulas',
    'voice': 'voice',
    'genui': 'genui',
  };
  return mapping[feature] || null;
}

/**
 * Get combined model list for dropdown (provider-specific + gateway fallback)
 */
export function getModelsForDropdown(
  provider: LLMProvider,
  availableModels: ModelInfo[]
): ModelInfo[] {
  // Get provider-specific models
  const providerModels = availableModels.filter(m => m.provider === provider);

  // For gateway-auto, also include models from all providers
  if (provider === 'gateway-auto') {
    return availableModels;
  }

  return providerModels;
}
