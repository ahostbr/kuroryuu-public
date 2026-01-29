/**
 * Mock Electron API for E2E testing
 * Prevents real PTY/Claude processes from spawning during tests
 */

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error';
  version?: string;
  percent?: number;
  error?: string;
}

export interface CreatePtyOptions {
  cmd?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface MockPtyProcess {
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

export class MockElectronAPI {
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
        cwd: options?.cwd || process.cwd(),
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

    // Event handlers (no-op in mock)
    onData: (_id: string, _callback: (data: string) => void) => () => {},
    onExit: (_id: string, _callback: (code: number) => void) => () => {},
    subscribe: async (_id: string) => {},
    getBufferedData: async (_id: string) => '',
  };

  quizmaster = {
    getPromptPath: async () => ({
      ok: true,
      promptPath: 'ai/prompt_packs/quizmasterplanner/ULTIMATE_QUIZZER_PROMPT_small.md',
    }),
  };

  // Mock updater API for update flow tests
  private updateStatusListeners: Array<(status: UpdateStatus) => void> = [];

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

// Singleton for use in tests
export const mockElectronAPI = new MockElectronAPI();
