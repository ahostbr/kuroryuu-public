/**
 * Unit Tests for Feature Manager
 * 
 * Tests:
 * - Module discovery and registration
 * - Module loading and unloading
 * - Capability registration
 * - Call routing
 * 
 * Requirements: 4.1, 4.2, 4.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FeatureManager,
  FeatureManagerConfig,
  resetFeatureManager,
} from '../feature-manager';
import {
  IFeatureModule,
  IEventBus,
  FeatureModuleBase,
  FeatureResponse,
  FeatureErrorCode,
  FeatureEventType,
  ModuleFactory,
} from '../base';

// ═══════════════════════════════════════════════════════════════════════════════
// Mock Event Bus
// ═══════════════════════════════════════════════════════════════════════════════

const createMockEventBus = (): IEventBus => ({
  emitEvent: vi.fn(),
  emitCaptureScreenshotComplete: vi.fn(),
  emitCaptureRecordStart: vi.fn(),
  emitCaptureRecordStop: vi.fn(),
  emitVoiceInputStart: vi.fn(),
  emitVoiceInputComplete: vi.fn(),
  emitTTSSpeakStart: vi.fn(),
  emitTTSSpeakComplete: vi.fn(),
  emitError: vi.fn(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Mock Module Implementation
// ═══════════════════════════════════════════════════════════════════════════════

class MockModule extends FeatureModuleBase {
  readonly id = 'mock-module';
  readonly name = 'Mock Module';
  readonly version = '1.0.0';

  public initializeCalled = false;
  public shutdownCalled = false;
  public executeCallCount = 0;
  public lastAction = '';
  public lastParams: Record<string, unknown> = {};

  // Allow controlling behavior for tests
  public shouldFailInit = false;
  public shouldFailExecute = false;
  public executeDelay = 0;

  constructor(eventBus: IEventBus) {
    super(eventBus);
  }

  async initialize(): Promise<FeatureResponse<void>> {
    if (this.shouldFailInit) {
      return this.error('Mock init failure', FeatureErrorCode.MODULE_LOAD_FAILED);
    }
    this.initializeCalled = true;
    this._isInitialized = true;
    return this.success();
  }
  
  async execute<T = unknown>(action: string, params: Record<string, unknown>): Promise<FeatureResponse<T>> {
    const initCheck = this.requireInitialized();
    if (initCheck) return initCheck;
    
    const actionCheck = this.validateAction(action);
    if (actionCheck) return actionCheck;
    
    if (this.executeDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.executeDelay));
    }
    
    if (this.shouldFailExecute) {
      return this.error('Mock execute failure', FeatureErrorCode.UNKNOWN_ERROR);
    }
    
    this.executeCallCount++;
    this.lastAction = action;
    this.lastParams = params;
    
    return this.success({ action, params } as T);
  }
  
  async shutdown(): Promise<FeatureResponse<void>> {
    this.shutdownCalled = true;
    this._isInitialized = false;
    return this.success();
  }
  
  getSupportedActions(): string[] {
    return ['test-action', 'another-action'];
  }
}

// Factory for creating mock modules
const createMockModuleFactory = (overrides?: Partial<MockModule>): ModuleFactory => {
  return () => {
    const module = new MockModule(createMockEventBus());
    if (overrides) {
      Object.assign(module, overrides);
    }
    return module;
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('FeatureManager', () => {
  let manager: FeatureManager;
  
  beforeEach(() => {
    resetFeatureManager();
    manager = new FeatureManager({ autoInitialize: true });
  });
  
  afterEach(async () => {
    await manager.shutdown();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Module Registration Tests (Req 4.1)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Module Registration', () => {
    it('should register a module successfully', async () => {
      const result = await manager.registerModule(createMockModuleFactory());
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result?.id).toBe('mock-module');
        expect(result.result?.name).toBe('Mock Module');
        expect(result.result?.version).toBe('1.0.0');
        expect(result.result?.enabled).toBe(true);
      }
    });
    
    it('should auto-initialize module when configured', async () => {
      const factory = createMockModuleFactory();
      await manager.registerModule(factory);
      
      const module = manager.getModule('mock-module') as MockModule;
      expect(module).toBeDefined();
      expect(module.initializeCalled).toBe(true);
      expect(module.isInitialized).toBe(true);
    });
    
    it('should not auto-initialize when disabled', async () => {
      manager = new FeatureManager({ autoInitialize: false });
      const factory = createMockModuleFactory();
      await manager.registerModule(factory);
      
      const module = manager.getModule('mock-module') as MockModule;
      expect(module.initializeCalled).toBe(false);
    });
    
    it('should reject duplicate module registration', async () => {
      await manager.registerModule(createMockModuleFactory());
      const result = await manager.registerModule(createMockModuleFactory());
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.ALREADY_INITIALIZED);
      }
    });
    
    it('should skip disabled modules', async () => {
      manager = new FeatureManager({
        autoInitialize: true,
        disabledModules: ['mock-module'],
      });
      
      const result = await manager.registerModule(createMockModuleFactory());
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result?.enabled).toBe(false);
      }
      expect(manager.hasModule('mock-module')).toBe(false);
    });
    
    it('should emit MODULE_INITIALIZED event on successful registration', async () => {
      const eventHandler = vi.fn();
      manager.on(FeatureEventType.MODULE_INITIALIZED, eventHandler);
      
      await manager.registerModule(createMockModuleFactory());
      
      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: 'mock-module',
          timestamp: expect.any(Number),
        })
      );
    });
    
    it('should handle module init failure gracefully', async () => {
      const factory = createMockModuleFactory({ shouldFailInit: true } as any);
      const result = await manager.registerModule(factory);
      
      expect(result.ok).toBe(false);
      expect(manager.hasModule('mock-module')).toBe(false);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Module Execution Tests (Req 4.3)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Module Execution', () => {
    beforeEach(async () => {
      await manager.registerModule(createMockModuleFactory());
    });
    
    it('should execute action on registered module', async () => {
      const result = await manager.execute('mock-module', 'test-action', { foo: 'bar' });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result).toEqual({ action: 'test-action', params: { foo: 'bar' } });
      }
    });
    
    it('should return error for unknown module', async () => {
      const result = await manager.execute('unknown-module', 'test-action');
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.MODULE_NOT_FOUND);
      }
    });
    
    it('should return error for unsupported action', async () => {
      const result = await manager.execute('mock-module', 'unsupported-action');
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.ACTION_NOT_SUPPORTED);
      }
    });
    
    it('should route executeAction to correct module', async () => {
      const result = await manager.executeAction('test-action', { data: 123 });
      
      expect(result.ok).toBe(true);
      
      const module = manager.getModule('mock-module') as MockModule;
      expect(module.lastAction).toBe('test-action');
      expect(module.lastParams).toEqual({ data: 123 });
    });
    
    it('should emit error event on execution failure', async () => {
      const module = manager.getModule('mock-module') as MockModule;
      module.shouldFailExecute = true;
      
      const errorHandler = vi.fn();
      manager.on(FeatureEventType.MODULE_ERROR, errorHandler);
      
      await manager.execute('mock-module', 'test-action');
      
      expect(errorHandler).toHaveBeenCalledTimes(1);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Module Unregistration Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Module Unregistration', () => {
    beforeEach(async () => {
      await manager.registerModule(createMockModuleFactory());
    });
    
    it('should unregister and shutdown module', async () => {
      const module = manager.getModule('mock-module') as MockModule;
      
      const result = await manager.unregisterModule('mock-module');
      
      expect(result.ok).toBe(true);
      expect(module.shutdownCalled).toBe(true);
      expect(manager.hasModule('mock-module')).toBe(false);
    });
    
    it('should return error for unknown module', async () => {
      const result = await manager.unregisterModule('unknown');
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.MODULE_NOT_FOUND);
      }
    });
    
    it('should emit MODULE_SHUTDOWN event', async () => {
      const eventHandler = vi.fn();
      manager.on(FeatureEventType.MODULE_SHUTDOWN, eventHandler);
      
      await manager.unregisterModule('mock-module');
      
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({ moduleId: 'mock-module' })
      );
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Query Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Queries', () => {
    beforeEach(async () => {
      await manager.registerModule(createMockModuleFactory());
    });
    
    it('should return registered modules metadata', () => {
      const modules = manager.getRegisteredModules();
      
      expect(modules).toHaveLength(1);
      expect(modules[0].id).toBe('mock-module');
      expect(modules[0].supportedActions).toContain('test-action');
    });
    
    it('should return all supported actions', () => {
      const actions = manager.getAllSupportedActions();
      
      expect(actions.get('mock-module')).toEqual(['test-action', 'another-action']);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Shutdown Tests (Req 4.8)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Shutdown', () => {
    it('should shutdown all registered modules', async () => {
      await manager.registerModule(createMockModuleFactory());
      const module = manager.getModule('mock-module') as MockModule;
      
      await manager.shutdown();
      
      expect(module.shutdownCalled).toBe(true);
      expect(manager.getRegisteredModules()).toHaveLength(0);
    });
    
    it('should reject new executions after shutdown starts', async () => {
      await manager.registerModule(createMockModuleFactory());
      
      // Start shutdown but don't await
      const shutdownPromise = manager.shutdown();
      
      // Try to execute - should fail
      const result = await manager.execute('mock-module', 'test-action');
      
      expect(result.ok).toBe(false);
      
      await shutdownPromise;
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Timeout Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Timeout Handling', () => {
    it('should timeout slow operations', async () => {
      manager = new FeatureManager({
        autoInitialize: true,
        operationTimeout: 100, // Very short timeout
      });
      
      const factory = createMockModuleFactory({ executeDelay: 500 } as any);
      await manager.registerModule(factory);
      
      const result = await manager.execute('mock-module', 'test-action');
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('timed out');
      }
    });
  });
});
