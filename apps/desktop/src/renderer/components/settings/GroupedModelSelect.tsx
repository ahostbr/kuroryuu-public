/**
 * GroupedModelSelect Component
 *
 * A select dropdown that groups models by family (Claude, OpenAI, etc.)
 * Uses native HTML <optgroup> for semantically correct, accessible grouping.
 */

import { useMemo } from 'react';
import type { ModelInfo, ModelFamily } from '../../types/domain-config';
import {
  groupModelsByFamily,
  getFamilyGroupLabel,
  FAMILY_SORT_ORDER,
} from '../../types/domain-config';

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

  const groupedModels = useMemo(() => groupModelsByFamily(uniqueModels), [uniqueModels]);

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
    () => FAMILY_SORT_ORDER.filter(f => groupedModels.has(f)),
    [groupedModels]
  );

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
      ) : (
        // Grouped by family
        families.map(family => {
          const familyModels = groupedModels.get(family) || [];
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

      {((flat && uniqueModels.length === 0) || (!flat && families.length === 0)) && !showAutoOption && (
        <option value="" disabled>No models available</option>
      )}
    </select>
  );
}

export default GroupedModelSelect;
