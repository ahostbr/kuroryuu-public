/**
 * Zustand store for Formula System
 *
 * Manages TOML workflow templates that add tasks to ai/todo.md.
 * Formulas define structured workflows that can be applied to add tasks.
 */
import { create } from 'zustand';
import { toast } from '../components/ui/toast';
import { useTaskStore } from './task-store';

// --- Types ---

export type FormulaVarType = 'string' | 'number' | 'boolean' | 'choice' | 'file_path';

export interface FormulaVar {
  name: string;
  var_type: FormulaVarType;
  required: boolean;
  default?: string | null;
  prompt: string;
  options: string[];
  description: string;
}

export interface FormulaStep {
  id: string;
  name: string;
  description: string;
  prompt_ref?: string | null;
  inline_prompt: string;
  needs: string[];
  input_artifacts: string[];
  output_artifact?: string | null;
  parallel: boolean;
  complexity_hint: number;
  optional: boolean;
  uses_vars: string[];
}

export interface Formula {
  formula_id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  variables: FormulaVar[];
  steps: FormulaStep[];
  created_at: string;
  updated_at?: string | null;
  file_path?: string | null;
  is_builtin: boolean;
}

export interface CookVariables {
  [key: string]: string | number | boolean;
}

// --- Store ---

interface FormulaStore {
  // State
  formulas: Formula[];
  selectedFormulaId: string | null;
  isLoading: boolean;
  isApplying: boolean;
  error: string | null;
  
  // Apply dialog state
  isApplyDialogOpen: boolean;
  applyingFormula: Formula | null;
  applyVariables: CookVariables;
  
  // Editor state
  isEditorOpen: boolean;
  editingFormula: Formula | null;
  
  // Actions
  loadFormulas: () => Promise<void>;
  selectFormula: (id: string | null) => void;
  getFormula: (id: string) => Promise<Formula | null>;
  
  // CRUD
  createFormula: (formula: Partial<Formula>) => Promise<string | null>;
  updateFormula: (id: string, updates: Partial<Formula>) => Promise<boolean>;
  deleteFormula: (id: string) => Promise<boolean>;
  cloneFormula: (id: string, newName?: string) => Promise<string | null>;
  validateFormula: (id: string) => Promise<string[]>;
  
  // Apply (execute formula)
  openApplyDialog: (formula: Formula) => void;
  closeApplyDialog: () => void;
  setApplyVariable: (name: string, value: string | number | boolean) => void;
  applyFormula: () => Promise<string | null>;
  
  // Editor
  openEditor: (formula?: Formula) => void;
  closeEditor: () => void;
  saveEditingFormula: () => Promise<boolean>;
  updateEditingFormula: (updates: Partial<Formula>) => void;
  
  // Selectors
  getSelectedFormula: () => Formula | undefined;
  getBuiltinFormulas: () => Formula[];
  getCustomFormulas: () => Formula[];
  getFormulasByTag: (tag: string) => Formula[];
}

// Gateway base URL
const GATEWAY_URL = 'http://127.0.0.1:8200';

// API helpers using direct fetch
async function fetchFormulas(): Promise<Formula[]> {
  const response = await fetch(`${GATEWAY_URL}/v1/orchestration/formulas`);
  const data = await response.json();
  if (data.ok) {
    return data.formulas || [];
  }
  throw new Error(data.message || 'Failed to fetch formulas');
}

async function fetchFormula(id: string): Promise<Formula | null> {
  const response = await fetch(`${GATEWAY_URL}/v1/orchestration/formulas/${encodeURIComponent(id)}`);
  const data = await response.json();
  if (data.ok) {
    return data.formula;
  }
  return null;
}

async function apiCreateFormula(formula: Partial<Formula>): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/v1/orchestration/formulas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: formula.name,
      description: formula.description || '',
      tags: formula.tags || [],
      variables: formula.variables?.map(v => ({
        name: v.name,
        type: v.var_type,
        required: v.required,
        default: v.default,
        prompt: v.prompt,
        options: v.options,
        description: v.description,
      })) || [],
      steps: formula.steps?.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        prompt_ref: s.prompt_ref,
        inline_prompt: s.inline_prompt,
        needs: s.needs,
        input_artifacts: s.input_artifacts,
        output_artifact: s.output_artifact,
        parallel: s.parallel,
        complexity_hint: s.complexity_hint,
        optional: s.optional,
        uses_vars: s.uses_vars,
      })) || [],
    }),
  });
  
  const data = await response.json();
  if (data.ok) {
    return data.formula_id;
  }
  throw new Error(data.message || 'Failed to create formula');
}

async function apiUpdateFormula(id: string, formula: Partial<Formula>): Promise<boolean> {
  const response = await fetch(`${GATEWAY_URL}/v1/orchestration/formulas/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: formula.name,
      description: formula.description || '',
      tags: formula.tags || [],
      variables: formula.variables?.map(v => ({
        name: v.name,
        type: v.var_type,
        required: v.required,
        default: v.default,
        prompt: v.prompt,
        options: v.options,
        description: v.description,
      })) || [],
      steps: formula.steps?.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        prompt_ref: s.prompt_ref,
        inline_prompt: s.inline_prompt,
        needs: s.needs,
        input_artifacts: s.input_artifacts,
        output_artifact: s.output_artifact,
        parallel: s.parallel,
        complexity_hint: s.complexity_hint,
        optional: s.optional,
        uses_vars: s.uses_vars,
      })) || [],
    }),
  });
  const data = await response.json();
  return data.ok === true;
}

async function apiDeleteFormula(id: string): Promise<boolean> {
  const response = await fetch(`${GATEWAY_URL}/v1/orchestration/formulas/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await response.json();
  return data.ok === true;
}

async function apiCloneFormula(id: string, newName?: string): Promise<string> {
  const url = new URL(`${GATEWAY_URL}/v1/orchestration/formulas/${encodeURIComponent(id)}/clone`);
  if (newName) {
    url.searchParams.set('new_name', newName);
  }
  const response = await fetch(url.toString(), { method: 'POST' });
  const data = await response.json();
  if (data.ok) {
    return data.clone_id;
  }
  throw new Error(data.message || 'Failed to clone formula');
}

async function apiValidateFormula(id: string): Promise<string[]> {
  const response = await fetch(`${GATEWAY_URL}/v1/orchestration/formulas/${encodeURIComponent(id)}/validate`, {
    method: 'POST',
  });
  const data = await response.json();
  return data.errors || [];
}

interface ApplyFormulaResult {
  task_ids: string[];
  task_count: number;
  message: string;
}

async function apiApplyFormula(id: string, variables: CookVariables, priority: number = 5): Promise<ApplyFormulaResult> {
  const response = await fetch(`${GATEWAY_URL}/v1/orchestration/formulas/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      formula_id: id,
      variables,
      priority,
      metadata: {},
    }),
  });
  const data = await response.json();
  if (data.ok) {
    return {
      task_ids: data.task_ids || [data.task_id],  // Support both new and legacy response
      task_count: data.task_count || data.subtask_count || 1,
      message: data.message || 'Tasks added to Backlog',
    };
  }
  throw new Error(data.message || 'Failed to apply formula');
}

// Create default empty formula
function createEmptyFormula(): Formula {
  return {
    formula_id: '',
    name: 'New Formula',
    description: '',
    version: '1.0',
    author: 'user',
    tags: [],
    variables: [],
    steps: [],
    created_at: new Date().toISOString(),
    updated_at: null,
    file_path: null,
    is_builtin: false,
  };
}

export const useFormulaStore = create<FormulaStore>((set, get) => ({
  // Initial state
  formulas: [],
  selectedFormulaId: null,
  isLoading: false,
  isApplying: false,
  error: null,
  isApplyDialogOpen: false,
  applyingFormula: null,
  applyVariables: {},
  isEditorOpen: false,
  editingFormula: null,
  
  // Load all formulas
  loadFormulas: async () => {
    set({ isLoading: true, error: null });
    try {
      const formulas = await fetchFormulas();
      set({ formulas, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load formulas';
      set({ error: message, isLoading: false });
      toast.error(message);
    }
  },
  
  // Select a formula
  selectFormula: (id) => set({ selectedFormulaId: id }),
  
  // Get single formula
  getFormula: async (id) => {
    try {
      return await fetchFormula(id);
    } catch {
      return null;
    }
  },
  
  // Create formula
  createFormula: async (formula) => {
    try {
      const id = await apiCreateFormula(formula);
      await get().loadFormulas();
      toast.success('Formula created');
      return id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create formula';
      toast.error(message);
      return null;
    }
  },
  
  // Update formula
  updateFormula: async (id, updates) => {
    try {
      const success = await apiUpdateFormula(id, updates);
      if (success) {
        await get().loadFormulas();
        toast.success('Formula updated');
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update formula';
      toast.error(message);
      return false;
    }
  },
  
  // Delete formula
  deleteFormula: async (id) => {
    try {
      const success = await apiDeleteFormula(id);
      if (success) {
        await get().loadFormulas();
        toast.success('Formula deleted');
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete formula';
      toast.error(message);
      return false;
    }
  },
  
  // Clone formula
  cloneFormula: async (id, newName) => {
    try {
      const cloneId = await apiCloneFormula(id, newName);
      await get().loadFormulas();
      toast.success('Formula cloned');
      return cloneId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clone formula';
      toast.error(message);
      return null;
    }
  },
  
  // Validate formula
  validateFormula: async (id) => {
    try {
      return await apiValidateFormula(id);
    } catch {
      return ['Validation request failed'];
    }
  },
  
  // Open apply dialog
  openApplyDialog: (formula) => {
    // Initialize variables with defaults
    const variables: CookVariables = {};
    for (const v of formula.variables) {
      if (v.default !== null && v.default !== undefined) {
        variables[v.name] = v.default;
      } else if (v.var_type === 'boolean') {
        variables[v.name] = false;
      } else if (v.var_type === 'number') {
        variables[v.name] = 0;
      } else {
        variables[v.name] = '';
      }
    }

    set({
      isApplyDialogOpen: true,
      applyingFormula: formula,
      applyVariables: variables,
    });
  },

  // Close apply dialog
  closeApplyDialog: () => {
    set({
      isApplyDialogOpen: false,
      applyingFormula: null,
      applyVariables: {},
    });
  },

  // Set apply variable
  setApplyVariable: (name, value) => {
    set((state) => ({
      applyVariables: { ...state.applyVariables, [name]: value },
    }));
  },

  // Execute apply - adds tasks to ai/todo.md Backlog
  applyFormula: async () => {
    const { applyingFormula, applyVariables } = get();
    if (!applyingFormula) return null;

    set({ isApplying: true });

    try {
      const result = await apiApplyFormula(applyingFormula.formula_id, applyVariables);
      set({ isApplying: false });
      get().closeApplyDialog();

      // Show success with task IDs
      const taskIdsStr = result.task_ids.join(', ');
      toast.success(`Added ${result.task_count} tasks to Backlog: ${taskIdsStr}`);

      // Refresh task list to show new tasks in Kanban
      useTaskStore.getState().loadTasks();

      // Return first task ID for compatibility
      return result.task_ids[0] || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply formula';
      set({ isApplying: false });
      toast.error(message);
      return null;
    }
  },
  
  // Open editor
  openEditor: (formula) => {
    set({
      isEditorOpen: true,
      editingFormula: formula || createEmptyFormula(),
    });
  },
  
  // Close editor
  closeEditor: () => {
    set({
      isEditorOpen: false,
      editingFormula: null,
    });
  },
  
  // Save editing formula
  saveEditingFormula: async () => {
    const { editingFormula } = get();
    if (!editingFormula) return false;
    
    try {
      if (editingFormula.formula_id) {
        // Update existing
        const success = await get().updateFormula(editingFormula.formula_id, editingFormula);
        if (success) get().closeEditor();
        return success;
      } else {
        // Create new
        const id = await get().createFormula(editingFormula);
        if (id) get().closeEditor();
        return id !== null;
      }
    } catch {
      return false;
    }
  },
  
  // Update editing formula (local state only)
  updateEditingFormula: (updates) => {
    set((state) => ({
      editingFormula: state.editingFormula
        ? { ...state.editingFormula, ...updates }
        : null,
    }));
  },
  
  // Selectors
  getSelectedFormula: () => {
    const { formulas, selectedFormulaId } = get();
    return formulas.find(f => f.formula_id === selectedFormulaId);
  },
  
  getBuiltinFormulas: () => {
    return get().formulas.filter(f => f.is_builtin);
  },
  
  getCustomFormulas: () => {
    return get().formulas.filter(f => !f.is_builtin);
  },
  
  getFormulasByTag: (tag) => {
    return get().formulas.filter(f => f.tags.includes(tag));
  },
}));
