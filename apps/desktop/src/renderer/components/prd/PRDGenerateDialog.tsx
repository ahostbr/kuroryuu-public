/**
 * PRD Generate Dialog Component
 *
 * Form for collecting PRD generation configuration
 * Follows Radix UI Dialog pattern from TaskDetailModal
 */
import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, FileText, AlertCircle, Cpu, AlertTriangle } from 'lucide-react';
import type { PRDConfig, PRDScope } from '../../types/prd';
import { usePRDStore } from '../../stores/prd-store';
import { gatewayClient } from '../../services/gateway-client';

export function PRDGenerateDialog() {
  const { isGenerateDialogOpen, startGeneration } = usePRDStore();
  const [config, setConfig] = useState<PRDConfig>({
    title: '',
    description: '',
    scope: 'feature',
    includeTechSpec: true,
    includeAcceptance: true,
    model: 'mistralai/devstral-small-2-2512',
  });

  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});
  const [activeBackend, setActiveBackend] = useState<string | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);

  // Fetch active backend when dialog opens
  useEffect(() => {
    if (isGenerateDialogOpen) {
      setBackendLoading(true);
      gatewayClient.currentBackend()
        .then((result) => {
          if (result.ok && result.data) {
            // Map backend names to display names
            const displayNames: Record<string, string> = {
              'lmstudio': 'LMStudio',
              'cliproxyapi': 'Claude (CLI Proxy)',
              'claude': 'Claude API',
            };
            setActiveBackend(displayNames[result.data.name] || result.data.name);
          } else {
            setActiveBackend(null);
          }
        })
        .catch(() => setActiveBackend(null))
        .finally(() => setBackendLoading(false));
    }
  }, [isGenerateDialogOpen]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!isGenerateDialogOpen) {
      setConfig({
        title: '',
        description: '',
        scope: 'feature',
        includeTechSpec: true,
        includeAcceptance: true,
        model: 'mistralai/devstral-small-2-2512',
      });
      setErrors({});
    }
  }, [isGenerateDialogOpen]);

  const validate = (): boolean => {
    const newErrors: { title?: string; description?: string } = {};

    if (!config.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (config.title.trim().length < 5) {
      newErrors.title = 'Title must be at least 5 characters';
    }

    if (!config.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (config.description.trim().length < 20) {
      newErrors.description = 'Description must be at least 20 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGenerate = async () => {
    if (!validate()) return;

    await startGeneration(config);
    usePRDStore.setState({ isGenerateDialogOpen: false });
  };

  const handleOpenChange = (open: boolean) => {
    usePRDStore.setState({ isGenerateDialogOpen: open });
  };

  const scopeOptions: { value: PRDScope; label: string; description: string }[] = [
    { value: 'task', label: 'Task', description: 'Small, focused change (1-2 days)' },
    { value: 'feature', label: 'Feature', description: 'New capability (1-2 weeks)' },
    { value: 'epic', label: 'Epic', description: 'Large initiative (multi-week)' },
  ];

  return (
    <Dialog.Root open={isGenerateDialogOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40 animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden z-50 animate-in fade-in zoom-in-95">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Generate Product Requirements Document
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground mt-0.5">
                  Create a comprehensive PRD with codebase context
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          {/* Form Content */}
          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(85vh-160px)]">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={config.title}
                onChange={(e) => setConfig({ ...config, title: e.target.value })}
                placeholder="e.g., User Authentication System"
                className={`w-full px-4 py-2.5 bg-secondary border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${
                  errors.title ? 'border-red-500' : 'border-border'
                }`}
              />
              {errors.title && (
                <p className="mt-1.5 text-sm text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.title}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Description <span className="text-red-400">*</span>
              </label>
              <textarea
                value={config.description}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                placeholder="Describe the feature, problem it solves, and key requirements..."
                rows={5}
                className={`w-full px-4 py-2.5 bg-secondary border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all resize-none ${
                  errors.description ? 'border-red-500' : 'border-border'
                }`}
              />
              {errors.description && (
                <p className="mt-1.5 text-sm text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.description}
                </p>
              )}
            </div>

            {/* Scope */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Scope
              </label>
              <div className="space-y-2">
                {scopeOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      config.scope === option.value
                        ? 'bg-blue-500/10 border-blue-500/50'
                        : 'bg-secondary border-border hover:border-blue-500/30'
                    }`}
                  >
                    <input
                      type="radio"
                      value={option.value}
                      checked={config.scope === option.value}
                      onChange={(e) => setConfig({ ...config, scope: e.target.value as PRDScope })}
                      className="mt-0.5 text-blue-500 focus:ring-blue-500 border-border"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{option.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{option.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Optional Sections */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Optional Sections
              </label>
              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 rounded-lg bg-secondary border border-border cursor-pointer hover:border-blue-500/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={config.includeTechSpec}
                    onChange={(e) => setConfig({ ...config, includeTechSpec: e.target.checked })}
                    className="mt-0.5 text-blue-500 focus:ring-blue-500 border-border rounded"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">Technical Specification</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Architecture, data models, API endpoints, dependencies
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg bg-secondary border border-border cursor-pointer hover:border-blue-500/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={config.includeAcceptance}
                    onChange={(e) => setConfig({ ...config, includeAcceptance: e.target.checked })}
                    className="mt-0.5 text-blue-500 focus:ring-blue-500 border-border rounded"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">Acceptance Criteria</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Testable completion requirements (functional, performance, security)
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Info Box */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-300">
                💡 PRDs will reference actual components, endpoints, and TODOs from your codebase
                using repo_intel analysis.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 p-6 border-t border-border">
            {/* Backend Indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Cpu className="w-3.5 h-3.5" />
              {backendLoading ? (
                <span>Checking backend...</span>
              ) : activeBackend ? (
                <span className={activeBackend.includes('Claude') ? 'text-blue-400' : 'text-green-400'}>
                  {activeBackend}
                </span>
              ) : (
                <span className="text-yellow-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  No backend available
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Dialog.Close className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                Cancel
              </Dialog.Close>
              <button
                onClick={handleGenerate}
                disabled={!config.title.trim() || !config.description.trim()}
                className="px-6 py-2 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
              >
                Generate PRD
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
