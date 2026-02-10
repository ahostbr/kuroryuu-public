/**
 * Domain Config Dialog
 *
 * Unified provider/model selection for all 14 LLM generation domains.
 * Groups domains by category and allows configuration of provider and model.
 */

import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Cpu,
  Check,
  RefreshCw,
  RotateCcw,
  Sparkles,
  MessageSquare,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDomainConfigStore } from '../../stores/domain-config-store';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';
import { toast } from '../ui/toast';
import type { DomainId, DomainCategory, LLMProvider, ModelInfo } from '../../types/domain-config';
import {
  DOMAINS,
  PROVIDERS,
  getDomainsByCategory,
  getProviderColorClass,
  getProviderBorderClass,
} from '../../types/domain-config';
import { GroupedModelSelect } from './GroupedModelSelect';

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_INFO: Record<DomainCategory, { icon: typeof Sparkles; label: string; color: string }> = {
  generation: { icon: Sparkles, label: 'Generation Domains', color: 'text-yellow-400' },
  assistant: { icon: MessageSquare, label: 'Assistant Domains', color: 'text-purple-400' },
  tools: { icon: Wrench, label: 'Tool Domains', color: 'text-cyan-400' },
};

// ============================================================================
// Domain Card Component
// ============================================================================

interface DomainCardProps {
  domainId: DomainId;
  availableModels: ModelInfo[];
  providerHealthy: Record<LLMProvider, boolean>;
}

function DomainCard({ domainId, availableModels, providerHealthy }: DomainCardProps) {
  const { getConfigForDomain, updateDomainConfig, resetDomainToDefault } = useDomainConfigStore();
  const config = getConfigForDomain(domainId);
  const domainInfo = DOMAINS.find(d => d.id === domainId);

  if (!domainInfo) return null;

  // Get models for selected provider
  const modelsForProvider = availableModels.filter(m => {
    if (config.provider === 'gateway-auto') {
      // For gateway, show all models
      return true;
    }
    return m.provider === config.provider;
  });

  // Add fallback models if none available
  const displayModels = modelsForProvider.length > 0
    ? modelsForProvider
    : [{ id: config.modelId || 'auto', name: config.modelName || 'Auto', provider: config.provider }];

  return (
    <div className={`p-4 bg-card rounded-lg border ${getProviderBorderClass(config.provider)} hover:border-primary/30 transition-colors`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{domainInfo.icon}</span>
          <div>
            <h4 className="text-sm font-medium text-foreground">{domainInfo.label}</h4>
            <p className="text-xs text-muted-foreground">{domainInfo.description}</p>
          </div>
        </div>
        <button
          onClick={() => resetDomainToDefault(domainId)}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          title="Reset to default"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Provider Selection */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Provider</label>
          <div className="grid grid-cols-2 gap-1.5">
            {PROVIDERS.map((provider) => {
              const isSelected = config.provider === provider.id;
              const isHealthy = providerHealthy[provider.id];

              return (
                <button
                  key={provider.id}
                  onClick={() => updateDomainConfig(domainId, { provider: provider.id })}
                  className={`
                    px-2 py-1.5 rounded text-xs transition-all text-left
                    ${isSelected
                      ? `${getProviderColorClass(provider.id)} border border-current`
                      : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
                    }
                  `}
                  title={provider.description}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="truncate">{provider.name}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Model Selection - Grouped by source provider (flat for LMStudio) */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Model</label>
          <GroupedModelSelect
            models={displayModels}
            value={config.modelId}
            onChange={(modelId, modelName) => {
              updateDomainConfig(domainId, { modelId, modelName });
            }}
            showAutoOption={config.provider === 'gateway-auto'}
            autoOptionLabel="Auto (Smart Selection)"
            showCounts={true}
            flat={config.provider === 'lmstudio'}
            groupBy="source"
          />
        </div>

      </div>
    </div>
  );
}

// ============================================================================
// Category Section Component
// ============================================================================

interface CategorySectionProps {
  category: DomainCategory;
  availableModels: ModelInfo[];
  providerHealthy: Record<LLMProvider, boolean>;
}

function CategorySection({ category, availableModels, providerHealthy }: CategorySectionProps) {
  const domains = getDomainsByCategory(category);
  const { icon: Icon, label, color } = CATEGORY_INFO[category];

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${color}`} />
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground">({domains.length})</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {domains.map((domain) => (
          <DomainCard
            key={domain.id}
            domainId={domain.id}
            availableModels={availableModels}
            providerHealthy={providerHealthy}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Dialog Component
// ============================================================================

export function DomainConfigDialog() {
  const {
    isDialogOpen,
    closeDialog,
    availableModels,
    modelsLoading,
    fetchAvailableModels,
    providerHealth,
    healthLoading,
    checkProviderHealth,
    resetAllToDefaults,
  } = useDomainConfigStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isKuroryuu, isGrunge } = useIsThemedStyle();

  // Fetch models and health on open
  useEffect(() => {
    if (isDialogOpen) {
      fetchAvailableModels();
      checkProviderHealth();
    }
  }, [isDialogOpen, fetchAvailableModels, checkProviderHealth]);

  // Convert health to simple boolean map
  const providerHealthy: Record<LLMProvider, boolean> = {
    'gateway-auto': providerHealth['gateway-auto']?.healthy ?? false,
    'lmstudio': providerHealth['lmstudio']?.healthy ?? false,
    'cliproxyapi': providerHealth['cliproxyapi']?.healthy ?? false,
    'claude': providerHealth['claude']?.healthy ?? true, // Assume healthy
    'claude-cli': providerHealth['claude-cli']?.healthy ?? false,
    'claude-cli-pty': providerHealth['claude-cli-pty']?.healthy ?? false,
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchAvailableModels(),
        checkProviderHealth(),
      ]);
      toast.success('Refreshed models and provider status');
    } catch {
      toast.error('Failed to refresh');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResetAll = () => {
    if (confirm('Reset all domain configurations to defaults?')) {
      resetAllToDefaults();
      toast.success('Reset all domains to defaults');
    }
  };

  const handleSave = async () => {
    // Configs are auto-saved via persist middleware
    // Also export to shared file for Tray Companion sync
    const { exportToFile } = useDomainConfigStore.getState();
    const result = await exportToFile();
    if (result?.success) {
      toast.success('Configuration saved & synced');
    } else {
      toast.success('Configuration saved (sync failed)');
    }
    closeDialog();
  };

  return (
    <Dialog.Root open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="lg"
            className="w-[900px] max-h-[85vh] overflow-hidden flex flex-col"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-secondary rounded-lg">
                  <Cpu className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-semibold text-foreground">
                    Domain Configuration
                  </Dialog.Title>
                  <p className="text-sm text-muted-foreground">
                    Configure provider and model per generation domain
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Gateway Auto Chain: LMStudio → CLI Proxy → Claude API
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing || modelsLoading || healthLoading}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors disabled:opacity-50"
                  title="Refresh models and status"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
                <Dialog.Close className="p-2 hover:bg-secondary rounded-lg transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </Dialog.Close>
              </div>
            </div>

            {/* Provider Health Summary */}
            <div className="px-4 py-2 bg-secondary/50 border-b border-border flex items-center gap-4 flex-shrink-0">
              <span className="text-xs text-muted-foreground">Providers:</span>
              {PROVIDERS.map((provider) => (
                <div key={provider.id} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${providerHealthy[provider.id] ? 'bg-green-400' : 'bg-red-400/60'}`} />
                  <span className={`text-xs ${providerHealthy[provider.id] ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {provider.name}
                  </span>
                </div>
              ))}
              {(modelsLoading || healthLoading) && (
                <span className="text-xs text-muted-foreground animate-pulse">Checking...</span>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <CategorySection
                category="generation"
                availableModels={availableModels}
                providerHealthy={providerHealthy}
              />
              <CategorySection
                category="assistant"
                availableModels={availableModels}
                providerHealthy={providerHealthy}
              />
              <CategorySection
                category="tools"
                availableModels={availableModels}
                providerHealthy={providerHealthy}
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetAll}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset All
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={closeDialog}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 transition-colors text-sm font-medium"
                >
                  <Check className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default DomainConfigDialog;
