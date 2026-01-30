/**
 * E2E Test Hooks for Playwright
 *
 * This module exposes internal app state for E2E testing when
 * the app is launched with E2E_TEST_MODE=true.
 *
 * Exposes:
 * - window.__ZUSTAND_STORE__ - Direct access to PRD store for test setup
 * - window.__MOCK_ELECTRON_API__ - Mock PTY API for assertions
 */

import { usePRDStore } from './stores/prd-store';
import { useSettingsStore } from './stores/settings-store';
import type { WorkflowType, PRDStatus } from './types/prd';

// Type declarations for the test globals
declare global {
  interface Window {
    __ZUSTAND_STORE__: {
      getState: () => {
        // PRD State
        prds: unknown[];
        selectedPrdId: string | null;
        executingWorkflows: Record<string, unknown>;

        // Actions for test setup
        addPRD: (prd: unknown) => string;
        selectPRD: (id: string | null) => void;
        updatePRD: (id: string, updates: unknown) => void;
        updatePRDStatus: (id: string, status: PRDStatus) => void;
        setExecutingWorkflow: (prdId: string, workflow: WorkflowType, ptyId: string) => void;
        clearExecutingWorkflow: (prdId: string) => void;
        markWorkflowDone: (prdId: string) => void;

        // Selectors
        getSelectedPRD?: () => { status: string; id: string } | undefined;
        selectedPRD?: { status: string; id: string };
        getExecutingWorkflow: (prdId: string) => unknown;

        // Workflow node state
        selectWorkflowNode?: (workflow: WorkflowType | null) => void;

        // Cleanup for test isolation
        clearAllPRDs?: () => void;
        clearExecutingWorkflows?: () => void;
      };
      subscribe: (listener: () => void) => () => void;
    };
    __MOCK_ELECTRON_API__: MockElectronAPI;
  }
}

/**
 * Mock Electron API for E2E testing
 * Prevents real PTY/Claude processes from spawning during tests
 */
interface CreatePtyOptions {
  cmd?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

interface MockPtyProcess {
  id: string;
  pid: number;
  cols: number;
  rows: number;
  cwd: string;
  sessionId?: string;
}

interface MockPtyCall {
  action: 'create' | 'write' | 'kill' | 'resize' | 'list';
  args: unknown[];
  timestamp: number;
}

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error';
  version?: string;
  percent?: number;
  error?: string;
}

class MockElectronAPI {
  private ptyCounter = 0;
  private ptyCalls: MockPtyCall[] = [];
  private activePtys: Map<string, { options: CreatePtyOptions; data: string[] }> = new Map();
  private shouldFail = false;
  private failureMessage = '';

  pty = {
    create: async (options?: CreatePtyOptions): Promise<MockPtyProcess> => {
      if (this.shouldFail) {
        this.shouldFail = false;
        throw new Error(this.failureMessage || 'Mock PTY creation failed');
      }

      const id = `mock-pty-${++this.ptyCounter}`;
      this.ptyCalls.push({ action: 'create', args: [options], timestamp: Date.now() });
      this.activePtys.set(id, { options: options || {}, data: [] });

      return {
        id,
        pid: 10000 + this.ptyCounter,
        cols: options?.cols || 120,
        rows: options?.rows || 30,
        cwd: options?.cwd || '',
        sessionId: `session-${id}`,
      };
    },

    write: async (id: string, data: string): Promise<boolean> => {
      this.ptyCalls.push({ action: 'write', args: [id, data], timestamp: Date.now() });
      const pty = this.activePtys.get(id);
      if (pty) {
        pty.data.push(data);
        return true;
      }
      return false;
    },

    kill: async (id: string): Promise<boolean> => {
      this.ptyCalls.push({ action: 'kill', args: [id], timestamp: Date.now() });
      return this.activePtys.delete(id);
    },

    list: async (): Promise<MockPtyProcess[]> => {
      this.ptyCalls.push({ action: 'list', args: [], timestamp: Date.now() });
      return Array.from(this.activePtys.entries()).map(([id, data]) => ({
        id,
        pid: parseInt(id.split('-')[2]) + 10000,
        cols: data.options.cols || 120,
        rows: data.options.rows || 30,
        cwd: data.options.cwd || '',
      }));
    },

    resize: async (id: string, cols: number, rows: number): Promise<boolean> => {
      this.ptyCalls.push({ action: 'resize', args: [id, cols, rows], timestamp: Date.now() });
      return this.activePtys.has(id);
    },

    onData: () => () => {},
    onExit: () => () => {},
    subscribe: async () => {},
    getBufferedData: async () => '',
  };

  quizmaster = {
    getPromptPath: async () => ({
      ok: true,
      promptPath: 'ai/prompt_packs/quizmasterplanner/ULTIMATE_QUIZZER_PROMPT_small.md',
    }),
  };

  // Mock updater API for update flow tests
  updateStatusListeners: Array<(status: UpdateStatus) => void> = [];

  updater = {
    onStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
      this.updateStatusListeners.push(callback);
      return () => {
        this.updateStatusListeners = this.updateStatusListeners.filter(cb => cb !== callback);
      };
    },
    check: async () => ({ ok: true, updateInfo: null }),
    install: () => { /* mock install */ },
    getVersion: async () => '0.1.0',
  };

  // Test utility to simulate update status events
  emitUpdateStatus(status: UpdateStatus): void {
    this.updateStatusListeners.forEach(cb => cb(status));
  }

  // Test utilities
  getCalls(): MockPtyCall[] {
    return [...this.ptyCalls];
  }

  getCreateCalls(): MockPtyCall[] {
    return this.ptyCalls.filter(c => c.action === 'create');
  }

  getLastCreate(): CreatePtyOptions | undefined {
    const createCalls = this.getCreateCalls();
    return createCalls.length > 0
      ? createCalls[createCalls.length - 1].args[0] as CreatePtyOptions
      : undefined;
  }

  getWriteCalls(): MockPtyCall[] {
    return this.ptyCalls.filter(c => c.action === 'write');
  }

  getDataWrittenTo(ptyId: string): string[] {
    const pty = this.activePtys.get(ptyId);
    return pty ? [...pty.data] : [];
  }

  setNextCreateToFail(message = 'PTY creation failed'): void {
    this.shouldFail = true;
    this.failureMessage = message;
  }

  reset(): void {
    this.ptyCalls = [];
    this.activePtys.clear();
    this.ptyCounter = 0;
    this.shouldFail = false;
    this.failureMessage = '';
    this.updateStatusListeners = [];
  }
}

/**
 * Initialize E2E test hooks if running in test mode
 */
export function initE2ETestHooks(): void {
  // Check if we're in E2E test mode via preload API
  const isE2ETest = typeof window !== 'undefined' &&
    window.electronAPI?.env?.isE2ETest === true;

  if (!isE2ETest) {
    return;
  }

  console.log('[E2E] Test mode detected, initializing test hooks...');

  // Disable animations for test stability (prevents "element not stable" errors)
  console.log('[E2E] Disabling animations for test stability...');
  useSettingsStore.getState().setEnableAnimations(false);

  // Expose Zustand store directly with additional test helpers
  // We need to expose the actual store so actions work correctly
  const store = usePRDStore;

  // Add test helper methods directly to the store
  const originalGetState = store.getState.bind(store);

  // Create a wrapped getState that includes test helpers
  const wrappedGetState = () => {
    const state = originalGetState();
    return {
      ...state,
      // Test helper methods
      clearAllPRDs: () => {
        store.setState({ prds: [], selectedPrdId: null });
      },
      clearExecutingWorkflows: () => {
        store.setState({ executingWorkflows: {} });
      },
      // Convenience aliases
      selectedPRD: state.prds.find((p: { id: string }) => p.id === state.selectedPrdId),
    };
  };

  // Expose the store with the wrapped getState
  window.__ZUSTAND_STORE__ = {
    getState: wrappedGetState,
    setState: store.setState.bind(store),
    subscribe: store.subscribe.bind(store),
  } as typeof window.__ZUSTAND_STORE__;

  // Expose Mock Electron API
  const mockApi = new MockElectronAPI();
  window.__MOCK_ELECTRON_API__ = mockApi;

  // Wire mock updater to window.electronAPI.updater for UpdateNotification component
  if (window.electronAPI) {
    // Override the updater API to use mock
    // Use Object.defineProperty since electronAPI is frozen by contextBridge
    try {
      Object.defineProperty(window.electronAPI, 'updater', {
        value: {
          onStatus: (callback: (status: UpdateStatus) => void) => {
            mockApi.updateStatusListeners.push(callback);
            return () => {
              mockApi.updateStatusListeners = mockApi.updateStatusListeners.filter(cb => cb !== callback);
            };
          },
          check: mockApi.updater.check,
          install: mockApi.updater.install,
          getVersion: mockApi.updater.getVersion,
        },
        writable: true,
        configurable: true,
      });
      console.log('[E2E] - window.electronAPI.updater wired to mock');
    } catch (err) {
      console.warn('[E2E] - Could not override updater API:', err);
    }
  }

  console.log('[E2E] Test hooks initialized:');
  console.log('[E2E] - window.__ZUSTAND_STORE__ ready');
  console.log('[E2E] - window.__MOCK_ELECTRON_API__ ready');
}
