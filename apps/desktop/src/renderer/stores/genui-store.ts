import { create } from 'zustand';
import type { A2UIComponent, ActivityLogEntry, DashboardState, JsonPatch } from '../types/genui';

const ZONE_ORDER = ['hero', 'metrics', 'insights', 'content', 'media', 'resources', 'tags'];

function groupByZone(components: A2UIComponent[]): Record<string, A2UIComponent[]> {
  return components.reduce((acc, comp) => {
    const zone = comp.zone || 'content';
    (acc[zone] ??= []).push(comp);
    return acc;
  }, {} as Record<string, A2UIComponent[]>);
}

function applyJsonPatch(components: A2UIComponent[], patches: JsonPatch[]): A2UIComponent[] {
  let result = [...components];
  for (const patch of patches) {
    if (patch.op === 'add' && patch.path === '/components/-') {
      result.push(patch.value as A2UIComponent);
    } else if (patch.op === 'replace' && patch.path.startsWith('/components/')) {
      const idx = parseInt(patch.path.split('/')[2], 10);
      if (!isNaN(idx) && idx < result.length) {
        result[idx] = patch.value as A2UIComponent;
      }
    } else if (patch.op === 'remove' && patch.path.startsWith('/components/')) {
      const idx = parseInt(patch.path.split('/')[2], 10);
      if (!isNaN(idx) && idx < result.length) {
        result.splice(idx, 1);
      }
    }
  }
  return result;
}

interface GenUIState extends DashboardState {
  componentsByZone: Record<string, A2UIComponent[]>;

  generateDashboard: (markdown: string, layoutOverride?: string) => Promise<void>;
  reset: () => void;
  applySnapshot: (snapshot: Partial<DashboardState>) => void;
  applyDelta: (patches: JsonPatch[]) => void;
}

const initialState: DashboardState = {
  markdownContent: '',
  documentTitle: '',
  documentType: '',
  contentAnalysis: {},
  layoutType: '',
  components: [],
  status: 'idle',
  progress: 0,
  currentStep: '',
  activityLog: [],
  errorMessage: null,
};

export const useGenUIStore = create<GenUIState>((set, get) => ({
  ...initialState,
  componentsByZone: {},

  generateDashboard: async (markdown: string, layoutOverride?: string) => {
    set({
      ...initialState,
      markdownContent: markdown,
      status: 'analyzing',
      progress: 0,
      componentsByZone: {},
    });

    try {
      const body: Record<string, string> = { markdown };
      if (layoutOverride) body.layout_override = layoutOverride;

      const response = await fetch('http://127.0.0.1:8200/v1/genui/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Gateway error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            const eventType = event.type;

            if (eventType === 'STATE_SNAPSHOT') {
              // AG-UI wraps snapshot in event.snapshot; Gateway sends snake_case keys
              const raw = event.snapshot || event;
              const mapped: Record<string, any> = {};
              if (raw.status !== undefined) mapped.status = raw.status;
              if (raw.progress !== undefined) mapped.progress = raw.progress;
              if (raw.current_step !== undefined) mapped.currentStep = raw.current_step;
              if (raw.document_title !== undefined) mapped.documentTitle = raw.document_title;
              if (raw.document_type !== undefined) mapped.documentType = raw.document_type;
              if (raw.layout_type !== undefined) mapped.layoutType = raw.layout_type;
              if (raw.content_analysis !== undefined) mapped.contentAnalysis = raw.content_analysis;
              if (raw.error_message !== undefined) mapped.errorMessage = raw.error_message;
              if (raw.components !== undefined) mapped.components = raw.components;
              get().applySnapshot(mapped);
            } else if (eventType === 'STATE_DELTA') {
              const patches = event.delta as JsonPatch[];
              if (patches) get().applyDelta(patches);
            } else if (eventType === 'RUN_ERROR') {
              set({ status: 'error', errorMessage: event.message || 'Unknown error' });
            } else if (eventType === 'STEP_STARTED') {
              set(state => ({
                activityLog: [...state.activityLog, {
                  timestamp: new Date().toISOString(),
                  step: event.stepName || '',
                  message: `Started: ${event.stepName}`,
                }],
              }));
            } else if (eventType === 'STEP_FINISHED') {
              set(state => ({
                activityLog: [...state.activityLog, {
                  timestamp: new Date().toISOString(),
                  step: event.stepName || '',
                  message: `Finished: ${event.stepName}`,
                }],
              }));
            } else if (eventType === 'RUN_FINISHED') {
              // Fallback: ensure status is 'complete' even if final STATE_SNAPSHOT missed
              const current = get();
              if (current.status !== 'complete' && current.status !== 'error') {
                set({ status: 'complete', progress: 100 });
              }
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    } catch (err: any) {
      set({
        status: 'error',
        errorMessage: err.message || 'Failed to connect to Gateway',
      });
    }
  },

  reset: () => set({ ...initialState, componentsByZone: {} }),

  applySnapshot: (snapshot) => {
    set(state => {
      const updates: Partial<GenUIState> = {};

      if (snapshot.status !== undefined) updates.status = snapshot.status;
      if (snapshot.progress !== undefined) updates.progress = snapshot.progress;
      if (snapshot.currentStep !== undefined) updates.currentStep = snapshot.currentStep;
      if (snapshot.documentTitle !== undefined) updates.documentTitle = snapshot.documentTitle;
      if (snapshot.documentType !== undefined) updates.documentType = snapshot.documentType;
      if (snapshot.layoutType !== undefined) updates.layoutType = snapshot.layoutType;
      if (snapshot.contentAnalysis !== undefined) updates.contentAnalysis = snapshot.contentAnalysis;
      if (snapshot.errorMessage !== undefined) updates.errorMessage = snapshot.errorMessage;

      if (snapshot.components !== undefined) {
        updates.components = snapshot.components;
        updates.componentsByZone = groupByZone(snapshot.components);
      }

      return updates;
    });
  },

  applyDelta: (patches) => {
    set(state => {
      const newComponents = applyJsonPatch(state.components, patches);
      return {
        components: newComponents,
        componentsByZone: groupByZone(newComponents),
      };
    });
  },
}));
