/**
 * Apply Dialog Component
 *
 * Modal dialog to collect variable values before applying a formula.
 * Shows formula info, variables form, and apply button.
 */
import { X, Play, Beaker, AlertTriangle, Info } from 'lucide-react';
import { useFormulaStore, type FormulaVar } from '../../stores/formula-store';

// ============================================================================
// VariableInput - Input for a single variable
// ============================================================================
interface VariableInputProps {
  variable: FormulaVar;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}

function VariableInput({ variable, value, onChange }: VariableInputProps) {
  const renderInput = () => {
    switch (variable.var_type) {
      case 'boolean':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-secondary text-purple-500 focus:ring-purple-500"
            />
            <span className="text-sm text-foreground">
              {variable.prompt || variable.name}
            </span>
          </label>
        );

      case 'choice':
        return (
          <select
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            {variable.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case 'number':
        return (
          <input
            type="number"
            value={String(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            placeholder={variable.prompt || `Enter ${variable.name}`}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        );

      case 'file_path':
      case 'string':
      default:
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder={variable.prompt || `Enter ${variable.name}`}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        );
    }
  };

  return (
    <div className="space-y-1.5">
      {variable.var_type !== 'boolean' && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          {variable.prompt || variable.name}
          {variable.required && <span className="text-red-400">*</span>}
        </label>
      )}
      {renderInput()}
      {variable.description && (
        <p className="text-xs text-muted-foreground">{variable.description}</p>
      )}
    </div>
  );
}

// ============================================================================
// ApplyDialog - Main dialog component
// ============================================================================
export function ApplyDialog() {
  const {
    isApplyDialogOpen,
    applyingFormula,
    applyVariables,
    isApplying,
    closeApplyDialog,
    setApplyVariable,
    applyFormula,
  } = useFormulaStore();

  if (!isApplyDialogOpen || !applyingFormula) return null;

  // Check if all required variables are filled
  const missingRequired = applyingFormula.variables
    .filter((v) => v.required)
    .filter((v) => {
      const val = applyVariables[v.name];
      return val === undefined || val === '' || val === null;
    });

  const canApply = missingRequired.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeApplyDialog}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Beaker className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Apply Formula</h2>
              <p className="text-sm text-muted-foreground">{applyingFormula.name}</p>
            </div>
          </div>
          <button
            onClick={closeApplyDialog}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {/* Description */}
          {applyingFormula.description && (
            <div className="mb-4 p-3 rounded-lg bg-secondary/50 border border-border">
              <p className="text-sm text-muted-foreground">{applyingFormula.description}</p>
            </div>
          )}

          {/* Steps Preview */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              This will add {applyingFormula.steps.length} tasks to Backlog:
            </h3>
            <div className="space-y-1">
              {applyingFormula.steps.map((step, i) => (
                <div
                  key={step.id}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-xs">
                    {i + 1}
                  </span>
                  <span className="text-foreground">{step.name}</span>
                  {step.needs.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      (after: {step.needs.join(', ')})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Variables Form */}
          {applyingFormula.variables.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Variables</h3>
              {applyingFormula.variables.map((variable) => (
                <VariableInput
                  key={variable.name}
                  variable={variable}
                  value={applyVariables[variable.name] ?? ''}
                  onChange={(value) => setApplyVariable(variable.name, value)}
                />
              ))}
            </div>
          )}

          {/* Missing Required Warning */}
          {!canApply && missingRequired.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm text-primary">Missing required variables:</p>
                  <ul className="mt-1 text-xs text-primary/80">
                    {missingRequired.map((v) => (
                      <li key={v.name}>• {v.name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <button
            onClick={closeApplyDialog}
            className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={applyFormula}
            disabled={!canApply || isApplying}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-400 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
          >
            {isApplying ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Apply Formula
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
