/**
 * Formula List Component
 *
 * Displays available formulas with apply/edit actions.
 * Used in the Ideation panel alongside idea generation.
 */
import { useEffect } from 'react';
import {
  Beaker,
  Play,
  Edit3,
  Copy,
  Trash2,
  Plus,
  Tag,
  GitBranch,
  Clock,
  User,
  Loader2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useFormulaStore, type Formula } from '../../stores/formula-store';

// ============================================================================
// FormulaCard - Individual formula card
// ============================================================================
interface FormulaCardProps {
  formula: Formula;
  isSelected: boolean;
  onSelect: () => void;
  onApply: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete?: () => void;
}

function FormulaCard({
  formula,
  isSelected,
  onSelect,
  onApply,
  onEdit,
  onClone,
  onDelete,
}: FormulaCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`group p-4 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'bg-secondary border-purple-500/50 ring-1 ring-purple-500/20'
          : 'bg-card border-border hover:border-border hover:bg-secondary/50'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Beaker className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">{formula.name}</h3>
            <p className="text-xs text-muted-foreground">{formula.steps.length} steps</p>
          </div>
        </div>
        {formula.is_builtin && (
          <span className="px-2 py-0.5 text-xs rounded bg-secondary text-muted-foreground border border-border">
            Built-in
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
        {formula.description || 'No description'}
      </p>

      {/* Tags */}
      {Array.isArray(formula.tags) && formula.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {formula.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-secondary text-muted-foreground"
            >
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
          {formula.tags.length > 3 && (
            <span className="px-1.5 py-0.5 text-xs text-muted-foreground">
              +{formula.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
        <span className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          v{formula.version}
        </span>
        <span className="flex items-center gap-1">
          <User className="w-3 h-3" />
          {formula.author}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onApply();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500 text-white text-xs font-medium hover:bg-purple-400 transition-colors"
        >
          <Play className="w-3 h-3" />
          Apply
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-1.5 rounded-lg bg-muted text-foreground hover:bg-muted transition-colors"
          title="Edit"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClone();
          }}
          className="p-1.5 rounded-lg bg-muted text-foreground hover:bg-muted transition-colors"
          title="Clone"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        {onDelete && !formula.is_builtin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 rounded-lg bg-muted text-foreground hover:bg-red-500 hover:text-white transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// FormulaList - Main formula list component
// ============================================================================
export function FormulaList() {
  const {
    formulas,
    selectedFormulaId,
    isLoading,
    loadFormulas,
    selectFormula,
    openApplyDialog,
    openEditor,
    cloneFormula,
    deleteFormula,
  } = useFormulaStore();

  // Load formulas on mount
  useEffect(() => {
    loadFormulas();
  }, [loadFormulas]);

  const builtinFormulas = formulas.filter((f) => f.is_builtin);
  const customFormulas = formulas.filter((f) => !f.is_builtin);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Beaker className="w-5 h-5 text-purple-400" />
          <h2 className="font-semibold text-foreground">Formulas</h2>
          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400">
            {formulas.length}
          </span>
        </div>
        <button
          onClick={() => openEditor()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 text-sm hover:bg-purple-500/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Formula
        </button>
      </div>

      {/* Empty State */}
      {formulas.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-500/20 flex items-center justify-center">
            <Beaker className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No Formulas</h3>
          <p className="text-muted-foreground mb-4">
            Formulas are reusable workflow templates.
          </p>
          <button
            onClick={() => openEditor()}
            className="flex items-center gap-2 px-4 py-2 mx-auto rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-400 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Create First Formula
          </button>
        </div>
      )}

      {/* Built-in Formulas */}
      {builtinFormulas.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase mb-3">
            Built-in Formulas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {builtinFormulas.map((formula) => (
              <FormulaCard
                key={formula.formula_id}
                formula={formula}
                isSelected={selectedFormulaId === formula.formula_id}
                onSelect={() => selectFormula(formula.formula_id)}
                onApply={() => openApplyDialog(formula)}
                onEdit={() => openEditor(formula)}
                onClone={() => cloneFormula(formula.formula_id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Custom Formulas */}
      {customFormulas.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase mb-3">
            Custom Formulas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {customFormulas.map((formula) => (
              <FormulaCard
                key={formula.formula_id}
                formula={formula}
                isSelected={selectedFormulaId === formula.formula_id}
                onSelect={() => selectFormula(formula.formula_id)}
                onApply={() => openApplyDialog(formula)}
                onEdit={() => openEditor(formula)}
                onClone={() => cloneFormula(formula.formula_id)}
                onDelete={() => deleteFormula(formula.formula_id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
