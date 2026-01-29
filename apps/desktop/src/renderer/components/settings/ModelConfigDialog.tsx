/**
 * Model Config Dialog
 * Per-phase model selection, thinking levels, and temperature settings
 */

import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Brain,
  Sparkles,
  Check,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settings-store';
import { AVAILABLE_MODELS } from '../../types/settings';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';
import type { AgentPhase, ThinkingLevel } from '../../types/settings';
import { GroupedModelSelect } from './GroupedModelSelect';
import type { ModelInfo } from '../../types/domain-config';

const PHASE_ICONS: Record<AgentPhase, string> = {
  spec: '📋',
  planning: '🗺️',
  coding: '💻',
  qa: '🔍',
  insights: '💡',
  ideation: '🎨',
  roadmap: '🛤️',
  utility: '🔧',
};

const THINKING_LEVELS: { value: ThinkingLevel; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'Fast responses, no extended thinking' },
  { value: 'basic', label: 'Basic', description: 'Brief reasoning steps' },
  { value: 'deep', label: 'Deep', description: 'Extended thinking for complex tasks' },
];

// Convert AVAILABLE_MODELS to ModelInfo[] format for GroupedModelSelect
const modelInfoList: ModelInfo[] = AVAILABLE_MODELS.map(m => ({
  id: m.id,
  name: m.name,
  provider: 'cliproxyapi' as const, // Provider used for display purposes
}));

function PhaseModelCard({
  phase,
  label,
  description,
  model,
  onUpdateModel,
}: {
  phase: AgentPhase;
  label: string;
  description: string;
  model: {
    modelId: string;
    modelName: string;
    thinkingLevel: ThinkingLevel;
    temperature: number;
    maxTokens: number;
  };
  onUpdateModel: (updates: Partial<typeof model>) => void;
}) {
  return (
    <div className="p-4 bg-card rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl">{PHASE_ICONS[phase]}</span>
        <div>
          <h4 className="text-sm font-medium text-foreground">{label}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {/* Model Selection - Grouped by Family */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Model</label>
          <GroupedModelSelect
            models={modelInfoList}
            value={model.modelId}
            onChange={(modelId, modelName) => {
              onUpdateModel({ modelId, modelName });
            }}
            showCounts={true}
            className="px-3 py-2 rounded-lg text-sm"
          />
        </div>

        {/* Thinking Level */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Thinking Level</label>
          <div className="grid grid-cols-3 gap-2">
            {THINKING_LEVELS.map((level) => (
              <button
                key={level.value}
                onClick={() => onUpdateModel({ thinkingLevel: level.value })}
                className={`
                  px-3 py-2 rounded-lg text-xs transition-colors
                  ${model.thinkingLevel === level.value
                    ? 'bg-primary text-black'
                    : 'bg-secondary text-muted-foreground hover:bg-muted'
                  }
                `}
                title={level.description}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>

        {/* Temperature & Max Tokens */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Temperature: {model.temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={model.temperature}
              onChange={(e) => onUpdateModel({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Max Tokens: {model.maxTokens.toLocaleString()}
            </label>
            <input
              type="range"
              min="1024"
              max="16384"
              step="1024"
              value={model.maxTokens}
              onChange={(e) => onUpdateModel({ maxTokens: parseInt(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelConfigDialog() {
  const {
    activeDialog,
    closeDialog,
    modelConfigs,
    updatePhaseModel,
    saveSettings,
  } = useSettingsStore();

  const isOpen = activeDialog === 'model-config';
  const { isKuroryuu, isGrunge } = useIsThemedStyle();

  const handleSave = async () => {
    await saveSettings();
    closeDialog();
  };

  // Group configs by category
  const corePhases = modelConfigs.filter((c) => ['spec', 'planning', 'coding', 'qa'].includes(c.phase));
  const assistantPhases = modelConfigs.filter((c) => ['insights', 'ideation', 'roadmap', 'utility'].includes(c.phase));

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="lg"
            className="w-[700px] max-h-[85vh] overflow-hidden flex flex-col"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
            {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-secondary rounded-lg">
                <Brain className="w-5 h-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Model Configuration
                </Dialog.Title>
                <p className="text-sm text-muted-foreground">Configure AI models per agent phase</p>
              </div>
            </div>
            <Dialog.Close className="p-2 hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            {/* Core Phases */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">Core Agent Phases</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {corePhases.map((config) => (
                  <PhaseModelCard
                    key={config.phase}
                    phase={config.phase}
                    label={config.label}
                    description={config.description}
                    model={config.model}
                    onUpdateModel={(updates) => updatePhaseModel(config.phase, updates)}
                  />
                ))}
              </div>
            </div>

            {/* Assistant Phases */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-foreground">Assistant Phases</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {assistantPhases.map((config) => (
                  <PhaseModelCard
                    key={config.phase}
                    phase={config.phase}
                    label={config.label}
                    description={config.description}
                    model={config.model}
                    onUpdateModel={(updates) => updatePhaseModel(config.phase, updates)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-border flex-shrink-0">
            <p className="text-xs text-muted-foreground">
              Changes apply to new agent runs
            </p>
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
