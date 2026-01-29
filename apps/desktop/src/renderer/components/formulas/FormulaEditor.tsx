/**
 * Formula Editor Component
 * 
 * Full-featured editor for creating and editing formulas.
 * Features:
 * - Step list with drag-drop reordering
 * - Variable management
 * - DAG visualization (future)
 * - TOML preview
 */
import { useState } from 'react';
import {
  X,
  Save,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Tag,
  GitBranch,
  Beaker,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { useFormulaStore, type Formula, type FormulaStep, type FormulaVar, type FormulaVarType } from '../../stores/formula-store';

// ============================================================================
// StepEditor - Editor for a single step
// ============================================================================
interface StepEditorProps {
  step: FormulaStep;
  index: number;
  allSteps: FormulaStep[];
  onChange: (step: FormulaStep) => void;
  onDelete: () => void;
}

function StepEditor({ step, index, allSteps, onChange, onDelete }: StepEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const otherStepIds = allSteps.filter((s) => s.id !== step.id).map((s) => s.id);

  const update = (updates: Partial<FormulaStep>) => {
    onChange({ ...step, ...updates });
  };

  return (
    <div className="border border-border rounded-lg bg-card/50 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 p-3 bg-secondary/50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs flex items-center justify-center">
          {index + 1}
        </span>
        <input
          value={step.name}
          onChange={(e) => update({ name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="Step name"
          className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
        />
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Step ID */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Step ID</label>
            <input
              value={step.id}
              onChange={(e) => update({ id: e.target.value.toLowerCase().replace(/\s/g, '_') })}
              placeholder="step_id"
              className="w-full px-2 py-1.5 text-sm rounded bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Description</label>
            <textarea
              value={step.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="Step description..."
              rows={2}
              className="w-full px-2 py-1.5 text-sm rounded bg-secondary border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none"
            />
          </div>

          {/* Prompt Ref or Inline */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Prompt Reference (ai/prompts/*.md)
            </label>
            <input
              value={step.prompt_ref || ''}
              onChange={(e) => update({ prompt_ref: e.target.value || null })}
              placeholder="e.g., create-prd"
              className="w-full px-2 py-1.5 text-sm rounded bg-secondary border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

          {!step.prompt_ref && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Inline Prompt (if no ref)
              </label>
              <textarea
                value={step.inline_prompt}
                onChange={(e) => update({ inline_prompt: e.target.value })}
                placeholder="Enter inline prompt..."
                rows={3}
                className="w-full px-2 py-1.5 text-sm rounded bg-secondary border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none font-mono"
              />
            </div>
          )}

          {/* Dependencies */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Depends On (needs)
            </label>
            <div className="flex flex-wrap gap-2">
              {otherStepIds.map((id) => (
                <label key={id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={step.needs.includes(id)}
                    onChange={(e) => {
                      const needs = e.target.checked
                        ? [...step.needs, id]
                        : step.needs.filter((n) => n !== id);
                      update({ needs });
                    }}
                    className="w-3 h-3 rounded border-border bg-secondary text-purple-500"
                  />
                  <span className="text-muted-foreground">{id}</span>
                </label>
              ))}
              {otherStepIds.length === 0 && (
                <span className="text-xs text-muted-foreground">No other steps to depend on</span>
              )}
            </div>
          </div>

          {/* Options row */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={step.parallel}
                onChange={(e) => update({ parallel: e.target.checked })}
                className="w-3 h-3 rounded border-border bg-secondary text-purple-500"
              />
              <span className="text-muted-foreground">Parallel execution</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={step.optional}
                onChange={(e) => update({ optional: e.target.checked })}
                className="w-3 h-3 rounded border-border bg-secondary text-purple-500"
              />
              <span className="text-muted-foreground">Optional</span>
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Complexity:</span>
              <input
                type="number"
                min={1}
                max={10}
                value={step.complexity_hint}
                onChange={(e) => update({ complexity_hint: Number(e.target.value) })}
                className="w-12 px-1.5 py-0.5 text-xs rounded bg-secondary border border-border text-foreground"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VariableEditor - Editor for a single variable
// ============================================================================
interface VariableEditorProps {
  variable: FormulaVar;
  onChange: (variable: FormulaVar) => void;
  onDelete: () => void;
}

function VariableEditor({ variable, onChange, onDelete }: VariableEditorProps) {
  const update = (updates: Partial<FormulaVar>) => {
    onChange({ ...variable, ...updates });
  };

  return (
    <div className="flex items-start gap-2 p-2 rounded bg-secondary/50 border border-border">
      <div className="flex-1 grid grid-cols-4 gap-2">
        <input
          value={variable.name}
          onChange={(e) => update({ name: e.target.value.replace(/\s/g, '_') })}
          placeholder="var_name"
          className="px-2 py-1 text-sm rounded bg-card border border-border text-foreground"
        />
        <select
          value={variable.var_type}
          onChange={(e) => update({ var_type: e.target.value as FormulaVarType })}
          className="px-2 py-1 text-sm rounded bg-card border border-border text-foreground"
        >
          <option value="string">String</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
          <option value="choice">Choice</option>
          <option value="file_path">File Path</option>
        </select>
        <input
          value={variable.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="Prompt question?"
          className="px-2 py-1 text-sm rounded bg-card border border-border text-foreground"
        />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={variable.required}
              onChange={(e) => update({ required: e.target.checked })}
              className="w-3 h-3 rounded border-border bg-secondary text-purple-500"
            />
            <span className="text-muted-foreground">Required</span>
          </label>
          <button
            onClick={onDelete}
            className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FormulaEditor - Main editor component
// ============================================================================
export function FormulaEditor() {
  const {
    isEditorOpen,
    editingFormula,
    closeEditor,
    saveEditingFormula,
    updateEditingFormula,
    validateFormula,
  } = useFormulaStore();

  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'steps' | 'variables' | 'meta'>('steps');

  if (!isEditorOpen || !editingFormula) return null;

  const handleSave = async () => {
    setIsSaving(true);
    const success = await saveEditingFormula();
    setIsSaving(false);
  };

  const handleValidate = async () => {
    if (editingFormula.formula_id) {
      const errors = await validateFormula(editingFormula.formula_id);
      setValidationErrors(errors);
    } else {
      // Local validation
      const errors: string[] = [];
      if (!editingFormula.name) errors.push('Name is required');
      if (editingFormula.steps.length === 0) errors.push('At least one step is required');
      editingFormula.steps.forEach((s, i) => {
        if (!s.id) errors.push(`Step ${i + 1}: ID is required`);
        if (!s.name) errors.push(`Step ${i + 1}: Name is required`);
      });
      setValidationErrors(errors);
    }
  };

  const addStep = () => {
    const newStep: FormulaStep = {
      id: `step_${editingFormula.steps.length + 1}`,
      name: `Step ${editingFormula.steps.length + 1}`,
      description: '',
      prompt_ref: null,
      inline_prompt: '',
      needs: [],
      input_artifacts: [],
      output_artifact: null,
      parallel: false,
      complexity_hint: 5,
      optional: false,
      uses_vars: [],
    };
    updateEditingFormula({ steps: [...editingFormula.steps, newStep] });
  };

  const updateStep = (index: number, step: FormulaStep) => {
    const steps = [...editingFormula.steps];
    steps[index] = step;
    updateEditingFormula({ steps });
  };

  const deleteStep = (index: number) => {
    const steps = editingFormula.steps.filter((_, i) => i !== index);
    updateEditingFormula({ steps });
  };

  const addVariable = () => {
    const newVar: FormulaVar = {
      name: `var_${editingFormula.variables.length + 1}`,
      var_type: 'string',
      required: true,
      default: null,
      prompt: '',
      options: [],
      description: '',
    };
    updateEditingFormula({ variables: [...editingFormula.variables, newVar] });
  };

  const updateVariable = (index: number, variable: FormulaVar) => {
    const variables = [...editingFormula.variables];
    variables[index] = variable;
    updateEditingFormula({ variables });
  };

  const deleteVariable = (index: number) => {
    const variables = editingFormula.variables.filter((_, i) => i !== index);
    updateEditingFormula({ variables });
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeEditor}
      />

      {/* Editor Panel */}
      <div className="relative ml-auto w-full max-w-2xl bg-card border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Beaker className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">
                {editingFormula.formula_id ? 'Edit Formula' : 'New Formula'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {editingFormula.name || 'Untitled'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleValidate}
              className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Validate
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-400 disabled:bg-muted disabled:text-muted-foreground transition-colors"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </button>
            <button
              onClick={closeEditor}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">Validation Errors:</p>
                <ul className="text-red-400/80 text-xs">
                  {validationErrors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(['meta', 'variables', 'steps'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-purple-400 border-b-2 border-purple-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'meta' && 'Metadata'}
              {tab === 'variables' && `Variables (${editingFormula.variables.length})`}
              {tab === 'steps' && `Steps (${editingFormula.steps.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Metadata Tab */}
          {activeTab === 'meta' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Name</label>
                <input
                  value={editingFormula.name}
                  onChange={(e) => updateEditingFormula({ name: e.target.value })}
                  placeholder="Formula name"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Description</label>
                <textarea
                  value={editingFormula.description}
                  onChange={(e) => updateEditingFormula({ description: e.target.value })}
                  placeholder="Describe what this formula does..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Version</label>
                <input
                  value={editingFormula.version}
                  onChange={(e) => updateEditingFormula({ version: e.target.value })}
                  placeholder="1.0"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Tags (comma-separated)</label>
                <input
                  value={editingFormula.tags.join(', ')}
                  onChange={(e) =>
                    updateEditingFormula({
                      tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                    })
                  }
                  placeholder="feature, workflow, prd"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>
            </div>
          )}

          {/* Variables Tab */}
          {activeTab === 'variables' && (
            <div className="space-y-3">
              {editingFormula.variables.map((variable, i) => (
                <VariableEditor
                  key={i}
                  variable={variable}
                  onChange={(v) => updateVariable(i, v)}
                  onDelete={() => deleteVariable(i)}
                />
              ))}
              <button
                onClick={addVariable}
                className="flex items-center gap-2 w-full p-3 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Variable
              </button>
            </div>
          )}

          {/* Steps Tab */}
          {activeTab === 'steps' && (
            <div className="space-y-3">
              {editingFormula.steps.map((step, i) => (
                <StepEditor
                  key={i}
                  step={step}
                  index={i}
                  allSteps={editingFormula.steps}
                  onChange={(s) => updateStep(i, s)}
                  onDelete={() => deleteStep(i)}
                />
              ))}
              <button
                onClick={addStep}
                className="flex items-center gap-2 w-full p-3 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Step
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
