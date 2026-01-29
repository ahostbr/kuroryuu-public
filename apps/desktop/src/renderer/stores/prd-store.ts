/**
 * Zustand store for PRD (Product Requirements Documents)
 *
 * Follows the pattern established by ideation-store.ts
 * Uses Gateway API for LMStudio-powered PRD generation with repo_intel context
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PRD, PRDConfig, PRDSession, PRDScope, PRDStatus, WorkflowType } from '../types/prd';
import { gatewayClient } from '../services/gateway-client';
import { useFormulaStore } from './formula-store';
import { useDomainConfigStore } from './domain-config-store';
import { toast } from '../components/ui/toast';

/**
 * Executing workflow state - tracks PTY sessions for active workflows
 */
interface ExecutingWorkflow {
  workflow: WorkflowType;
  ptyId: string;
  prdId: string;
  startedAt: string;
}

/**
 * Status transitions when marking workflow as done
 */
const STATUS_TRANSITIONS: Partial<Record<WorkflowType, { from: PRDStatus[]; to: PRDStatus }>> = {
  'plan-feature': { from: ['draft'], to: 'in_review' },
  'plan': { from: ['in_review'], to: 'approved' },
  'execute': { from: ['approved', 'in_progress'], to: 'in_progress' },
  'validate': { from: ['in_progress'], to: 'complete' },
  // These workflows don't change status
  'prime': undefined,
  'review': undefined,
  'code-review': undefined,
  'system-review': undefined,
  'execution-report': undefined,
  'hackathon-complete': undefined,
};

function generateId(): string {
  return `prd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface PRDStore {
  // Data State
  prds: PRD[];
  selectedPrdId: string | null;

  // Generation State
  isGenerating: boolean;
  generationProgress: number;
  generationConfig: PRDConfig | null;

  // UI State
  isDetailPanelOpen: boolean;
  isGenerateDialogOpen: boolean;

  // Workflow Node State (for workflow-first UI)
  selectedWorkflowNode: WorkflowType | null;
  isNodeDetailPanelOpen: boolean;

  // Workflow Execution State (persisted)
  executingWorkflows: Record<string, ExecutingWorkflow>;

  // Session Management
  sessions: PRDSession[];
  currentSessionId: string | null;
  isLoadingSessions: boolean;
  isSessionManagerOpen: boolean;

  // Actions
  selectPRD: (id: string | null) => void;
  addPRD: (prd: Omit<PRD, 'id' | 'created_at' | 'updated_at'>) => string;
  updatePRD: (id: string, updates: Partial<PRD>) => void;
  dismissPRD: (id: string) => void;
  dismissAll: () => void;

  // Generation
  startGeneration: (config: PRDConfig) => Promise<void>;
  cancelGeneration: () => void;

  // Session Management
  openSessionManager: () => void;
  closeSessionManager: () => void;
  loadSessions: () => Promise<void>;
  saveSession: (name: string, description?: string) => Promise<string | null>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  exportSession: (sessionId: string, format: 'markdown' | 'json') => Promise<string | null>;
  clearSession: () => void;

  // Formula Integration
  executePRDWithFormula: (prdId: string) => void;

  // Selectors
  getSelectedPRD: () => PRD | undefined;
  getPRDCountByStatus: () => Record<PRDStatus, number>;
  getExecutingWorkflow: (prdId: string) => ExecutingWorkflow | undefined;

  // Status Management
  updatePRDStatus: (id: string, status: PRDStatus) => void;

  // Workflow Node Actions
  selectWorkflowNode: (node: WorkflowType | null) => void;
  closeNodeDetailPanel: () => void;

  // Workflow Execution Actions
  setExecutingWorkflow: (prdId: string, workflow: WorkflowType, ptyId: string) => void;
  clearExecutingWorkflow: (prdId: string) => void;
  markWorkflowDone: (prdId: string) => void;
}

const DEFAULT_CONFIG: PRDConfig = {
  title: '',
  description: '',
  scope: 'feature',
  includeTechSpec: true,
  includeAcceptance: true,
  model: 'mistralai/devstral-small-2-2512',
};

export const usePRDStore = create<PRDStore>()(
  persist(
    (set, get) => ({
  // Initial state
  prds: [],
  selectedPrdId: null,
  isGenerating: false,
  generationProgress: 0,
  generationConfig: null,
  isDetailPanelOpen: false,
  isGenerateDialogOpen: false,
  selectedWorkflowNode: null,
  isNodeDetailPanelOpen: false,
  executingWorkflows: {},
  sessions: [],
  currentSessionId: null,
  isLoadingSessions: false,
  isSessionManagerOpen: false,

  selectPRD: (id) => {
    set({
      selectedPrdId: id,
      isDetailPanelOpen: id !== null
    });
  },

  addPRD: (prdData) => {
    const id = generateId();
    const now = new Date().toISOString();
    const prd: PRD = {
      ...prdData,
      id,
      created_at: now,
      updated_at: now,
    };
    set(state => ({
      prds: [prd, ...state.prds] // Prepend new PRD
    }));
    return id;
  },

  updatePRD: (id, updates) => {
    set(state => ({
      prds: state.prds.map(prd =>
        prd.id === id
          ? { ...prd, ...updates, updated_at: new Date().toISOString() }
          : prd
      ),
    }));
  },

  updatePRDStatus: (id: string, status: PRDStatus) => {
    get().updatePRD(id, { status });
  },

  dismissPRD: (id) => {
    set(state => ({
      prds: state.prds.map(prd =>
        prd.id === id
          ? { ...prd, is_archived: true, updated_at: new Date().toISOString() }
          : prd
      ),
      selectedPrdId: state.selectedPrdId === id ? null : state.selectedPrdId,
      isDetailPanelOpen: state.selectedPrdId === id ? false : state.isDetailPanelOpen,
    }));
  },

  dismissAll: () => {
    const count = get().prds.filter(p => !p.is_archived).length;
    set(state => ({
      prds: state.prds.map(prd => ({
        ...prd,
        is_archived: true,
        updated_at: new Date().toISOString()
      })),
      selectedPrdId: null,
      isDetailPanelOpen: false,
    }));
    toast.info(`Archived ${count} PRD${count !== 1 ? 's' : ''}`);
  },

  startGeneration: async (config: PRDConfig) => {
    set({
      isGenerating: true,
      generationProgress: 10,
      generationConfig: config,
    });

    try {
      // Get domain-specific model config
      const domainConfig = useDomainConfigStore.getState().getConfigForDomain('prd');
      const modelToUse = config.model || domainConfig.modelId;

      // Call Gateway API for PRD generation
      const result = await gatewayClient.generate.prd({
        title: config.title,
        description: config.description,
        scope: config.scope,
        include_tech_spec: config.includeTechSpec,
        include_acceptance: config.includeAcceptance,
        model: modelToUse,
        provider: domainConfig.provider,
      });

      set({ generationProgress: 50 });

      if (!result.ok) {
        console.error('PRD generation failed:', result.error);
        toast.error(`PRD generation failed: ${result.error || 'Unknown error'}`);
        set({
          isGenerating: false,
          generationProgress: 0,
          generationConfig: null,
        });
        return;
      }

      // Check if task was created (LMStudio unavailable)
      if (result.task_created && result.task_id) {
        set({
          isGenerating: false,
          generationProgress: 0,
          generationConfig: null,
        });

        toast.info(result.message || `LMStudio unavailable. Task ${result.task_id} created in Backlog.`);

        // Switch to Kanban tab - use custom event to avoid circular dependencies
        window.dispatchEvent(new CustomEvent('switch-to-kanban'));
        return;
      }

      // PRD was generated successfully
      if (!result.data) {
        console.error('PRD generation failed: no data returned');
        toast.error('No data returned');
        set({
          isGenerating: false,
          generationProgress: 0,
          generationConfig: null,
        });
        return;
      }

      // Query which backend was used for generation
      const backendResult = await gatewayClient.currentBackend();
      let authorName = 'AI'; // Default fallback
      if (backendResult.ok && backendResult.data) {
        // Map backend names to display names
        const backendDisplayNames: Record<string, string> = {
          'lmstudio': 'LMStudio',
          'cliproxyapi': 'Claude (CLI)',
          'claude': 'Claude',
        };
        authorName = backendDisplayNames[backendResult.data.name] || backendResult.data.name;
      }

      // Add the generated PRD
      const prdId = get().addPRD({
        title: result.data.title,
        scope: result.data.scope as PRDScope,
        status: result.data.status as PRDStatus,
        content: result.data.content,
        is_archived: false,
        metadata: {
          author: authorName,
          tags: [result.data.scope],
        },
      });

      // Simulate progress completion
      set({ generationProgress: 100 });

      // Small delay for visual feedback, then select the PRD
      await new Promise(resolve => setTimeout(resolve, 500));

      set({
        isGenerating: false,
        generationProgress: 0,
        generationConfig: null,
        selectedPrdId: prdId,
        isDetailPanelOpen: true,
      });

      toast.success('PRD generated successfully!');

    } catch (error) {
      console.error('PRD generation error:', error);
      toast.error(`Failed to generate PRD: ${error instanceof Error ? error.message : 'Network error'}`);
      set({
        isGenerating: false,
        generationProgress: 0,
        generationConfig: null,
      });
    }
  },

  cancelGeneration: () => {
    set({
      isGenerating: false,
      generationProgress: 0,
      generationConfig: null,
    });
  },

  executePRDWithFormula: (prdId: string) => {
    const prd = get().prds.find(p => p.id === prdId);
    if (!prd) {
      console.error('PRD not found:', prdId);
      toast.error('PRD not found');
      return;
    }

    // Parse PRD markdown to extract sections
    const sections = parsePRDSections(prd.content);

    // Find PRD-First formula
    const formulaStore = useFormulaStore.getState();
    const formula = formulaStore.formulas.find(
      f => f.formula_id === 'prd-first-feature'
    );

    if (!formula) {
      console.error('PRD-First formula not found');
      toast.error('PRD-First formula not found. Please ensure the formula is configured.');
      return;
    }

    // Update PRD status to in_progress
    get().updatePRD(prdId, { status: 'in_progress' });

    // Open ApplyDialog with pre-filled variables
    formulaStore.openApplyDialog(formula);

    // Pre-fill variables from PRD
    if (sections.overview) {
      formulaStore.setApplyVariable('project_name', prd.title);
      formulaStore.setApplyVariable('feature_description', sections.overview);
    }

    if (sections.acceptance) {
      formulaStore.setApplyVariable('acceptance_criteria', sections.acceptance);
    }

    // Map scope to complexity
    const complexityMap: Record<PRDScope, string> = {
      task: 'simple',
      feature: 'medium',
      epic: 'complex',
    };
    formulaStore.setApplyVariable('target_complexity', complexityMap[prd.scope]);

    toast.success('Formula pre-filled with PRD content');
  },

  getSelectedPRD: () => {
    const { prds, selectedPrdId } = get();
    return prds.find(p => p.id === selectedPrdId);
  },

  getPRDCountByStatus: () => {
    const { prds } = get();
    const activePRDs = prds.filter(p => !p.is_archived);
    const counts: Record<PRDStatus, number> = {
      draft: 0,
      in_review: 0,
      approved: 0,
      in_progress: 0,
      complete: 0,
    };
    activePRDs.forEach(prd => {
      counts[prd.status]++;
    });
    return counts;
  },

  // Session management (similar to ideation-store)
  openSessionManager: () => {
    set({ isSessionManagerOpen: true });
    get().loadSessions();
  },

  closeSessionManager: () => set({ isSessionManagerOpen: false }),

  loadSessions: async () => {
    set({ isLoadingSessions: true });
    try {
      // TODO: Implement API call when backend is ready
      // const result = await gatewayClient.prd.listSessions();
      // if (result.ok && result.data) {
      //   set({ sessions: result.data });
      // }
      set({ sessions: [] });
    } catch (e) {
      console.error('Failed to load PRD sessions:', e);
    } finally {
      set({ isLoadingSessions: false });
    }
  },

  saveSession: async (name: string, description = '') => {
    const { prds } = get();

    try {
      // TODO: Implement API call when backend is ready
      // const result = await gatewayClient.prd.saveSession(name, description, prds);
      // if (result.ok && result.data) {
      //   set({ currentSessionId: result.data.session_id });
      //   get().loadSessions();
      //   toast.success(`Session "${name}" saved successfully`);
      //   return result.data.session_id;
      // }
      console.log('Save PRD session:', name, description, prds.length, 'PRDs');
      toast.info('Session save not yet implemented (backend pending)');
      return null;
    } catch (e) {
      console.error('Failed to save PRD session:', e);
      toast.error('Failed to save session');
      return null;
    }
  },

  loadSession: async (sessionId: string) => {
    try {
      // TODO: Implement API call when backend is ready
      // const result = await gatewayClient.prd.loadSession(sessionId);
      // if (result.ok && result.data) {
      //   set({
      //     prds: result.data.prds,
      //     currentSessionId: sessionId,
      //     isSessionManagerOpen: false,
      //     selectedPrdId: null,
      //   });
      //   toast.success('Session loaded successfully');
      // }
      console.log('Load PRD session:', sessionId);
      toast.info('Session load not yet implemented (backend pending)');
    } catch (e) {
      console.error('Failed to load PRD session:', e);
      toast.error('Failed to load session');
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      // TODO: Implement API call when backend is ready
      // const result = await gatewayClient.prd.deleteSession(sessionId);
      // if (result.ok) {
      //   if (get().currentSessionId === sessionId) {
      //     set({ currentSessionId: null });
      //   }
      //   get().loadSessions();
      //   toast.success('Session deleted successfully');
      // }
      console.log('Delete PRD session:', sessionId);
      toast.info('Session delete not yet implemented (backend pending)');
    } catch (e) {
      console.error('Failed to delete PRD session:', e);
      toast.error('Failed to delete session');
    }
  },

  exportSession: async (sessionId: string, format: 'markdown' | 'json') => {
    try {
      // For now, export current PRDs (backend session loading not implemented yet)
      const activePRDs = get().prds.filter(p => !p.is_archived);

      if (activePRDs.length === 0) {
        toast.info('No PRDs to export');
        return null;
      }

      if (format === 'json') {
        // Export as JSON
        const exportData = {
          session_id: sessionId,
          exported_at: new Date().toISOString(),
          prd_count: activePRDs.length,
          prds: activePRDs.map(prd => ({
            id: prd.id,
            title: prd.title,
            scope: prd.scope,
            status: prd.status,
            content: prd.content,
            created_at: prd.created_at,
            updated_at: prd.updated_at,
            metadata: prd.metadata,
          })),
        };
        toast.success(`Exported ${activePRDs.length} PRD${activePRDs.length !== 1 ? 's' : ''} as JSON`);
        return JSON.stringify(exportData, null, 2);
      } else {
        // Export as Markdown
        const lines: string[] = [];
        lines.push('# PRD Session Export');
        lines.push('');
        lines.push(`**Exported**: ${new Date().toLocaleString()}`);
        lines.push(`**Total PRDs**: ${activePRDs.length}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        activePRDs.forEach((prd, index) => {
          lines.push(`# ${index + 1}. ${prd.title}`);
          lines.push('');
          lines.push(`**Scope**: ${prd.scope}`);
          lines.push(`**Status**: ${prd.status}`);
          lines.push(`**Created**: ${new Date(prd.created_at).toLocaleString()}`);
          if (prd.metadata?.author) {
            lines.push(`**Author**: ${prd.metadata.author}`);
          }
          if (prd.metadata?.tags && prd.metadata.tags.length > 0) {
            lines.push(`**Tags**: ${prd.metadata.tags.join(', ')}`);
          }
          lines.push('');
          lines.push(prd.content);
          lines.push('');
          lines.push('---');
          lines.push('');
        });

        toast.success(`Exported ${activePRDs.length} PRD${activePRDs.length !== 1 ? 's' : ''} as Markdown`);
        return lines.join('\n');
      }
    } catch (e) {
      console.error('Failed to export PRD session:', e);
      toast.error('Failed to export session');
      return null;
    }
  },

  clearSession: () => {
    const count = get().prds.length;
    set({
      prds: [],
      currentSessionId: null,
      selectedPrdId: null,
      isDetailPanelOpen: false,
    });
    toast.info(`Cleared ${count} PRD${count !== 1 ? 's' : ''}`);
  },

  // Workflow Node Actions
  selectWorkflowNode: (node) => {
    set({
      selectedWorkflowNode: node,
      isNodeDetailPanelOpen: node !== null,
    });
  },

  closeNodeDetailPanel: () => {
    set({
      selectedWorkflowNode: null,
      isNodeDetailPanelOpen: false,
    });
  },

  // Workflow Execution Actions
  setExecutingWorkflow: (prdId: string, workflow: WorkflowType, ptyId: string) => {
    set(state => ({
      executingWorkflows: {
        ...state.executingWorkflows,
        [prdId]: {
          workflow,
          ptyId,
          prdId,
          startedAt: new Date().toISOString(),
        },
      },
    }));
  },

  clearExecutingWorkflow: (prdId: string) => {
    set(state => {
      const { [prdId]: _, ...rest } = state.executingWorkflows;
      return { executingWorkflows: rest };
    });
  },

  markWorkflowDone: (prdId: string) => {
    const executingWorkflow = get().executingWorkflows[prdId];
    if (!executingWorkflow) {
      toast.info('No executing workflow to mark done');
      return;
    }

    const { workflow } = executingWorkflow;
    const transition = STATUS_TRANSITIONS[workflow];

    // Clear the executing state first
    get().clearExecutingWorkflow(prdId);

    // Apply status transition if defined
    if (transition) {
      const prd = get().prds.find(p => p.id === prdId);
      if (prd && transition.from.includes(prd.status)) {
        get().updatePRDStatus(prdId, transition.to);
        toast.success(`${workflow} complete - PRD status updated to ${transition.to.replace('_', ' ')}`);
      } else {
        toast.success(`${workflow} complete`);
      }
    } else {
      toast.success('Workflow complete');
    }
  },

  getExecutingWorkflow: (prdId: string) => {
    return get().executingWorkflows[prdId];
  },
    }),
    {
      name: 'kuroryuu-prd-store',
      partialize: (state) => ({
        // Only persist these fields
        prds: state.prds,
        executingWorkflows: state.executingWorkflows,
      }),
    }
  )
);

// E2E test hooks are now initialized via e2e-test-hooks.ts
// which is imported in main.tsx

/**
 * Parse PRD markdown content to extract sections
 */
function parsePRDSections(content: string): {
  overview?: string;
  acceptance?: string;
  requirements?: string;
  technical?: string;
} {
  const overviewMatch = content.match(/##\s+Overview\s*\n([\s\S]*?)(?=\n##|$)/);
  const acceptanceMatch = content.match(/##\s+Acceptance Criteria\s*\n([\s\S]*?)(?=\n##|$)/);
  const requirementsMatch = content.match(/##\s+Requirements\s*\n([\s\S]*?)(?=\n##|$)/);
  const technicalMatch = content.match(/##\s+Technical Specification\s*\n([\s\S]*?)(?=\n##|$)/);

  return {
    overview: overviewMatch?.[1]?.trim(),
    acceptance: acceptanceMatch?.[1]?.trim(),
    requirements: requirementsMatch?.[1]?.trim(),
    technical: technicalMatch?.[1]?.trim(),
  };
}
