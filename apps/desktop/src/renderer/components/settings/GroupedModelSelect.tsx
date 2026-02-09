/**
 * GroupedModelSelect Component
 *
 * A select dropdown that groups models by family or source provider.
 * Uses native HTML <optgroup> for semantically correct, accessible grouping.
 */

import { useMemo } from 'react';
import type { ModelInfo, ModelFamily } from '../../types/domain-config';
import {
  groupModelsByFamily,
  getFamilyGroupLabel,
  FAMILY_SORT_ORDER,
} from '../../types/domain-config';

// ---------------------------------------------------------------------------
// Source-based grouping (matches ModelSelector's actual-provider grouping)
// ---------------------------------------------------------------------------

const SOURCE_ORDER = ['claude', 'openai', 'gemini', 'antigravity', 'github-copilot', 'kiro', 'qwen', 'deepseek', 'lmstudio', 'other'] as const;

const SOURCE_LABELS: Record<string, string> = {
  'antigravity': 'Antigravity',
  'claude': 'Claude',
  'openai': 'OpenAI',
  'github-copilot': 'GitHub Copilot',
  'kiro': 'Kiro',
  'gemini': 'Gemini',
  'qwen': 'Qwen',
  'deepseek': 'DeepSeek',
  'lmstudio': 'LM Studio',
  'gateway-auto': 'Gateway',
  'other': 'Other',
};

const SOURCE_ALIASES: Record<string, string> = {
  'aws': 'kiro',
  'copilot': 'github-copilot',
  'google': 'gemini',
};

function groupBySource(models: ModelInfo[]): { source: string; label: string; models: ModelInfo[] }[] {
  const groups = new Map<string, ModelInfo[]>();
  for (const model of models) {
    const raw = model.source || model.provider;
    const source = SOURCE_ALIASES[raw] || raw;
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source)!.push(model);
  }
  const result: { source: string; label: string; models: ModelInfo[] }[] = [];
  for (const source of SOURCE_ORDER) {
    const g = groups.get(source);
    if (g?.length) {
      result.push({ source, label: SOURCE_LABELS[source] || source, models: g });
    }
  }
  for (const [source, g] of groups) {
    if (!(SOURCE_ORDER as readonly string[]).includes(source) && g.length) {
      result.push({ source, label: SOURCE_LABELS[source] || source, models: g });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------

interface GroupedModelSelectProps {
  models: ModelInfo[];
  value: string;
  onChange: (modelId: string, modelName: string) => void;
  showAutoOption?: boolean;
  autoOptionLabel?: string;
  showCounts?: boolean;
  className?: string;
  disabled?: boolean;
  flat?: boolean; // Display as flat list without family grouping
  groupBy?: 'family' | 'source'; // Group by model family or actual source provider
}

export function GroupedModelSelect({
  models,
  value,
  onChange,
  showAutoOption = false,
  autoOptionLabel = 'Auto',
  showCounts = true,
  className = '',
  disabled = false,
  flat = false,
  groupBy = 'family',
}: GroupedModelSelectProps) {
  // Dedupe models by ID to prevent duplicate key warnings
  const uniqueModels = useMemo(() => {
    const seen = new Set<string>();
    return models.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [models]);

  const familyGroups = useMemo(() => groupModelsByFamily(uniqueModels), [uniqueModels]);
  const sourceGroups = useMemo(
    () => groupBy === 'source' ? groupBySource(uniqueModels) : [],
    [uniqueModels, groupBy],
  );

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    if (modelId === 'auto') {
      onChange('auto', 'Auto');
      return;
    }
    const selectedModel = uniqueModels.find(m => m.id === modelId);
    if (selectedModel) {
      onChange(selectedModel.id, selectedModel.name);
    }
  };

  const families = useMemo(
    () => FAMILY_SORT_ORDER.filter(f => familyGroups.has(f)),
    [familyGroups]
  );

  const hasGroups = groupBy === 'source' ? sourceGroups.length > 0 : families.length > 0;

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={disabled}
      className={`w-full px-2 py-1.5 bg-secondary border border-border rounded text-xs text-foreground appearance-none cursor-pointer focus:outline-none focus:border-muted ${className}`}
    >
      {showAutoOption && <option value="auto">{autoOptionLabel}</option>}

      {flat ? (
        // Flat list - no grouping
        uniqueModels.map(model => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))
      ) : groupBy === 'source' ? (
        // Grouped by actual source provider
        sourceGroups.map(group => (
          <optgroup key={group.source} label={showCounts ? `${group.label} (${group.models.length})` : group.label}>
            {group.models.map(model => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </optgroup>
        ))
      ) : (
        // Grouped by model family
        families.map(family => {
          const familyModels = familyGroups.get(family) || [];
          const label = getFamilyGroupLabel(family, familyModels.length, showCounts);

          return (
            <optgroup key={family} label={label}>
              {familyModels.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </optgroup>
          );
        })
      )}

      {((flat && uniqueModels.length === 0) || (!flat && !hasGroups)) && !showAutoOption && (
        <option value="" disabled>No models available</option>
      )}
    </select>
  );
}

export default GroupedModelSelect;
